<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  type RefresherCustomEvent,
} from '@ionic/vue';
import { checkmarkCircleOutline, cloudUploadOutline, gridOutline, listOutline } from 'ionicons/icons';
import BookmarkList from '@/shared/components/BookmarkList.vue';
import SearchPanel from '@/features/search/components/SearchPanel.vue';
import { useBookmarkSearch } from '@/features/search/useBookmarkSearch';
import { useVaultStore } from '../vaultStore';
import { useSelection } from '../useSelection';
import { viewMode } from '../viewPrefs';
import BatchActionBar from '../components/BatchActionBar.vue';

const vault = useVaultStore();
const route = useRoute();
const router = useRouter();
const search = useBookmarkSearch();
const selection = useSelection();

// 從標籤 / 統計卡片跳過來時帶入篩選條件（?tag=ID、?filter=uncategorized）
watch(
  () => route.query,
  (q) => {
    if (typeof q.tag === 'string') {
      search.resetFilters();
      search.query.tagIds = [q.tag];
    } else if (q.filter === 'uncategorized') {
      search.resetFilters();
      search.query.onlyUncategorized = true;
    } else if (q.filter === 'missing') {
      search.resetFilters();
      search.query.onlyMissingUrl = true;
    } else {
      return;
    }
    void router.replace({ path: '/tabs/bookmarks' });
  },
  { immediate: true },
);

const results = search.results;
const isFiltered = computed(() => !!search.query.text.trim() || search.activeFilterCount.value > 0);
const recentCount = computed(() => {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  return vault.bookmarks.filter((b) => (b.savedAt ?? b.importedAt) >= weekAgo).length;
});

async function refresh(ev: RefresherCustomEvent) {
  await vault.reloadAll();
  await ev.target.complete();
}

function showUncategorized() {
  search.resetFilters();
  search.query.onlyUncategorized = true;
}
function showMissing() {
  search.resetFilters();
  search.query.onlyMissingUrl = true;
}
function showRecent() {
  search.resetFilters();
  search.query.sort = 'saved_desc';
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Threads Vault</ion-title>
        <ion-buttons slot="end">
          <ion-button
            :aria-label="viewMode === 'card' ? '切換為清單檢視' : '切換為卡片檢視'"
            @click="viewMode = viewMode === 'card' ? 'list' : 'card'"
          >
            <ion-icon slot="icon-only" :icon="viewMode === 'card' ? listOutline : gridOutline" />
          </ion-button>
          <ion-button v-if="!selection.selecting.value" :disabled="!vault.bookmarks.length" @click="selection.start()">
            <ion-icon slot="start" :icon="checkmarkCircleOutline" />選取
          </ion-button>
          <ion-button v-else strong @click="selection.stop()">完成</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <div class="tv-container">
        <div v-if="!vault.ready" class="center">
          <ion-spinner v-if="vault.loading" />
          <p v-if="vault.error" class="error">資料庫載入失敗：{{ vault.error }}</p>
        </div>

        <template v-else-if="vault.bookmarks.length === 0">
          <div class="empty">
            <ion-icon :icon="cloudUploadOutline" class="empty__icon" aria-hidden="true" />
            <h2>還沒有任何收藏</h2>
            <p class="tv-muted">從 Meta 帳號中心匯出 Threads 資料後，匯入 <code>saved_threads.json</code> 即可開始整理。</p>
            <ion-button router-link="/import">匯入 Meta 收藏</ion-button>
          </div>
        </template>

        <template v-else>
          <section class="stats" aria-label="收藏統計">
            <button type="button" class="stat tv-card" @click="search.resetFilters()">
              <strong>{{ vault.bookmarks.length }}</strong><span>全部收藏</span>
            </button>
            <button type="button" class="stat tv-card" @click="router.push('/tabs/folders')">
              <strong>{{ vault.folders.length }}</strong><span>資料夾</span>
            </button>
            <button type="button" class="stat tv-card" @click="showUncategorized">
              <strong>{{ vault.uncategorizedCount }}</strong><span>未分類</span>
            </button>
            <button type="button" class="stat tv-card" @click="showRecent">
              <strong>{{ recentCount }}</strong><span>近 7 天</span>
            </button>
            <button v-if="vault.missingUrlCount" type="button" class="stat tv-card" @click="showMissing">
              <strong>{{ vault.missingUrlCount }}</strong><span>缺少網址</span>
            </button>
          </section>

          <SearchPanel :search="search" />

          <div class="result-head">
            <span class="tv-muted">
              {{ isFiltered ? `找到 ${results.length} 篇` : `最近收藏 · 共 ${results.length} 篇` }}
            </span>
            <span v-if="selection.selecting.value" class="result-head__actions">
              <ion-button size="small" fill="clear" @click="selection.setAll(results.map((b) => b.id))">全選結果</ion-button>
              <ion-button size="small" fill="clear" @click="selection.clear()">取消全選</ion-button>
            </span>
          </div>

          <BookmarkList
            :items="results"
            :view="viewMode"
            :selecting="selection.selecting.value"
            :selected-ids="selection.selectedIds.value"
            @toggle="selection.toggle"
          />
          <p v-if="results.length === 0" class="center tv-muted">沒有符合條件的收藏</p>
        </template>
      </div>
    </ion-content>

    <ion-footer v-if="selection.selecting.value">
      <BatchActionBar :selection="selection" />
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.center {
  display: grid;
  place-items: center;
  padding: 48px 16px;
  text-align: center;
}
.error {
  color: var(--ion-color-danger);
}
.empty {
  text-align: center;
  padding: 64px 24px;
}
.empty__icon {
  font-size: 56px;
  color: var(--ion-color-primary);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  padding: 12px 12px 0;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 12px;
  cursor: pointer;
  color: inherit;
  font: inherit;
  text-align: left;
}
.stat strong {
  font-size: 22px;
  line-height: 1.2;
}
.stat span {
  font-size: 12px;
  color: var(--tv-text-muted);
}
.stat:hover {
  border-color: var(--ion-color-primary);
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 16px 8px;
  font-size: 13px;
  min-height: 36px;
}
</style>
