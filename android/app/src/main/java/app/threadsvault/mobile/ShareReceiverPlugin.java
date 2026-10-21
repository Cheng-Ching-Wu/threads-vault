package app.threadsvault.mobile;

import android.content.Intent;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * 接收 Android 系統分享（ACTION_SEND, text/plain），例如在 Threads App 按「分享 → Threads Vault」。
 * 只把使用者分享的文字（通常是貼文網址）交給 Web 層處理，不存取任何其他資料。
 *
 * JS 端：src/features/share/shareReceiver.ts
 */
@CapacitorPlugin(name = "ShareReceiver")
public class ShareReceiverPlugin extends Plugin {

    private static final String EVENT = "shareReceived";
    private static final List<String> pending = new ArrayList<>();
    private static ShareReceiverPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** 由 MainActivity 在 onCreate / onNewIntent 呼叫 */
    public static void handleIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("text/")) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) return;

        // 避免 Activity 重建時重複處理同一個 Intent
        intent.setAction(null);

        synchronized (pending) {
            ShareReceiverPlugin plugin = instance;
            if (plugin != null && plugin.hasListeners(EVENT)) {
                JSObject data = new JSObject();
                data.put("text", text);
                plugin.notifyListeners(EVENT, data);
            } else {
                // Web 層尚未載入，先暫存，等 getPendingShares() 取走
                pending.add(text);
            }
        }
    }

    @PluginMethod
    public void getPendingShares(PluginCall call) {
        JSArray items = new JSArray();
        synchronized (pending) {
            for (String text : pending) {
                JSObject item = new JSObject();
                item.put("text", text);
                items.put(item);
            }
            pending.clear();
        }
        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }
}
