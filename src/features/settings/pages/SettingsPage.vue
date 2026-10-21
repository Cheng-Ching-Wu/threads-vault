<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  loadingController,
} from '@ionic/vue';
import {
  archiveOutline,
  cloudDownloadOutline,
  cloudUploadOutline,
  colorWandOutline,
  documentAttachOutline,
  gridOutline,
  linkOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  trashBinOutline,
} from 'ionicons/icons';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { parseBackup, serializeBackup } from '@/services/backup/backupFormat';
import { snapshotToCsv } from '@/services/backup/csvFormat';
import { pickFile, saveTextFile } from '@/services/platform/fileService';
import { fileTimestamp, formatDateTime } from '@/shared/utils/date';
import { confirm, prompt, toast, toastError } from '@/shared/utils/ui';
import { setThemeMode, themeMode, type ThemeMode } from '../theme';
import CloudSyncSection from '@/features/cloud/components/CloudSyncSection.vue';

const vault = useVaultStore();
const busy = ref(false);

const stats = computed(() => ({
  total: vault.bookmarks.length,
  withUrl: vault.bookmarks.length - vault.missingUrlCount,
  missingUrl: vault.missingUrlCount,
  folders: vault.folders.length,
  tags: vault.tags.length,
  uncategorized: vault.uncategorizedCount,
  withNotes: vault.bookmarks.filter((b) => b.notes).length,
}));

const SOURCE: Record<string, string> = { meta_json: 'Meta JSON', json: 'JSON', csv: 'CSV', share: '分享' };

async function withLoading(message: string, fn: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  const loading = await loadingController.create({ message });
  await loading.present();
  try {
    await fn();
  } catch (e) {
    await toastError(e);
  } finally {
    await loading.dismiss();
    busy.value = false;
  }
}

function exportJson() {
  return withLoading('正在產生備份…', async () => {
    const snap = await (await vault.getRepo()).exportSnapshot();
    await saveTextFile(`threads-vault-backup-${fileTimestamp()}.json`, serializeBackup(snap), 'application/json');
    await toast(`已匯出 ${snap.bookmarks.length} 篇收藏的備份`, 'success');
  });
}

function exportCsv() {
  return withLoading('正在產生 CSV…', async () => {
    const snap = await (await vault.getRepo()).exportSnapshot();
    await saveTextFile(`threads-vault-export-${fileTimestamp()}.csv`, snapshotToCsv(snap), 'text/csv');
    await toast('已匯出 CSV', 'success');
  });
}

async function restore() {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  let snapshot;
  try {
    snapshot = parseBackup(JSON.parse(await file.text()));
  } catch (e) {
    await toastError(e, '無法讀取備份');
    return;
  }
  const ok = await confirm({
    header: '還原備份？',
    message:
      `備份內有 ${snapshot.bookmarks.length} 篇收藏、${snapshot.folders.length} 個資料夾、${snapshot.tags.length} 個標籤。` +
      `還原會「取代」目前所有資料（目前 ${vault.bookmarks.length} 篇）。建議先匯出一份目前的備份。`,
    confirmText: '取代並還原',
    destructive: true,
  });
  if (!ok) return;
  await withLoading('正在還原…', async () => {
    await (await vault.getRepo()).replaceAll(snapshot);
    await vault.reloadAll();
    await toast('還原完成', 'success');
  });
}

async function clearAll() {
  const cloud = vault.storageKind === 'firestore';
  const ok = await confirm({
    header: cloud ? '清除雲端上的所有資料？' : '清除所有資料？',
    message: cloud
      ? '你雲端帳號裡的所有收藏、資料夾、標籤與備註都會被刪除，所有登入這個帳號的裝置都會受影響，無法復原。請先匯出備份。'
      : '所有收藏、資料夾、標籤與備註都會從這台裝置刪除，無法復原。請先匯出備份。',
    confirmText: '繼續',
    destructive: true,
  });
  if (!ok) return;
  const typed = await prompt({ header: '請輸入「刪除」以確認', placeholder: '刪除', confirmText: '清除所有資料' });
  if (typed?.trim() !== '刪除') {
    if (typed !== null) await toast('輸入不符，已取消', 'warning');
    return;
  }
  await withLoading('正在清除…', async () => {
    await (await vault.getRepo()).clearAll();
    await vault.reloadAll();
    await toast('已清除所有資料', 'success');
  });
}

async function addByUrl() {
  const text = await prompt({ header: '以網址新增收藏', placeholder: 'https://www.threads.com/@user/post/…', confirmText: '新增' });
  if (!text) return;
  try {
    const { created } = await vault.addFromSharedText(text, 'manual');
    await toast(created ? '已新增收藏' : '這篇已經在收藏中', created ? 'success' : 'medium');
  } catch (e) {
    await toastError(e, '無法新增');
  }
}

function onTheme(ev: CustomEvent) {
  setThemeMode(ev.detail.value as ThemeMode);
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar><ion-title>設定</ion-title></ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="tv-container">
        <CloudSyncSection />

        <ion-list inset>
          <ion-list-header>匯入</ion-list-header>
          <ion-item button router-link="/import" :detail="true">
            <ion-icon slot="start" :icon="cloudUploadOutline" aria-hidden="true" />
            <ion-label>
              <h3>匯入 Meta 收藏 / JSON / CSV</h3>
              <p>saved_threads.json、Threads Vault 備份或 CSV</p>
            </ion-label>
          </ion-item>
          <ion-item button :detail="false" @click="addByUrl">
            <ion-icon slot="start" :icon="linkOutline" aria-hidden="true" />
            <ion-label>以網址新增收藏</ion-label>
          </ion-item>
          <ion-item button router-link="/rules" :detail="true">
            <ion-icon slot="start" :icon="colorWandOutline" aria-hidden="true" />
            <ion-label>
              <h3>自動分類規則</h3>
              <p>依關鍵字自動放進資料夾、加上標籤</p>
            </ion-label>
            <ion-note slot="end">{{ vault.autoRules.filter((r) => r.enabled).length }} 條啟用</ion-note>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header>備份與匯出</ion-list-header>
          <ion-item button :detail="false" :disabled="busy" @click="exportJson">
            <ion-icon slot="start" :icon="archiveOutline" aria-hidden="true" />
            <ion-label>
              <h3>匯出備份（JSON）</h3>
              <p>完整保留收藏、資料夾、標籤、備註與自動分類規則</p>
            </ion-label>
          </ion-item>
          <ion-item button :detail="false" :disabled="busy" @click="exportCsv">
            <ion-icon slot="start" :icon="documentAttachOutline" aria-hidden="true" />
            <ion-label>
              <h3>匯出 CSV</h3>
              <p>可用 Excel / Google 試算表開啟</p>
            </ion-label>
          </ion-item>
          <ion-item button :detail="false" :disabled="busy" @click="restore">
            <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
            <ion-label>
              <h3>還原備份</h3>
              <p>以備份檔取代目前資料</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header>外觀</ion-list-header>
          <ion-item lines="none">
            <ion-segment :value="themeMode" @ion-change="onTheme">
              <ion-segment-button value="system"><ion-label>跟隨系統</ion-label></ion-segment-button>
              <ion-segment-button value="light"><ion-label>亮色</ion-label></ion-segment-button>
              <ion-segment-button value="dark"><ion-label>深色</ion-label></ion-segment-button>
            </ion-segment>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header>資料統計</ion-list-header>
          <ion-item><ion-icon slot="start" :icon="gridOutline" aria-hidden="true" /><ion-label>收藏總數</ion-label><ion-note slot="end">{{ stats.total }}</ion-note></ion-item>
          <ion-item><ion-label>有原始網址</ion-label><ion-note slot="end">{{ stats.withUrl }}</ion-note></ion-item>
          <ion-item><ion-label>缺少網址</ion-label><ion-note slot="end">{{ stats.missingUrl }}</ion-note></ion-item>
          <ion-item><ion-label>未分類</ion-label><ion-note slot="end">{{ stats.uncategorized }}</ion-note></ion-item>
          <ion-item><ion-label>資料夾 / 標籤</ion-label><ion-note slot="end">{{ stats.folders }} / {{ stats.tags }}</ion-note></ion-item>
          <ion-item lines="none"><ion-label>有備註</ion-label><ion-note slot="end">{{ stats.withNotes }}</ion-note></ion-item>
        </ion-list>

        <ion-list v-if="vault.importJobs.length" inset>
          <ion-list-header>匯入紀錄</ion-list-header>
          <ion-item v-for="j in vault.importJobs.slice(0, 10)" :key="j.id">
            <ion-icon slot="start" :icon="cloudDownloadOutline" :color="j.status === 'failed' ? 'danger' : 'success'" aria-hidden="true" />
            <ion-label class="ion-text-wrap">
              <h3>{{ formatDateTime(j.startedAt) }} · {{ SOURCE[j.sourceType] ?? j.sourceType }}</h3>
              <p v-if="j.status === 'completed'">
                新增 {{ j.counts.added }}、更新 {{ j.counts.updated }}、略過 {{ j.counts.skipped }}、失敗 {{ j.counts.failed }}
              </p>
              <p v-else class="danger">失敗：{{ j.errorMessage }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-list-header>隱私</ion-list-header>
          <ion-item lines="none">
            <ion-icon slot="start" :icon="shieldCheckmarkOutline" color="success" aria-hidden="true" />
            <ion-label class="ion-text-wrap">
              <p>
                <template v-if="vault.storageKind === 'firestore'">
                  雲端同步已開啟：收藏存在你的 Firebase 雲端資料庫（Google 伺服器），只有你的帳號能讀寫。這台裝置也保留一份離線快取，登出時會清除。
                </template>
                <template v-else>
                  目前所有收藏只儲存在這台裝置（{{ vault.ready ? '本機資料庫' : '載入中' }}），不會上傳到任何伺服器。登入雲端同步後才會存到雲端。
                </template>
                自動分類規則只在裝置上比對關鍵字，不使用 AI。
              </p>
            </ion-label>
          </ion-item>
        </ion-list>

        <ion-list inset>
          <ion-item button :detail="false" :disabled="busy" @click="clearAll">
            <ion-icon slot="start" :icon="trashBinOutline" color="danger" aria-hidden="true" />
            <ion-label color="danger">清除所有資料</ion-label>
          </ion-item>
        </ion-list>
        <p class="version tv-muted">Threads Vault v0.1.0</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.danger {
  color: var(--ion-color-danger) !important;
}
.version {
  text-align: center;
  font-size: 12px;
  padding-bottom: 24px;
}
</style>
