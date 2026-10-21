<script setup lang="ts">
import { IonIcon, IonLabel, IonPage, IonRouterOutlet, IonTabBar, IonTabButton, IonTabs } from '@ionic/vue';
import { bookmarksOutline, folderOpenOutline, settingsOutline } from 'ionicons/icons';
</script>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet />
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="bookmarks" href="/tabs/bookmarks">
          <ion-icon :icon="bookmarksOutline" aria-hidden="true" />
          <ion-label>收藏</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="folders" href="/tabs/folders">
          <ion-icon :icon="folderOpenOutline" aria-hidden="true" />
          <ion-label>分類</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings" href="/tabs/settings">
          <ion-icon :icon="settingsOutline" aria-hidden="true" />
          <ion-label>設定</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>
