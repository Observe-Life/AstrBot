package com.observe.astrbot.webui;

import android.os.Bundle;
import android.os.SystemClock;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private long lastBackAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        /* Android 13+ 的手势返回走 OnBackPressedDispatcher，不再回调 onBackPressed()，
         * 因此必须注册 dispatcher 回调才能拦到。本回调注册晚于 Capacitor 自己的，
         * 优先级更高（dispatcher 后进先出）。
         * 决策权交给网页：window.__onNativeBack() 返回 "consumed" 表示页面已处理
         * （关闭思考详情页/浮层/回退路由），返回 "root" 表示停在根页，走双击退出。 */
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    exitOrWarn();
                    return;
                }
                webView.evaluateJavascript(
                        "(function(){try{return (window.__onNativeBack&&window.__onNativeBack())||'root'}catch(e){return 'root'}})()",
                        value -> {
                            if (value != null && value.contains("consumed")) {
                                return;
                            }
                            exitOrWarn();
                        });
            }
        });
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
