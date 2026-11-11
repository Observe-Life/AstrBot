<template>
  <div
    v-if="props.active"
    class="chat-ui"
    :class="{
      'is-dark': isDark,
      'sidebar-collapsed': isSidebarCollapsed,
      'is-wide': isWide,
    }"
  >
    <div
      class="chat-tab-content"
      @touchstart.passive="onTabSwipeStart"
      @touchend.passive="onTabSwipeEnd"
    >
    <section
      v-if="activeTab === 'list' || isWide"
      class="chat-tab chat-tab--list"
      :class="tabAnimClass"
    >
      <div class="list-header">
        <button class="list-search" type="button" @click="openSearch">
          <Search :size="18" class="list-search-icon" />
          <span class="list-search-text">搜索</span>
        </button>
        <button
          class="list-create"
          type="button"
          aria-label="创建会话"
          @click="startNewChat"
        >
          <SquarePen :size="22" />
        </button>
      </div>
      <div class="tab-list-inner">
        <div
          ref="sidebarContent"
          class="sidebar-content tab-list-scroll"
          @scroll.passive="loadMoreSessions"
        >
        <section v-if="pinnedSessions.length" class="sidebar-section pinned-section">
          <button
            class="sidebar-section-header pinned-header"
            type="button"
            @click="pinnedOpen = !pinnedOpen"
          >
            <span>置顶</span>
            <ChevronDown
              :size="16"
              class="pinned-chevron"
              :class="{ 'is-open': pinnedOpen }"
            />
          </button>
          <template v-if="pinnedOpen">
            <ChatSessionRow
              v-for="session in pinnedSessions"
              :key="session.session_id"
              :title="sessionTitle(session)"
              :subtitle="sessionSubtitle(session)"
              :active="!isProviderWorkspace && currSessionId === session.session_id"
              :running="isSessionRunning(session.session_id)"
              :pinned="true"
              @select="selectSession(session.session_id)"
              @long-press="openSessionSheet(session)"
            />
          </template>
        </section>

        <ProjectList
          ref="sidebarProjects"
          :projects="projects"
          :project-sessions="projectSessionsById"
          :loading-project-ids="loadingProjectSessionIds"
          :selected-project-id="selectedProjectId"
          :active-session-id="currSessionId"
          :is-session-running="isSessionRunning"
          @create-project="openCreateProjectDialog"
          @edit-project="openEditProjectDialog"
          @delete-project="handleDeleteProject"
          @toggle-project="handleProjectToggle"
          @select-project="selectProject"
          @select-session="selectProjectSession"
          @edit-session-title="editProjectSessionTitle"
          @delete-session="deleteProjectSession"
        />

        <section class="sidebar-section session-list">
          <div class="sidebar-section-header">
            <span>{{ tm("conversation.title") }}</span>
          </div>
          <ChatSessionRow
            v-for="session in unpinnedSessions"
            :key="session.session_id"
            :title="sessionTitle(session)"
            :subtitle="sessionSubtitle(session)"
            :active="!isProviderWorkspace && currSessionId === session.session_id"
            :running="isSessionRunning(session.session_id)"
            :pinned="false"
            @select="selectSession(session.session_id)"
            @long-press="openSessionSheet(session)"
          />
          <v-progress-linear
            v-if="sessionsPagination.loading"
            color="primary"
            height="2"
            indeterminate
            :aria-label="tm('conversation.loading')"
          />
          <ChatLoadError
            v-if="sessionsPagination.error"
            :message="tm('conversation.loadFailed')"
            :loading="sessionsPagination.loading"
            @retry="getSessions(sessionsPagination.append)"
          />
        </section>
        </div>
      </div>
      <div
        v-if="sheetSession"
        class="sheet-backdrop"
        @click="closeSessionSheet"
      >
        <div class="sheet" @click.stop>
          <div class="sheet-title">{{ sessionTitle(sheetSession) }}</div>
          <button class="sheet-item" type="button" @click="togglePin(sheetSession)">
            {{ isPinned(sheetSession.session_id) ? "取消置顶" : "置顶" }}
          </button>
          <button class="sheet-item" type="button" @click="renameFromSheet">
            重命名
          </button>
          <button
            class="sheet-item sheet-item--danger"
            type="button"
            @click="deleteFromSheet"
          >
            删除
          </button>
        </div>
      </div>

      <div v-if="searchOpen" class="search-panel">
        <div class="search-bar">
          <div class="search-field">
            <Search :size="18" class="search-field-icon" />
            <input
              v-model="searchQuery"
              class="search-input"
              type="search"
              placeholder="搜索智能体会话"
              @keydown.enter="commitSearch"
            />
          </div>
          <button class="search-cancel" type="button" @click="closeSearch">
            取消
          </button>
        </div>
        <div v-if="searchHistory.length" class="search-history">
          <div
            v-for="(item, index) in searchHistory"
            :key="item + index"
            class="search-history-row"
          >
            <button
              class="search-history-main"
              type="button"
              @click="applyHistory(item)"
            >
              <History :size="18" class="search-history-icon" />
              <span class="search-history-text">{{ item }}</span>
            </button>
            <button
              class="search-history-del"
              type="button"
              aria-label="删除该记录"
              @click="removeHistory(index)"
            >
              <X :size="18" />
            </button>
          </div>
          <button class="search-clear" type="button" @click="clearHistory">
            清空全部搜索记录
          </button>
        </div>
      </div>
      <div v-if="isWide" class="wide-sidebar-footer">
        <button
          type="button"
          class="wide-footer-btn"
          :class="{ active: activeTab === 'extensions' }"
          @click="selectTab('extensions')"
        >
          <Puzzle :size="17" />
          <span>扩展</span>
        </button>
        <button
          type="button"
          class="wide-footer-btn"
          :class="{ active: activeTab === 'settings' }"
          @click="selectTab('settings')"
        >
          <Settings :size="17" />
          <span>设置</span>
        </button>
      </div>
    </section>

    <main
      v-if="activeTab === 'chat' || (isWide && activeTab === 'list')"
      class="chat-main"
      :class="[tabAnimClass, {
        'empty-chat': isEmptyChat,
        'has-side-panel':
          threadPanelOpen ||
          reasoningPanelOpen ||
          refsSidebarOpen ||
          chatHeader.workspaceFilesOpen,
      }]"
      v-on="dragEvents"
    >
      <header v-if="isWide" class="chat-desktop-topbar">
        <ChatToolbarContext always-visible />
      </header>
      <transition name="drop-fade">
        <div
          v-if="isDragging && !isProviderWorkspace"
          class="chat-drop-overlay"
        >
          <div class="chat-drop-overlay-content">
            <v-icon size="48" color="primary">mdi-cloud-upload</v-icon>
            <span class="chat-drop-text">{{ tm("input.dropToUpload") }}</span>
          </div>
        </div>
      </transition>
      <section v-if="isProviderWorkspace" class="provider-workspace-shell">
        <ProviderChatCompletionPanel
          class="provider-workspace-page"
          :show-border="false"
        />
      </section>

      <ProjectView
        v-else-if="selectedProject"
        :project="selectedProject"
        :sessions="projectSessions"
        @select-session="selectProjectSession"
        @edit-session-title="editProjectSessionTitle"
        @delete-session="deleteProjectSession"
      >
        <section class="project-composer-shell">
          <ChatInput
            ref="inputRef"
            v-model:prompt="draft"
            :staged-images-url="stagedImagesUrl"
            :staged-audio-url="stagedAudioUrl"
            :staged-files="stagedNonImageFiles"
            :disabled="sending"
            :is-recording="isRecording"
            :is-running="
              Boolean(currSessionId && isSessionRunning(currSessionId))
            "
            :token-usage="tokenUsageIndicator"
            :session-id="currSessionId || null"
            :current-session="currentSession"
            :reply-to="chatInputReplyTarget"
            :send-shortcut="sendShortcut"
            :show-provider-selector="true"
            :failed-uploads="failedUploadViews"
            :active-uploads="activeUploadViews"
            :placeholder="tm('input.projectPlaceholder')"
            @send="sendCurrentMessage"
            @stop="stopCurrentSession"
            @compress-context="compactCurrentContext"
            @remove-image="removeImage"
            @remove-audio="removeAudio"
            @remove-file="removeFile"
            @retry-failed-upload="retryFailedUpload"
            @discard-failed-upload="discardFailedUpload"
            @cancel-active-upload="cancelActiveUpload"
            @start-recording="startRecording"
            @stop-recording="stopRecording"
            @paste-image="handlePaste"
            @file-select="handleFilesSelected"
            @clear-reply="replyTarget = null"
          />
        </section>
      </ProjectView>

      <div
        v-else
        class="conversation-stack"
        :class="{ 'is-empty': isEmptyChat }"
      >
        <v-progress-linear
          v-if="activeSessionPagination?.loading"
          class="history-loading"
          color="primary"
          height="2"
          indeterminate
          absolute
          location="top"
          :aria-label="tm('history.loading')"
        />
        <section
          ref="messagesContainer"
          class="messages-panel"
          :class="{ 'history-anchor-locked': suppressAutoScroll }"
          tabindex="0"
          @scroll="handleMessagesScroll"
          @wheel.passive="handleMessagesInteraction"
          @touchstart.passive="handleMessagesInteraction"
          @touchmove.passive="handleMessagesInteraction"
          @pointerdown="handleMessagesInteraction"
          @keydown="handleMessagesInteraction"
        >
          <div v-if="loadingMessages" class="center-state">
            <v-progress-circular indeterminate size="32" width="3" />
          </div>

          <div
            v-else-if="!activeMessages.length && activeSessionPagination?.error"
            class="welcome-state"
          >
            <ChatLoadError
              :message="tm('history.loadFailed')"
              :loading="loadingMessages"
              @retry="retryCurrentSessionLoad"
            />
          </div>

          <div v-else-if="!activeMessages.length" class="welcome-state">
            <div class="welcome-title">{{ tm("welcome.title") }}</div>
          </div>

          <div
            v-if="!messagesViewReady && !loadingMessages && activeMessages.length"
            class="center-state"
          >
            <v-progress-circular indeterminate size="28" width="3" />
          </div>

          <div
            v-if="!loadingMessages && activeMessages.length && messagesViewReady"
            ref="messagesContent"
            class="messages-list-shell"
          >
            <ChatLoadError
              v-if="activeSessionPagination?.error"
              class="history-load-error"
              :message="tm('history.loadEarlierFailed')"
              :loading="activeSessionPagination.loading"
              @retry="retryCurrentSessionLoad"
            />
            <ChatMessageList
              v-model:edit-draft="messageEditDraft"
              :messages="activeMessages"
              :is-dark="isDark"
              :is-streaming="
                Boolean(currSessionId && isSessionRunning(currSessionId))
              "
              :enable-edit="
                !Boolean(currSessionId && isSessionRunning(currSessionId))
              "
              enable-regenerate
              enable-thread-selection
              :manage-refs-sidebar="false"
              :editing-message-id="editingMessage?.id || null"
              :saving-edit="savingMessageEdit"
              @open-edit="openMessageEdit"
              @cancel-edit="cancelMessageEdit"
              @save-edit="saveMessageEdit"
              @regenerate="handleRegenerateMessage"
              @regenerate-with-model="handleRegenerateMessage"
              @select-bot-text="handleBotTextSelection"
              @open-thread="openThreadPanel"
              @open-reasoning="openReasoningPanel"
              @open-refs="openRefsSidebar"
            />
          </div>
        </section>

        <section ref="composerShell" class="composer-shell">
          <ChatInput
            ref="inputRef"
            v-model:prompt="draft"
            :staged-images-url="stagedImagesUrl"
            :staged-audio-url="stagedAudioUrl"
            :staged-files="stagedNonImageFiles"
            :disabled="sending"
            :is-recording="isRecording"
            :is-running="
              Boolean(currSessionId && isSessionRunning(currSessionId))
            "
            :token-usage="tokenUsageIndicator"
            :session-id="currSessionId || null"
            :current-session="currentSession"
            :reply-to="chatInputReplyTarget"
            :send-shortcut="sendShortcut"
            :show-provider-selector="true"
            :show-scroll-to-bottom="isAwayFromBottom && !shouldStickToBottom"
            @scroll-to-bottom="scrollToBottom(true)"
            :failed-uploads="failedUploadViews"
            :active-uploads="activeUploadViews"
            :placeholder="
              activeProject ? tm('input.projectPlaceholder') : undefined
            "
            @send="sendCurrentMessage"
            @stop="stopCurrentSession"
            @compress-context="compactCurrentContext"
            @remove-image="removeImage"
            @remove-audio="removeAudio"
            @remove-file="removeFile"
            @retry-failed-upload="retryFailedUpload"
            @discard-failed-upload="discardFailedUpload"
            @cancel-active-upload="cancelActiveUpload"
            @start-recording="startRecording"
            @stop-recording="stopRecording"
            @paste-image="handlePaste"
            @file-select="handleFilesSelected"
            @clear-reply="replyTarget = null"
          />
        </section>
      </div>
    </main>

    <section
      v-if="activeTab === 'extensions'"
      class="chat-tab chat-tab--blank"
      :class="tabAnimClass"
    >
      <p class="tab-blank-text">敬请期待</p>
    </section>

    <section
      v-if="activeTab === 'settings'"
      class="chat-tab chat-tab--settings"
      :class="tabAnimClass"
    >
      <!-- 二级页：模型配置 -->
      <div v-if="settingsSub === 'providers'" class="settings-subpage-provider">
        <button class="settings-back" type="button" @click="settingsSub = null">
          <ArrowLeft :size="20" />
          <span>模型配置</span>
        </button>
        <div class="settings-provider-body">
          <ProviderChatCompletionPanel :show-border="false" />
        </div>
      </div>

      <!-- 二级页：语言 -->
      <div v-else-if="settingsSub === 'language'" class="settings-scroll">
        <button class="settings-back" type="button" @click="settingsSub = null">
          <ArrowLeft :size="20" />
          <span>语言</span>
        </button>
        <div class="settings-card">
          <button
            v-for="lang in languageOptions"
            :key="lang.value"
            type="button"
            class="settings-row"
            @click="switchLanguage(lang.value as Locale)"
          >
            <span class="settings-name">{{ lang.flag }} {{ lang.label }}</span>
            <Check
              v-if="currentLanguage?.value === lang.value"
              :size="19"
              class="settings-check"
            />
          </button>
        </div>
      </div>

      <!-- 二级页：主题 -->
      <div v-else-if="settingsSub === 'theme'" class="settings-scroll">
        <button class="settings-back" type="button" @click="settingsSub = null">
          <ArrowLeft :size="20" />
          <span>主题</span>
        </button>
        <div class="settings-card">
          <button
            v-for="opt in themeChoices"
            :key="opt.mode"
            type="button"
            class="settings-row"
            @click="setThemeMode(opt.mode)"
          >
            <span class="settings-name">{{ opt.label }}</span>
            <Check
              v-if="customizer.themeMode === opt.mode"
              :size="19"
              class="settings-check"
            />
          </button>
        </div>
      </div>

      <!-- 主页 -->
      <div v-else class="settings-scroll">
        <div class="settings-card">
          <button class="settings-row" type="button" @click="openProviderSettings">
            <Box :size="20" class="settings-icon" />
            <span class="settings-name">模型配置</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
          <button class="settings-row" type="button" @click="settingsOpen = true">
            <Settings :size="20" class="settings-icon" />
            <span class="settings-name">聊天设置</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
          <button class="settings-row" type="button" @click="settingsSub = 'language'">
            <Languages :size="20" class="settings-icon" />
            <span class="settings-name">语言</span>
            <span class="settings-value">{{ currentLanguage?.label }}</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
          <button class="settings-row" type="button" @click="settingsSub = 'theme'">
            <SunMoon :size="20" class="settings-icon" />
            <span class="settings-name">主题</span>
            <span class="settings-value">{{ currentThemeLabel }}</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
        </div>

        <div class="settings-card">
          <button class="settings-row" type="button" @click="openUpdatePanel">
            <RefreshCw :size="20" class="settings-icon" />
            <span class="settings-name">更新 AstrBot</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
          <button class="settings-row" type="button" @click="openAccountPanel">
            <User :size="20" class="settings-icon" />
            <span class="settings-name">修改账户</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
        </div>

        <div class="settings-card">
          <button class="settings-row" type="button" @click="enterAdmin">
            <LayoutGrid :size="20" class="settings-icon" />
            <span class="settings-name">进入后台管理</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
        </div>

        <div class="settings-card">
          <button
            class="settings-row settings-row--danger"
            type="button"
            @click="authStore.logout()"
          >
            <LogOut :size="20" class="settings-icon" />
            <span class="settings-name">退出登录</span>
          </button>
        </div>

        <div class="settings-card">
          <button class="settings-row" type="button" @click="openServerDialog">
            <Globe :size="20" class="settings-icon" />
            <span class="settings-name">连接服务器</span>
            <span
              class="settings-value"
              :class="{ 'settings-value--muted': !serverConnected }"
            >{{ serverUrl || "未连接" }}</span>
            <ChevronRight :size="18" class="settings-chevron" />
          </button>
        </div>
      </div>
    </section>

    <ChatSettingsDialog
      v-model="settingsOpen"
      v-model:enable-streaming="enableStreaming"
      v-model:enable-reasoning="enableReasoning"
      v-model:send-shortcut="sendShortcut"
      v-model:transport-mode="transportMode"
    />

    </div>

    <div
      v-if="!serverConnected && activeTab !== 'settings'"
      class="server-offline-mask"
    >
      <div class="server-offline-card">
        <Unplug :size="44" class="server-offline-icon" />
        <div class="server-offline-title">未连接服务器</div>
        <p class="server-offline-text">
          先到「设置」页填写 AstrBot 后端网址，连接后即可使用聊天与列表。
        </p>
        <button
          class="server-offline-btn"
          type="button"
          @click="openServerDialog"
        >
          去连接
        </button>
      </div>
    </div>

    <nav v-if="!searchOpen" class="chat-tabbar" aria-label="主导航">
      <button
        v-for="tab in chatTabs"
        :key="tab.key"
        type="button"
        class="chat-tabbar-btn"
        :class="{ active: activeTab === tab.key }"
        @click="onTabClick(tab.key)"
      >
        <component :is="tab.icon" :size="22" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div
      v-if="threadSelection.visible"
      class="thread-selection-action"
      :style="{
        left: `${threadSelection.left}px`,
        top: `${threadSelection.top}px`,
      }"
    >
      <button
        class="thread-selection-button"
        type="button"
        @click="createThreadFromSelection"
      >
        {{ tm("thread.askInThread") }}
      </button>
    </div>

    <div
      v-if="serverDialogOpen"
      class="server-dialog-mask"
      @click.self="serverDialogOpen = false"
    >
      <div class="server-dialog" role="dialog" aria-label="连接服务器">
        <div class="server-dialog-title">连接服务器</div>
        <input
          v-model="serverDraft"
          class="server-dialog-input"
          type="url"
          inputmode="url"
          enterkeyhint="done"
          autocomplete="off"
          spellcheck="false"
          placeholder="http://192.168.31.115:6185"
          @keydown.enter.prevent="saveServerUrl"
        />
        <p class="server-dialog-hint">
          填 AstrBot 后端的内网网址，例如 http://192.168.31.115:6185
        </p>
        <div class="server-dialog-actions">
          <button
            v-if="serverConnected"
            class="server-dialog-btn"
            type="button"
            @click="disconnectServer"
          >
            断开
          </button>
          <button
            class="server-dialog-btn server-dialog-btn--primary"
            type="button"
            @click="saveServerUrl"
          >
            确定
          </button>
        </div>
      </div>
    </div>

    <ProjectDialog
      v-model="projectDialogOpen"
      :project="editingProject"
      :error-message="projectDialogError"
      :saving="savingProject"
      @save="saveProject"
    />
    <v-dialog v-model="sessionTitleDialogOpen" max-width="420">
      <v-card>
        <v-card-title class="text-h3 pa-4 pb-0 pl-6">
          {{ tm("conversation.editDisplayName") }}
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="sessionTitleDraft"
            :label="tm('conversation.displayName')"
            variant="outlined"
            density="comfortable"
            hide-details
            autofocus
            @keydown.enter="saveSessionTitleDialog"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="sessionTitleDialogOpen = false">
            {{ t("core.common.cancel") }}
          </v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            :loading="savingSessionTitle"
            @click="saveSessionTitleDialog"
          >
            {{ t("core.common.save") }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <ThreadPanel
      v-model="threadPanelOpen"
      :thread="activeThread"
      :is-dark="isDark"
      :deleting="deletingThread"
      :get-provider-selection="getSelectedProviderSelection"
      @delete="deleteThread"
    />
    <ReasoningSidebar
      v-model="reasoningPanelOpen"
      :parts="activeReasoningParts"
      :is-dark="isDark"
    />
    <RefsSidebar v-model="refsSidebarOpen" :refs="selectedRefs" />
    <WorkspaceFilesPanel
      :model-value="chatHeader.workspaceFilesOpen"
      :project-id="activeProject?.project_id || ''"
      :project-title="activeProject?.title || ''"
      @update:model-value="chatHeader.SET_WORKSPACE_FILES_OPEN"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  provide,
  reactive,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDisplay, useTheme } from "vuetify";
import { isAxiosError } from "axios";
import {
  ArrowDown,
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Languages,
  LayoutGrid,
  List,
  LogOut,
  MessageCircle,
  PanelLeft,
  Pencil,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  SquarePen,
  SunMoon,
  Trash2,
  User,
  X,
  Globe,
  Unplug,
} from "@lucide/vue";
import { chatApi, conversationApi, providerApi } from "@/api/v1";
import { webuiExtApi } from "@/api/webuiExt";
import ChatSettingsDialog from "@/components/chat/ChatSettingsDialog.vue";
import ChatToolbarContext from "@/components/chat/ChatToolbarContext.vue";
import type { Locale } from "@/i18n/types";
import ProjectDialog, {
  type ProjectFormData,
} from "@/components/chat/ProjectDialog.vue";
import ProjectList, { type Project } from "@/components/chat/ProjectList.vue";
import ProjectView from "@/components/chat/ProjectView.vue";
import ChatInput from "@/components/chat/ChatInput.vue";
import ChatMessageList from "@/components/chat/ChatMessageList.vue";
import ChatUILogo from "@/components/chat/ChatUILogo.vue";
import type { RegenerateModelSelection } from "@/components/chat/RegenerateMenu.vue";
import ChatLoadError from "@/components/chat/ChatLoadError.vue";
import ChatSessionRow from "@/components/chat/ChatSessionRow.vue";
import ReasoningSidebar from "@/components/chat/ReasoningSidebar.vue";
import ThreadPanel from "@/components/chat/ThreadPanel.vue";
import WorkspaceFilesPanel from "@/components/chat/WorkspaceFilesPanel.vue";
import RefsSidebar from "@/components/chat/message_list_comps/RefsSidebar.vue";
import {
  ensureDefaultServerUrl,
  getServerUrl,
  setServerUrl,
} from "@/composables/useServerAddress";
import { useSessions, type Session } from "@/composables/useSessions";
import {
  messageBlocks as buildMessageBlocks,
  useMessages,
  type ChatRecord,
  type ChatThread,
  type MessagePart,
  type TransportMode,
} from "@/composables/useMessages";
import { useMediaHandling } from "@/composables/useMediaHandling";
import { useRecording } from "@/composables/useRecording";
import { useProjects } from "@/composables/useProjects";
import { useDragUpload } from "@/composables/useDragUpload";
import { useProviderModelSelection } from "@/composables/useProviderModelSelection";
import { useChatHeaderStore } from "@/stores/chatHeader";
import { useHeaderContextStore } from "@/stores/headerContext";
import { useMobileDrawerStore } from "@/stores/mobileDrawer";
import { useCustomizerStore } from "@/stores/customizer";
import { useAuthStore } from "@/stores/auth";
import { useUiPanelsStore } from "@/stores/uiPanels";
import ProviderChatCompletionPanel from "@/components/provider/ProviderChatCompletionPanel.vue";
import {
  useI18n,
  useLanguageSwitcher,
  useModuleI18n,
} from "@/i18n/composables";
import { askForConfirmation, useConfirmDialog } from "@/utils/confirmDialog";
import {
  contextLimit,
  formatTokenCount,
  type ProviderModelMetadata,
  type ProviderMetadataSource,
} from "@/utils/providerMetadata";
import { useToast } from "@/utils/toast";
import { useBackGuard } from "@/composables/useBackGuard";
import { readChatDraft, writeChatDraft } from "@/utils/chatDraftStorage.mjs";

const props = withDefaults(
  defineProps<{ chatboxMode?: boolean; active?: boolean }>(),
  {
    chatboxMode: false,
    active: true,
  },
);

const route = useRoute();
const router = useRouter();
const chatHeader = useChatHeaderStore();
const headerContext = useHeaderContextStore();
const mobileDrawer = useMobileDrawerStore();

/* 宽屏（电脑版）：列表与会话合并为左右两栏 */
const WIDE_QUERY = "(min-width: 961px)";
const isWide = ref(
  typeof window === "undefined"
    ? false
    : window.matchMedia(WIDE_QUERY).matches,
);
function syncIsWide(event: MediaQueryListEvent | MediaQueryList) {
  isWide.value = event.matches;
}

/* Project the chat toolbar context (model selector + session title) into the
   top toolbar only while the chat page is actually visible.
   宽屏下标题由聊天页自己画，不再塞进全局顶栏。 */
watch(
  [() => props.active, isWide],
  ([active, wide]) =>
    headerContext.SET_COMPONENT(
      active && !wide ? markRaw(ChatToolbarContext) : null,
    ),
  { immediate: true },
);

onUnmounted(() => headerContext.SET_COMPONENT(null));
const customizer = useCustomizerStore();
const { t } = useI18n();
const { tm } = useModuleI18n("features/chat");
const confirmDialog = useConfirmDialog();
const toast = useToast();
const {
  sessions,
  sessionsPagination,
  currSessionId,
  getSessions,
  newSession,
  newChat,
  deleteSession,
  updateSessionTitle,
} = useSessions(props.chatboxMode);
const {
  projects,
  selectedProjectId,
  getProjects,
  createProject,
  updateProject,
  deleteProject: deleteProjectById,
  addSessionToProject,
  getProjectSessions,
} = useProjects();

const {
  stagedFiles,
  stagedImagesUrl,
  stagedAudioUrl,
  stagedNonImageFiles,
  failedUploadViews,
  activeUploadViews,
  processAndUploadImage,
  processAndUploadFile,
  handlePaste,
  removeImage,
  removeAudio,
  removeFile,
  retryFailedUpload,
  discardFailedUpload,
  cancelActiveUpload,
  clearStaged,
  cleanupMediaCache,
} = useMediaHandling();

const { isDragging, dragEvents } = useDragUpload((files) => {
  if (isProviderWorkspace.value) return;
  handleFilesSelected(files);
});

type WorkspaceView = "chat" | "providers";

interface TokenProviderConfig extends ProviderMetadataSource {
  id: string;
  enable?: boolean;
}

/* ── 连接服务器 ──────────────────────────────
 * 填写 AstrBot 后端内网网址后，安卓壳里所有请求（HTTP/WS）都指向它；
 * 浏览器开发模式数据仍由 vite 代理提供，地址仅作状态记录。 */
const serverUrl = ref(getServerUrl());
const serverDialogOpen = ref(false);
const serverDraft = ref("");
const serverConnected = computed(() => Boolean(serverUrl.value.trim()));
function openServerDialog() {
  serverDraft.value = serverUrl.value || "http://192.168.31.115:6185";
  serverDialogOpen.value = true;
}
function saveServerUrl() {
  serverUrl.value = setServerUrl(serverDraft.value);
  serverDialogOpen.value = false;
  /* 重载以按新地址重建数据与连接 */
  window.location.reload();
}
function disconnectServer() {
  serverUrl.value = setServerUrl("");
  serverDialogOpen.value = false;
  window.location.reload();
}
ensureDefaultServerUrl();
serverUrl.value = getServerUrl();

/* ── 输入法键盘避让 ──────────────────────────
 * 键盘高度写入 --chat-kb-inset，聊天外壳随键盘上移；弹出时消息滚到底。
 * 配合 index.html 的 interactive-widget=resizes-content：支持的浏览器
 * 布局视口自动收缩（此时插入量为 0），两者互补不叠加。 */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const applyKeyboardInset = () => {
    const kb = Math.max(
      0,
      Math.round(window.innerHeight - vv.height - vv.offsetTop),
    );
    document.documentElement.style.setProperty(
      "--chat-kb-inset",
      `${kb}px`,
    );
    if (kb > 0 && activeTab.value === "chat") {
      window.setTimeout(() => scrollToBottom(false), 80);
    }
  };
  vv.addEventListener("resize", applyKeyboardInset);
  vv.addEventListener("scroll", applyKeyboardInset);
  applyKeyboardInset();
}

const activeWorkspace = ref<WorkspaceView>("chat");

/* 底部标签页：列表 / 会话 / 扩展 / 设置 */
type ChatTab = "list" | "chat" | "extensions" | "settings";
const activeTab = ref<ChatTab>("chat");
/* 宽屏下没有独立的“列表页”，进入 #/list 时直接落到 #/session */
watch([isWide, activeTab], ([wide, tab]) => {
  if (wide && tab === "list") selectTab("chat");
});

/* 宽屏下聊天页占满整个窗口，应用顶栏（原本只放标题和模式切换）整条隐去 */
watch(
  [isWide, () => props.active],
  ([wide, active]) => {
    document.documentElement.classList.toggle(
      "astrbot-chat-wide",
      Boolean(wide && active),
    );
  },
  { immediate: true },
);
const chatTabs = [
  { key: "list" as ChatTab, label: "列表", icon: markRaw(List) },
  { key: "chat" as ChatTab, label: "会话", icon: markRaw(MessageCircle) },
  { key: "extensions" as ChatTab, label: "扩展", icon: markRaw(Puzzle) },
  { key: "settings" as ChatTab, label: "设置", icon: markRaw(Settings) },
];
const uiPanels = useUiPanelsStore();



/* 每个标签页一个真实路径，刷新后停在同一页 */
const TAB_PATHS: Record<ChatTab, string> = {
  list: "/list",
  chat: "/session",
  extensions: "/extend",
  settings: "/settings",
};
function tabFromPath(path: string): ChatTab | null {
  if (path === "/list") return "list";
  if (path.startsWith("/session")) return "chat";
  if (path === "/extend") return "extensions";
  if (path === "/settings") return "settings";
  if (path.startsWith("/chat")) return "chat";
  return null;
}
const slideDir = ref<"left" | "right" | "">("");
const tabAnimClass = computed(() =>
  slideDir.value === "left"
    ? "tab-anim-left"
    : slideDir.value === "right"
      ? "tab-anim-right"
      : "",
);

/* 点击标签栏按钮时给一次轻微振动；滑动切换不振动 */
function onTabClick(tab: ChatTab) {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* 部分浏览器不支持振动，忽略 */
  }
  selectTab(tab);
}

function selectTab(tab: ChatTab) {
  const order: ChatTab[] = ["list", "chat", "extensions", "settings"];
  const from = order.indexOf(activeTab.value);
  const to = order.indexOf(tab);
  slideDir.value = to > from ? "left" : to < from ? "right" : "";
  activeTab.value = tab;
  /* 离开会话页时收起侧栏，避免旧内容留在屏幕上 */
  if (tab !== "chat") closeSecondaryPanels();
  /* 回到「会话」页时保留当前打开的会话，否则会被当成新会话 */
  const target =
    tab === "chat" && currSessionId.value
      ? `${TAB_PATHS.chat}/${currSessionId.value}`
      : TAB_PATHS[tab];
  if (!route.path.startsWith(TAB_PATHS[tab])) void router.push(target);
}
watch(
  () => route.path,
  (path) => {
    const tab = tabFromPath(path);
    if (tab) activeTab.value = tab;
  },
  { immediate: true },
);

/* ===== 搜索界面（本轮只做界面，搜索逻辑后续接） ===== */
const SEARCH_HISTORY_KEY = "astrbot:chat-search-history:v1";
const searchOpen = ref(false);
const searchQuery = ref("");
const searchHistory = ref<string[]>(readSearchHistory());

function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((item) => typeof item === "string").slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

function persistSearchHistory() {
  try {
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(searchHistory.value),
    );
  } catch {
    /* 忽略存储失败 */
  }
}

function openSearch() {
  searchOpen.value = true;
}

function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = "";
}

/* 搜索层拦截手机返回手势 */
useBackGuard(searchOpen);

function commitSearch() {
  const keyword = searchQuery.value.trim();
  if (!keyword) return;
  searchHistory.value = [
    keyword,
    ...searchHistory.value.filter((item) => item !== keyword),
  ].slice(0, 10);
  persistSearchHistory();
}

function applyHistory(keyword: string) {
  searchQuery.value = keyword;
}

function removeHistory(index: number) {
  searchHistory.value = searchHistory.value.filter((_, i) => i !== index);
  persistSearchHistory();
}

function clearHistory() {
  searchHistory.value = [];
  persistSearchHistory();
}

/* ===== 左右滑动切换标签页 ===== */
const TAB_ORDER: ChatTab[] = ["list", "chat", "extensions", "settings"];
let swipeStartX = 0;
let swipeStartY = 0;
let swipeTracking = false;

function onTabSwipeStart(event: TouchEvent) {
  if (searchOpen.value) {
    swipeTracking = false;
    return;
  }
  const touch = event.touches[0];
  if (!touch) return;
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeTracking = true;
}

function onTabSwipeEnd(event: TouchEvent) {
  if (!swipeTracking) return;
  swipeTracking = false;
  const touch = event.changedTouches[0];
  if (!touch) return;
  const dx = touch.clientX - swipeStartX;
  const dy = touch.clientY - swipeStartY;
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  const index = TAB_ORDER.indexOf(activeTab.value);
  if (index < 0) return;
  const next = dx < 0 ? index + 1 : index - 1;
  if (next >= 0 && next < TAB_ORDER.length) selectTab(TAB_ORDER[next]);
}
/* 设置页的二级页面：null=主页，'language'/'theme'=子页 */
const settingsSub = ref<null | "language" | "theme" | "providers">(null);
/* 设置二级页同样拦截手机返回手势 */
useBackGuard(
  computed({
    get: () => settingsSub.value !== null,
    set: (open: boolean) => {
      if (!open) settingsSub.value = null;
    },
  }),
);
watch(activeTab, (tab) => uiPanels.SET_ACTIVE_TAB(tab), { immediate: true });
const authStore = useAuthStore();
const theme = useTheme();
const { languageOptions, currentLanguage, switchLanguage } =
  useLanguageSwitcher();
const themeChoices = [
  { mode: "light" as const, label: "浅色" },
  { mode: "dark" as const, label: "深色" },
  { mode: "system" as const, label: "跟随系统" },
];
const currentThemeLabel = computed(
  () => themeChoices.find((o) => o.mode === customizer.themeMode)?.label ?? "",
);
function setThemeMode(mode: "light" | "dark" | "system") {
  customizer.SET_THEME_MODE(mode);
  theme.global.name.value = customizer.uiTheme;
}
function openProviderSettings() {
  settingsSub.value = "providers";
}

function openUpdatePanel() {
  uiPanels.OPEN_UPDATE_DIALOG();
}
function openAccountPanel() {
  uiPanels.OPEN_ACCOUNT_DIALOG();
}
function enterAdmin() {
  router.push("/");
}
const projectDialogOpen = ref(false);
const editingProject = ref<Project | null>(null);
const projectDialogError = ref("");
const savingProject = ref(false);
const sessionTitleDialogOpen = ref(false);
const sessionTitleDraft = ref("");
const editingSessionTitleId = ref("");
const refreshProjectSessionsAfterTitleSave = ref(false);
const savingSessionTitle = ref(false);
const messageEditDraft = ref("");
const editingMessage = ref<ChatRecord | null>(null);
const savingMessageEdit = ref(false);
const projectSessions = ref<Session[]>([]);
const projectSessionsById = ref<Record<string, Session[]>>({});
const loadingProjectSessionIds = ref<string[]>([]);
const loadingSessions = ref(false);
const draft = ref(readChatDraft(currSessionId.value));
const tokenProviderConfigs = ref<TokenProviderConfig[]>([]);
const tokenModelMetadata = ref<Record<string, ProviderModelMetadata>>({});
const selectedTokenProviderId = ref("");
const messagesContainer = ref<HTMLElement | null>(null);
const sidebarContent = ref<HTMLElement | null>(null);
const sidebarProjects = ref<InstanceType<typeof ProjectList> | null>(null);
const sidebarProjectElement = computed<HTMLElement | null>(
  () => sidebarProjects.value?.$el || null,
);
const messagesContent = ref<HTMLElement | null>(null);
const composerShell = ref<HTMLElement | null>(null);
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null);
const shouldStickToBottom = ref(true);
const autoScrollPaused = ref(false);
const suppressAutoScroll = ref(false);
const LOAD_EARLIER_SCROLL_THRESHOLD = 120;
const isAwayFromBottom = ref(false);
let lastMessagesScrollTop = 0;
let lastMessagesScrollHeight = 0;
let lastMessagesClientHeight = 0;
let touchScrollY = 0;
let scrollIntent = 0;
let autoScrollFrame: number | null = null;
const replyTarget = ref<ChatRecord | null>(null);
const threadPanelOpen = ref(false);
const activeThread = ref<ChatThread | null>(null);
const reasoningPanelOpen = ref(false);
const activeReasoningTarget = ref<{
  message: ChatRecord;
  blockIndex: number;
} | null>(null);
const deletingThread = ref(false);
const refsSidebarOpen = ref(false);
const selectedRefs = ref<Record<string, unknown> | null>(null);
const threadSelection = reactive<{
  visible: boolean;
  left: number;
  top: number;
  message: ChatRecord | null;
  selectedText: string;
}>({
  visible: false,
  left: 0,
  top: 0,
  message: null,
  selectedText: "",
});
const settingsOpen = ref(false);
/* 聊天设置弹窗拦截手机返回手势 */
useBackGuard(settingsOpen);
const enableStreaming = ref(true);
const enableReasoning = ref(true);
const sendShortcut = ref<"enter" | "shift_enter">("enter");
const CHAT_UI_SETTINGS_KEY = "chat_ui_settings";
const persistedSendShortcuts = reactive<Record<string, string>>({});
let chatSettingsSyncing = false;
let chatSettingsSaveTimer: number | null = null;

function currentViewScope(): "mobile" | "desktop" {
  return isMobile.value ? "mobile" : "desktop";
}

async function applyPersistedSendShortcut() {
  if (!localStorage.getItem("token")) return;
  try {
    const response: any = await webuiExtApi.getPreferences();
    if (response.data?.status !== "ok") return;
    const prefs = response.data?.data?.preferences || {};
    // 保存的值就是「视图 -> 快捷键」映射本身，不要再套一层 sendShortcut 键
    const stored = prefs[CHAT_UI_SETTINGS_KEY] || {};
    for (const key of Object.keys(stored)) persistedSendShortcuts[key] = stored[key];
    const value = persistedSendShortcuts[currentViewScope()];
    if (value === "enter" || value === "shift_enter") {
      chatSettingsSyncing = true;
      sendShortcut.value = value;
      chatSettingsSyncing = false;
    }
  } catch (error) {
    console.warn("Failed to load chat UI settings:", error);
  }
}

watch(sendShortcut, (value) => {
  if (chatSettingsSyncing || !localStorage.getItem("token")) return;
  const view = currentViewScope();
  if (persistedSendShortcuts[view] === value) return;
  persistedSendShortcuts[view] = value;
  if (chatSettingsSaveTimer !== null)
    window.clearTimeout(chatSettingsSaveTimer);
  chatSettingsSaveTimer = window.setTimeout(() => {
    webuiExtApi
      .putPreference(CHAT_UI_SETTINGS_KEY, { ...persistedSendShortcuts })
      .catch((error) =>
        console.warn("Failed to save chat UI settings:", error),
      );
    chatSettingsSaveTimer = null;
  }, 500);
});

const DRAFT_SAVE_DELAY_MS = 300;
let activeDraftSessionId = currSessionId.value;
let draftSaveTimer: number | null = null;
let chatResizeObserver: ResizeObserver | null = null;
let chatMutationObserver: MutationObserver | null = null;
const {
  isRecording,
  startRecording: startRecorder,
  stopRecording: stopRecorder,
} = useRecording();
const { smAndDown: isMobile } = useDisplay();

const isSidebarCollapsed = computed(
  () => !isMobile.value && customizer.chatSidebarCollapsed,
);
const isProviderWorkspace = computed(
  () => activeWorkspace.value === "providers",
);

function toggleChatSidebar() {
  if (isMobile.value) {
    mobileDrawer.SET(false);
    return;
  }
  customizer.SET_CHAT_SIDEBAR_COLLAPSED(!customizer.chatSidebarCollapsed);
}

const activeReasoningParts = computed<MessagePart[]>(() => {
  if (!activeReasoningTarget.value) return [];
  const blocks = buildMessageBlocks(
    activeReasoningTarget.value.message.content || { type: "bot", message: [] },
  );
  const block = blocks[activeReasoningTarget.value.blockIndex];
  return block?.kind === "thinking" ? block.parts : [];
});

watch(reasoningPanelOpen, (open) => {
  if (!open) {
    activeReasoningTarget.value = null;
  }
});

const {
  loadingMessages,
  sending,
  loadedSessions,
  sessionDetails,
  sessionProjects,
  activeMessages,
  paginationBySession,
  isSessionRunning,
  isUserMessage,
  messageParts,
  loadSessionMessages,
  loadEarlierMessages,
  createLocalExchange,
  sendMessageStream,
  editMessage,
  continueEditedMessage,
  regenerateMessage,
  stopSession,
} = useMessages({
  currentSessionId: currSessionId,
  onSessionsChanged: getSessions,
  onStreamUpdate: (sessionId) => {
    if (sessionId === currSessionId.value && shouldStickToBottom.value) {
      scrollToBottom();
    }
  },
});

const activeSessionPagination = computed(() =>
  currSessionId.value ? paginationBySession[currSessionId.value] : undefined,
);

const transportMode = ref<TransportMode>(
  (localStorage.getItem("chat.transportMode") as TransportMode) === "websocket"
    ? "websocket"
    : "sse",
);

watch(transportMode, (mode) => {
  localStorage.setItem("chat.transportMode", mode);
});

watch(draft, (value) => {
  if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer);
  const sessionId = activeDraftSessionId;
  draftSaveTimer = window.setTimeout(() => {
    writeChatDraft(sessionId, value);
    draftSaveTimer = null;
  }, DRAFT_SAVE_DELAY_MS);
});

watch(currSessionId, (sessionId) => {
  flushDraft();
  activeDraftSessionId = sessionId;
  draft.value = readChatDraft(sessionId);
});

const isDark = computed(() => customizer.uiTheme === "PurpleThemeDark");
const canSend = computed(
  () =>
    Boolean(draft.value.trim() || stagedFiles.value.length) && !sending.value,
);
const currentSession = computed(
  () =>
    sessions.value.find(
      (session) => session.session_id === currSessionId.value,
    ) ||
    projectSessions.value.find(
      (session) => session.session_id === currSessionId.value,
    ) ||
    Object.values(projectSessionsById.value)
      .flat()
      .find((session) => session.session_id === currSessionId.value) ||
    sessionDetails[currSessionId.value] ||
    null,
);
const sessionProject = computed(() =>
  currSessionId.value ? sessionProjects[currSessionId.value] : null,
);
const sidebarSessions = computed(() => {
  const current = currentSession.value;
  if (
    current &&
    !sessionProject.value &&
    !sessions.value.some((session) => session.session_id === current.session_id)
  ) {
    return [current, ...sessions.value];
  }
  return sessions.value;
});

/* ===== 置顶会话（本地保存，不依赖后端） ===== */
const PINNED_KEY = "astrbot:chat-pinned-sessions:v1";
const pinnedSessionIds = ref<string[]>(readPinnedSessions());
const pinnedOpen = ref(true);
const sheetSession = ref<Session | null>(null);

function readPinnedSessions(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function persistPinnedSessions() {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedSessionIds.value));
  } catch {
    /* 忽略存储失败 */
  }
}

function isPinned(sessionId: string) {
  return pinnedSessionIds.value.includes(sessionId);
}

function togglePin(session: Session) {
  const id = session.session_id;
  pinnedSessionIds.value = isPinned(id)
    ? pinnedSessionIds.value.filter((item) => item !== id)
    : [id, ...pinnedSessionIds.value];
  persistPinnedSessions();
  closeSessionSheet();
}

/* 统一按“最后更新时间”倒序：置顶区与普通区用同一规则 */
function sessionSortTime(session: Session): number {
  const ts = sessionActivity.value[session.session_id];
  if (typeof ts === "number" && ts > 0) return ts * 1000;
  const d = parseSessionDate(session.updated_at);
  return d ? d.getTime() : 0;
}

const sortedSidebarSessions = computed(() =>
  [...sidebarSessions.value].sort(
    (a, b) => sessionSortTime(b) - sessionSortTime(a),
  ),
);

const pinnedSessions = computed(() =>
  sortedSidebarSessions.value.filter((session) => isPinned(session.session_id)),
);
const unpinnedSessions = computed(() =>
  sortedSidebarSessions.value.filter(
    (session) => !isPinned(session.session_id),
  ),
);

function openSessionSheet(session: Session) {
  /* 长按时浏览器可能残留文字选区（会露出一截选择手柄），这里主动清掉 */
  window.getSelection()?.removeAllRanges();
  document.getSelection()?.removeAllRanges();
  sheetSession.value = session;
}

function closeSessionSheet() {
  sheetSession.value = null;
}

function renameFromSheet() {
  const session = sheetSession.value;
  closeSessionSheet();
  if (session) editSidebarSessionTitle(session);
}

async function deleteFromSheet() {
  const session = sheetSession.value;
  closeSessionSheet();
  if (session) await deleteSidebarSession(session);
}
const currentSessionTitle = computed(() =>
  currentSession.value ? sessionTitle(currentSession.value) : "",
);
const selectedProject = computed(
  () =>
    projects.value.find(
      (project) => project.project_id === selectedProjectId.value,
    ) || null,
);
const activeProject = computed(() => {
  if (isProviderWorkspace.value) return null;
  if (selectedProject.value) return selectedProject.value;
  const projectId = sessionProject.value?.project_id;
  return (
    projects.value.find((project) => project.project_id === projectId) || null
  );
});
const isEmptyChat = computed(
  () =>
    !isProviderWorkspace.value &&
    !selectedProject.value &&
    !loadingMessages.value &&
    !activeMessages.value.length,
);
const chatHeaderTitle = computed(
  () => currentSessionTitle.value || selectedProject.value?.title || "",
);
const chatHeaderSubtitle = computed(() =>
  currentSessionTitle.value
    ? sessionProject.value?.title || selectedProject.value?.title || ""
    : "",
);
const chatInputReplyTarget = computed(() =>
  replyTarget.value?.id == null
    ? null
    : {
        messageId: replyTarget.value.id,
        selectedText: replyPreview(replyTarget.value.id, ""),
      },
);
const currentTokenProvider = computed(() => {
  const selectedProvider = tokenProviderConfigs.value.find(
    (provider) => provider.id === selectedTokenProviderId.value,
  );
  return selectedProvider || tokenProviderConfigs.value[0] || null;
});
const currentTokenMetadata = computed(() => {
  const model = currentTokenProvider.value?.model;
  return model ? tokenModelMetadata.value[model] || null : null;
});
const latestContextTokens = computed(() => {
  for (let index = activeMessages.value.length - 1; index >= 0; index -= 1) {
    const message = activeMessages.value[index];
    if (isUserMessage(message)) continue;
    const stats = message.content?.agentStats;
    if (!stats) continue;
    if (stats.current_context_tokens != null) {
      return readTokenCount(stats.current_context_tokens);
    }
    const usage = stats.token_usage;
    if (!usage) continue;
    return (
      readTokenCount(usage.input_other) +
      readTokenCount(usage.input_cached) +
      readTokenCount(usage.output)
    );
  }
  return 0;
});
const tokenUsageIndicator = computed(() => {
  const used = latestContextTokens.value;
  const limit = contextLimit(
    currentTokenProvider.value,
    currentTokenMetadata.value,
  );
  if (used <= 0 || limit <= 0) return null;

  const percent = (used / limit) * 100;
  return {
    used,
    limit,
    percent: Math.min(100, Math.max(0, percent)),
    tooltip: tm("tokenUsage.tooltip", {
      used: formatTokenCount(used),
      limit: formatTokenCount(limit),
      percent: formatUsagePercent(percent),
    }),
  };
});

function getSelectedProviderSelection() {
  const inputSelection = inputRef.value?.getCurrentSelection();
  if (inputSelection?.providerId) {
    selectedTokenProviderId.value = inputSelection.providerId;
    return inputSelection;
  }
  if (typeof window === "undefined") {
    return { providerId: "", modelName: "" };
  }
  syncSelectedTokenProvider();
  return {
    providerId: localStorage.getItem("selectedProvider") || "",
    modelName: localStorage.getItem("selectedProviderModel") || "",
  };
}

const {
  selectedProviderId: currentProviderId,
  selectedModelName: currentModelName,
  setSelection: setProviderSelection,
} = useProviderModelSelection();

const SESSION_PROVIDER_STORAGE_PREFIX = "chat.sessionProvider.";

function readSessionProviderSelection(sessionId: string) {
  try {
    const raw = localStorage.getItem(
      SESSION_PROVIDER_STORAGE_PREFIX + sessionId,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.providerId === "string" && parsed.providerId) {
      return {
        providerId: parsed.providerId,
        modelName: typeof parsed.modelName === "string" ? parsed.modelName : "",
      };
    }
  } catch {
    // Ignore corrupted entries.
  }
  return null;
}

function writeSessionProviderSelection(
  sessionId: string,
  selection: { providerId?: string; modelName?: string } | null,
) {
  if (!sessionId || !selection?.providerId) return;
  try {
    localStorage.setItem(
      SESSION_PROVIDER_STORAGE_PREFIX + sessionId,
      JSON.stringify({
        providerId: selection.providerId,
        modelName: selection.modelName || "",
      }),
    );
  } catch {
    // Session model persistence must not block chat flows.
  }
}

// Remember the model picked by the user for the active session.
watch([currentProviderId, currentModelName], ([providerId, modelName]) => {
  if (!currSessionId.value || !providerId) return;
  writeSessionProviderSelection(currSessionId.value, {
    providerId,
    modelName,
  });
});

provide("isDark", isDark);

watch(
  [chatHeaderTitle, chatHeaderSubtitle, activeProject],
  ([title, subtitle, project]) => {
    chatHeader.SET_CONTEXT({
      title,
      subtitle,
      projectId: project?.project_id,
    });
  },
  { immediate: true },
);

watch(
  () => chatHeader.workspaceFilesOpen,
  (open) => {
    if (!open) return;
    threadSelection.visible = false;
    threadPanelOpen.value = false;
    activeThread.value = null;
    reasoningPanelOpen.value = false;
    activeReasoningTarget.value = null;
    refsSidebarOpen.value = false;
    selectedRefs.value = null;
  },
);

onMounted(async () => {
  void applyPersistedSendShortcut();
  window.addEventListener("beforeunload", flushDraft);
  if (typeof ResizeObserver !== "undefined") {
    chatResizeObserver = new ResizeObserver((entries) => {
      if (
        entries.some(
          (entry) =>
            entry.target === sidebarContent.value ||
            entry.target === sidebarProjectElement.value,
        )
      ) {
        loadMoreSessions();
      }
      const container = messagesContainer.value;
      if (!container) return;
      let composerResized = false;
      let messagesResized = false;
      for (const entry of entries) {
        if (entry.target === composerShell.value) {
          composerResized = true;
          const height = Math.ceil(entry.target.getBoundingClientRect().height);
          container.style.setProperty("--chat-composer-height", `${height}px`);
        }
        if (entry.target === messagesContent.value) {
          messagesResized = true;
        }
      }
      if (!composerResized && !messagesResized) return;

      if (shouldStickToBottom.value && !autoScrollPaused.value) {
        scrollToBottom();
      } else {
        isAwayFromBottom.value =
          container.scrollHeight -
            container.scrollTop -
            container.clientHeight >
          2;
      }
    });
    if (composerShell.value) chatResizeObserver.observe(composerShell.value);
    if (sidebarContent.value) chatResizeObserver.observe(sidebarContent.value);
    if (sidebarProjectElement.value)
      chatResizeObserver.observe(sidebarProjectElement.value);
    if (messagesContent.value)
      chatResizeObserver.observe(messagesContent.value);
  }
  if (typeof MutationObserver !== "undefined") {
    chatMutationObserver = new MutationObserver(() => {
      if (
        !suppressAutoScroll.value &&
        shouldStickToBottom.value &&
        !autoScrollPaused.value
      ) {
        scrollToBottom();
      }
    });
    if (messagesContent.value) {
      chatMutationObserver.observe(messagesContent.value, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  loadingSessions.value = true;
  try {
    await Promise.all([getSessions(), getProjects(), loadTokenProviders()]);
    const routeSessionId = getRouteSessionId();
    if (routeSessionId === "models") {
      activeWorkspace.value = "providers";
    } else if (routeSessionId) {
      await selectSession(routeSessionId, false);
    }
  } finally {
    loadingSessions.value = false;
  }
});

onBeforeUnmount(() => {
  flushDraft();
  window.removeEventListener("beforeunload", flushDraft);
  chatResizeObserver?.disconnect();
  chatMutationObserver?.disconnect();
  if (autoScrollFrame !== null) {
    window.cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
  }
  chatHeader.CLEAR_CONTEXT();
  cleanupMediaCache();
});

watch(
  [composerShell, messagesContent, sidebarContent, sidebarProjectElement],
  (elements, previousElements) => {
    if (!chatResizeObserver) return;
    for (const element of previousElements) {
      if (element) chatResizeObserver.unobserve(element);
    }
    for (const element of elements) {
      if (element) chatResizeObserver.observe(element);
    }
  },
  { flush: "post" },
);

watch(
  [() => sessionsPagination.loading, () => mobileDrawer.open],
  () => loadMoreSessions(),
  { flush: "post" },
);

watch(
  messagesContent,
  (element, previousElement) => {
    if (!chatMutationObserver) return;
    if (previousElement) chatMutationObserver.disconnect();
    if (element) {
      chatMutationObserver.observe(element, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  },
  { flush: "post" },
);

watch(
  () => route.params.conversationId,
  async () => {
    const routeSessionId = getRouteSessionId();
    if (routeSessionId === "models") {
      activeWorkspace.value = "providers";
      return;
    }
    if (routeSessionId && routeSessionId !== currSessionId.value) {
      showChatWorkspace();
      selectedProjectId.value = null;
      await selectSession(routeSessionId, false);
      return;
    }
    /* 只有真的回到“会话列表根路径”才算新会话；
       切到 /list、/settings 等其它标签页时不能清空当前会话 */
    const isSessionRoot =
      route.path === basePath() || route.path === `${basePath()}/`;
    if (!routeSessionId && currSessionId.value && isSessionRoot) {
      showChatWorkspace();
      currSessionId.value = "";
    }
  },
);

watch(activeMessages, () => {
  if (!suppressAutoScroll.value && shouldStickToBottom.value) {
    scrollToBottom();
  }
});

function getRouteSessionId() {
  const raw = route.params.conversationId;
  return Array.isArray(raw) ? raw[0] : raw || "";
}

function basePath() {
  return props.chatboxMode ? "/chatbox" : "/session";
}

function closeSecondaryPanels() {
  threadSelection.visible = false;
  threadPanelOpen.value = false;
  activeThread.value = null;
  reasoningPanelOpen.value = false;
  activeReasoningTarget.value = null;
  refsSidebarOpen.value = false;
  selectedRefs.value = null;
  chatHeader.SET_WORKSPACE_FILES_OPEN(false);
}

function showChatWorkspace() {
  activeWorkspace.value = "chat";
}

async function openProviderWorkspace() {
  activeTab.value = "chat";
  closeSecondaryPanels();
  activeWorkspace.value = "providers";
  const targetPath = `${basePath()}/models`;
  if (route.path !== targetPath) {
  await router.push(targetPath);
  }
}

/*
 * 会话列表里的 updated_at 只在会话记录被改动时更新，不代表“最后一次对话”。
 * 真正的最后活跃时间来自按会话聚合的对话记录（conversations.updated_at，单位秒）。
 */
const sessionActivity = ref<Record<string, number>>({});
const activityPagesLoaded = ref(0);

function pickSessionActivity(item: any): { id: string; ts: number } | null {
  const raw = item?.umo_info?.session_id || item?.user_id || "";
  const id = String(raw).split("!").pop() || "";
  const ts = Number(item?.updated_at);
  if (!id || !Number.isFinite(ts) || ts <= 0) return null;
  return { id, ts };
}

async function loadSessionActivity(targetCount?: number, refreshOnly = false) {
  const wanted = Math.max(targetCount ?? sidebarSessions.value.length, 1);
  const pagesNeeded = Math.min(6, Math.ceil(wanted / 100));
  const start = refreshOnly ? 1 : activityPagesLoaded.value + 1;
  for (let page = start; page <= pagesNeeded; page++) {
    try {
      const resp = await conversationApi.list({
        page,
        page_size: 100,
        group_by_session: true,
        sort_by: "updated_at",
        sort_order: "desc",
        include_history: false,
      });
      const rows = resp?.data?.data?.conversations ?? [];
      const next = { ...sessionActivity.value };
      for (const row of rows) {
        const hit = pickSessionActivity(row);
        if (hit) next[hit.id] = hit.ts;
      }
      sessionActivity.value = next;
      activityPagesLoaded.value = Math.max(activityPagesLoaded.value, page);
      if (rows.length < 100) break;
    } catch {
      break;
    }
    if (refreshOnly) break;
  }
}

/* 会话条数变化时补齐时间；切回列表页时刷新第一页（最新 100 条） */
watch(
  () => sidebarSessions.value.length,
  (len) => {
    if (len > 0) void loadSessionActivity(len);
  },
);
watch(activeTab, (tab) => {
  if (tab === "list") void loadSessionActivity(undefined, true);
});

/* ===== 会话页：记忆滚动位置 + 先出框架后渲染消息 ===== */
const messagesViewReady = ref(true);
let savedChatScrollTop = 0;
let savedChatStick = true;
let pendingScrollRestore = false;

function renderMessagesNextFrame() {
  messagesViewReady.value = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      messagesViewReady.value = true;
      if (pendingScrollRestore) {
        pendingScrollRestore = false;
        void nextTick(() => restoreChatScroll());
      }
    });
  });
}

function applyScrollTarget(el: HTMLElement, target: number, tries = 0) {
  el.scrollTop = target;
  if (tries >= 4) return;
  window.setTimeout(() => {
    /* 用户已经自己滚动了就不再纠正 */
    if (performance.now() - lastUserScrollAt < 500) return;
    if (savedChatStick) return;
    const cur = messagesContainer.value;
    if (!cur) return;
    if (Math.abs(cur.scrollTop - target) > 4) applyScrollTarget(cur, target, tries + 1);
  }, 110);
}

function restoreChatScroll() {
  const el = messagesContainer.value;
  if (!el) return;
  if (savedChatStick) {
    el.scrollTop = el.scrollHeight;
    shouldStickToBottom.value = true;
    isAwayFromBottom.value = false;
    return;
  }
  shouldStickToBottom.value = false;
  isAwayFromBottom.value = true;
  applyScrollTarget(el, savedChatScrollTop);
  isAwayFromBottom.value =
    el.scrollHeight - el.scrollTop - el.clientHeight > 8;
}

watch(activeTab, (tab, prev) => {
  if (prev === "chat" && tab !== "chat") {
    const el = messagesContainer.value;
    if (el) {
      savedChatScrollTop = el.scrollTop;
      savedChatStick = shouldStickToBottom.value;
    }
    return;
  }
  if (tab === "chat" && prev !== "chat") {
    pendingScrollRestore = true;
    renderMessagesNextFrame();
  }
});
const wideMq = window.matchMedia(WIDE_QUERY);
onMounted(() => {
  wideMq.addEventListener("change", syncIsWide);
  syncIsWide(wideMq);
});
onUnmounted(() => {
  wideMq.removeEventListener("change", syncIsWide);
  document.documentElement.classList.remove("astrbot-chat-wide");
});

/* sidebarSessions 在下方才声明，挂载后再触发首次加载，避免初始化顺序问题 */
onMounted(() => {
  if (sidebarSessions.value.length > 0) void loadSessionActivity();
});

function sessionTitle(session: Session) {
  return session.display_name?.trim() || tm("conversation.newConversation");
}

function parseSessionDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
/* 时间显示规则：
   今天 -> 时:分；昨天 -> 昨天  时:分；
   今年更早 -> X月X日  时:分；往年 -> X年X月X日  时:分（日期与时间之间两个空格） */
function sessionUpdatedAt(session: Session): Date | null {
  const ts = sessionActivity.value[session.session_id];
  if (typeof ts === "number" && ts > 0) return new Date(ts * 1000);
  return parseSessionDate(session.updated_at);
}

function sessionSubtitle(session: Session) {
  const d = sessionUpdatedAt(session);
  if (!d) return "";
  const now = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sep = "\u00A0\u00A0";
  if (isSameDay(d, now)) return hm;
  const yesterday = new Date(now.getTime() - 86400000);
  if (isSameDay(d, yesterday)) return `昨天${sep}${hm}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日${sep}${hm}`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日${sep}${hm}`;
}

function syncSelectedTokenProvider() {
  if (typeof window === "undefined") return;
  selectedTokenProviderId.value =
    localStorage.getItem("selectedProvider") || "";
}

async function loadTokenProviders() {
  syncSelectedTokenProvider();
  try {
    const response = await providerApi.listByProviderType("chat_completion");
    if (response.data.status === "ok") {
      tokenModelMetadata.value = ((response.data as any).model_metadata ||
        {}) as Record<string, ProviderModelMetadata>;
      tokenProviderConfigs.value = (
        (response.data.data || []) as unknown as TokenProviderConfig[]
      ).filter((provider) => provider.enable !== false);
    }
  } catch (error) {
    console.error("Failed to load provider context metadata:", error);
  }
}

function readTokenCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function formatUsagePercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10) return String(Math.round(value));
  if (value >= 1) return String(Math.round(value * 10) / 10);
  return String(Math.round(value * 100) / 100);
}

async function startNewChat() {
  showChatWorkspace();
  activeTab.value = "chat";
  selectedProjectId.value = null;
  replyTarget.value = null;
  newChat();
  await focusChatInputOnDesktop();
}

function openCreateProjectDialog() {
  editingProject.value = null;
  projectDialogError.value = "";
  projectDialogOpen.value = true;
}

function openEditProjectDialog(project: Project) {
  editingProject.value = project;
  projectDialogError.value = "";
  projectDialogOpen.value = true;
}

async function selectProject(projectId: string) {
  showChatWorkspace();
  selectedProjectId.value = projectId;
  currSessionId.value = "";
  replyTarget.value = null;
  await router.push(basePath());
  await loadProjectSessions(projectId);
  await focusChatInputOnDesktop();
}

async function loadProjectSessions(projectId = selectedProjectId.value) {
  if (!projectId) {
    projectSessions.value = [];
    return [];
  }
  const sessions = await getProjectSessions(projectId);
  projectSessionsById.value = {
    ...projectSessionsById.value,
    [projectId]: sessions,
  };
  if (projectId === selectedProjectId.value) {
    projectSessions.value = sessions;
  }
  return sessions;
}

async function handleProjectToggle(projectId: string, expanded: boolean) {
  if (!expanded || projectSessionsById.value[projectId]) return;
  if (loadingProjectSessionIds.value.includes(projectId)) return;
  loadingProjectSessionIds.value = [
    ...loadingProjectSessionIds.value,
    projectId,
  ];
  try {
    await loadProjectSessions(projectId);
  } finally {
    loadingProjectSessionIds.value = loadingProjectSessionIds.value.filter(
      (item) => item !== projectId,
    );
  }
}

async function handleDeleteProject(projectId: string) {
  await deleteProjectById(projectId);
  const nextSessionsById = { ...projectSessionsById.value };
  delete nextSessionsById[projectId];
  projectSessionsById.value = nextSessionsById;
  loadingProjectSessionIds.value = loadingProjectSessionIds.value.filter(
    (item) => item !== projectId,
  );
  if (selectedProjectId.value === projectId) {
    selectedProjectId.value = null;
    projectSessions.value = [];
  }
}

function openSessionTitleDialog(
  sessionId: string,
  title: string,
  refreshProjectSessions = false,
) {
  editingSessionTitleId.value = sessionId;
  sessionTitleDraft.value = title;
  refreshProjectSessionsAfterTitleSave.value = refreshProjectSessions;
  sessionTitleDialogOpen.value = true;
}

async function saveSessionTitleDialog() {
  if (!editingSessionTitleId.value) return;

  savingSessionTitle.value = true;
  try {
    const sessionId = editingSessionTitleId.value;
    const displayName = sessionTitleDraft.value.trim();
    await chatApi.updateSession(sessionId, {
      display_name: displayName,
    });
    updateSessionTitle(sessionId, displayName);
    if (sessionDetails[sessionId]) {
      sessionDetails[sessionId].display_name = displayName;
    }
    const projectSession = projectSessions.value.find(
      (session) => session.session_id === sessionId,
    );
    if (projectSession) {
      projectSession.display_name = displayName;
    }
    Object.values(projectSessionsById.value).forEach((projectSessionList) => {
      const cachedProjectSession = projectSessionList.find(
        (session) => session.session_id === sessionId,
      );
      if (cachedProjectSession) {
        cachedProjectSession.display_name = displayName;
      }
    });
    if (refreshProjectSessionsAfterTitleSave.value) {
      await loadProjectSessions();
    } else {
      await getSessions();
    }
    sessionTitleDialogOpen.value = false;
  } finally {
    savingSessionTitle.value = false;
  }
}

function editSidebarSessionTitle(session: Session) {
  openSessionTitleDialog(session.session_id, session.display_name || "");
}

async function deleteSidebarSession(session: Session) {
  const title = sessionTitle(session);
  const message = tm("conversation.confirmDelete", { name: title });
  if (!(await askForConfirmation(message, confirmDialog))) return;

  const wasCurrent = currSessionId.value === session.session_id;
  await deleteSession(session.session_id);
  if (wasCurrent) {
    selectedProjectId.value = null;
    await router.push(basePath());
  }
}

async function selectProjectSession(sessionId: string) {
  selectedProjectId.value = null;
  await selectSession(sessionId);
}

async function editProjectSessionTitle(sessionId: string, title: string) {
  openSessionTitleDialog(sessionId, title, true);
}

async function deleteProjectSession(
  sessionId: string,
  projectId = selectedProjectId.value,
) {
  await deleteSession(sessionId);
  if (projectId) {
    await loadProjectSessions(projectId);
  } else {
    await loadProjectSessions();
  }
}

async function saveProject(formData: ProjectFormData, projectId?: string) {
  savingProject.value = true;
  projectDialogError.value = "";
  try {
    if (projectId) {
      await updateProject(
        projectId,
        formData.title,
        formData.emoji,
        formData.description,
        formData.workspace_type,
        formData.workspace_path,
      );
    } else {
      await createProject(
        formData.title,
        formData.emoji,
        formData.description,
        formData.workspace_type,
        formData.workspace_path,
      );
    }
    projectDialogOpen.value = false;
    editingProject.value = null;
  } catch (error) {
    projectDialogError.value =
      error instanceof Error ? error.message : "Failed to save project";
  } finally {
    savingProject.value = false;
  }
}

watch(projectDialogOpen, (open) => {
  if (!open) {
    projectDialogError.value = "";
    savingProject.value = false;
  }
});

async function selectSession(sessionId: string, pushRoute = true) {
  showChatWorkspace();
  activeTab.value = "chat";
  selectedProjectId.value = null;
  currSessionId.value = sessionId;
  replyTarget.value = null;
  if (pushRoute && route.path !== `${basePath()}/${sessionId}`) {
    await router.push(`${basePath()}/${sessionId}`);
    if (currSessionId.value !== sessionId) return;
  }
  if (!loadedSessions[sessionId]) {
    await loadSessionMessages(sessionId);
    if (currSessionId.value !== sessionId) return;
  }
  const storedSelection = readSessionProviderSelection(sessionId);
  if (storedSelection) {
    setProviderSelection(storedSelection.providerId, storedSelection.modelName);
  }
  if (!pendingScrollRestore) scrollToBottom(true);
  await focusChatInputOnDesktop();
}

async function sendCurrentMessage() {
  if (!canSend.value) return;

  const draftSessionId = activeDraftSessionId;
  const draftText = draft.value;
  const text = draftText.trim();
  const outgoingParts = buildOutgoingParts(text);
  sending.value = true;
  try {
    let sessionId = currSessionId.value;
    const targetProjectId = selectedProjectId.value;
    const targetProject = selectedProject.value;
    if (!sessionId) {
      sessionId = await newSession();
      await nextTick();
      draft.value = draftText;
      if (targetProjectId) {
        await addSessionToProject(sessionId, targetProjectId);
        sessionProjects[sessionId] = targetProject
          ? {
              project_id: targetProject.project_id,
              title: targetProject.title,
              emoji: targetProject.emoji,
            }
          : null;
        await loadProjectSessions(targetProjectId);
        selectedProjectId.value = null;
      }
      // 关联项目后再刷新，否则新会话会短暂出现在"对话"列表
      await getSessions();
    }

    const messageId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const selection = getSelectedProviderSelection();
    writeSessionProviderSelection(sessionId, selection);
    const { userRecord, botRecord } = createLocalExchange({
      sessionId,
      messageId,
      parts: outgoingParts,
    });
    updateTitleFromText(sessionId, text);

    if (draftSaveTimer !== null) {
      window.clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
    writeChatDraft(draftSessionId, "");
    writeChatDraft(activeDraftSessionId, "");
    draft.value = "";
    replyTarget.value = null;
    clearStaged({ revokeUrls: false });
    scrollToBottom(true);

    sendMessageStream({
      sessionId,
      messageId,
      parts: outgoingParts,
      transport: transportMode.value,
      enableStreaming: enableStreaming.value,
      enableReasoning: enableReasoning.value,
      selectedProvider: selection?.providerId || "",
      selectedModel: selection?.modelName || "",
      userRecord,
      botRecord,
    });
  } catch (error) {
    console.error("Failed to send message:", error);
  } finally {
    sending.value = false;
    await focusChatInput();
  }
}

function flushDraft() {
  if (draftSaveTimer !== null) {
    window.clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  writeChatDraft(activeDraftSessionId, draft.value);
}

function buildOutgoingParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  if (replyTarget.value?.id != null) {
    parts.push({
      type: "reply",
      message_id: replyTarget.value.id,
      selected_text: "",
    });
  }
  if (text) {
    parts.push({ type: "plain", text });
  }
  stagedFiles.value.forEach((file) => {
    parts.push({
      type: file.type,
      attachment_id: file.attachment_id,
      filename: file.filename,
      embedded_url: file.url,
    });
  });
  return parts;
}

function updateTitleFromText(sessionId: string, text: string) {
  const session = sessions.value.find((item) => item.session_id === sessionId);
  const projectSession = projectSessions.value.find(
    (item) => item.session_id === sessionId,
  );
  const cachedProjectSessions = Object.values(projectSessionsById.value)
    .flat()
    .filter((item) => item.session_id === sessionId);
  if (
    (!session && !projectSession && !cachedProjectSessions.length) ||
    session?.display_name ||
    projectSession?.display_name ||
    cachedProjectSessions.some((item) => item.display_name) ||
    !text
  ) {
    return;
  }
  updateSessionTitle(sessionId, text.slice(0, 40));
  if (projectSession) {
    projectSession.display_name = text.slice(0, 40);
  }
  cachedProjectSessions.forEach((item) => {
    item.display_name = text.slice(0, 40);
  });
}

function replyPreview(messageId?: string | number, fallback?: string) {
  if (fallback) return truncate(fallback, 80);
  const found = activeMessages.value.find(
    (message) => String(message.id) === String(messageId),
  );
  const text = found ? plainTextFromMessage(found) : "";
  return text ? truncate(text, 80) : tm("reply.replyTo");
}

function plainTextFromMessage(message: ChatRecord) {
  return messageParts(message)
    .filter((part) => part.type === "plain" && part.text)
    .map((part) => part.text)
    .join("\n");
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function scrollToMessage(messageId?: string | number) {
  if (!messageId) return;
  const index = activeMessages.value.findIndex(
    (message) => String(message.id) === String(messageId),
  );
  if (index < 0) return;
  shouldStickToBottom.value = false;
  const rows = messagesContainer.value?.querySelectorAll(".message-row");
  rows?.[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openMessageEdit(message: ChatRecord) {
  messageEditDraft.value = plainTextFromMessage(message);
  editingMessage.value = message;
  nextTick(() => scrollToMessage(message.id));
}

function cancelMessageEdit() {
  editingMessage.value = null;
  messageEditDraft.value = "";
}

async function saveMessageEdit() {
  if (!currSessionId.value || !editingMessage.value) return;
  const sessionId = currSessionId.value;
  const target = editingMessage.value;
  savingMessageEdit.value = true;
  try {
    const result = await editMessage(sessionId, target, messageEditDraft.value);
    if (
      currSessionId.value !== sessionId ||
      !activeMessages.value.includes(target)
    ) {
      cancelMessageEdit();
      return;
    }
    cancelMessageEdit();

    if (result.needsRegenerate && result.truncatedAfterMessage) {
      const selection = getSelectedProviderSelection();
      continueEditedMessage({
        sessionId,
        sourceRecord: target,
        enableStreaming: enableStreaming.value,
        enableReasoning: enableReasoning.value,
        selectedProvider: selection?.providerId || "",
        selectedModel: selection?.modelName || "",
      });
      scrollToBottom(true);
    } else if (result.needsRegenerate) {
      const index = activeMessages.value.findIndex(
        (message) => String(message.id) === String(target.id),
      );
      const nextBot = activeMessages.value
        .slice(index + 1)
        .find((message) => !isUserMessage(message));
      if (nextBot) {
        await handleRegenerateMessage(nextBot);
      }
    }
  } catch (error) {
    console.error("Failed to edit message:", error);
  } finally {
    savingMessageEdit.value = false;
  }
}

async function handleRegenerateMessage(
  message: ChatRecord,
  selection?: RegenerateModelSelection,
) {
  if (!currSessionId.value || isUserMessage(message)) return;
  message.threads = [];
  const effectiveSelection = selection ?? getSelectedProviderSelection();
  writeSessionProviderSelection(currSessionId.value, effectiveSelection);
  await regenerateMessage(
    currSessionId.value,
    message,
    effectiveSelection?.providerId || "",
    effectiveSelection?.modelName || "",
    enableStreaming.value,
    enableReasoning.value,
  );
}

function handleBotTextSelection(event: MouseEvent, message: ChatRecord) {
  if (message.id == null || String(message.id).startsWith("local-")) return;
  const container = event.currentTarget as HTMLElement | null;
  window.setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selection || !selectedText) {
      threadSelection.visible = false;
      return;
    }
    if (
      !container ||
      !container.contains(selection.anchorNode) ||
      !container.contains(selection.focusNode)
    ) {
      threadSelection.visible = false;
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    threadSelection.message = message;
    threadSelection.selectedText = selectedText;
    threadSelection.left = Math.min(
      window.innerWidth - 180,
      Math.max(12, rect.left + rect.width / 2 - 70),
    );
    threadSelection.top = Math.max(12, rect.top - 42);
    threadSelection.visible = true;
  }, 0);
}

async function createThreadFromSelection() {
  const message = threadSelection.message;
  if (!currSessionId.value || !message?.id || !threadSelection.selectedText)
    return;
  try {
    const response = await chatApi.createThread({
      session_id: currSessionId.value,
      parent_message_id: message.id,
      selected_text: threadSelection.selectedText,
    });
    if (response.data?.status !== "ok") {
      toast.error(response.data?.message || tm("thread.createFailed"));
      return;
    }
    const thread = response.data?.data as ChatThread | undefined;
    if (!thread) {
      toast.error(tm("thread.createFailed"));
      return;
    }
    message.threads = message.threads || [];
    if (!message.threads.some((item) => item.thread_id === thread.thread_id)) {
      message.threads.push(thread);
    }
    openThreadPanel(thread);
    window.getSelection()?.removeAllRanges();
  } catch (error) {
    toast.error(
      isAxiosError(error)
        ? error.response?.data?.message || error.message
        : tm("thread.createFailed"),
    );
    console.error("Failed to create thread:", error);
  } finally {
    threadSelection.visible = false;
  }
}

function openThreadPanel(thread: ChatThread) {
  chatHeader.SET_WORKSPACE_FILES_OPEN(false);
  reasoningPanelOpen.value = false;
  activeReasoningTarget.value = null;
  refsSidebarOpen.value = false;
  activeThread.value = thread;
  threadPanelOpen.value = true;
}

function openRefsSidebar(refs: unknown) {
  chatHeader.SET_WORKSPACE_FILES_OPEN(false);
  threadPanelOpen.value = false;
  activeThread.value = null;
  reasoningPanelOpen.value = false;
  activeReasoningTarget.value = null;
  selectedRefs.value =
    refs && typeof refs === "object" ? (refs as Record<string, unknown>) : null;
  refsSidebarOpen.value = true;
}

function openReasoningPanel(payload: {
  message: ChatRecord;
  blockIndex: number;
}) {
  chatHeader.SET_WORKSPACE_FILES_OPEN(false);
  threadPanelOpen.value = false;
  activeThread.value = null;
  refsSidebarOpen.value = false;
  selectedRefs.value = null;
  activeReasoningTarget.value = payload;
  reasoningPanelOpen.value = true;
}

async function loadEarlierWithAnchor() {
  const sessionId = currSessionId.value;
  if (!sessionId || activeSessionPagination.value?.loading) return;
  const container = messagesContainer.value;
  const firstMessage = activeMessages.value[0];
  const firstId = firstMessage?.id == null ? "" : String(firstMessage.id);
  const beforeScrollTop = Math.max(0, container?.scrollTop || 0);
  const beforeTop = firstId
    ? container
        ?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(firstId)}"]`,
        )
        ?.getBoundingClientRect().top
    : undefined;
  suppressAutoScroll.value = true;
  try {
    await loadEarlierMessages(sessionId);
    if (currSessionId.value !== sessionId) return;
    await nextTick();
    if (beforeTop == null || !container || !firstId) return;
    const row = container.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(firstId)}"]`,
    );
    if (row) {
      const currentScrollTop = Math.max(0, container.scrollTop);
      const userScrollDelta = currentScrollTop - beforeScrollTop;
      container.scrollTop +=
        row.getBoundingClientRect().top - beforeTop + userScrollDelta;
      lastMessagesScrollTop = Math.max(0, container.scrollTop);
      lastMessagesScrollHeight = container.scrollHeight;
      lastMessagesClientHeight = container.clientHeight;
    }
  } finally {
    suppressAutoScroll.value = false;
  }
}

async function retryCurrentSessionLoad() {
  const sessionId = currSessionId.value;
  if (!sessionId || activeSessionPagination.value?.loading) return;
  if (activeMessages.value.length && activeSessionPagination.value?.has_more) {
    await loadEarlierWithAnchor();
    return;
  }
  await loadSessionMessages(sessionId, true, true);
}

async function deleteThread(thread: ChatThread) {
  if (deletingThread.value) return;
  if (!(await askForConfirmation(tm("thread.confirmDelete"), confirmDialog)))
    return;
  deletingThread.value = true;
  try {
    await chatApi.deleteThread(thread.thread_id);
    removeThreadFromMessages(thread.thread_id);
    if (activeThread.value?.thread_id === thread.thread_id) {
      threadPanelOpen.value = false;
      activeThread.value = null;
    }
  } catch (error) {
    console.error("Failed to delete thread:", error);
  } finally {
    deletingThread.value = false;
  }
}

function removeThreadFromMessages(threadId: string) {
  for (const message of activeMessages.value) {
    if (!message.threads?.length) continue;
    message.threads = message.threads.filter(
      (thread) => thread.thread_id !== threadId,
    );
  }
}

async function handleFilesSelected(files: FileList | File[]) {
  const selectedFiles = Array.from(files || []);
  for (const file of selectedFiles) {
    if (file.type.startsWith("image/")) {
      await processAndUploadImage(file);
    } else {
      await processAndUploadFile(file);
    }
  }
}

async function startRecording() {
  try {
    await startRecorder();
  } catch (error) {
    console.error("Failed to start recording:", error);
    toast.error(tm("voice.error"));
  }
}

async function stopRecording() {
  try {
    const audioFile = await stopRecorder();
    const uploaded = await processAndUploadFile(audioFile);
    if (!uploaded) {
      toast.error(tm("voice.error"));
    }
  } catch (error) {
    console.error("Failed to stop recording:", error);
    toast.error(tm("voice.error"));
  }
}

let lastUserScrollAt = 0;

function handleMessagesInteraction(
  event: WheelEvent | TouchEvent | PointerEvent | KeyboardEvent,
) {
  lastUserScrollAt = performance.now();
  if (event instanceof WheelEvent) {
    if (event.ctrlKey || event.deltaY === 0) return;
    autoScrollPaused.value = true;
    scrollIntent = Math.sign(event.deltaY);
  } else if (event.type === "touchstart" || event.type === "touchmove") {
    const touch = (event as TouchEvent).touches[0];
    if (!touch) return;
    if (event.type === "touchstart") {
      touchScrollY = touch.clientY;
      return;
    }
    autoScrollPaused.value = true;
    scrollIntent = Math.sign(touchScrollY - touch.clientY);
    touchScrollY = touch.clientY;
  } else if (event instanceof KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (
      target.closest("input, textarea, select, [contenteditable], button, a")
    ) {
      return;
    }
    if (
      ["ArrowUp", "PageUp", "Home"].includes(event.key) ||
      (event.key === " " && event.shiftKey)
    ) {
      scrollIntent = -1;
    } else if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) {
      scrollIntent = 1;
    } else {
      return;
    }
    autoScrollPaused.value = true;
  } else {
    autoScrollPaused.value = true;
    scrollIntent = 0;
    shouldStickToBottom.value = false;
  }
  if (scrollIntent < 0) shouldStickToBottom.value = false;
}

function handleMessagesScroll() {
  threadSelection.visible = false;
  const container = messagesContainer.value;
  if (!container) return;
  const maxScrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight,
  );
  const scrollTop = Math.max(0, container.scrollTop);
  const previousTop = Math.min(lastMessagesScrollTop, maxScrollTop);
  const contentGrew = container.scrollHeight > lastMessagesScrollHeight + 1;
  const wasAtBottom =
    lastMessagesScrollHeight > 0 &&
    lastMessagesScrollHeight -
      lastMessagesScrollTop -
      lastMessagesClientHeight <=
      2;
  isAwayFromBottom.value = maxScrollTop - scrollTop > 2;

  // A growing message list can emit a scroll event before the browser has
  // adjusted scrollTop. Keep following when we were already at the bottom;
  // only explicit user interaction should pause auto-scroll.
  const causedByContentGrowth =
    contentGrew &&
    wasAtBottom &&
    !autoScrollPaused.value &&
    scrollIntent >= 0 &&
    scrollTop >= previousTop;

  if (causedByContentGrowth) {
    shouldStickToBottom.value = true;
    isAwayFromBottom.value = false;
    scrollToBottom();
  } else if (isAwayFromBottom.value || scrollTop < previousTop) {
    autoScrollPaused.value = true;
    shouldStickToBottom.value = false;
  } else if (
    scrollTop > previousTop &&
    !isAwayFromBottom.value &&
    scrollIntent >= 0
  ) {
    autoScrollPaused.value = false;
    shouldStickToBottom.value = true;
  }
  lastMessagesScrollTop = scrollTop;
  lastMessagesScrollHeight = container.scrollHeight;
  lastMessagesClientHeight = container.clientHeight;
  maybeLoadEarlierOnScroll(container);
}

function loadMoreSessions() {
  const container = sidebarContent.value;
  if (
    !container ||
    container.clientHeight === 0 ||
    !sessionsPagination.hasMore ||
    sessionsPagination.loading ||
    sessionsPagination.error
  )
    return;
  if (
    container.scrollHeight - container.scrollTop - container.clientHeight > 120
  )
    return;
  void getSessions(true);
}

function maybeLoadEarlierOnScroll(container: HTMLElement) {
  const sessionId = currSessionId.value;
  const pagination = activeSessionPagination.value;
  if (!sessionId || !pagination) return;
  if (!pagination.has_more || pagination.loading || pagination.error) return;
  if (container.scrollHeight <= container.clientHeight) return;
  if (container.scrollTop > LOAD_EARLIER_SCROLL_THRESHOLD) return;
  void loadEarlierWithAnchor();
}

function scrollToBottom(resumeFollowing = false) {
  if (resumeFollowing) {
    autoScrollPaused.value = false;
    shouldStickToBottom.value = true;
    scrollIntent = 0;
  }
  // Coalesce stream, mutation, and resize notifications into one scroll per frame.
  if (autoScrollFrame !== null) return;
  autoScrollFrame = window.requestAnimationFrame(() => {
    autoScrollFrame = null;
    const container = messagesContainer.value;
    // Recheck after rendering so queued stream updates cannot override user intent.
    if (
      !container ||
      suppressAutoScroll.value ||
      autoScrollPaused.value ||
      !shouldStickToBottom.value
    )
      return;
    container.scrollTop = container.scrollHeight;
    lastMessagesScrollTop = Math.max(0, container.scrollTop);
    lastMessagesScrollHeight = container.scrollHeight;
    lastMessagesClientHeight = container.clientHeight;
    isAwayFromBottom.value = false;
  });
}

/* 移动端打开会话时不自动呼出键盘 */
async function focusChatInputOnDesktop() {
  if (isMobile.value) return;
  await focusChatInput();
}

async function focusChatInput() {
  await nextTick();
  window.requestAnimationFrame(() => {
    inputRef.value?.focusInput();
  });
}

async function compactCurrentContext() {
  const sessionId = currSessionId.value;
  if (!sessionId || sending.value) {
    if (inputRef.value) inputRef.value.setCompressLoading(false);
    return;
  }
  try {
    const selection = getSelectedProviderSelection();
    const response: any = await webuiExtApi.compressContext(sessionId, {
      preferred_provider_id: selection.providerId || undefined,
      selected_model: selection.modelName || undefined,
    });
    if (response.data?.status !== "ok") {
      throw new Error(response.data?.message || "Compaction failed");
    }
    toast.success(tm("tokenUsage.done"));
    await loadSessionMessages(sessionId, false, false);
  } catch (error) {
    toast.error(
      `${tm("tokenUsage.failed")}: ${(error as Error)?.message || error}`,
    );
  } finally {
    if (inputRef.value) inputRef.value.setCompressLoading(false);
  }
}

async function stopCurrentSession() {
  if (!currSessionId.value) return;
  try {
    await stopSession(currSessionId.value);
  } catch (error) {
    console.error("Failed to stop session:", error);
  }
}
</script>

<style scoped>
/* ── 连接服务器与键盘避让 ── */
.chat-ui {
  padding-bottom: var(--chat-kb-inset, 0px);
}

.chat-tabbar {
  position: relative;
  z-index: 81;
}

.server-offline-mask {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--chat-page-bg, #fff);
}

.server-offline-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  max-width: 280px;
}

.server-offline-icon {
  color: rgba(var(--v-theme-on-surface), 0.35);
}

.server-offline-title {
  font-size: 17px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.server-offline-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.server-offline-btn {
  margin-top: 10px;
  padding: 9px 26px;
  border: 0;
  border-radius: 999px;
  background: rgb(1, 102, 255);
  color: #fff;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.server-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.server-dialog {
  width: 100%;
  max-width: 340px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  border-radius: 18px;
  padding: 20px 18px 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}

.server-dialog-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 12px;
}

.server-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  outline: none;
}

.server-dialog-input:focus {
  border-color: rgb(1, 102, 255);
}

.server-dialog-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.server-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.server-dialog-btn {
  padding: 8px 18px;
  border: 0;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.server-dialog-btn--primary {
  background: rgb(1, 102, 255);
  color: #fff;
}

.settings-value--muted {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.chat-ui {
  /* Side panels live inside .chat-main, which already starts below the 40px
     window toolbar. Keep them flush with the content area's top edge. */
  --chat-panel-top-offset: 0px;
  --chat-session-active-bg: #efefef;
  --chat-page-bg: #ffffff; /* 问答区背景 RGB 255,255,255 */
  --chat-border: #f2f2f2;
  --chat-muted: rgba(var(--v-theme-on-surface), 0.62);
  --chat-section-label: rgba(var(--v-theme-on-surface), 0.48);
  --chat-content-width: 76%;
  --chat-content-max-width: 760px;
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--chat-page-bg);
  color: rgb(var(--v-theme-on-surface));
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    "Open Sans",
    "Helvetica Neue",
    sans-serif;
}

.chat-ui.is-dark {
  --chat-session-active-bg: rgba(255, 255, 255, 0.08);
  --chat-page-bg: rgb(var(--v-theme-background));
  --chat-border: rgba(255, 255, 255, 0.1);
  --chat-section-label: rgba(255, 255, 255, 0.5);
}

.chat-ui.is-dark .chat-sidebar {
  border-right-color: rgba(255, 255, 255, 0.06);
}

/* Match the shell's dynamic viewport sizing so the drawer's bottom (session list
   tail and the Settings footer) stays above the mobile browsers' toolbar area. */
.chat-sidebar {
  top: 0 !important;
  height: 100dvh !important;
  background: var(--astrbot-chrome-bg, rgb(var(--v-theme-surface)));
  border-right: 0;
  user-select: none;
}

.chat-sidebar.collapsed {
  background: var(--astrbot-chrome-bg, rgb(var(--v-theme-surface)));
  border-right: 0;
}

.chat-sidebar :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* The header draws across the whole width, above the full-height chat sidebar. */
:global(.chat-sidebar .v-navigation-drawer__content) {
  /* Seat the brand's top edge at the content area's top edge, fully below the toolbar. */
  padding-top: calc(var(--astrbot-toolbar-height, 40px) - 10px);
  box-sizing: border-box;
}

/* Off macOS the chat sidebar owns the top-left corner, so the brand sits in the
   toolbar band itself instead of clearing it. */
:global(html:not([data-astrbot-desktop-platform='macos']) .chat-sidebar .v-navigation-drawer__content) {
  padding-top: 4px;
}

:global(html:not([data-astrbot-desktop-platform='macos']) .chat-sidebar .chat-sidebar-brand) {
  min-height: var(--astrbot-toolbar-height, 40px);
}

/* On macOS the chat sidebar stays transparent; the shared tint is painted behind it. */
:global(html[data-astrbot-desktop-platform='macos'] .chat-sidebar) {
  background: transparent !important;
}

/* A temporary (mobile) drawer floats above the page, so the vibrancy
   transparency would let content bleed through; keep it opaque instead. */
:global(html[data-astrbot-desktop-platform='macos'] .chat-sidebar.v-navigation-drawer--temporary) {
  background: var(--astrbot-chrome-bg, rgb(var(--v-theme-surface))) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16) !important;
  z-index: 1007 !important;
}

/* Off macOS the chat sidebar is opaque and owns the top-left corner: it must paint
   above the header's left zone so the brand stays visible in the toolbar band. */
:global(html:not([data-astrbot-desktop-platform='macos']) .chat-sidebar) {
  z-index: 1007 !important;
}

/* The dark chat sidebar uses its own palette; match the corner notch to it. */
:global(html:not([data-astrbot-desktop-platform='macos']) .v-application.v-theme--PurpleThemeDark .v-main.chat-main) {
  background-image: linear-gradient(
    to right,
    var(--astrbot-chrome-bg, #242424) 0 calc(var(--v-layout-left) + 12px),
    transparent calc(var(--v-layout-left) + 12px) 100%
  ) !important;
}

/* The chat header is in-flow, so the old absolute-header top offset is dead space;
   drop it so the sub-header sits directly under the toolbar band. */
:global(.chat-main) {
  padding-top: 0 !important;
}

.sidebar-top {
  padding: 0 16px 2px;
}

.chat-sidebar.collapsed .sidebar-top {
  width: 56px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 2px;
}

.chat-sidebar-brand {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px 2px; /* 气泡到屏幕 12px */
}

/* Force the brand onto its own compositing layer: on the macOS vibrancy window
   the inline SVG logo can fail to paint after a webview reload. */
.chat-sidebar-brand .chat-sidebar-brand-logo {
  transform: translateZ(0);
}

.chat-sidebar-brand.collapsed {
  width: 36px;
  justify-content: center;
  padding: 0 0 2px;
}

.chat-sidebar-brand-title {
  min-width: 0;
  display: flex;
  align-items: center;
  /* The ChatUI brand has a 2px logo optical correction below, so its layout
     gap is 6px to match the dashboard brand's resulting visual spacing. */
  gap: 6px;
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.05;
}

.chat-sidebar-brand-logo {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: block;
}

.chat-sidebar-brand-title .chat-sidebar-brand-logo {
  transform: translateX(-2px);
}

.chat-sidebar-brand-copy {
  min-width: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}

.chat-sidebar-brand-name {
  font-size: 18px;
  font-weight: 800;
}

.chat-sidebar-brand-mode {
  color: var(--chat-muted);
  font-size: 18px;
  font-weight: 500;
}

.chat-sidebar-brand-toggle {
  width: 36px;
  height: 36px;
  min-width: 36px;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--chat-muted);
}

.chat-sidebar-brand-toggle :deep(.v-btn__overlay) {
  opacity: 0 !important;
}

.chat-sidebar-rail-btn {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
}

.chat-sidebar-brand-toggle:hover {
  background: transparent !important;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.chat-sidebar-rail-icon-stack {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}

.chat-sidebar-rail-icon-stack > * {
  grid-area: 1 / 1;
}

.chat-sidebar-brand-logo--collapsed {
  width: 20px;
  height: 20px;
  transition:
    opacity 0.14s ease,
    visibility 0.14s ease;
  opacity: 1;
  visibility: visible;
}

.chat-sidebar-rail-icon-stack .sidebar-panel-toggle-icon {
  transition:
    opacity 0.14s ease,
    visibility 0.14s ease;
  opacity: 0;
  visibility: hidden;
}

.chat-sidebar-brand-toggle:hover .chat-sidebar-brand-logo--collapsed,
.chat-sidebar-brand-toggle:focus-visible .chat-sidebar-brand-logo--collapsed {
  opacity: 0;
  visibility: hidden;
}

.chat-sidebar-brand-toggle:hover .sidebar-panel-toggle-icon,
.chat-sidebar-brand-toggle:focus-visible .sidebar-panel-toggle-icon {
  opacity: 1;
  visibility: visible;
}

.sidebar-panel-toggle-icon {
  flex: 0 0 auto;
}

.new-chat-btn,
.settings-btn {
  color: rgb(var(--v-theme-on-surface));
  border-radius: 8px;
}

.sidebar-action-icon {
  color: currentcolor;
  flex: 0 0 auto;
  stroke-width: 2;
}

.new-chat-btn:not(.icon-only) .sidebar-action-icon {
  margin-right: 12px !important;
}

.new-chat-btn,
.settings-btn {
  width: 100%;
  min-height: 36px;
  height: 36px;
  justify-content: flex-start;
  border-radius: 8px;
  text-transform: none;
  letter-spacing: 0;
  font-size: 14px;
  font-weight: 500;
}

.sidebar-provider-btn {
  margin-bottom: 2px;
}

.new-chat-btn:not(.icon-only),
.settings-btn:not(.icon-only) {
  padding-inline: 10px;
}

.new-chat-btn.icon-only,
.settings-btn.icon-only {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  margin-inline: auto;
  padding: 0 !important;
  justify-content: center;
}

.chat-sidebar.collapsed .new-chat-btn.icon-only :deep(.v-btn__content),
.chat-sidebar.collapsed .settings-btn.icon-only :deep(.v-btn__content) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-chat-btn :deep(.v-btn__content),
.settings-btn :deep(.v-btn__content) {
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
}

.chat-sidebar.collapsed .sidebar-footer {
  display: flex;
  justify-content: center;
}

.new-chat-btn:hover,
.settings-btn:hover {
  background: var(--chat-session-active-bg);
}

.sidebar-workspace-btn--active {
  background: var(--chat-session-active-bg);
  color: rgb(var(--v-theme-on-surface));
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 2px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-section {
  flex: 0 0 auto;
}

.sidebar-section-header {
  min-height: 24px;
  display: flex;
  align-items: center;
  padding: 0 10px 4px;
  color: var(--chat-section-label);
  font-size: 12px;
  font-weight: 500;
}

.session-list {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-item {
  width: 100%;
  min-height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px;
  position: relative;
  box-sizing: border-box;
  cursor: pointer;
  text-align: left;
}

/* Active session stays clearly highlighted (subtle in light mode otherwise). */
.session-item.active {
  background: rgba(var(--v-theme-primary), 0.22);
}

.session-item.running {
  padding-right: 27px;
}

.session-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
}

.session-progress {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
  transition:
    opacity 0.14s ease,
    visibility 0.14s ease;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  visibility: hidden;
}

.session-item:hover .session-actions,
.session-item:focus-within .session-actions {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
}

.session-item:hover .session-progress,
.session-item:focus-within .session-progress {
  opacity: 0;
  visibility: hidden;
}

.session-action-btn {
  color: var(--chat-muted);
}

.session-action-btn:hover {
  color: rgb(var(--v-theme-on-surface));
}

.sidebar-footer {
  margin-top: auto;
  padding: 10px 16px 14px;
}

.chat-sidebar.collapsed .sidebar-footer {
  width: 56px;
  box-sizing: border-box;
  padding-inline: 10px;
}

.chat-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  box-sizing: border-box;
  padding-top: 50px;
}

.provider-workspace-shell {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.provider-workspace-page {
  height: 100%;
  min-height: 0;
}

.conversation-stack {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

/* 全区域拖拽上传遮罩 */
.chat-drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(var(--v-theme-primary), 0.12);
  border: 2px dashed rgba(var(--v-theme-primary), 0.45);
  border-radius: 16px;
}

.chat-drop-overlay-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.chat-drop-text {
  font-size: 16px;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
}

.drop-fade-enter-active,
.drop-fade-leave-active {
  transition: opacity 0.2s ease;
}

.drop-fade-enter-from,
.drop-fade-leave-to {
  opacity: 0;
}

.conversation-stack.is-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
}

.messages-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  overflow-anchor: auto;
  padding: 24px 0 calc(var(--chat-composer-height, 82px) + 34px);
  scroll-padding-bottom: calc(var(--chat-composer-height, 82px) + 34px);
}

.messages-panel.history-anchor-locked {
  overflow-anchor: none;
}

.history-loading {
  z-index: 2;
  pointer-events: none;
}

.conversation-stack.is-empty .messages-panel {
  flex: none;
  min-height: auto;
  overflow: visible;
  padding: 0;
  scroll-padding-bottom: 0;
}

.messages-list-shell {
  width: var(--chat-content-width);
  max-width: var(--chat-content-max-width);
  margin: 0 auto;
}

.center-state,
.welcome-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.history-load-error {
  margin: 0 auto 12px;
}

.conversation-stack.is-empty .welcome-state {
  height: auto;
}

.welcome-title {
  font-family: "Outfit", "Noto Sans", sans-serif;
  font-size: 28px;
  font-weight: 800;
}

.welcome-subtitle {
  margin-top: 8px;
  color: var(--chat-muted);
  font-size: 16px;
}

.thread-selection-action {
  position: fixed;
  z-index: 1200;
  pointer-events: auto;
}

.thread-selection-button {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.14);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.composer-shell {
  position: relative;
  z-index: 3;
  isolation: isolate;
  background: transparent;
  padding: 0 0 18px;
}

.scroll-to-bottom {
  position: absolute;
  top: -48px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
  pointer-events: auto;
}

.scroll-to-bottom:hover {
  background: rgb(var(--v-theme-surface-variant));
}

.scroll-running-dots {
  display: flex;
  gap: 3px;
}

.scroll-running-dots span {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  animation: scroll-dot-pulse 1.2s ease-in-out infinite;
}

.scroll-running-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.scroll-running-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes scroll-dot-pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
  }
  40% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .scroll-running-dots span {
    animation: none;
  }
}

.conversation-stack:not(.is-empty) .composer-shell {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
}

.conversation-stack:not(.is-empty) .composer-shell::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: 32px;
  right: 0;
  bottom: 0;
  left: 0;
  pointer-events: none;
  background: var(--chat-page-bg);
}

.composer-shell :deep(.input-area),
.project-composer-shell :deep(.input-area) {
  padding-top: 0;
  padding-inline: 0;
  border-top: 0;
}

.conversation-stack:not(.is-empty) .composer-shell :deep(.input-area) {
  position: relative;
  z-index: 1;
  pointer-events: none;
  background: transparent;
}

.conversation-stack:not(.is-empty) .composer-shell :deep(.input-container) {
  pointer-events: auto;
}

/* 输入区在有消息时整体穿透点击，操作栏是新增的交互元素，需要单独恢复 */
.conversation-stack:not(.is-empty) .composer-shell :deep(.composer-actions) {
  pointer-events: auto;
}

.conversation-stack.is-empty .composer-shell {
  padding-bottom: 0;
}

kbd {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  font: inherit;
}

:deep(.paragraph-node) {
  margin: 0.5rem 0;
}

:deep(.list-node) {
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

:global(html.astrbot-chat-wide .v-app-bar.top-header) {
  display: none !important;
}

:global(html.astrbot-chat-wide .v-main.chat-main) {
  --v-layout-top: 0px;
  padding-top: 0 !important;
  top: 0 !important;
}

/* ===== 宽屏：左侧列表 + 右侧会话 双栏 ===== */
@media (min-width: 961px) {
  .chat-ui.is-wide {
    flex-direction: row;
  }

  /* 让标签内容区的子元素直接参与外层横向布局 */
  .chat-ui.is-wide .chat-tab-content {
    display: contents;
  }

  .chat-ui.is-wide .chat-tab--list {
    flex: 0 0 300px;
    width: 300px;
    height: 100%;
    padding-top: 0;
    border-right: 1px solid var(--chat-border);
    background: var(--chat-page-bg);
  }

  .chat-ui.is-wide .chat-main {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding-top: 0;
  }

  .chat-ui.is-wide .chat-main.empty-chat {
    padding-top: 0;
  }

  .chat-ui.is-wide .chat-tabbar {
    display: none;
  }

  .chat-ui.is-wide .list-header {
    padding: 12px 12px 8px;
  }
}

.chat-desktop-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 16px;
  border-bottom: 1px solid var(--chat-border);
}

.wide-sidebar-footer {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--chat-border);
}

.wide-footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  cursor: pointer;
}

.wide-footer-btn:hover {
  background: var(--chat-session-active-bg);
}

.wide-footer-btn.active {
  color: rgb(1, 102, 255);
  background: rgba(1, 102, 255, 0.08);
}

@media (min-width: 761px) {
  .chat-main.has-side-panel {
    --chat-content-width: calc(100% - 40px);
  }

  .messages-list-shell,
  .composer-shell :deep(.input-container) {
    transition:
      width 320ms cubic-bezier(0.22, 1, 0.36, 1),
      max-width 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .messages-list-shell,
  .composer-shell :deep(.input-container) {
    transition: none;
  }
}

@media (max-width: 760px) {
  .messages-panel {
    padding: 18px 0 calc(var(--chat-composer-height, 72px) + 20px);
    scroll-padding-bottom: calc(var(--chat-composer-height, 72px) + 20px);
  }

  .conversation-stack.is-empty .messages-panel {
    padding: 0;
    scroll-padding-bottom: 0;
  }

  .messages-list-shell {
    width: calc(100% - 24px); /* 气泡到屏幕左右各 12px */
    max-width: 100%;
  }

  .composer-shell,
  .project-composer-shell {
    padding: 0;
  }
}

/* ===== 底部标签栏（列表 / 会话 / 扩展 / 设置） ===== */
.chat-ui {
  flex-direction: column;
  /* 应用外壳（标签栏、列表、菜单、顶栏）一律不可选中；
     只有消息正文和输入框保留选择能力，避免长按后残留文字选择手柄 */
  user-select: none;
  -webkit-user-select: none;
}

.chat-ui :deep(.markdown-content),
.chat-ui :deep(.reasoning-text),
.chat-ui :deep(textarea),
.chat-ui :deep(input),
.chat-ui :deep(.search-input) {
  user-select: text;
  -webkit-user-select: text;
}

.chat-tab-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.chat-main {
  height: auto;
  min-height: 0;
}

/* 空会话时顶栏被收起，正文不需要再让出 50px */
.chat-main.empty-chat {
  padding-top: 8px;
}

.chat-tab {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 8px; /* 非会话标签页不显示标题，只需一点留白 */
  box-sizing: border-box;
  position: relative;
}

/* 列表页：原侧边栏内容，改为整屏宽度 */
.tab-list-inner {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  user-select: none;
  -webkit-user-select: none;
  padding: 6px 8px 0;
}

.tab-list-new {
  width: 100%;
  justify-content: flex-start;
}

.tab-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 设置页 */
.chat-tab--settings {
  overflow-y: auto;
}

.tab-settings-inner {
  display: flex;
  flex-direction: column;
  padding: 8px 12px 24px;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 12px;
  border: 0;
  border-radius: 12px;
  background: none;
  font: inherit;
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.settings-row:hover,
.settings-row:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.settings-row-icon {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.settings-row-label {
  flex: 1;
}

.settings-row--danger {
  color: rgb(var(--v-theme-error));
}

.settings-row--danger .settings-row-icon {
  color: inherit;
}

.settings-group {
  padding: 6px 12px 10px;
}

.settings-group-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  font-size: 16px;
}

.settings-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-left: 32px;
}

.settings-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 999px;
  background: transparent;
  font: inherit;
  font-size: 14px;
  color: inherit;
  cursor: pointer;
}

.settings-chip.active {
  border-color: rgb(1, 102, 255);
  background: rgba(1, 102, 255, 0.06);
  color: rgb(1, 102, 255);
}

.settings-chip-flag {
  font-size: 15px;
}

/* 扩展页留白 */
.chat-tab--blank {
  align-items: center;
  justify-content: center;
}

.tab-blank-text {
  color: rgba(var(--v-theme-on-surface), 0.45);
  font-size: 14px;
}

/* 标签栏本体 */
.chat-tabbar {
  flex: 0 0 auto;
  display: flex;
  border-top: 1px solid var(--chat-border);
  background: var(--chat-page-bg, #fff);
  padding-bottom: env(safe-area-inset-bottom);
}

.chat-tabbar-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px 0 6px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 11px;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), 0.55);
  cursor: pointer;
}

.chat-tabbar-btn.active {
  color: rgb(1, 102, 255);
}

.chat-tabbar-btn svg {
  stroke-width: 1.8;
}

@media (min-width: 600px) {
  .chat-tabbar {
    justify-content: center;
  }

  .chat-tabbar-btn {
    flex: 0 0 120px;
  }
}

/* 列表页右下角「创建会话」悬浮按钮 */
.list-fab {
  position: absolute;
  right: 20px;
  bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 0;
  border-radius: 50%;
  background: rgb(1, 102, 255);
  color: #fff;
  box-shadow: 0 4px 10px rgba(1, 102, 255, 0.22);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.list-fab:hover {
  box-shadow: 0 8px 22px rgba(1, 102, 255, 0.4);
}

.list-fab:active {
  transform: scale(0.94);
}

/* 设置二级页 */
.settings-back {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 4px 16px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 17px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.settings-row--choice {
  padding: 14px 12px;
}

.settings-choice-flag {
  font-size: 18px;
  line-height: 1;
}

.settings-row-value {
  font-size: 14px;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.settings-chevron {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.32);
}

.settings-check {
  flex: 0 0 auto;
  color: rgb(1, 102, 255);
}

/* ===== 列表页：会话项（仿参考图：圆形图标 + 两行文字 + 右侧时间） ===== */
/* 覆盖旧的侧边栏内边距，给列表更多宽度；移动端隐藏滚动条 */
.tab-list-scroll {
  padding: 0 4px 0;
  scrollbar-width: none;
}

.tab-list-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.settings-scroll {
  scrollbar-width: none;
}

.settings-scroll::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.session-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  margin: 0;
  padding: 8px 8px;
  border-radius: 14px;
  background: transparent;
}

/* 只有真有鼠标的设备才用悬停高亮；手机上点击后残留的 hover 会变成一条灰条 */
@media (hover: hover) and (pointer: fine) {
  .session-item:hover,
  .session-item:focus-visible {
    background: rgba(var(--v-theme-on-surface), 0.05);
  }
}

.session-item.active {
  background: rgba(1, 102, 255, 0.08);
}

.session-avatar {
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

.session-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.session-item .session-title {
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

.session-time {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.38);
  white-space: nowrap;
}

.session-item .session-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 0;
  padding-left: 8px;
  background: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-actions,
.session-item:focus-within .session-actions {
  opacity: 1;
  pointer-events: auto;
}

/* ===== 设置页：分组卡片（仿参考图） ===== */
.chat-tab--settings {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.settings-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 0 32px;
}

.settings-card {
  margin: 0 16px 20px;
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}

.settings-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 54px;
  padding: 12px 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  font: inherit;
  font-size: 16.5px;
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.settings-row + .settings-row::before {
  content: "";
  position: absolute;
  left: 16px;
  right: 0;
  top: 0;
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.settings-row:active {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.settings-icon {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.9);
  stroke-width: 2.1;
}

.settings-name {
  flex: 1;
  min-width: 0;
}

.settings-value {
  font-size: 15px;
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.settings-chevron {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.26);
}

.settings-check {
  flex: 0 0 auto;
  color: rgb(1, 102, 255);
}

.settings-row--danger {
  color: rgb(var(--v-theme-error));
}

.settings-row--danger .settings-icon {
  color: inherit;
}

.settings-back {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 16px 12px;
  padding: 6px 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}

/* ===== 列表页顶部：搜索栏 + 创建会话 ===== */
.list-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px 8px;
}

.list-search {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font: inherit;
  cursor: pointer;
}

.list-search-icon {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.list-search-text {
  font-size: 16px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.list-create {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}

.list-create:active {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

/* ===== 搜索界面 ===== */
.search-panel {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
}

.search-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 10px;
}

.search-field {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.search-field-icon {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface));
}

.search-input::placeholder {
  color: rgba(var(--v-theme-on-surface), 0.38);
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-cancel {
  flex: 0 0 auto;
  padding: 6px 4px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}

.search-history {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0 24px;
  scrollbar-width: none;
}

.search-history::-webkit-scrollbar {
  width: 0;
}

.search-history-row {
  display: flex;
  align-items: center;
  padding-right: 8px;
}

.search-history-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  height: 56px;
  padding: 0 16px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 17px;
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.search-history-icon {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.38);
}

.search-history-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.search-history-del {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: rgba(var(--v-theme-on-surface), 0.32);
  cursor: pointer;
}

.search-clear {
  display: block;
  margin: 14px auto 8px;
  padding: 8px 16px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 15px;
  color: rgba(var(--v-theme-on-surface), 0.42);
  cursor: pointer;
}

/* ===== 标签页切换动效（MD 共享轴：淡入 + 轻微横移） ===== */
@keyframes tabAnimFromRight {
  from {
    opacity: 0.2;
    transform: translateX(28px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes tabAnimFromLeft {
  from {
    opacity: 0.2;
    transform: translateX(-28px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.tab-anim-left {
  animation: tabAnimFromRight 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tab-anim-right {
  animation: tabAnimFromLeft 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* ===== 置顶分组 ===== */
.pinned-header {
  gap: 3px;
  width: 100%;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.pinned-section {
  padding-bottom: 4px;
}

.pinned-chevron {
  color: rgba(var(--v-theme-on-surface), 0.4);
  transition: transform 0.2s ease;
}

.pinned-chevron.is-open {
  transform: rotate(180deg);
}

/* ===== 长按操作菜单 ===== */
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.32);
  animation: sheetFade 0.16s ease-out;
}

@keyframes sheetFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.sheet {
  width: 100%;
  padding: 8px 8px calc(12px + env(safe-area-inset-bottom));
  border-radius: 18px 18px 0 0;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.12);
  animation: sheetUp 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}

@keyframes sheetUp {
  from {
    transform: translateY(24px);
  }
  to {
    transform: none;
  }
}

.sheet {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.sheet-title {
  user-select: none;
  -webkit-user-select: none;
  padding: 10px 16px 8px;
  font-size: 13px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sheet-item {
  display: block;
  width: 100%;
  padding: 15px 16px;
  border: 0;
  border-radius: 12px;
  background: none;
  font: inherit;
  font-size: 16.5px;
  color: rgb(var(--v-theme-on-surface));
  text-align: left;
  cursor: pointer;
}

.sheet-item:active {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.sheet-item--danger {
  color: rgb(var(--v-theme-error));
}

/* ===== 设置页内的模型配置子页 ===== */
.settings-subpage-provider {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 0 0;
  background: rgb(var(--v-theme-surface));
}

.settings-provider-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0 4px 8px;
}
</style>
