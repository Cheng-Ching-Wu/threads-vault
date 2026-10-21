<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote, loadingController } from '@ionic/vue';
import {
  alertCircleOutline,
  cloudDoneOutline,
  cloudOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  logOutOutline,
  personCircleOutline,
} from 'ionicons/icons';
import { getLocalRepository } from '@/database';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { authReady, cloudErrorMessage, cloudUser, signOut } from '@/services/cloud/authService';
import { copyVault } from '@/services/cloud/migrate';
import { confirm, toast } from '@/shared/utils/ui';
import AuthModal from './AuthModal.vue';

const vault = useVaultStore();
const authOpen = ref(false);
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const localCount = ref<number | null>(null);
const busy = ref(false);

const updateOnline = () => (online.value = navigator.onLine);
onMounted(() => {
  void authReady();
  window.addEventListener('online', updateOnline);
  window.addEventListener('offline', updateOnline);
});
onUnmounted(() => {
  window.removeEventListener('online', updateOnline);
  window.removeEventListener('offline', updateOnline);
});

const inCloud = computed(() => vault.storageKind === 'firestore');
/** 已登入但雲端資料庫沒有連上（例如安全規則尚未發布） */
const cloudFailed = computed(() => !!cloudUser.value && !inCloud.value && !!vault.error && !vault.loading);

async function retry() {
  busy.value = true;
  try {
    await vault.switchRepository();
    await toast('已連上雲端資料庫', 'success');
  } catch {
    /* 錯誤訊息已顯示在畫面上 */
  } finally {
    busy.value = false;
  }
}

/** 雲端模式下顯示本機還有幾篇可以上傳 */
watch(
  inCloud,
  async (cloud) => {
    if (!cloud) return;
    try {
      localCount.value = await (await getLocalRepository()).countBookmarks();
    } catch {
      localCount.value = null;
    }
  },
  { immediate: true },
);

async function upload() {
  if (busy.value || !localCount.value) return;
  const ok = await confirm({
    header: `上傳本機的 ${localCount.value} 篇收藏？`,
    message:
      vault.bookmarks.length === 0
        ? '雲端目前是空的，會完整複製本機的收藏、資料夾、標籤、備註與自動分類規則。本機資料不會被刪除。'
        : `雲端已經有 ${vault.bookmarks.length} 篇，會合併：同一篇不會重複，雲端上的備註與分類都會保留。本機資料不會被刪除。`,
    confirmText: '上傳',
  });
  if (!ok) return;
  busy.value = true;
  const loading = await loadingController.create({ message: '正在上傳到雲端…' });
  await loading.present();
  try {
    const result = await copyVault(await getLocalRepository(), await vault.getRepo());
    await vault.reloadAll();
    await toast(
      result.mode === 'replace' ? `已上傳 ${result.bookmarks} 篇收藏` : `已合併，新增 ${result.added} 篇收藏`,
      'success',
    );
  } catch (e) {
    await toast(`上傳失敗：${cloudErrorMessage(e)}`, 'danger');
  } finally {
    await loading.dismiss();
    busy.value = false;
  }
}

async function logout() {
  const ok = await confirm({
    header: '登出雲端同步？',
    message: '登出後會回到這台裝置的本機資料，並清除這台裝置上的雲端快取。雲端上的資料不會被刪除，之後重新登入即可。',
    confirmText: '登出',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await signOut();
    await toast('已登出，現在使用本機資料', 'medium');
  } catch (e) {
    await toast(`登出失敗：${cloudErrorMessage(e)}`, 'danger');
  } finally {
    busy.value = false;
  }
}

async function onSignedIn() {
  authOpen.value = false;
  await toast('登入成功，正在載入雲端資料', 'success');
}
</script>

<template>
  <ion-list inset>
    <ion-list-header>雲端同步</ion-list-header>

    <template v-if="!cloudUser">
      <ion-item lines="none">
        <ion-icon slot="start" :icon="cloudOfflineOutline" aria-hidden="true" />
        <ion-label class="ion-text-wrap">
          <h3>目前使用本機資料</h3>
          <p>登入後可在手機和電腦之間同步收藏。本機資料會保留，登入後可以一鍵上傳。</p>
        </ion-label>
      </ion-item>
      <ion-item lines="none">
        <ion-button expand="block" class="full" @click="authOpen = true">登入 / 註冊</ion-button>
      </ion-item>
    </template>

    <template v-else>
      <ion-item>
        <ion-icon slot="start" :icon="personCircleOutline" aria-hidden="true" />
        <ion-label class="ion-text-wrap">
          <h3>{{ cloudUser.displayName || cloudUser.email || '已登入' }}</h3>
          <p v-if="cloudUser.displayName && cloudUser.email">{{ cloudUser.email }}</p>
        </ion-label>
      </ion-item>
      <ion-item v-if="cloudFailed" class="failed">
        <ion-icon slot="start" :icon="alertCircleOutline" color="danger" aria-hidden="true" />
        <ion-label class="ion-text-wrap">
          <h3>無法連上雲端資料庫</h3>
          <p>{{ vault.error }}</p>
        </ion-label>
        <ion-button slot="end" fill="outline" size="small" :disabled="busy" @click="retry">重試</ion-button>
      </ion-item>
      <ion-item v-else-if="!inCloud">
        <ion-icon slot="start" :icon="cloudOutline" aria-hidden="true" />
        <ion-label>正在連線雲端資料庫…</ion-label>
      </ion-item>
      <ion-item v-else>
        <ion-icon slot="start" :icon="online ? cloudDoneOutline : cloudOfflineOutline" :color="online ? 'success' : 'warning'" aria-hidden="true" />
        <ion-label class="ion-text-wrap">
          <h3>{{ online ? '已連線，自動同步中' : '離線中' }}</h3>
          <p v-if="!online">可以照常使用，恢復連線後會自動上傳。</p>
        </ion-label>
      </ion-item>
      <ion-item v-if="inCloud && localCount" button :detail="false" :disabled="busy" @click="upload">
        <ion-icon slot="start" :icon="cloudUploadOutline" aria-hidden="true" />
        <ion-label class="ion-text-wrap">
          <h3>上傳本機資料到雲端</h3>
          <p>這台裝置的本機資料有 {{ localCount }} 篇收藏</p>
        </ion-label>
      </ion-item>
      <ion-item button :detail="false" :disabled="busy" lines="none" @click="logout">
        <ion-icon slot="start" :icon="logOutOutline" aria-hidden="true" />
        <ion-label>登出</ion-label>
        <ion-note slot="end">回到本機資料</ion-note>
      </ion-item>
    </template>
  </ion-list>

  <AuthModal :is-open="authOpen" @dismiss="authOpen = false" @signed-in="onSignedIn" />
</template>

<style scoped>
.failed h3 {
  color: var(--ion-color-danger);
}
.full {
  width: 100%;
  margin: 0 0 8px;
}
</style>
