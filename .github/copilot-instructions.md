# AstrBot Development Instructions

AstrBot is a multi-platform LLM chatbot and development framework written in Python with a Vue.js dashboard. It supports multiple messaging platforms (QQ, Telegram, Discord, etc.) and various LLM providers (OpenAI, Anthropic, Google Gemini, etc.).

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

> **Fork override:** this repository is a single-owner maintenance fork (branch `4.29.0-customize`). The single source of truth is [`【必读】AstrBot使用指南.md`](../%E3%80%90%E5%BF%85%E8%AF%BB%E3%80%91AstrBot%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%97.md) at the repository root. Read it first. Wherever the notes below describe upstream defaults, the guide wins.

## Working Effectively

### Bootstrap and Install Dependencies
- **Python 3.10+ required** - Check `.python-version` file
- Install UV package manager: `pip install uv`
- Install project dependencies: `uv sync` -- takes 6-7 minutes. NEVER CANCEL. Set timeout to 10+ minutes.
- Create required directories: `mkdir -p data/plugins data/config data/temp`

### Running the Application
- Run main application: `uv run main.py` -- starts in ~3 seconds
- Application creates WebUI on http://localhost:6185
- Upstream default credentials are `astrbot`/`astrbot`; **this fork does not use them**. Credentials live on the server only and must never be written into the repo or the guide

### Dashboard Build (Vue.js/Node.js)
- **Prerequisites**: Node.js 24 and **pnpm 10.28.2** (the repo is pnpm-based; do not use npm here)
- Navigate to dashboard: `cd dashboard`
- Install dashboard dependencies: `pnpm install --frozen-lockfile` -- takes 2-3 minutes. NEVER CANCEL. Set timeout to 5+ minutes.
- Build dashboard: `pnpm run build` (runs `vue-tsc --noEmit` then `vite build`) -- takes 25-30 seconds. NEVER CANCEL.
- Dashboard creates optimized production build in `dashboard/dist/`
- After changing backend routes, schemas, or `openspec/openapi-v1.yaml`, regenerate the client with `pnpm run generate:api` and commit `dashboard/src/api/generated`. CI fails if they drift.

### Testing
- Do not generate test files for now.

### Code Quality and Linting
- Install ruff linter: `uv add --dev ruff`
- Check code style: `uv run ruff check .` -- takes <1 second
- Check formatting: `uv run ruff format --check .` -- takes <1 second
- Fix formatting: `uv run ruff format .`
- **ALWAYS** run `uv run ruff check .` and `uv run ruff format .` before committing changes

### Plugin Development
- Plugins load from `astrbot/builtin_stars/` (built-in) and `data/plugins/` (user-installed)
- Plugin system supports function tools and message handlers
- Key plugins: python_interpreter, web_searcher, astrbot, reminder, session_controller

### Common Issues and Workarounds
- **Dashboard download fails**: Known issue with "division by zero" error - application still works
- **Import errors in tests**: Ensure `uv run` is used to run tests in proper environment
- **Build timeouts**: Always set appropriate timeouts (10+ minutes for uv sync, 5+ minutes for pnpm install)

## CI/CD Integration
- Two workflows matter for this fork: `custom-build.yml` (artifacts → rolling Release `customize-build`) and `custom-image-build.yml` (full-image fallback, manual only). See the guide.
- Upstream workflows (`dashboard_ci.yml`, `docker-image.yml`, `release.yml`, `stale.yml`, `sync-wiki.yml`) are kept for future syncing but **never run here** — their jobs are guarded by `github.repository == 'AstrBotDevs/AstrBot'`. Do not copy deployment steps from them.
- Pre-commit hooks enforce ruff formatting and linting

## Docker Support
- The official image `soulter/astrbot` does **not** contain this fork's changes. Deploy with the images/artifacts produced by this branch, following the guide's three upgrade paths.
- `compose.yml` in the repo root is the upstream original (official image, ports 6185/6199 only) and does **not** match how this server runs. Do not deploy from it without reading the guide.
- Exposes ports: 6185 (WebUI), 6195 (WeChat), 6199 (QQ), etc.
- Volume mount required: `./data:/AstrBot/data`

## Multi-language Support
- Documentation in Chinese (README.md), English (README_en.md), Japanese (README_ja.md)
- UI supports internationalization
- Default language is Chinese

Remember: This is a production chatbot framework with real users. Always test thoroughly and ensure changes don't break existing functionality.
