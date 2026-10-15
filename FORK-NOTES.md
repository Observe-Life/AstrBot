# FORK-NOTES · 派生仓库的维护说明

> 这是 `Observe-Life/AstrBot`（派生自 `AstrBotDevs/AstrBot`）的**本地维护总账**。
> 每次改本仓库前先读这里；改完在这里登记，下次才不会忘。

## 一、仓库模型（谁放什么）

| 分支/标签 | 角色 | 允许的改动 |
|---|---|---|
| `master` | **上游镜像**。只用来同步官方版本 | 只允许被官方覆盖，**不要在这里提交我们的改动** |
| `personal` | **我们的改动都住这里** | 日常提交、推送都在这里 |
| `fix/xxx`（临时） | 单个修复 | 改完合回 `personal` 后删除 |
| 标签 `upstream-v4.29.0` | 标记「已同步到哪个官方版本」 | 只读标记 |

**基线**：`master` 的提交 = 官方 `v4.29.0` 正式版（commit `db4ce0c4b0ae94f443c641f0f78cc9228ddabbeb`，与官方 tag `v4.29.0` 完全一致）。

> 不同步官方 `main`：正式版之外的提交太密，跟了会长期处在半成品状态。

## 二、日常操作

**改东西**：在 `personal` 上提交 → 推送。

**上游发新正式版时**：

```bash
git remote add upstream https://github.com/AstrBotDevs/AstrBot.git   # 只需一次
git fetch upstream --tags
git switch master
git reset --hard upstream/v4.30.0        # 换成目标版本标签
git push origin master
git tag -f upstream-v4.30.0 && git push -f origin upstream-v4.30.0
git switch personal
git merge master                          # 冲突只在这里解
```

**升级后必须做**：重新打本仓库的补丁（见下节），否则运行环境里的改动会被新版本覆盖掉。

## 三、我们对上游的改动（补丁台账）

| # | 改动 | 文件 | 补丁 | 状态 |
|---|---|---|---|---|
| 1 | MCP 会话失效后自动重连（修「服务端重启后调用持续失败」） | `astrbot/core/agent/mcp_client.py` | `patches/mcp-client-reconnect.patch` | 已提交到 `personal`；已应用到运行环境（需重启生效） |

### 补丁 1：MCP 会话失效自动重连

**问题**：上游只在 `anyio.ClosedResourceError` 时重连。服务端正常返回「这条会话已失效」
（HTTP 404 `Session not found` / `Session terminated`）时，SDK 抛的是 `McpError`，
不属于那类异常 → **不重连**，会话一直坏到进程重启。实测现象：MCP 服务端（凭证代理保险箱）
一重启，AstrBot 的工具调用持续报 `Session terminated`，只能手动重新保存 MCP 条目。

**改法**：新增 `_is_session_invalid()`，把「消息里含 session + not found/terminated/expired/invalid/404」
判为会话失效；重试条件由 `retry_if_exception_type(anyio.ClosedResourceError)` 改为
`retry_if_exception(_is_session_invalid)`，尝试次数 2 → 3。其它错误（如参数错误）照旧直接抛出，不滥重连。

**上游状态**：issue #9859 标题写了 `[Fixed]` 但仍是 Open；修复 PR #8694（commit `2bda4e4d`）
当天被 PR #8991（commit `d90530af`）撤销，v4.29.0 及两个 beta 都没有该修复。
官方修好之后即可删掉本补丁。

**应用/撤销**：

```bash
patches/apply.sh              # 容器内，默认目标 /AstrBot
patches/apply.sh --revert     # 撤销
```

生效前提：**重启 AstrBot 进程**。

## 四、还没做的事（别忘）

1. 旧本地 MCP 服务未退役：豆包 / 微信 / Exa 的本地 Python 服务仍在，密钥以明文存在 AstrBot 配置里
   （凭证代理保险箱已可用，属于重复来源）
2. 网页终端经统一网关的 **WebSocket 升级未验证**（Node 代理未处理 upgrade）
3. **30 分钟管理授权到期**未端到端验证
4. **退出登录后管理授权是否即时失效**未验证
5. 前端替换（把 `ASTRBOT_WEBUI_DIR` 指向自建前端）未做
6. 公众号搜索服务单次返回约 5 万字符，未裁剪

## 五、边界

- 本仓库只放「让 AstrBot 更好用」的最小改动，**不做大范围重构**，避免每次同步上游都要解冲突。
- 运行环境是容器，仓库改了 ≠ 生效：必须走「改仓库 → 打补丁/替换文件 → 重启」这条链。
