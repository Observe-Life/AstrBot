import { createRouter, createWebHashHistory } from 'vue-router';
import MainRoutes from './MainRoutes';
import AuthRoutes from './AuthRoutes';
import ChatBoxRoutes from './ChatBoxRoutes';
import { useAuthStore } from '@/stores/auth';
import { hasServerUrl } from '@/composables/useServerAddress';
import { useRouterLoadingStore } from '@/stores/routerLoading';

/*
 * 直接访问 /list、/session、/extend、/settings（不带 #）时，
 * 自动补上 hash 路由前缀，保证刷新后仍停在同一个标签页。
 */
(function normalizeTabEntry() {
  if (typeof window === "undefined") return;
  if (window.location.hash) return;
  const TAB_BASES = ["/list", "/session", "/extend", "/settings", "/chat"];
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const raw = window.location.pathname.replace(/\/+$/, "") || "/";
  const path = base && raw.startsWith(base) ? raw.slice(base.length) || "/" : raw;
  if (!TAB_BASES.some((b) => path === b || path.startsWith(`${b}/`))) return;
  window.location.replace(`${window.location.origin}${base}/#${path}`);
})();

export const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    MainRoutes,
    AuthRoutes,
    ChatBoxRoutes
  ]
});

interface AuthStore {
  username: string;
  returnUrl: string | null;
  login(
    username: string,
    password: string,
    code?: string,
    trustDeviceToken?: boolean,
  ): Promise<void | 'totp_required' | 'upgrade_recovery_required'>;
  logout(): void;
  has_token(): boolean;
}

/* 手机与安卓壳：默认落列表页（四标签框架），不进后台管理首页 */
function isMobileLikeViewport(): boolean {
  const native = Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.(),
  );
  return native || window.innerWidth < 961;
}

router.beforeEach(async (to, from, next) => {
  if (
    (to.path === '/' || to.path === '/welcome') &&
    isMobileLikeViewport() &&
    from.matched.length === 0
  ) {
    /* 仅在冷启动（无来源页）时改落点；应用内主动进后台管理不拦截 */
    return next('/list');
  }
  if (from.name && from.path !== to.path) {
    const loadingStore = useRouterLoadingStore();
    loadingStore.start();
  }

  const publicPages = ['/auth/login', '/auth/setup'];
  const authRequired = !publicPages.includes(to.path);
  const auth: AuthStore = useAuthStore();

  // 如果用户已登录且试图访问登录页面，则重定向到首页
  if (to.path === '/auth/login' && auth.has_token()) {
    return next('/welcome');
  }

  if (to.matched.some((record) => record.meta.requiresAuth)) {
    if (authRequired && !auth.has_token()) {
      // 尚未连接服务器（安卓壳首次打开/地址未填）：登录无处可发，
      // 主框架四标签全部放行（未连接遮罩 + 设置页「连接服务器」），其余页面落会话页。
      // 注意：不能无脑重定向，否则会与 requiresAuth 形成循环导致白屏。
      if (!hasServerUrl()) {
        const FRAME_PATHS = ['/list', '/session', '/extend', '/settings'];
        if (
          FRAME_PATHS.some(
            (base) => to.path === base || to.path.startsWith(`${base}/`),
          )
        ) {
          return next();
        }
        return next('/session');
      }
      auth.returnUrl = to.fullPath;
      return next('/auth/login');
    }
    return next();
  } else {
    next();
  }
});

router.afterEach(() => {
  const loadingStore = useRouterLoadingStore();
  loadingStore.finish();
});
