<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { addOutline, copyOutline, openOutline, pricetagOutline, trashOutline, warningOutline } from 'ionicons/icons';
import SelectListModal from '@/shared/components/SelectListModal.vue';
import { formatDateTime } from '@/shared/utils/date';
import { confirm, toast, toastError } from '@/shared/utils/ui';
import { openExternal } from '@/services/platform/fileService';
import { useVaultStore } from '../vaultStore';

const props = defineProps<{ id: string }>();
const vault = useVaultStore();
const router = useRouter();
void vault.whenReady();

const bookmark = computed(() => vault.bookmarkById.get(props.id) ?? null);
const folders = computed(() => (bookmark.value ? vault.foldersFor(bookmark.value.id) : []));
const tags = computed(() => (bookmark.value ? vault.tagsFor(bookmark.value.id) : []));
const link = computed(() => bookmark.value?.canonicalUrl ?? bookmark.value?.originalUrl ?? null);

const editing = ref<'folders' | 'tags' | null>(null);
const notes = ref('');
const savingState = ref<'idle' | 'saving' | 'saved'>('idle');
let saveTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => bookmark.value?.id,
  () => (notes.value = bookmark.value?.notes ?? ''),
  { immediate: true },
);

async function saveNotes() {
  clearTimeout(saveTimer);
  const b = bookmark.value;
  if (!b || (b.notes ?? '') === notes.value) return;
  savingState.value = 'saving';
  try {
    await vault.updateBookmark(b.id, { notes: notes.value });
    savingState.value = 'saved';
  } catch (e) {
    savingState.value = 'idle';
    await toastError(e, '備註儲存失敗');
  }
}

function onNotesInput() {
  savingState.value = 'idle';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNotes, 800);
}

onBeforeUnmount(() => {
  void saveNotes();
});

async function onPickFolders(ids: string[]) {
  editing.value = null;
  if (!bookmark.value) return;
  try {
    await vault.setBookmarkFolders(bookmark.value.id, ids);
  } catch (e) {
    await toastError(e);
  }
}
async function onPickTags(ids: string[]) {
  editing.value = null;
  if (!bookmark.value) return;
  try {
    await vault.setBookmarkTags(bookmark.value.id, ids);
  } catch (e) {
    await toastError(e);
  }
}
async function onCreate(name: string) {
  const kind = editing.value;
  const b = bookmark.value;
  editing.value = null;
  if (!b) return;
  try {
    if (kind === 'folders') {
      const f = await vault.createFolder({ name });
      await vault.setBookmarkFolders(b.id, [...folders.value.map((x) => x.id), f.id]);
    } else {
      const t = await vault.ensureTag(name);
      await vault.setBookmarkTags(b.id, [...tags.value.map((x) => x.id), t.id]);
    }
  } catch (e) {
    await toastError(e);
  }
}

async function copyLink() {
  if (!link.value) return;
  try {
    await navigator.clipboard.writeText(link.value);
    await toast('已複製連結', 'success');
  } catch {
    await toast('無法存取剪貼簿', 'warning');
  }
}

async function remove() {
  const b = bookmark.value;
  if (!b) return;
  const ok = await confirm({
    header: '刪除收藏',
    message: '確定要刪除這篇收藏嗎？分類、標籤與備註也會一併移除。',
    confirmText: '刪除',
    destructive: true,
  });
  if (!ok) return;
  try {
    await vault.batchDelete([b.id]);
    await toast('已刪除', 'success');
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
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/bookmarks" text="返回" />
        </ion-buttons>
        <ion-title>收藏內容</ion-title>
        <ion-buttons slot="end">
          <ion-button v-if="bookmark" color="danger" aria-label="刪除收藏" @click="remove">
            <ion-icon slot="icon-only" :icon="trashOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="tv-container">
        <p v-if="vault.ready && !bookmark" class="tv-muted">找不到這篇收藏，可能已被刪除。</p>

        <template v-if="bookmark">
          <div class="meta">
            <strong v-if="bookmark.author">@{{ bookmark.author }}</strong>
            <span class="tv-muted">收藏於 {{ formatDateTime(bookmark.savedAt) }}</span>
          </div>
          <h2 v-if="bookmark.title" class="title">{{ bookmark.title }}</h2>

          <article class="content tv-card tv-pre">{{ bookmark.content || '（這篇收藏在匯出資料中沒有內文）' }}</article>

          <div class="link-row">
            <template v-if="link">
              <ion-button @click="openExternal(link)">
                <ion-icon slot="start" :icon="openOutline" />在 Threads 開啟
              </ion-button>
              <ion-button fill="outline" @click="copyLink">
                <ion-icon slot="start" :icon="copyOutline" />複製連結
              </ion-button>
            </template>
            <p v-else class="warn">
              <ion-icon :icon="warningOutline" aria-hidden="true" />
              原始連結不可用：Meta 匯出資料沒有提供這篇貼文的網址。
            </p>
          </div>
          <p v-if="link" class="url tv-muted">{{ link }}</p>

          <h3 class="tv-section-title">資料夾</h3>
          <div class="chips">
            <span v-for="f in folders" :key="f.id" class="chip" @click="router.push(`/folders/${f.id}`)">
              <span class="tv-dot" :style="{ background: f.color }" />{{ f.name }}
            </span>
            <button type="button" class="chip chip--add" @click="editing = 'folders'">
              <ion-icon :icon="addOutline" aria-hidden="true" />{{ folders.length ? '編輯' : '加入資料夾' }}
            </button>
          </div>

          <h3 class="tv-section-title">標籤</h3>
          <div class="chips">
            <span v-for="t in tags" :key="t.id" class="chip">
              <ion-icon :icon="pricetagOutline" aria-hidden="true" />{{ t.name }}
            </span>
            <button type="button" class="chip chip--add" @click="editing = 'tags'">
              <ion-icon :icon="addOutline" aria-hidden="true" />{{ tags.length ? '編輯' : '加上標籤' }}
            </button>
          </div>

          <h3 class="tv-section-title">
            個人備註
            <span v-if="savingState === 'saving'" class="save-state">儲存中…</span>
            <span v-else-if="savingState === 'saved'" class="save-state">已儲存</span>
          </h3>
          <ion-textarea
            v-model="notes"
            class="notes tv-card"
            :auto-grow="true"
            :rows="3"
            placeholder="寫下為什麼收藏、想法或待辦…"
            aria-label="個人備註"
            @ion-input="onNotesInput"
            @ion-blur="saveNotes"
          />

          <h3 class="tv-section-title">資料來源</h3>
          <ion-list inset class="info">
            <ion-item><ion-label>貼文代碼</ion-label><ion-note slot="end">{{ bookmark.platformPostId ?? '—' }}</ion-note></ion-item>
            <ion-item><ion-label>fbid</ion-label><ion-note slot="end">{{ bookmark.fbid ?? '—' }}</ion-note></ion-item>
            <ion-item><ion-label>匯入時間</ion-label><ion-note slot="end">{{ formatDateTime(bookmark.importedAt) }}</ion-note></ion-item>
            <ion-item lines="none"><ion-label>最後更新</ion-label><ion-note slot="end">{{ formatDateTime(bookmark.updatedAt) }}</ion-note></ion-item>
          </ion-list>
        </template>
      </div>

      <SelectListModal
        :is-open="editing === 'folders'"
        title="選擇資料夾"
        multiple
        :items="vault.folders.map((f) => ({ id: f.id, name: f.name, color: f.color }))"
        :initial-selected="folders.map((f) => f.id)"
        create-label="建立資料夾"
        @dismiss="editing = null"
        @confirm="onPickFolders"
        @create="onCreate"
      />
      <SelectListModal
        :is-open="editing === 'tags'"
        title="選擇標籤"
        multiple
        :items="vault.tags.map((t) => ({ id: t.id, name: t.name }))"
        :initial-selected="tags.map((t) => t.id)"
        create-label="建立標籤"
        @dismiss="editing = null"
        @confirm="onPickTags"
        @create="onCreate"
      />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
  font-size: 14px;
  margin-bottom: 8px;
}
.title {
  margin: 4px 0 8px;
  font-size: 20px;
}
.content {
  padding: 16px;
  font-size: 16px;
  line-height: 1.7;
}
.link-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.url {
  font-size: 12px;
  word-break: break-all;
  margin: 4px 0 0;
}
.warn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ion-color-warning-shade);
  margin: 4px 0;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 4px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--tv-surface);
  border: 1px solid var(--tv-border);
  cursor: pointer;
  color: inherit;
  font-family: inherit;
}
.chip--add {
  color: var(--ion-color-primary);
  border-style: dashed;
}
.notes {
  --padding-start: 12px;
  --padding-end: 12px;
}
.save-state {
  text-transform: none;
  font-weight: 400;
  margin-left: 8px;
}
.info {
  margin: 0;
}
</style>
