/**
 * v-pull-refresh —— 移动端下拉刷新
 *
 * 用法：<div class="scroll-area" v-pull-refresh="onRefresh"> ... </div>
 * - onRefresh 可为同步或异步函数；执行期间指示器保持转圈。
 * - 仅在滚动容器滚到顶部（scrollTop <= 0）时生效，不影响正常滚动。
 * - 指示器是 body 下的独立固定层，不进 Vue 管理的 DOM，避免 patch 冲突。
 */
import type { Directive } from "vue";

const THRESHOLD = 64; // 触发刷新的下拉距离
const MAX_PULL = 96; // 最大可拉距离
const DAMPING = 0.45; // 阻尼系数

interface PullState {
  startY: number;
  tracking: boolean;
  pull: number;
  refreshing: boolean;
  indicator: HTMLElement;
  spinner: HTMLElement;
  el: HTMLElement;
}

const states = new WeakMap<HTMLElement, PullState>();

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.pull-refresh-indicator {
  position: fixed;
  left: 50%;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.16);
  transform: translate(-50%, -50%) scale(0.9);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.pull-refresh-indicator.is-visible {
  opacity: 1;
}
.pull-refresh-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0, 0, 0, 0.12);
  border-top-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
}
.pull-refresh-indicator.is-loading .pull-refresh-spinner {
  animation: pullRefreshSpin 0.7s linear infinite;
}
@keyframes pullRefreshSpin {
  to { transform: rotate(360deg); }
}
`;
  document.head.appendChild(style);
}

function createIndicator(): { wrap: HTMLElement; spinner: HTMLElement } {
  injectStyle();
  const wrap = document.createElement("div");
  wrap.className = "pull-refresh-indicator";
  const spinner = document.createElement("span");
  spinner.className = "pull-refresh-spinner";
  wrap.appendChild(spinner);
  document.body.appendChild(wrap);
  return { wrap, spinner };
}

function positionIndicator(state: PullState, visible: boolean) {
  const rect = state.el.getBoundingClientRect();
  const y = Math.max(16, rect.top + 18);
  state.indicator.style.top = `${y}px`;
  state.indicator.classList.toggle("is-visible", visible);
}

async function runRefresh(el: HTMLElement, state: PullState) {
  const handler = (el as HTMLElement & { __pullRefreshHandler?: () => unknown })
    .__pullRefreshHandler;
  if (!handler) return;
  state.refreshing = true;
  state.indicator.classList.add("is-loading");
  positionIndicator(state, true);
  try {
    await handler();
  } catch (error) {
    console.error("[pull-refresh]", error);
  } finally {
    state.refreshing = false;
    state.indicator.classList.remove("is-loading");
    state.indicator.classList.remove("is-visible");
    el.style.transition = "transform 0.22s ease";
    el.style.transform = "";
    state.pull = 0;
  }
}

function handleTouchStart(el: HTMLElement, state: PullState, event: TouchEvent) {
  if (state.refreshing) return;
  if (el.scrollTop > 0) {
    state.tracking = false;
    return;
  }
  state.startY = event.touches[0].clientY;
  state.tracking = true;
  state.pull = 0;
}

function handleTouchMove(el: HTMLElement, state: PullState, event: TouchEvent) {
  if (!state.tracking || state.refreshing) return;
  const dy = event.touches[0].clientY - state.startY;
  if (dy <= 0 || el.scrollTop > 0) {
    state.tracking = dy <= 0 ? state.tracking : false;
    if (state.pull > 0) {
      state.pull = 0;
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "";
    }
    return;
  }
  if (event.cancelable) event.preventDefault();
  state.pull = Math.min(MAX_PULL, dy * DAMPING);
  el.style.transition = "none";
  el.style.transform = `translateY(${state.pull}px)`;
  positionIndicator(state, state.pull > 4);
}

function handleTouchEnd(el: HTMLElement, state: PullState) {
  if (!state.tracking) return;
  state.tracking = false;
  if (state.pull >= THRESHOLD) {
    el.style.transition = "transform 0.22s ease";
    el.style.transform = `translateY(${THRESHOLD * 0.5}px)`;
    void runRefresh(el, state);
  } else {
    state.pull = 0;
    el.style.transition = "transform 0.22s ease";
    el.style.transform = "";
  }
}

export const pullRefresh: Directive<HTMLElement, () => unknown> = {
  mounted(el, binding) {
    if (!document.body) return;
    const { wrap, spinner } = createIndicator();
    const state: PullState = {
      startY: 0,
      tracking: false,
      pull: 0,
      refreshing: false,
      indicator: wrap,
      spinner,
      el,
    };
    states.set(el, state);
    (el as HTMLElement & { __pullRefreshHandler?: () => unknown })
      .__pullRefreshHandler = binding.value;

    el.addEventListener("touchstart", (e) => handleTouchStart(el, state, e), {
      passive: true,
    });
    el.addEventListener("touchmove", (e) => handleTouchMove(el, state, e), {
      passive: false,
    });
    el.addEventListener("touchend", () => handleTouchEnd(el, state));
    el.addEventListener("touchcancel", () => handleTouchEnd(el, state));
  },
  updated(el, binding) {
    (el as HTMLElement & { __pullRefreshHandler?: () => unknown })
      .__pullRefreshHandler = binding.value;
  },
  unmounted(el) {
    const state = states.get(el);
    if (state) {
      state.indicator.remove();
      states.delete(el);
    }
  },
};

export default pullRefresh;
