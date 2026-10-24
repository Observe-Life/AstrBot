import inspect
import traceback
import typing as T

from astrbot import logger
from astrbot.core.message.message_event_result import CommandResult, MessageEventResult
from astrbot.core.platform.astr_message_event import AstrMessageEvent
from astrbot.core.star.star import star_map
from astrbot.core.star.star_handler import EventType, star_handlers_registry


async def call_handler(
    event: AstrMessageEvent,
    handler: T.Callable[..., T.Awaitable[T.Any] | T.AsyncGenerator[T.Any, None]],
    *args,
    **kwargs,
) -> T.AsyncGenerator[T.Any, None]:
    """执行事件处理函数并处理其返回结果

    该方法负责调用处理函数并处理不同类型的返回值。它支持两种类型的处理函数:
    1. 异步生成器: 实现洋葱模型，每次 yield 都会将控制权交回上层
    2. 协程: 执行一次并处理返回值

    Args:
        event (AstrMessageEvent): 事件对象
        handler (Awaitable): 事件处理函数

    Returns:
        AsyncGenerator[None, None]: 异步生成器，用于在管道中传递控制流

    """
    ready_to_call = None  # 一个协程或者异步生成器

    trace_ = None

    try:
        ready_to_call = handler(event, *args, **kwargs)
    except TypeError:
        logger.error(
            "Plugin Handler arguments do not match its definition.",
            exc_info=True,
        )

    if not ready_to_call:
        return

    if inspect.isasyncgen(ready_to_call):
        _has_yielded = False
        try:
            async for ret in ready_to_call:
                # 这里逐步执行异步生成器, 对于每个 yield 返回的 ret, 执行下面的代码
                # 返回值只能是 MessageEventResult 或者 None（无返回值）
                _has_yielded = True
                if isinstance(ret, MessageEventResult | CommandResult):
                    # 如果返回值是 MessageEventResult, 设置结果并继续
                    event.set_result(ret)
                    yield
                else:
                    # 如果返回值是 None, 则不设置结果并继续
                    # 继续执行后续阶段
                    yield ret
            if not _has_yielded:
                # 如果这个异步生成器没有执行到 yield 分支
                yield
        except Exception as e:
            logger.error(f"Previous Error: {trace_}")
            raise e
    elif inspect.iscoroutine(ready_to_call):
        # 如果只是一个协程, 直接执行
        ret = await ready_to_call
        if isinstance(ret, MessageEventResult | CommandResult):
            event.set_result(ret)
            yield
        else:
            yield ret


async def call_event_hook(
    event: AstrMessageEvent,
    hook_type: EventType,
    *args,
    **kwargs,
) -> bool:
    """调用事件钩子函数

    Returns:
        bool: 如果事件被终止，返回 True
    #

    """
    handlers = star_handlers_registry.get_handlers_by_event_type(
        hook_type,
        plugins_name=event.plugins_name,
    )
    for handler in handlers:
        try:
            assert inspect.iscoroutinefunction(handler.handler)
            logger.debug(
                f"hook({hook_type.name}) -> {star_map[handler.handler_module_path].name} - {handler.handler_name}",
            )
            await handler.handler(event, *args, **kwargs)
        except BaseException:
            logger.error(traceback.format_exc())

        if event.is_stopped():
            logger.info(
                f"{star_map[handler.handler_module_path].name} - "
                f"{handler.handler_name} stopped event propagation.",
            )
            return True

    return event.is_stopped()

async def collect_event_decisions(
    event: AstrMessageEvent,
    hook_type: EventType,
    *args,
    **kwargs,
) -> dict:
    """调用决策型事件钩子并聚合各插件的决策（泛用机制，任何插件可注册）。

    钩子返回值约定：
    - None / 无返回值：放行（不发表意见）
    - str：拦截，字符串作为拦截原因 / 要求文本
    - dict：{"action": "block"|"deny"|"allow"|"modify", "text": str,
             "tool_args": dict}（modify 时提供替换后的完整参数）

    聚合规则（对齐 ZCode 的决策优先级）：任一拦截即拦截（deny/block 优先），
    拦截文本合并；无拦截时若有 modify 则采用改参数；allow 不覆盖其他钩子的拦截。

    Returns:
        {"blocked": bool, "texts": list[str], "modified_args": dict | None,
         "fired": int}
    """
    result: dict = {
        "blocked": False,
        "texts": [],
        "modified_args": None,
        "fired": 0,
        "stage": None,
        "max_blocks": 3,
        "over_limit": "release",
        "total_limit": None,
    }
    handlers = star_handlers_registry.get_handlers_by_event_type(
        hook_type,
        plugins_name=event.plugins_name,
    )
    for handler in handlers:
        try:
            assert inspect.iscoroutinefunction(handler.handler)
            logger.debug(
                f"decision hook({hook_type.name}) -> "
                f"{star_map[handler.handler_module_path].name} - "
                f"{handler.handler_name}",
            )
            ret = await handler.handler(event, *args, **kwargs)
            result["fired"] += 1
        except BaseException:
            logger.error(traceback.format_exc())
            continue
        if isinstance(ret, str) and ret.strip():
            result["blocked"] = True
            result["texts"].append(ret.strip())
        elif isinstance(ret, dict):
            action = str(ret.get("action", "")).lower()
            text = str(ret.get("text", "") or "").strip()
            if action in ("block", "deny"):
                result["blocked"] = True
                if text:
                    result["texts"].append(text)
                if not result["stage"] and ret.get("stage"):
                    result["stage"] = str(ret.get("stage"))
                if ret.get("max_blocks") is not None:
                    try:
                        result["max_blocks"] = max(1, int(ret.get("max_blocks")))
                    except (TypeError, ValueError):
                        pass
                if str(ret.get("over_limit", "")).lower() in ("release", "abort"):
                    result["over_limit"] = str(ret.get("over_limit")).lower()
                if ret.get("total_limit") is not None:
                    try:
                        result["total_limit"] = max(1, int(ret.get("total_limit")))
                    except (TypeError, ValueError):
                        pass
            elif action == "modify" and not result["blocked"]:
                modified = ret.get("tool_args")
                if isinstance(modified, dict):
                    result["modified_args"] = modified
            # allow / 未知动作：不覆盖其他钩子的决策
    return result

class StageBlockTracker:
    """按阶段计数的拦截上限追踪（泛用，三个决策节点共用）。

    插件在决策里声明 stage（阶段标识）、max_blocks（本阶段拦截上限，默认 3）、
    over_limit（达上限后 "release"=本轮放行 或 "abort"=中断回答）。
    机制只负责计数与裁决，不管业务：阶段数与问题数由插件自由决定。
    """

    def __init__(self) -> None:
        self.counts: dict[str, int] = {}
        self.released: set[str] = set()

    def on_block(self, stage: str | None, max_blocks: int, over_limit: str) -> str:
        """登记一次拦截，返回裁决："block"（正常拦截注入）| "release"（超限放行）| "abort"（应中断）。"""
        key = stage or "default"
        if key in self.released:
            return "release"
        count = self.counts.get(key, 0) + 1
        self.counts[key] = count
        if count >= max(1, int(max_blocks or 3)):
            if str(over_limit or "release").lower() == "abort":
                return "abort"
            self.released.add(key)
            return "release"
        return "block"
