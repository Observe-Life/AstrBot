import {
  getServerUrl,
  isNativeApp,
  resolveApiUrl,
} from '@/composables/useServerAddress';
import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

const AUTH_HEADER = 'Authorization';
const LOCALE_HEADER = 'Accept-Language';

let configured = false;
let originalFetch: typeof window.fetch | null = null;

export const httpClient = axios;
export const apiV1Client = axios.create({ baseURL: '/api/v1' });

function getToken(): string | null {
  return localStorage.getItem('token');
}

function getLocale(): string | null {
  return localStorage.getItem('astrbot-locale');
}

function setAxiosHeader(
  headers: InternalAxiosRequestConfig['headers'],
  key: string,
  value: string,
) {
  if (typeof headers.set === 'function') {
    headers.set(key, value);
    return;
  }
  headers[key] = value;
}

/**
 * 配置的服务器地址（安卓壳）与页面同源一样，都属于第一方；
 * 其余跨域目标仍不携带仪表盘凭据。
 */
function isFirstPartyOrigin(origin: string): boolean {
  if (origin === window.location.origin) return true;
  try {
    const base = getServerUrl();
    return Boolean(base) && origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/**
 * 安卓壳里把相对 API 地址改写到配置的服务器；
 * 浏览器开发模式保持相对路径（走 vite 代理）。
 */
function rewriteToServerUrl(config: InternalAxiosRequestConfig) {
  try {
    if (!isNativeApp()) return config;
    const url = config.url || '';
    if (/^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)) return config;
    const base = config.baseURL || '';
    const combined = base
      ? `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
      : url;
    config.url = resolveApiUrl(combined);
    config.baseURL = undefined;
  } catch {
    /* 解析失败保持原样 */
  }
  return config;
}

function attachAxiosHeaders(config: InternalAxiosRequestConfig) {
  // Dashboard credentials must not be attached to third-party requests.
  try {
    const requestUrl = new URL(axios.getUri(config), window.location.href);
    if (!isFirstPartyOrigin(requestUrl.origin)) return config;
  } catch {
    return config;
  }

  const token = getToken();
  if (token) {
    setAxiosHeader(config.headers, AUTH_HEADER, `Bearer ${token}`);
  }

  const locale = getLocale();
  if (locale) {
    setAxiosHeader(config.headers, LOCALE_HEADER, locale);
  }

  return config;
}

function normalizeAxiosError(error: AxiosError) {
  if (error.response?.status === 401) {
    let requestPath = '';
    try {
      const url = error.config?.url || '';
      const baseURL = error.config?.baseURL;
      const resolvedUrl =
        url && baseURL && !/^([a-z][a-z\d+\-.]*:)?\/\//i.test(url)
          ? `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
          : url;
      const requestUrl = new URL(resolvedUrl || '/', window.location.origin);
      if (requestUrl.origin === window.location.origin) {
        requestPath = requestUrl.pathname;
      }
    } catch {
      requestPath = '';
    }

    const isAuthChallenge =
      [
        '/api/auth/login',
        '/api/auth/setup',
        '/api/auth/setup-status',
        '/api/v1/auth/login',
        '/api/v1/auth/setup',
        '/api/v1/auth/setup-status',
      ].includes(requestPath) ||
      Boolean(
        (
          error.response.data as
            | { data?: { totp_required?: boolean } }
            | undefined
        )?.data?.totp_required,
      );

    if (requestPath.startsWith('/api/') && !isAuthChallenge) {
      [
        'user',
        'token',
        'change_pwd_hint',
        'md5_pwd_hint',
        'password_upgrade_required',
      ].forEach((key) => localStorage.removeItem(key));

      if (!window.location.hash.startsWith('#/auth/login')) {
        window.location.hash = '/auth/login';
      }
    }
  }

  if (error.response?.status === 429) {
    const data = error.response.data as { message?: string } | undefined;
    if (data?.message) {
      return Promise.reject(data.message);
    }
  }
  return Promise.reject(error);
}

function installAxiosInterceptors(instance: AxiosInstance) {
  instance.interceptors.request.use(rewriteToServerUrl);
  instance.interceptors.request.use(attachAxiosHeaders);
  instance.interceptors.response.use((response) => response, normalizeAxiosError);
}

export function fetchWithAuth(input: RequestInfo | URL, init?: RequestInit) {
  const fetchImpl = originalFetch ?? window.fetch.bind(window);
  // The global fetch wrapper also handles public, cross-origin resources.
  try {
    const requestUrl = new URL(
      input instanceof Request ? input.url : input,
      window.location.href,
    );
    if (!isFirstPartyOrigin(requestUrl.origin)) {
      return fetchImpl(input, init);
    }
  } catch {
    return fetchImpl(input, init);
  }

  const token = getToken();
  const locale = getLocale();

  if (!token && !locale) {
    return fetchImpl(input, init);
  }

  const requestHeaders =
    typeof input !== 'string' && 'headers' in input
      ? (input as Request).headers
      : undefined;
  const headers = new Headers(init?.headers || requestHeaders);

  if (token && !headers.has(AUTH_HEADER)) {
    headers.set(AUTH_HEADER, `Bearer ${token}`);
  }
  if (locale && !headers.has(LOCALE_HEADER)) {
    headers.set(LOCALE_HEADER, locale);
  }

  return fetchImpl(input, { ...init, headers });
}

export function setupHttpClient() {
  if (configured) {
    return;
  }

  installAxiosInterceptors(axios);
  installAxiosInterceptors(apiV1Client);

  originalFetch = window.fetch.bind(window);
  window.fetch = fetchWithAuth;

  configured = true;
}
