import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { errorMessage, toast } from '@/shared/utils/ui';


/**
 * 系統分享接收（第二階段）。
 *
 * Android：MainActivity 透過自訂的 ShareReceiver 外掛（android/app/src/main/java/.../ShareReceiverPlugin.java）
 *   接收 ACTION_SEND（text/plain）Intent，再把文字傳給這裡。
 * iOS：尚未實作。規劃使用 Share Extension 將網址寫入 App Group 的共用 UserDefaults，
 *   App 啟動或回到前景時以同一個 ShareReceiver 介面（getPendingShares）讀取。詳見 README。
 *
 * 只處理使用者主動分享進來的網址，不呼叫任何 Threads 未公開 API。
 */
export interface SharedPayload {
  text: string;
}

interface ShareReceiverPlugin {
  /** 取得 App 啟動前 / 背景時收到、尚未處理的分享內容 */
  getPendingShares(): Promise<{ items: SharedPayload[] }>;
  addListener(event: 'shareReceived', cb: (p: SharedPayload) => void): Promise<PluginListenerHandle>;
}

const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver');

export async function handleSharedText(text: string): Promise<void> {
  const vault = useVaultStore();
  try {
    await vault.whenReady();
    const { created } = await vault.addFromSharedText(text, 'share');
    await toast(created ? '已加入 Threads Vault' : '這篇已經在收藏中', created ? 'success' : 'medium');
  } catch (e) {
    await toast(`無法加入收藏：${errorMessage(e)}`, 'warning');
  }
}

let initialized = false;

export async function initShareReceiver(): Promise<void> {
  if (initialized || Capacitor.getPlatform() !== 'android') return;
  initialized = true;
  try {
    await ShareReceiver.addListener('shareReceived', (p) => void handleSharedText(p.text));
    const { items } = await ShareReceiver.getPendingShares();
    for (const item of items) await handleSharedText(item.text);
  } catch (e) {
    console.warn('[share] 分享接收器未啟用：', errorMessage(e));
  }
}
