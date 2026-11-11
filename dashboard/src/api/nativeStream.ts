/**
 * app 内原生流式请求：让 SSE 走手机原生 HTTP 层（capacitor-stream-http 插件），
 * 绕开 WebView 的混合内容拦截与 CapacitorHttp 的响应缓冲。
 *
 * 返回值与 fetch Response 同构（ok/status/body: ReadableStream<Uint8Array>），
 * 供 readSseStream 直接消费；仅在原生环境调用（isNativeApp()），网页端不受影响。
 */
import { StreamHttp } from "capacitor-stream-http";
import { getServerUrl } from "@/composables/useServerAddress";

function getAuthToken(): string | null {
  return localStorage.getItem("token");
}

export interface NativeStreamResponse {
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array>;
}

interface NativeStreamOptions {
  method?: "GET" | "POST";
  jsonBody?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
  signal?: AbortSignal;
}

export function isNativeStreamAvailable(): boolean {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.StreamHttp,
  );
}

/** 相对 API 路径 → 服务器绝对地址（fetchWithAuth 没做这件事，这里必须补上） */
function toAbsoluteUrl(path: string): string {
  const base = getServerUrl();
  if (!base) {
    throw new Error("未配置服务器地址");
  }
  return `${base.replace(/\/+$/, "")}${path}`;
}

export async function nativeStreamRequest(
  path: string,
  options: NativeStreamOptions = {},
): Promise<NativeStreamResponse> {
  const url = toAbsoluteUrl(path);
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    ...(options.headers || {}),
  };
  const token = options.token ?? getAuthToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const encoder = new TextEncoder();
  let status = 0;
  let responseHeadResolve: ((value: number) => void) | null = null;
  const responseHead = new Promise<number>((resolve) => {
    responseHeadResolve = resolve;
  });
  let streamId: string | null = null;
  let finished = false;
  const cleanup: Array<() => void> = [];

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onChunk = (data: { chunk?: string }) => {
        if (finished) return;
        if (typeof data.chunk === "string") {
          controller.enqueue(encoder.encode(data.chunk));
        }
      };
      const onEnd = () => {
        finished = true;
        controller.close();
      };
      const onError = (data: { error?: string }) => {
        finished = true;
        controller.error(new Error(data.error || "原生流式请求失败"));
      };
      const unsubChunk = await StreamHttp.addListener("chunk", onChunk);
      const unsubEnd = await StreamHttp.addListener("end", onEnd);
      const unsubError = await StreamHttp.addListener("error", onError);
      cleanup.push(() => {
        try {
          unsubChunk.remove();
          unsubEnd.remove();
          unsubError.remove();
        } catch {
          /* 插件已释放时忽略 */
        }
      });
    },
    cancel() {
      finished = true;
      if (streamId) {
        void StreamHttp.cancelStream({ id: streamId });
      }
    },
  });

  const started = await StreamHttp.startStream({
    url,
    method: options.method || "GET",
    headers,
    body: options.jsonBody === undefined ? undefined : JSON.stringify(options.jsonBody),
  });
  streamId = started.id;

  if (options.signal) {
    const onAbort = () => {
      finished = true;
      if (streamId) void StreamHttp.cancelStream({ id: streamId });
    };
    if (options.signal.aborted) {
      onAbort();
    } else {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  // response 事件在首个 chunk 前触发一次，带回状态码
  const responseUnsub = await StreamHttp.addListener("response", (data) => {
    status = data.status;
    responseHeadResolve?.(status);
    cleanup.push(() => {
      try {
        responseUnsub.remove();
      } catch {
        /* 忽略 */
      }
    });
  });
  void responseUnsub;

  // 兜底：某些版本 response 事件先于 startStream 返回注册，等待超时按 0 处理
  const timeout = new Promise<number>((resolve) => {
    setTimeout(() => resolve(0), 10000);
  });
  status = await Promise.race([responseHead, timeout]);
  responseHeadResolve = null;

  return {
    ok: status >= 200 && status < 400,
    status,
    body,
  };
}
