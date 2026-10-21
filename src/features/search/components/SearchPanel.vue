<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonIcon, IonSearchbar, IonSelect, IonSelectOption } from '@ionic/vue';
import { closeCircle, optionsOutline } from 'ionicons/icons';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import type { BookmarkSearch } from '../useBookmarkSearch';
import FilterModal from './FilterModal.vue';

const props = defineProps<{ search: BookmarkSearch; hideFolderFilter?: boolean }>();
const vault = useVaultStore();
const filterOpen = ref(false);
const q = props.search.query;

const chips = computed(() => {
  const out: { key: string; label: string; remove: () => void }[] = [];
  if (!props.hideFolderFilter) {
    for (const id of q.folderIds) {
      const f = vault.folderById.get(id);
      if (f) out.push({ key: `f${id}`, label: `📁 ${f.name}`, remove: () => (q.folderIds = q.folderIds.filter((x) => x !== id)) });
    }
  }
  for (const id of q.tagIds) {
    const t = vault.tagById.get(id);
    if (t) out.push({ key: `t${id}`, label: `# ${t.name}`, remove: () => (q.tagIds = q.tagIds.filter((x) => x !== id)) });
  }
  if (q.onlyUncategorized) out.push({ key: 'u', label: '未分類', remove: () => (q.onlyUncategorized = false) });
  if (q.onlyMissingUrl) out.push({ key: 'm', label: '缺少網址', remove: () => (q.onlyMissingUrl = false) });
  return out;
});
</script>

<template>
  <div class="panel">
    <ion-searchbar v-model="q.text" :debounce="0" placeholder="搜尋內文、標題、作者、備註" :animated="false" class="panel__search" />
    <div class="panel__row">
      <ion-select v-model="q.field" interface="popover" label="範圍" label-placement="start" justify="start" class="panel__select">
        <ion-select-option value="all">全部</ion-select-option>
        <ion-select-option value="content">內文</ion-select-option>
        <ion-select-option value="title">標題</ion-select-option>
        <ion-select-option value="author">作者</ion-select-option>
        <ion-select-option value="notes">備註</ion-select-option>
      </ion-select>
      <ion-select v-model="q.sort" interface="popover" label="排序" label-placement="start" justify="start" class="panel__select">
        <ion-select-option value="saved_desc">收藏日期：新到舊</ion-select-option>
        <ion-select-option value="saved_asc">收藏日期：舊到新</ion-select-option>
        <ion-select-option value="imported_desc">最近匯入</ion-select-option>
      </ion-select>
      <ion-button fill="clear" size="small" @click="filterOpen = true">
        <ion-icon slot="start" :icon="optionsOutline" aria-hidden="true" />
        篩選<span v-if="search.activeFilterCount.value">（{{ search.activeFilterCount.value }}）</span>
      </ion-button>
    </div>
    <div v-if="chips.length" class="panel__chips">
      <button v-for="c in chips" :key="c.key" type="button" class="fchip" @click="c.remove()">
        {{ c.label }} <ion-icon :icon="closeCircle" aria-label="移除篩選" />
      </button>
      <button type="button" class="fchip fchip--clear" @click="search.resetFilters()">清除全部</button>
    </div>
    <FilterModal :is-open="filterOpen" :search="search" :hide-folder-filter="hideFolderFilter" @dismiss="filterOpen = false" />
  </div>
</template>

<style scoped>
.panel {
  padding: 4px 4px 0;
}
.panel__search {
  --border-radius: 10px;
}
.panel__row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  flex-wrap: wrap;
}
.panel__select {
  font-size: 13px;
  width: auto;
  max-width: 240px;
  --gap: 6px;
  min-height: 36px;
}
.panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 16px 4px;
}
.fchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(var(--ion-color-primary-rgb), 0.4);
  background: rgba(var(--ion-color-primary-rgb), 0.1);
  color: var(--ion-color-primary);
  cursor: pointer;
}
.fchip--clear {
  background: transparent;
  border-color: var(--tv-border);
  color: var(--tv-text-muted);
}
</style>
