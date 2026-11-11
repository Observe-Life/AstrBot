<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import { MessageCircle, Pin } from "@lucide/vue";

withDefaults(
  defineProps<{
    title: string;
    subtitle: string;
    active?: boolean;
    running?: boolean;
    pinned?: boolean;
  }>(),
  { active: false, running: false, pinned: false },
);

const emit = defineEmits<{
  (event: "select"): void;
  (event: "long-press"): void;
}>();

const LONG_PRESS_MS = 480;
let pressTimer: number | null = null;
let startX = 0;
let startY = 0;
let longPressed = false;

function clearTimer() {
  if (pressTimer !== null) {
    window.clearTimeout(pressTimer);
    pressTimer = null;
  }
}

function handlePointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  startX = event.clientX;
  startY = event.clientY;
  longPressed = false;
  clearTimer();
  pressTimer = window.setTimeout(() => {
    pressTimer = null;
    longPressed = true;
    emit("long-press");
  }, LONG_PRESS_MS);
}

function handlePointerMove(event: PointerEvent) {
  if (pressTimer === null) return;
  if (
    Math.abs(event.clientX - startX) > 8 ||
    Math.abs(event.clientY - startY) > 8
  ) {
    clearTimer();
  }
}

function handleClick() {
  if (longPressed) {
    longPressed = false;
    return;
  }
  emit("select");
}

onBeforeUnmount(clearTimer);
</script>

<template>
  <div
    class="session-item"
    :class="{ active, running }"
    role="button"
    tabindex="0"
    @click="handleClick"
    @keydown.enter="emit('select')"
    @keydown.space.prevent="emit('select')"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="clearTimer"
    @pointercancel="clearTimer"
    @pointerleave="clearTimer"
    @contextmenu.prevent
  >
    <span class="session-avatar">
      <MessageCircle :size="19" />
      <span v-if="pinned" class="session-pin" aria-label="已置顶">
        <Pin :size="10" />
      </span>
    </span>
    <span class="session-body">
      <span class="session-title">{{ title }}</span>
      <span class="session-sub">{{ subtitle }}</span>
    </span>
    <span class="session-meta">
      <v-progress-circular
        v-if="running"
        indeterminate
        size="14"
        width="2"
      />
    </span>
  </div>
</template>

<style scoped>
.session-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 8px;
  border-radius: 14px;
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .session-item:hover {
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
}

.session-item.active {
  background: rgba(1, 102, 255, 0.08);
}

.session-avatar {
  position: relative;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(1, 102, 255, 0.1);
  color: rgb(1, 102, 255);
}

.session-item.active .session-avatar {
  background: rgba(1, 102, 255, 0.16);
}

.session-pin {
  position: absolute;
  left: -4px;
  top: -4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 0 0 1.5px rgba(1, 102, 255, 0.22);
  color: rgb(1, 102, 255);
}

.session-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.session-title {
  font-size: 15.5px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-sub {
  font-size: 12.5px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}
</style>
