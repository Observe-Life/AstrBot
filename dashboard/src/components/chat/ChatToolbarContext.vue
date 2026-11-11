<script setup lang="ts">
import { computed } from "vue";
import { useChatHeaderStore } from "@/stores/chatHeader";
import { useUiPanelsStore } from "@/stores/uiPanels";

const props = defineProps<{ alwaysVisible?: boolean }>();

const chatHeader = useChatHeaderStore();
const uiPanels = useUiPanelsStore();

const title = computed(() => {
  const t = chatHeader.title.trim();
  const s = chatHeader.subtitle.trim();
  if (t && s) return `${s} / ${t}`;
  return t || s;
});

/* 会话标题只在「会话」标签页显示；其它标签页整条标题栏隐去 */
const visible = computed(
  () => props.alwaysVisible || uiPanels.activeChatTab === "chat",
);
</script>

<template>
  <div v-show="visible && !!title" class="chat-toolbar-context">
    <span class="chat-toolbar-context-title">{{ title }}</span>
  </div>
</template>

<style scoped>
.chat-toolbar-context {
  display: flex;
  min-width: 0;
  width: 100%;
  align-items: center;
  justify-content: center; /* 标题居中 */
}

.chat-toolbar-context-title {
  max-width: 100%;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.0625rem; /* 17px */
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}
</style>
