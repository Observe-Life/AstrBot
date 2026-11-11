/*
 * 细滚动条：隐藏 WebView 原生悬浮滚动条，自绘 4px 细条。
 *
 * 安卓 WebView 的滚动条是系统绘制的悬浮条（粗、模糊、CSS 收不细），
 * 网页端浏览器则按网页样式绘制细条。这里统一改成自绘细条，双端观感一致。
 *
 * 用法：
 *   useThinScrollbar(scrollerRef)             // 条画在元素内部（元素需可定位）
 *   useThinScrollbar(innerRef, shellRef)      // 条画在外层壳（如 textarea 场景）
 */
import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";

const THUMB_CLASS = "thin-scrollbar-thumb";
const HIDE_DELAY = 900;

export function useThinScrollbar(
  target: Ref<HTMLElement | null>,
  host?: Ref<HTMLElement | null>,
) {
  let thumb: HTMLDivElement | null = null;
  let hideTimer = 0;
  let ro: ResizeObserver | null = null;
  let el: HTMLElement | null = null;

  const hostEl = (): HTMLElement | null =>
    host?.value ?? el?.parentElement ?? null;

  const ensureThumb = (): HTMLDivElement | null => {
    const h = hostEl();
    if (!h) return null;
    if (!thumb || !thumb.isConnected) {
      thumb =
        h.querySelector<HTMLDivElement>(`:scope > .${THUMB_CLASS}`) ?? null;
      if (!thumb) {
        thumb = document.createElement("div");
        thumb.className = THUMB_CLASS;
        /* 全部内联样式：不依赖任何全局 CSS，换页面也一定能显示 */
        Object.assign(thumb.style, {
          position: "absolute",
          top: "0",
          right: "2px",
          width: "4px",
          borderRadius: "2px",
          background: "rgba(0, 0, 0, 0.22)",
          opacity: "0",
          transition: "opacity 0.25s ease",
          pointerEvents: "none",
          zIndex: "6",
          willChange: "transform",
        });
        h.appendChild(thumb);
      }
    }
    return thumb;
  };

  const update = (show: boolean) => {
    if (!el) return;
    const t = ensureThumb();
    if (!t) return;
    const sh = el.scrollHeight;
    const ch = el.clientHeight;
    if (sh <= ch + 4) {
      t.style.opacity = "0";
      return;
    }
    const th = Math.max(28, Math.round((ch * ch) / sh));
    const maxTop = ch - th;
    const progress = el.scrollTop / (sh - ch);
    t.style.height = `${th}px`;
    t.style.transform = `translateY(${Math.round(progress * maxTop)}px)`;
    if (show) {
      t.style.opacity = "1";
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (thumb) thumb.style.opacity = "0";
      }, HIDE_DELAY);
    }
  };

  const onScroll = () => update(true);
  const onResize = () => update(false);

  const unbind = () => {
    if (el) el.removeEventListener("scroll", onScroll);
    ro?.disconnect();
    ro = null;
  };

  const bind = () => {
    unbind();
    el = target.value;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    ro = new ResizeObserver(onResize);
    ro.observe(el);
    update(false);
  };

  onMounted(bind);
  watch(target, bind);
  onBeforeUnmount(() => {
    unbind();
    window.clearTimeout(hideTimer);
    thumb?.remove();
    thumb = null;
  });
}
