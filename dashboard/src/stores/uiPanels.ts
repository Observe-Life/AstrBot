import { defineStore } from "pinia";

/**
 * 顶栏里的两个弹窗（更新 AstrBot、修改账户）由 VerticalHeader 持有。
 * 底部“设置”标签页需要能触发它们，这里用一个小 store 做开关。
 */
export const useUiPanelsStore = defineStore("uiPanels", {
  state: () => ({
    updateDialogOpen: false,
    accountDialogOpen: false,
    /** 底部标签栏当前页：list / chat / extensions / settings */
    activeChatTab: "chat" as "list" | "chat" | "extensions" | "settings",
  }),
  actions: {
    SET_ACTIVE_TAB(tab: "list" | "chat" | "extensions" | "settings") {
      this.activeChatTab = tab;
    },
    OPEN_UPDATE_DIALOG() {
      this.updateDialogOpen = true;
    },
    CLOSE_UPDATE_DIALOG() {
      this.updateDialogOpen = false;
    },
    OPEN_ACCOUNT_DIALOG() {
      this.accountDialogOpen = true;
    },
    CLOSE_ACCOUNT_DIALOG() {
      this.accountDialogOpen = false;
    },
  },
});
