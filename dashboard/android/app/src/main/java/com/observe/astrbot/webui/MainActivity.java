package com.observe.astrbot.webui;

import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private long lastBackAt = 0L;

    @Override
    public void onBackPressed() {
        /* 单次返回：提示但留在应用；2 秒内第二次返回：退出 */
        long now = System.currentTimeMillis();
        if (now - lastBackAt < 2000L) {
            super.onBackPressed();
            return;
        }
        lastBackAt = now;
        Toast.makeText(this, "再按一次返回键退出", Toast.LENGTH_SHORT).show();
    }
}
