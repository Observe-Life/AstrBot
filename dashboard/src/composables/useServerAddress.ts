/*
 * 服务器地址管理（安卓壳专用能力）。
 *
 * - 填写 AstrBot 后端内网网址后，安卓壳（Capacitor 原生环境）里的所有
 *   HTTP / WebSocket 请求都指向它；原生层发请求不受浏览器同源策略限制。
 * - 浏览器开发模式（vite dev）没有原生层，数据仍由代理提供，地址仅作
 *   状态记录与展示，避免误以为发生了真实跨域直连。
 */
const STORAGE_KEY = "server.url";
const DEFAULT_URL = "http://192.168.31.115:6185";

export function isNativeApp(): boolean {
  return Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.(),
  );
}

export function normalizeServerUrl(raw: string): string {
  let v = raw.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`;
  return v.replace(/\/+$/, "");
}

export function getServerUrl(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

/** 保存地址；传空串视为断开。返回规范化后的值。 */
export function setServerUrl(raw: string): string {
  const v = normalizeServerUrl(raw);
  if (v) localStorage.setItem(STORAGE_KEY, v);
  else localStorage.removeItem(STORAGE_KEY);
  return v;
}

export function hasServerUrl(): boolean {
  return Boolean(getServerUrl());
}

/** 首次使用的默认地址：浏览器原型预填便于审核；安卓壳保持未连接，由用户填写。 */
export function ensureDefaultServerUrl(): void {
  if (isNativeApp()) return;
  if (localStorage.getItem(STORAGE_KEY) === null) {
    localStorage.setItem(STORAGE_KEY, DEFAULT_URL);
  }
}

/** 给定 API 相对路径，返回应请求的完整地址。 */
export function resolveApiUrl(path: string): string {
  const base = getServerUrl();
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** WebSocket 协议：按配置的服务器地址决定（app 页面是 https://localhost，服务器是 http，必须 ws）。 */
export function resolveWebSocketProtocol(): "ws:" | "wss:" {
  const base = getServerUrl();
  if (base) {
    try {
      return new URL(base).protocol === "https:" ? "wss:" : "ws:";
    } catch {
      /* 配置地址无效时回退 */
    }
  }
  return window.location.protocol === "https:" ? "wss:" : "ws:";
}

/** WebSocket 主机名：仅原生环境且已配置地址时返回，否则走默认同源。 */
export function resolveWebSocketHost(): string | undefined {
  if (!isNativeApp()) return undefined;
  const base = getServerUrl();
  if (!base) return undefined;
  try {
    return new URL(base).host;
  } catch {
    return undefined;
  }
}
