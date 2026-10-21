<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { add, createOutline, pricetagOutline, trashOutline } from 'ionicons/icons';
import type { Folder, Tag } from '@/shared/types/models';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { confirm, prompt, toast, toastError } from '@/shared/utils/ui';
import FolderEditModal from '../components/FolderEditModal.vue';
import { folderIcon } from '../folderIcons';

const vault = useVaultStore();
const router = useRouter();
const segment = ref<'folders' | 'tags'>('folders');
const editorOpen = ref(false);
const editingFolder = ref<Folder | null>(null);

function newFolder() {
  editingFolder.value = null;
  editorOpen.value = true;
}
function editFolder(f: Folder) {
  editingFolder.value = f;
  editorOpen.value = true;
}

async function saveFolder(value: { name: string; icon: string; color: string }) {
  try {
    if (editingFolder.value) {
      await vault.updateFolder(editingFolder.value.id, value);
      await toast('資料夾已更新', 'success');
    } else {
      await vault.createFolder(value);
      await toast(`已建立「${value.name.trim()}」`, 'success');
    }
    editorOpen.value = false;
  } catch (e) {
    await toastError(e);
  }
}

async function removeFolder(f: Folder) {
  const n = vault.folderCounts.get(f.id) ?? 0;
  const ok = await confirm({
    header: `刪除「${f.name}」？`,
    message: n ? `資料夾內的 ${n} 篇收藏不會被刪除，只會移出這個資料夾。` : '這個資料夾是空的。',
    confirmText: '刪除資料夾',
    destructive: true,
  });
  if (!ok) return;
  try {
    await vault.deleteFolder(f.id);
    await toast('資料夾已刪除', 'success');
  } catch (e) {
    await toastError(e);
  }
}

async function newTag() {
  const name = await prompt({ header: '新增標籤', placeholder: '標籤名稱', confirmText: '建立' });
  if (name === null) return;
  try {
    const t = await vault.ensureTag(name);
    await toast(`已建立「${t.name}」`, 'success');
  } catch (e) {
    await toastError(e);
  }
}

async function renameTag(t: Tag) {
  const name = await prompt({ header: '重新命名標籤', value: t.name, confirmText: '儲存' });
  if (name === null) return;
  try {
    await vault.renameTag(t.id, name);
  } catch (e) {
    await toastError(e);
  }
}

async function removeTag(t: Tag) {
  const ok = await confirm({
    header: `刪除標籤「${t.name}」？`,
    message: '收藏本身不會被刪除，只會移除這個標籤。',
    confirmText: '刪除',
    destructive: true,
  });
  if (!ok) return;
  try {
    await vault.deleteTag(t.id);
  } catch (e) {
    await toastError(e);
  }
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>分類管理</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="segment === 'folders' ? newFolder() : newTag()">
            <ion-icon slot="start" :icon="add" />新增
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="segment">
          <ion-segment-button value="folders"><ion-label>資料夾（{{ vault.folders.length }}）</ion-label></ion-segment-button>
          <ion-segment-button value="tags"><ion-label>標籤（{{ vault.tags.length }}）</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="tv-container">
        <template v-if="segment === 'folders'">
          <ion-list inset>
            <ion-item button :detail="true" @click="router.push({ path: '/tabs/bookmarks', query: { filter: 'uncategorized' } })">
              <ion-label>未分類</ion-label>
              <ion-note slot="end">{{ vault.uncategorizedCount }}</ion-note>
            </ion-item>
          </ion-list>
          <ion-list v-if="vault.folders.length" inset>
            <ion-item-sliding v-for="f in vault.folders" :key="f.id">
              <ion-item button :detail="true" @click="router.push(`/folders/${f.id}`)">
                <span slot="start" class="ficon" :style="{ background: f.color }">
                  <ion-icon :icon="folderIcon(f.icon)" aria-hidden="true" />
                </span>
                <ion-label>{{ f.name }}</ion-label>
                <ion-note slot="end">{{ vault.folderCounts.get(f.id) ?? 0 }}</ion-note>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option @click="editFolder(f)"><ion-icon slot="icon-only" :icon="createOutline" /></ion-item-option>
                <ion-item-option color="danger" @click="removeFolder(f)"><ion-icon slot="icon-only" :icon="trashOutline" /></ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
          <div v-else class="empty tv-muted">
            <p>還沒有資料夾。建立資料夾後，可以在收藏頁「選取」多篇文章批次加入。</p>
            <ion-button @click="newFolder">建立第一個資料夾</ion-button>
          </div>
          <p v-if="vault.folders.length" class="hint tv-muted">提示：向左滑動可編輯或刪除資料夾；刪除資料夾不會刪除收藏。</p>
        </template>

        <template v-else>
          <ion-list v-if="vault.tags.length" inset>
            <ion-item-sliding v-for="t in vault.tags" :key="t.id">
              <ion-item button :detail="true" @click="router.push({ path: '/tabs/bookmarks', query: { tag: t.id } })">
                <ion-icon slot="start" :icon="pricetagOutline" aria-hidden="true" />
                <ion-label>{{ t.name }}</ion-label>
                <ion-note slot="end">{{ vault.tagCounts.get(t.id) ?? 0 }}</ion-note>
              </ion-item>
              <ion-item-options side="end">
                <ion-item-option @click="renameTag(t)"><ion-icon slot="icon-only" :icon="createOutline" /></ion-item-option>
                <ion-item-option color="danger" @click="removeTag(t)"><ion-icon slot="icon-only" :icon="trashOutline" /></ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
          <div v-else class="empty tv-muted">
            <p>還沒有標籤。</p>
            <ion-button @click="newTag">建立標籤</ion-button>
          </div>
          <p v-if="vault.tags.length" class="hint tv-muted">提示：向左滑動可重新命名或刪除標籤。</p>
        </template>
      </div>

      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button :aria-label="segment === 'folders' ? '新增資料夾' : '新增標籤'" @click="segment === 'folders' ? newFolder() : newTag()">
          <ion-icon :icon="add" />
        </ion-fab-button>
      </ion-fab>

      <FolderEditModal :is-open="editorOpen" :folder="editingFolder" @dismiss="editorOpen = false" @save="saveFolder" />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.ficon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 17px;
  margin-right: 12px;
}
.empty {
  text-align: center;
  padding: 40px 24px;
}
.hint {
  font-size: 12px;
  padding: 0 20px 80px;
}
</style>
