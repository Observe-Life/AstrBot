# 【必读】AstrBot使用指南

## 目录

- 一、最高指导
  - （一）文档定位
  - （二）修改权限
- 二、镜像构建
  - （一）生效的流水线
  - （二）产物形态
  - （三）构建闸门
  - （四）废弃与永不执行的流水线
- 三、容器部署
  - （一）当前运行实况
  - （二）时区三件套
  - （三）升级三档
  - （四）回退
  - （五）注意事项
- 四、首次配置
  - （一）账号与密钥
  - （二）会话数据迁移
- 五、日常使用
  - （一）访问入口
  - （二）浏览器测试
  - （三）手机真机基准参数
  - （四）更新 AstrBot
- 六、源码修改
  - （一）分支与提交
  - （二）前端定制内容
  - （三）后端本地改动清单
  - （四）编码规范
  - （五）前端禁忌
- 七、验证要点
  - （一）前端改动
  - （二）流水线改动

## 一、最高指导

### （一）文档定位

1. 本文件是本仓库**唯一**的要点记录处。README、`.github/copilot-instructions.md` 等只作引路，不重复维护内容。
2. 本仓库是 `AstrBotDevs/AstrBot` 的单人长期维护 fork，唯一维护分支 `4.29.0-customize`。

### （二）修改权限

> 警告：该部分内容作为整篇文档、整个项目的指导原则，仅可由用户修改，AI禁止主动修改，但可以提建议让用户授权修改。

## 二、镜像构建

### （一）生效的流水线

1. **Custom Build**（`.github/workflows/custom-build.yml`）：推送 `4.29.0-customize` 自动触发，也可手动。流程为 pnpm 锁依赖 → 契约漂移检查 → i18n 检查 → 类型检查与打包 → 注入版本 → 算依赖指纹 → 发布滚动 Release。
2. **Custom Image Build**（`.github/workflows/custom-image-build.yml`）：只手动触发，整镜像兜底。可勾选把镜像导出 tar.gz 上传 Release。

### （二）产物形态

滚动 Release 固定入口：`customize-build`（公开直链，支持断点续传）。

1. `custom-webui.zip`（约 5.1MB）：前端静态包，解压即 webui 根目录。
2. `astrbot-custom-code.tar.gz`（约 6.5MB）：后端源码 + 已烘入 `astrbot/dashboard/dist` 的前端。
3. `deps-fingerprint.txt`：`pyproject.toml`+`uv.lock`+`requirements.txt`+`dashboard/pnpm-lock.yaml` 的哈希前 16 位，用于判断能否增量组装。

### （三）构建闸门

1. OpenAPI 契约漂移：跑 `pnpm generate:api` 后 `dashboard/src/api/generated` 必须无差异，否则构建失败。改了后端接口/schema/契约却忘重新生成，装上去只会在运行时炸，所以在这里拦。
2. `vue-tsc --noEmit` 类型检查（在 `pnpm run build` 内）。
3. `pnpm run i18n:check` 文案键完整性。
4. `pnpm install --frozen-lockfile` 依赖锁定。

### （四）废弃与永不执行的流水线

1. 已删除：`dashboard_build_fork.yml`（产物只存在 Actions 临时区、60 天过期、下载需令牌）、`coverage_test.yml`（守卫写死上游仓库名，永不执行）。
2. 文件保留但永不执行（作业守卫是 `github.repository == 'AstrBotDevs/AstrBot'`）：`dashboard_ci.yml`、`docker-image.yml`、`release.yml`、`stale.yml`、`sync-wiki.yml`。留着是为将来同步上游，不要照着它们改部署方式。
3. 仍会触发但与部署无关：`build-docs.yml`、`code-format.yml`、`codeql.yml`、`smoke_test.yml`、`unit_tests.yml`。

## 三、容器部署

### （一）当前运行实况

1. 容器名 `astrbot`，镜像 `ghcr.io/observe-life/astrbot:clean-latest`（含后端本地改动 + 上游原版前端，`assets/version` 为 `v4.29.0`），启动命令 `python main.py`。
2. 数据卷：`/vol1/docker/astrbot/data` → `/AstrBot/data`。
3. 网络：`backend` + `bridge`；端口 `6185`(WebUI)、`11451`、`6194`、`6195`、`6196`、`6199`。
4. 容器由 `docker run` 创建，**宿主机没有 compose 文件**。仓库根 `compose.yml` 是上游原版（镜像写死 `soulter/astrbot:latest`、只映射 6185/6199、无 custom-webui），不要照抄它部署。

### （二）时区三件套

1. `TZ=Asia/Shanghai` + 挂载 `/etc/localtime:ro` + `/etc/timezone:ro`，三者缺一不可。只设 `TZ` 时，只读系统时区文件的程序会按 UTC 走，差 8 小时。

### （三）升级三档

1. **只改前端**：下载 `custom-webui.zip` 解压到宿主机 `custom-webui/`，加挂载 `-v ./custom-webui:/AstrBot/custom-webui:ro`，启动命令改为 `python main.py --webui-dir /AstrBot/custom-webui`，重启容器。不重建镜像。
2. **改了后端、依赖指纹与现装一致**：下载 `astrbot-custom-code.tar.gz`，以服务器上现有镜像为底座，三行 Dockerfile 覆盖 `/AstrBot` 代码。代码是 editable 安装（site-packages 里只有一个 `.pth` 指向 `/AstrBot/astrbot`），覆盖即生效，不需要重装依赖。
3. **依赖指纹变了 / 首次部署**：走 Custom Image Build 出整镜像，或导出 tar.gz 到服务器 `docker load`。

### （四）回退

1. 升级脚本 `/vol1/docker/astrbot-upgrade.sh`：停旧容器 → 改名留档（如 `astrbot-v4282-rollback`）→ 起新容器 → 自检 6185，失败自动改名回退。留档容器改名后要先释放它占用的网络名。

### （五）注意事项

1. 覆盖代码时不要删 `/AstrBot/.astrbot`（源码安装标记）。
2. 前端包里的 `dist/assets/version` 要与核心版本一致，否则 WebUI 版本显示错乱。
3. 官方镜像 `soulter/astrbot` 不含本分支改动，直接 `docker run` 官方镜像会丢掉后端补丁。

## 四、首次配置

### （一）账号与密钥

1. WebUI 地址 `http://<服务器>:6185`。账号已不是默认值，凭据只存服务器本地，不写进仓库和本文档。
2. JWT 密钥在 `data/cmd_config.json` 的 `dashboard.jwt_secret`。该文件带 BOM，脚本读取要用 `utf-8-sig`；自签测试令牌时载荷字段是 `username`。

### （二）会话数据迁移

1. `data_v4.db` 必须用 SQLite 在线备份 API 复制，保证 WAL 一致性；直接 `cp` 会拿到不一致的库。
2. 同时复制 `cmd_config.json`、`attachments/`、`knowledge_base/`。

## 五、日常使用

### （一）访问入口

1. 正式实例：`http://192.168.31.115:6185`（聊天页与后台管理同一实例）。
2. 前端原型预览：`http://192.168.31.115:3000`（web-dev 容器内 vite dev，未打包，首屏约 4 秒属正常）。

### （二）浏览器测试

1. 用 `browser-remote` 容器（Chromium headless，容器内 CDP 端口 9222，宿主 3001 是它的查看页）。宿主直连 CDP 需在容器内起 TCP 中继。
2. `fygo-browser` 应用已停用，不再作为测试浏览器。

### （三）手机真机基准参数

1. CSS 视口 **360×800**、DPR **3**（物理 1080×2400）。前端布局与测试一律按 360 宽，不得用 390 代替。

### （四）更新 AstrBot

1. WebUI 内「更新 AstrBot」走上游发版机制，**不含本分支改动**。本地更新按「三、（三）」三档处理。

## 六、源码修改

### （一）分支与提交

1. 只在 `4.29.0-customize` 上改。提交信息用 conventional commits。
2. 上游 `master` 与本基线已有 137 处文件差异，跟上游升级要单独做移植，不能直接合并。

### （二）前端定制内容

1. 与基线的差异共 **17 个文件**：14 改 + 3 新（`ChatSessionRow.vue`、`composables/useBackGuard.ts`、`stores/uiPanels.ts`）。原型存放在另一仓库（web-dev 的 `astrbot-web/`），路径要换成 `dashboard/`。
2. 已完成要点：底部四标签与独立路径、列表按最后对话时间倒序、置顶与长按菜单、搜索与历史记录、左右滑动切标签、返回手势拦截、聊天框操作栏（图片/文件/置底/能力/配置）、会话页滚动位置记忆、打开会话不自动呼键盘、消息列表延后渲染、电脑版双栏（左列表+右会话，断点 961px）、思考详情改右侧边栏、点击标签栏振动、外壳禁用长按选中。
3. **两处本地专用改动不能带进仓库**：`dashboard/vite.config.ts` 的代理目标（原型容器用 `astrbot:6185`，仓库要留 `127.0.0.1:6185`）；`dashboard/pnpm-lock.yaml`（本地比基线旧，带过去会让 `--frozen-lockfile` 直接失败）。

### （三）后端本地改动清单

1. `astrbot/core/agent/mcp_client.py`：MCP 会话失效自动重连补丁。
2. `astrbot/core/agent/runners/tool_loop_agent_runner.py`、`astrbot/core/astr_agent_run_util.py`、`astrbot/core/pipeline/context_utils.py`、`astrbot/core/star/*`：决策型钩子（`OnAnswerGateEvent` / `OnToolDecisionEvent` / `OnStopCheckEvent`）。
3. `astrbot/dashboard/api/webui_ext.py`、`astrbot/dashboard/api/router.py`：WebUI 扩展接口（`/api/v1/webui_preferences`、`/api/v1/chat/sessions/{id}/compact`）。

### （四）编码规范

1. 后端：提交前 `ruff format .` 与 `ruff check .`（已配 pre-commit）；注释与日志用英文；路径用 `pathlib.Path` 与 `astrbot.core.utils.path_utils`；docstring 用 Google 格式。
2. KISS：先定真问题与最小改动，不加没需要的开关、抽象和依赖；优先内联实现，只有同一段逻辑重复 3 处以上或主函数超 50 行才抽 helper。
3. 版本三处同步：`pyproject.toml` 的 `[project].version` 与 `astrbot/__init__.py` 的 `__version__`，`astrbot/core/config/default.py` 的 `VERSION` 由前者派生，不另写死。
4. 改后端路由、schema 或 `openspec/openapi-v1.yaml` → 必须 `cd dashboard && pnpm generate:api` 并提交生成目录（流水线会拦）。
5. 前端保持组件化、避免重复代码；不要新增 `xxx_SUMMARY.md` 之类的报告文件。

### （五）前端禁忌

1. Vue3 `<script setup>` 里 `watch` / `useBackGuard` 必须写在被监听 `ref` 的声明之后，否则整页白屏（TDZ）。已踩过三次。
2. 页面高度按实际顶栏高度计算，不要写死 40px。
3. 悬停样式必须限定 `@media (hover: hover) and (pointer: fine)`，否则手机点击后残留灰条。
4. 长按出现的粉色选择手柄来自浏览器选区：外壳统一 `user-select: none`，只在消息正文、思考文本、输入框放开。
5. 会话列表接口的 `updated_at` 不是最后对话时间；真实时间取 `/api/v1/conversations?group_by_session=true` 的 `updated_at`（秒级）。

## 七、验证要点

### （一）前端改动

1. 在 `browser-remote` 里按 1440×900 与 360×800/DPR3 各截图一次，确认两档都正常。
2. 检查是否存在 `vite-error-overlay`、控制台有无报错；关键元素用实测数值（坐标、宽度、颜色）确认，不靠目测。

### （二）流水线改动

1. 推分支后确认 Custom Build 全绿，滚动 Release `customize-build` 三个资产已更新。
2. 断点续传实测：先截断下载，再 `curl -C -` 续传，字节数须与完整一致。
3. 依赖指纹变化时，Release 说明与 `deps-fingerprint.txt` 必须同步变化。
