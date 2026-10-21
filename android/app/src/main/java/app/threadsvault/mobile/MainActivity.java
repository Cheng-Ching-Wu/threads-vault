package app.threadsvault.mobile;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 自訂外掛必須在 super.onCreate 之前註冊
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
        ShareReceiverPlugin.handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // launchMode="singleTask"：App 已開啟時，分享會從這裡進來
        ShareReceiverPlugin.handleIntent(intent);
    }
}
