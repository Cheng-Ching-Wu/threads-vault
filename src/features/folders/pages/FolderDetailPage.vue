<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { checkmarkCircleOutline, createOutline, gridOutline, listOutline, trashOutline } from 'ionicons/icons';
import BookmarkList from '@/shared/components/BookmarkList.vue';
import SearchPanel from '@/features/search/components/SearchPanel.vue';
import { useBookmarkSearch } from '@/features/search/useBookmarkSearch';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { useSelection } from '@/features/bookmarks/useSelection';
import { viewMode } from '@/features/bookmarks/viewPrefs';
import BatchActionBar from '@/features/bookmarks/components/BatchActionBar.vue';
import { confirm, toast, toastError } from '@/shared/utils/ui';
import FolderEditModal from '../components/FolderEditModal.vue';
import { folderIcon } from '../folderIcons';

const props = defineProps<{ id: string }>();
const vault = useVaultStore();
const router = useRouter();
void vault.whenReady();

const folder = computed(() => vault.folderById.get(props.id) ?? null);
const search = useBookmarkSearch({ fixedFolderId: () => props.id });
const selection = useSelection();
const editorOpen = ref(false);

async function save(value: { name: string; icon: string; color: string }) {
  try {
    await vault.updateFolder(props.id, value);
    editorOpen.value = false;
  } catch (e) {
    await toastError(e);
  }
}

async function remove() {
  if (!folder.value) return;
  const ok = await confirm({
    header: `刪除「${folder.value.name}」？`,
    message: '資料夾內的收藏不會被刪除，只會移出這個資料夾。',
    confirmText: '刪除資料夾',
    destructive: true,
  });
  if (!ok) return;
  try {
    await vault.deleteFolder(props.id);
    await toast('資料夾已刪除', 'success');
    router.back();
  } catch (e) {
    await toastError(e);
  }
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/tabs/folders" text="分類" /></ion-buttons>
        <ion-title>{{ folder?.name ?? '資料夾' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :aria-label="viewMode === 'card' ? '切換為清單檢視' : '切換為卡片檢視'" @click="viewMode = viewMode === 'card' ? 'list' : 'card'">
            <ion-icon slot="icon-only" :icon="viewMode === 'card' ? listOutline : gridOutline" />
          </ion-button>
          <ion-button v-if="!selection.selecting.value" @click="selection.start()">
            <ion-icon slot="start" :icon="checkmarkCircleOutline" />選取
          </ion-button>
          <ion-button v-else strong @click="selection.stop()">完成</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="tv-container">
        <p v-if="vault.ready && !folder" class="ion-padding tv-muted">找不到這個資料夾，可能已被刪除。</p>
        <template v-if="folder">
          <div class="head">
            <span class="ficon" :style="{ background: folder.color }"><ion-icon :icon="folderIcon(folder.icon)" aria-hidden="true" /></span>
            <div class="head__text">
              <h2>{{ folder.name }}</h2>
              <span class="tv-muted">{{ vault.folderCounts.get(folder.id) ?? 0 }} 篇收藏</span>
            </div>
            <ion-button fill="clear" aria-label="編輯資料夾" @click="editorOpen = true"><ion-icon slot="icon-only" :icon="createOutline" /></ion-button>
            <ion-button fill="clear" color="danger" aria-label="刪除資料夾" @click="remove"><ion-icon slot="icon-only" :icon="trashOutline" /></ion-button>
          </div>

          <SearchPanel :search="search" hide-folder-filter />
          <div class="result-head tv-muted">
            <span>{{ search.results.value.length }} 篇</span>
            <span v-if="selection.selecting.value">
              <ion-button size="small" fill="clear" @click="selection.setAll(search.results.value.map((b) => b.id))">全選</ion-button>
              <ion-button size="small" fill="clear" @click="selection.clear()">取消全選</ion-button>
            </span>
          </div>
          <BookmarkList
            :items="search.results.value"
            :view="viewMode"
            :selecting="selection.selecting.value"
            :selected-ids="selection.selectedIds.value"
            @toggle="selection.toggle"
          />
          <p v-if="!search.results.value.length" class="ion-padding tv-muted">
            這個資料夾還沒有收藏。到「收藏」頁點選「選取」，勾選文章後即可批次加入。
          </p>
        </template>
      </div>
      <FolderEditModal :is-open="editorOpen" :folder="folder" @dismiss="editorOpen = false" @save="save" />
    </ion-content>

    <ion-footer v-if="selection.selecting.value">
      <BatchActionBar :selection="selection" :context-folder-id="id" />
    </ion-footer>
  </ion-page>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 12px 4px 16px;
}
.head h2 {
  margin: 0;
  font-size: 20px;
}
.head__text {
  flex: 1;
  min-width: 0;
}
.ficon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 22px;
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
