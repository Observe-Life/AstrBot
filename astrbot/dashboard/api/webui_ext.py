"""Fork extensions for the WebUI: persisted UI preferences and manual context compaction.

These endpoints are fork-only additions and are kept in a single file so that
upstream merges stay low-friction. They intentionally reuse existing core
infrastructure (the preferences table and the provider manager) instead of
introducing new storage or services.
"""

from __future__ import annotations

import json
from typing import Any
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from astrbot.core import logger
from astrbot.core.provider.entities import ProviderType
from astrbot.dashboard.responses import ApiError, ok
from astrbot.dashboard.services.chat_service import (
    ChatServiceError,
    build_webchat_unified_msg_origin,
)

from .auth import require_dashboard_user

router = APIRouter(tags=["WebUI Extensions"])

WEBUI_PREFERENCE_SCOPE = "webui"
CONVERSATION_BACKUP_SCOPE = "conversation_backup"
MANUAL_COMPACT_BACKUP_KEY = "manual_compact_original"
PREFERENCE_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
MAX_TRANSCRIPT_CHARS = 60000

COMPRESS_SYSTEM_PROMPT = (
    "你将收到一段对话记录。请把它压缩成一段简洁、信息密度高的摘要，用于延续后续对话。"
    "必须保留：用户身份与偏好、任务目标、关键事实与已做决定、未尽事项/待办。"
    "不要添加对话中不存在的信息，不要评论，直接输出摘要正文。"
)


def _entry_text(entry: Any) -> str:
    """Extract plain text from one OpenAI-format history entry."""
    if not isinstance(entry, dict):
        return ""
    content = entry.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return "\n".join(parts)
    return ""


class WebUIPreferenceRequest(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: dict


class CompressContextRequest(BaseModel):
    preferred_provider_id: str | None = None
    selected_model: str | None = None


@router.get("/webui_preferences")
async def get_webui_preferences(
    request: Request,
    _username: str = Depends(require_dashboard_user),
):
    """Return all persisted WebUI preferences of the current dashboard user."""
    db = request.app.state.db
    prefs = await db.get_preferences(
        scope=WEBUI_PREFERENCE_SCOPE,
        scope_id=_username,
    )
    return ok({"preferences": {pref.key: pref.value for pref in prefs}})


@router.put("/webui_preferences")
async def put_webui_preference(
    payload: WebUIPreferenceRequest,
    request: Request,
    _username: str = Depends(require_dashboard_user),
):
    """Persist one WebUI preference key for the current dashboard user."""
    if not PREFERENCE_KEY_PATTERN.match(payload.key):
        raise ApiError("偏好键名不合法")
    db = request.app.state.db
    await db.insert_preference_or_update(
        WEBUI_PREFERENCE_SCOPE,
        _username,
        payload.key,
        payload.value,
    )
    return ok({"message": "已保存"})


@router.post("/chat/sessions/{session_id}/compact")
async def compact_chat_session(
    session_id: str,
    payload: CompressContextRequest,
    request: Request,
    username: str = Depends(require_dashboard_user),
):
    """Manually compact the LLM context of a WebChat session.

    Behavior:
    1. Summarize the session's current conversation with its in-use chat model.
    2. Stash the untouched original history into the local database
       (preferences table) so other tools/agents can still inspect it.
    3. Replace the LLM context with a single visible summary entry so
       subsequent turns start from a short context.
    4. Append a visible "bot" message about the compaction to the chat stream.
    """
    core_lifecycle = request.app.state.core_lifecycle
    db = request.app.state.db

    session = await db.get_platform_session_by_id(session_id)
    if session is None:
        raise ApiError("会话不存在")
    if session.creator != username:
        raise ApiError("没有权限操作该会话")

    umo = build_webchat_unified_msg_origin(session)
    cid = await core_lifecycle.conversation_manager.get_curr_conversation_id(umo)
    if not cid:
        raise ApiError("会话还没有可压缩的对话")
    conv = await core_lifecycle.conversation_manager.get_conversation(umo, cid)
    if conv is None:
        raise ApiError("对话不存在")

    try:
        history = json.loads(conv.history or "[]")
    except Exception as exc:
        raise ApiError(f"对话历史解析失败：{exc}")
    if not isinstance(history, list):
        raise ApiError("对话历史格式异常")

    lines: list[str] = []
    for entry in history:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role")
        if role not in ("user", "assistant"):
            continue
        text = _entry_text(entry).strip()
        if text:
            lines.append(f"{role}: {text}")
    if not lines:
        raise ApiError("没有可压缩的文本历史")

    transcript = "\n".join(lines)
    if len(transcript) > MAX_TRANSCRIPT_CHARS:
        transcript = transcript[-MAX_TRANSCRIPT_CHARS:]

    provider = await core_lifecycle.provider_manager.get_using_provider_async(
        ProviderType.CHAT_COMPLETION,
        umo=umo,
    )
    if provider is None:
        raise ApiError("当前没有可用的聊天模型，无法压缩上下文")

    try:
        response = await provider.text_chat(
            prompt=transcript,
            system_prompt=COMPRESS_SYSTEM_PROMPT,
            model=payload.selected_model or None,
        )
        summary = (response.completion_text or "").strip()
    except Exception as exc:
        logger.error(f"手动压缩上下文失败：{exc}")
        raise ApiError(f"压缩失败：{exc}")
    if not summary:
        raise ApiError("模型没有返回摘要内容")

    compacted_at = datetime.now(timezone.utc).isoformat()
    # 只保留第一次压缩的原始留底：重复压缩不覆盖，避免把最初原文冲掉。
    existing_backup = await db.get_preference(
        CONVERSATION_BACKUP_SCOPE,
        cid,
        MANUAL_COMPACT_BACKUP_KEY,
    )
    if existing_backup is None:
        await db.insert_preference_or_update(
            CONVERSATION_BACKUP_SCOPE,
            cid,
            MANUAL_COMPACT_BACKUP_KEY,
            {
                "umo": umo,
                "compacted_at": compacted_at,
                "original_history": history,
            },
        )

    new_history = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "（以下是此前对话的压缩摘要，供延续上下文参考）\n"
                        f"{summary}"
                    ),
                }
            ],
        }
    ]
    estimate = max(1, int(len(summary) / 2) + 64)
    await core_lifecycle.conversation_manager.update_conversation(
        umo,
        cid,
        history=new_history,
        token_usage=estimate,
    )

    stream_label = (
        "【上下文已压缩】此前对话历史已压缩为下面的摘要，供模型延续参考；"
        "原始完整记录仍保留在会话数据库中，可随时查看归档。\n"
        f"{summary}"
    )
    # 通知消息携带合成的 agent_stats（current_context_tokens=压缩后估算），
    # 让「上下文已用比例圆环」立即反映压缩后的占用；下一轮真实对话后由真实统计接管。
    await db.insert_platform_message_history(
        platform_id=conv.platform_id,
        user_id=conv.user_id,
        content={
            "type": "bot",
            "message": [{"type": "plain", "text": stream_label}],
            "agent_stats": {
                "token_usage": {
                    "input_other": max(0, estimate - 64),
                    "input_cached": 0,
                    "output": 64,
                },
                "current_context_tokens": estimate,
            },
        },
    )

    return ok(
        {
            "message": "压缩完成",
            "summary_chars": len(summary),
            "compacted_at": compacted_at,
        }
    )
