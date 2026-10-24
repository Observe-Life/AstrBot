# 部署要点（本地维护，部署/重装前必读）

> 本仓库是 `AstrBotDevs/AstrBot` 的本地长期维护 fork（默认分支 `4.29.0-customize`），
> 包含本地改动：MCP 会话失效自动重连补丁、决策型钩子机制（OnAnswerGateEvent /
> OnToolDecisionEvent / OnStopCheckEvent）、WebUI 扩展接口（`/api/v1/webui_preferences`
> 与 `/api/v1/chat/sessions/{id}/compact`）。

## 1. Compose 部署（推荐）

- 用仓库根目录的 `compose.yml`（已配好：`TZ=Asia/Shanghai` + `/etc/localtime:ro`
  + `/etc/timezone:ro` + 数据卷）。**时区三件套缺一不可**：只设 `TZ` 环境变量时，
  只读系统时区文件的程序会按 UTC 走（差 8 小时）。
- 自定义前端：构建产物放入 `custom-webui/`（含 `assets/version`，内容与核心版本一致），
  compose 挂载 `-v ./custom-webui:/AstrBot/custom-webui:ro`，启动命令
  `python main.py --webui-dir /AstrBot/custom-webui`。

## 2. 本地改动的生效方式

- 官方镜像（`soulter/astrbot`）不包含本分支的改动。部署后需要把改动文件
  `docker cp` 进容器对应路径后重启；或从本分支构建自己的镜像。
- 本分支相对官方 v4.29.0 的改动清单（见 git log）：
  - `astrbot/core/agent/mcp_client.py`：MCP 会话失效自动重连补丁；
  - `astrbot/core/agent/runners/tool_loop_agent_runner.py`、
    `astrbot/core/astr_agent_run_util.py`、`astrbot/core/pipeline/context_utils.py`、
    `astrbot/core/star/*`：决策型钩子机制；
  - `astrbot/dashboard/api/webui_ext.py`、`astrbot/dashboard/api/router.py`：WebUI 扩展接口；
  - `dashboard/`：自定义前端（发送快捷键持久化、上下文圆环小窗与压缩）。

## 3. 构建方式

- **前端**：GitHub Actions（`.github/workflows/dashboard_build_fork.yml`）——
  推送 `4.29.0-customize` 自动触发，产物 artifact 名 `dist-fork`；本地构建需
  pnpm + Node 24（`cd dashboard && pnpm install && pnpm run build`）。
- **会话数据迁移**：用 SQLite 在线备份方式（`sqlite3` backup API）复制
  `data_v4.db`，保证 WAL 一致性；另复制 `cmd_config.json`、`attachments/`、
  `knowledge_base/`。

## 4. 插件（astrbot_plugin_aegis）

- 位置：`data/plugins/astrbot_plugin_aegis/`（随数据卷走）。
- 决策钩子由该插件注册（回答前门禁 / 收工检查），开关在插件配置
  （`answer_gate_enabled` / `stop_check_enabled` / `enforcement_log`）。

---

## Setup commands

### Core

```
uv sync
uv run main.py
```

Exposed an API server on `http://localhost:6185` by default.

### Dashboard(WebUI)

```
cd dashboard
pnpm install # First time only. Use npm install -g pnpm if pnpm is not installed.
pnpm dev
```

Runs on `http://localhost:3000` by default.

## Pre-commit setup

AstrBot uses [pre-commit](https://pre-commit.com/) hooks to automatically format and lint Python code before each commit. The hooks run `ruff check`, `ruff format`, and `pyupgrade` (see [`.pre-commit-config.yaml`](.pre-commit-config.yaml) for details).

To set it up:

```bash
pip install pre-commit
pre-commit install
```

After installation, the hooks will run automatically on `git commit`. You can also run them manually at any time:

```bash
ruff format .
ruff check .
```

> **Note:** If you use VSCode, install the `Ruff` extension for real-time formatting and linting in the editor.

## Dev environment tips

### Basic

1. When modifying the WebUI, be sure to maintain componentization and clean code. Avoid duplicate code.
2. Do not add any report files such as xxx_SUMMARY.md.
3. After finishing, use `ruff format .` and `ruff check .` to format and check the code.
4. When committing, ensure to use conventional commits messages, such as `feat: add new agent for data analysis` or `fix: resolve bug in provider manager`.
5. Use **English** for all comments and logs.
6. For path handling, use `pathlib.Path` instead of string paths, and use `astrbot.core.utils.path_utils` to get the AstrBot data and temp directory.
7. When backend API routes, request/response schemas, or OpenAPI definitions change, regenerate the frontend API client by running `cd dashboard && pnpm generate:api`.
8. When updating the project version, keep `[project].version` in `pyproject.toml` and `__version__` in `astrbot/__init__.py` in sync. `VERSION` in `astrbot/core/config/default.py` should derive from `astrbot.__version__` instead of hardcoding a separate version string.
9. When designing WebUI dialogs, use `text-h3 pa-4 pb-0 pl-6` as the base class for dialog titles, and use `variant="text"` or `variant="tonal"` for dialog buttons.
10. Consider cross-platform compatibility (e.g., Windows, macOS, and Linux, as well as Arm64 and x86 CPU architectures) and compatibility with Python 3.10+.
11. When changing WebUI navigation, page structure, or terminology, update the affected instructions and screenshots in `docs/zh` and `docs/en` in the same PR. For renamed, moved, or merged entry points, include an old-to-new mapping in the relevant docs and changelog. Keep layout redesigns separate from feature additions where practical, and explain necessary navigation changes in the PR. See `CONTRIBUTING.md` for the review checklist.

### KISS and First Principles

Follow the KISS principle and reason from first principles during development. Start by identifying the real problem, required behavior, and smallest useful change before adding code. Do not pile on features, configuration switches, abstractions, dependencies, or compatibility layers unless they directly solve the current problem and have clear evidence of need.

Prefer the simplest implementation that is correct, maintainable, and consistent with the existing codebase. If a broader design seems attractive, reduce it to the essential behavior needed now and leave optional expansion for a later, explicit requirement.

### No Unnecessary Helpers

Prioritize inline implementation over abstraction. Avoid over-engineering and do not create helper functions unless absolutely necessary.

1. **Inline-First Rule**: If a logic block can be implemented directly within the main function without breaking overall readability, **do not** extract it into a new helper function.
2. **Strict Justification for Helpers**: You may only create a separate helper function if it meets at least one of these criteria:
   - **High Reuse**: The exact same logic is repeated across **3 or more** different locations.
   - **Extreme Complexity**: Inlining the logic makes the main function too long (e.g., >50 lines) or severely derails the main execution flow.
3. **No Fragmentation**: Do not split continuous linear logic (e.g., a single API call, simple form validation, or one-time data formatting) into tiny functions just for the sake of "clean code."
4. **Keep Context Compact**: Handle edge cases, error catching, and logging directly inside the main function block instead of offloading them.
5. **Refactoring Constraint**: When modifying existing code, do not alter the current function structure or extract code into new helpers unless the existing code already violates the complexity or reuse rules above.

### Mandatory Google-Style Docstrings
* **Comment the complex**: Add clear comments to any non-obvious function, method, or parameter.
* **Google Format**: All docstrings must strictly use the Google format (`Args:`, `Returns:`, `Raises:`).

#### Example:

```py
def calculate_metrics(user_id: int, force_refresh: bool = False) -> dict:
    """Brief description of the function.

    Args:
        user_id: Description of the ID.
        force_refresh: Description of the flag.

    Returns:
        Description of the returned dict.

    Raises:
        ValueError: Description of when this occurs.
    """
    # Inline implementation here...
```


## PR instructions

1. Title format: use conventional commit messages
2. Use English to write PR title and descriptions.

## Release versions

Use a short-lived `release/*` branch for each release. The release branch is the stabilization area for version bumps, changelog updates, release-blocking fixes, and final validation only. Do not add unrelated features or broad refactors to a release branch.

Prepare a release from a clean worktree with:

```bash
uv run python scripts/prepare_release.py 4.25.0
```

The script updates `pyproject.toml` and `astrbot/__init__.py`, creates `changelogs/v4.25.0.md`, runs the required Python checks, and prints the remaining steps. Use these flags when needed:

```bash
uv run python scripts/prepare_release.py 4.25.0 --generate-api-client
uv run python scripts/prepare_release.py 4.25.0 --dashboard-build
uv run python scripts/prepare_release.py 4.25.0 --commit --push
```

Open a PR from `release/4.25.0` to `master`. The PR title must use the conventional commit format, for example `chore: bump version to 4.25.0`. After the release PR is merged, create and push the tag from the updated `master` branch so the tag points to the exact code that was merged:

```bash
git checkout master
git pull --ff-only origin master
git tag v4.25.0
git push origin v4.25.0
```

For one-off release candidate branches, delete the release branch after the tag is pushed and verified. For maintained release lines, use a branch such as `release/4.25` and keep it until that line reaches EOL.

```bash
git branch -d release/4.25.0
git push origin --delete release/4.25.0
```
