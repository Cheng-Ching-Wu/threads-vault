<script setup lang="ts">
import { onMounted } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { initShareReceiver } from '@/features/share/shareReceiver';
import { toast } from '@/shared/utils/ui';

const vault = useVaultStore();

onMounted(async () => {
  vault.onSyncError((message) => void toast(`雲端同步失敗：${message}`, 'danger'));
  await vault.init();
  await initShareReceiver();
});
</script>

<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>
