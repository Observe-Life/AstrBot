/*
 * 聊天附件（图片 / 音频 / 视频 / 文件）的地址解析。
 *
 * 网页端：后端文件接口靠 cookie 鉴权，相对 URL 同源即可，原样返回。
 * 安卓壳：页面源是 https://localhost，相对 URL 会打到壳自己的本地资源
 *   服务器（拿到的是 index.html，图片必然裂开）；而 <img>/<audio> 这类
 *   标签无法携带 Bearer 头。所以壳内改走 axios —— 它被 CapacitorHttp
 *   接管、能带鉴权头拿到真正的二进制 —— 转成 blob URL 再交给标签。
 */
import { reactive } from "vue";
import axios from "axios";

import { isNativeApp, resolveApiUrl } from "@/composables/useServerAddress";

type MediaPart = {
  attachment_id?: string;
  stored_filename?: string;
  filename?: string;
};

/* key -> 已就绪的 blob URL；reactive 让模板在加载完成后自动重渲 */
const blobSrc = reactive<Record<string, string>>({});
const inflight = new Set<string>();

function mediaKey(part: MediaPart): string {
  return String(part.attachment_id || part.stored_filename || part.filename || "");
}

async function loadBlob(key: string, url: string) {
  try {
    const response = await axios.get(resolveApiUrl(url), {
      responseType: "blob",
    });
    const data = response.data;
    const blob =
      data instanceof Blob
        ? data
        : new Blob([data], {
            type: String(response.headers?.["content-type"] || ""),
          });
    blobSrc[key] = URL.createObjectURL(blob);
  } catch (error) {
    /* 拉取失败时退回原地址：网页端无影响，壳内至少能显示错误占位 */
    console.error("[chatMedia] 媒体加载失败:", error);
    blobSrc[key] = url;
  } finally {
    inflight.delete(key);
  }
}

/**
 * 给定附件的原始地址（相对或绝对），返回当前可直接放进标签的地址。
 * 壳内首次调用返回空串并触发异步加载，加载完成后自动更新。
 */
export function mediaDisplayUrl(part: MediaPart, fallback: string): string {
  if (!fallback) return "";
  if (!isNativeApp()) return fallback;
  /* 绝对地址（外链、data:、blob:）原样使用 */
  if (/^([a-z][a-z\d+\-.]*:)?\/\//i.test(fallback)) return fallback;
  const key = mediaKey(part);
  if (!key) return fallback;
  const ready = blobSrc[key];
  if (ready) return ready;
  if (!inflight.has(key)) {
    inflight.add(key);
    void loadBlob(key, fallback);
  }
  return "";
}
