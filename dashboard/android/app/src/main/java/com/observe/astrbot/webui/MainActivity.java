package com.observe.astrbot.webui;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * 极简原生壳：WebView + WebViewAssetLoader 伺服本地打包的前端。
 *
 * 与网页端的全部交互面：
 * - 壳标记：window.__ASTR_SHELL__ = true（页面脚本执行前注入，前端据此启用壳行为）。
 * - 返回键协议：window.__onNativeBack() 返回 "consumed"/"root"（沿用原约定）。
 * - 文件上传：WebChromeClient.onShowFileChooser（系统选择器，行为同浏览器）。
 * - blob 下载：window.__shellDownloadBlob(name, blob, mime) 经 JS 桥落盘到应用缓存。
 */
public class MainActivity extends AppCompatActivity {

    private static final String START_PATH = "/index.html";
    private static final int REQ_FILE_CHOOSER = 9101;

    private WebView webView;
    private ValueCallback<Uri[]> pendingFileChooser;
    private long lastBackAt = 0L;

    /** 页面脚本执行前注入：壳标记 + blob 下载助手说明（助手本体经 addJavascriptInterface 注册）。 */
    private static final String PRELOAD_JS =
            "window.__ASTR_SHELL__=true;"
            + "window.__shellDownloadBlob=function(name,blob,mime){"
            + "try{var fr=new FileReader();"
            + "fr.onload=function(){"
            + "androidBridge.saveBase64(name,fr.result.split(',')[1],mime||'application/octet-stream');"
            + "};fr.readAsDataURL(blob);}catch(e){}};";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(0xFFFFFFFF);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // 页面源是 https 虚拟域，后端是内网 http：必须放行混合内容（局域网自用场景）
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                // dist 根直接映射到虚拟源根：/index.html -> assets/index.html，
                // /assets/index-xxx.js -> assets/assets/index-xxx.js（与 vite base=/ 产物对齐）
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void saveBase64(String name, String base64, String mime) {
                try {
                    byte[] data = android.util.Base64.decode(base64, android.util.Base64.DEFAULT);
                    File dir = new File(getCacheDir(), "downloads");
                    if (!dir.exists()) dir.mkdirs();
                    File out = new File(dir, name == null || name.isEmpty() ? "download.bin" : name);
                    try (OutputStream os = new FileOutputStream(out)) {
                        os.write(data);
                    }
                } catch (IOException | IllegalArgumentException ignored) {
                }
            }

            /** 页面主题变化时同步系统栏图标明暗：dark -> 浅色图标，light -> 深色图标。 */
            @JavascriptInterface
            public void setWindowTheme(String mode) {
                final boolean lightIcons = !"dark".equalsIgnoreCase(mode);
                runOnUiThread(() -> {
                    WindowInsetsControllerCompat ctl =
                            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                    ctl.setAppearanceLightStatusBars(lightIcons);
                    ctl.setAppearanceLightNavigationBars(lightIcons);
                });
            }
        }, "androidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme() == null ? "" : request.getUrl().getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        // 注入先于任何页面脚本（官方 API，避免 onPageStarted 竞态）
        WebViewCompat.addDocumentStartJavaScript(
                webView, PRELOAD_JS,
                java.util.Collections.singleton("https://appassets.androidplatform.net"));

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                pendingFileChooser = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    pendingFileChooser = null;
                    return false;
                }
                return true;
            }
        });

        // 返回键：决策权交给网页（沿用 __onNativeBack 协议）
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                webView.evaluateJavascript(
                        "(function(){try{return (window.__onNativeBack&&window.__onNativeBack())||'root'}catch(e){return 'root'}})()",
                        value -> {
                            if (value != null && value.contains("consumed")) return;
                            exitOrWarn();
                        });
            }
        });

        /* 状态栏/刘海/键盘避让（targetSdk 36：Android 15+ 强制 edge-to-edge）。
         * 依据 Android 官方《Make WebViews edge-to-edge》与《Understand window
         * insets in WebView》：
         *  1) padding 加在 WebView 的父容器上——加在 WebView 自身会被忽略；
         *  2) 已用于 padding 的维度必须"归零"后继续下发（zeroing 方案），
         *     既避免双重留白，也避免键盘收起后残留 ghost padding；
         *  3) 用 enableEdgeToEdge 统一各 API 级别的系统栏透明与图标明暗。 */
        WindowCompat.enableEdgeToEdge(getWindow());
        /* 系统栏图标明暗由应用自己设定：WindowCompat.enableEdgeToEdge 只做窗口透明、
         * 刘海布局与对比度关闭，不设置图标明暗；Android 15+ 起系统也不再从状态栏
         * 颜色推导图标颜色（Google 已标记为预期行为）。页面初始为白底，故默认深色
         * 图标；页面切到深色主题时由 androidBridge.setWindowTheme 回调纠正。 */
        WindowInsetsControllerCompat barIcons =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        barIcons.setAppearanceLightStatusBars(true);
        barIcons.setAppearanceLightNavigationBars(true);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFFFFFFFF);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            int top = Math.max(bars.top, cutout.top);
            int bottom = Math.max(bars.bottom, ime.bottom);
            v.setPadding(cutout.left, top, cutout.right, bottom);
            return new WindowInsetsCompat.Builder(insets)
                    .setInsets(WindowInsetsCompat.Type.systemBars(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                    .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                    .build();
        });
        setContentView(root);

        webView.loadUrl("https://appassets.androidplatform.net" + START_PATH);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (pendingFileChooser == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    results = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        results[i] = clip.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            pendingFileChooser.onReceiveValue(results);
            pendingFileChooser = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** 单次返回只提示；2 秒内第二次才真正退出。 */
    private void exitOrWarn() {
        long now = SystemClock.elapsedRealtime();
        if (now - lastBackAt < 2000L) {
            finish();
            return;
        }
        lastBackAt = now;
        Toast.makeText(this, "再按一次返回键退出", Toast.LENGTH_SHORT).show();
    }
}
