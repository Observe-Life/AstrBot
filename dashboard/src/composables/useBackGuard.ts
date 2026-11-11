import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";

/**
 * 让「浮层/子页面」响应手机返回手势：
 * 打开时压入一条同地址的历史记录，用户返回时只关闭这一层，而不是退出整个页面。
 */
export function useBackGuard(isOpen: Ref<boolean>) {
  let pushed = false;

  function handlePopState() {
    if (!isOpen.value) return;
    pushed = false;
    isOpen.value = false;
  }

  watch(
    isOpen,
    (open) => {
      if (open && !pushed) {
        try {
          history.pushState(
            { ...(history.state || {}), backGuard: true },
            "",
          );
          pushed = true;
        } catch {
          pushed = false;
        }
        return;
      }
      if (!open && pushed) {
        pushed = false;
        history.back();
      }
    },
    { flush: "post" },
  );

  onMounted(() => window.addEventListener("popstate", handlePopState));
  onBeforeUnmount(() => window.removeEventListener("popstate", handlePopState));
}
