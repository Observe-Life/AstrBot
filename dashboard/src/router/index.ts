import { createRouter, createWebHashHistory } from 'vue-router';
import MainRoutes from './MainRoutes';
import AuthRoutes from './AuthRoutes';
import ChatBoxRoutes from './ChatBoxRoutes';
import { useAuthStore } from '@/stores/auth';
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

router.beforeEach(async (to, from, next) => {
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
