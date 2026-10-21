<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import type { BookmarkSearch } from '../useBookmarkSearch';

const props = defineProps<{ isOpen: boolean; search: BookmarkSearch; hideFolderFilter?: boolean }>();
const emit = defineEmits<{ dismiss: [] }>();
const vault = useVaultStore();
const q = props.search.query;

function toggleIn(list: 'folderIds' | 'tagIds', id: string) {
  q[list] = q[list].includes(id) ? q[list].filter((x) => x !== id) : [...q[list], id];
}
</script>

<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="search.resetFilters()">清除</ion-button>
        </ion-buttons>
        <ion-title>篩選</ion-title>
        <ion-buttons slot="end">
          <ion-button strong @click="emit('dismiss')">完成</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-toggle v-model="q.onlyUncategorized">只看未分類</ion-toggle>
        </ion-item>
        <ion-item>
          <ion-toggle v-model="q.onlyMissingUrl">只看缺少網址</ion-toggle>
        </ion-item>
      </ion-list>

      <ion-list v-if="!hideFolderFilter">
        <ion-list-header>資料夾（符合任一）</ion-list-header>
        <ion-item v-for="f in vault.folders" :key="f.id" button :detail="false" @click="toggleIn('folderIds', f.id)">
          <ion-checkbox slot="start" :checked="q.folderIds.includes(f.id)" aria-hidden="true" />
          <span slot="start" class="tv-dot" :style="{ background: f.color }" />
          <ion-label>{{ f.name }}</ion-label>
          <ion-note slot="end">{{ vault.folderCounts.get(f.id) ?? 0 }}</ion-note>
        </ion-item>
        <ion-item v-if="!vault.folders.length" lines="none"><ion-label class="tv-muted">尚未建立資料夾</ion-label></ion-item>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>標籤</ion-label>
        </ion-list-header>
        <ion-item lines="none">
          <ion-segment v-model="q.tagMode">
            <ion-segment-button value="any"><ion-label>符合任一</ion-label></ion-segment-button>
            <ion-segment-button value="all"><ion-label>全部符合</ion-label></ion-segment-button>
          </ion-segment>
        </ion-item>
        <ion-item v-for="t in vault.tags" :key="t.id" button :detail="false" @click="toggleIn('tagIds', t.id)">
          <ion-checkbox slot="start" :checked="q.tagIds.includes(t.id)" aria-hidden="true" />
          <ion-label># {{ t.name }}</ion-label>
          <ion-note slot="end">{{ vault.tagCounts.get(t.id) ?? 0 }}</ion-note>
        </ion-item>
        <ion-item v-if="!vault.tags.length" lines="none"><ion-label class="tv-muted">尚未建立標籤</ion-label></ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>
