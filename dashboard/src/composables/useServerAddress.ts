/*
 * 服务器地址管理（连接服务器的本体逻辑，网页端与壳共用同一实现）。
 *
 * - 页面在壳内由 WebViewAssetLoader 伺服于固定虚拟源，后端地址由用户配置：
 *   配置后所有 HTTP / WebSocket 请求都改写指向它（跨源，靠后端 CORS 放行）。
 * - 浏览器直接访问后端自身时页面与 API 同源，改写等于改到同源，无副作用。
 */
const STORAGE_KEY = "server.url";
const DEFAULT_URL = "http://192.168.31.115:6185";

/** 是否运行在 AstrBot 原生壳内（壳在页面脚本执行前注入 __ASTR_SHELL__）。 */
export function isShellApp(): boolean {
  return Boolean(
    (window as unknown as { __ASTR_SHELL__?: boolean }).__ASTR_SHELL__,
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

/** 首次使用的默认地址：浏览器原型预填便于审核；壳内保持未连接，由用户填写。 */
export function ensureDefaultServerUrl(): void {
  if (isShellApp()) return;
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

/** WebSocket 协议：按配置的服务器地址决定；未配置走页面自身的协议。 */
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

/** WebSocket 主机名：已配置地址时返回它，否则走默认同源。 */
export function resolveWebSocketHost(): string | undefined {
  const base = getServerUrl();
  if (!base) return undefined;
  try {
    return new URL(base).host;
  } catch {
    return undefined;
  }
}
