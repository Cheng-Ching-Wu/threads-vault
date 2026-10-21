<script setup lang="ts">
import { computed, ref } from 'vue';
import { IonButton, IonButtons, IonIcon, IonTitle, IonToolbar, actionSheetController } from '@ionic/vue';
import { folderOutline, pricetagOutline, removeCircleOutline, trashOutline } from 'ionicons/icons';
import SelectListModal, { type SelectItem } from '@/shared/components/SelectListModal.vue';
import { useVaultStore } from '../vaultStore';
import type { Selection } from '../useSelection';
import { confirm, toast, toastError } from '@/shared/utils/ui';

const props = defineProps<{ selection: Selection; contextFolderId?: string }>();
const vault = useVaultStore();

type Mode = 'add-folder' | 'remove-folder' | 'add-tag' | 'remove-tag' | null;
const mode = ref<Mode>(null);
const busy = ref(false);

const count = computed(() => props.selection.count.value);

const modalItems = computed<SelectItem[]>(() => {
  const ids = props.selection.selectedIds.value;
  if (mode.value === 'add-folder') {
    return vault.folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: vault.folderCounts.get(f.id) ?? 0 }));
  }
  if (mode.value === 'remove-folder') {
    // 只列出選取的收藏中實際有用到的資料夾
    const used = new Set<string>();
    for (const id of ids) vault.foldersOf.get(id)?.forEach((f) => used.add(f));
    return vault.folders.filter((f) => used.has(f.id)).map((f) => ({ id: f.id, name: f.name, color: f.color }));
  }
  if (mode.value === 'add-tag') {
    return vault.tags.map((t) => ({ id: t.id, name: t.name, count: vault.tagCounts.get(t.id) ?? 0 }));
  }
  if (mode.value === 'remove-tag') {
    const used = new Set<string>();
    for (const id of ids) vault.tagsOf.get(id)?.forEach((t) => used.add(t));
    return vault.tags.filter((t) => used.has(t.id)).map((t) => ({ id: t.id, name: t.name }));
  }
  return [];
});

const modalTitle = computed(
  () =>
    ({
      'add-folder': '加入資料夾',
      'remove-folder': '移出資料夾',
      'add-tag': '加上標籤',
      'remove-tag': '移除標籤',
    })[mode.value ?? 'add-folder'],
);

function requireSelection(): boolean {
  if (count.value === 0) {
    void toast('請先勾選至少一篇收藏', 'warning');
    return false;
  }
  return true;
}

async function withBusy(fn: () => Promise<void>) {
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    await toastError(e);
  } finally {
    busy.value = false;
  }
}

async function onPick(ids: string[]) {
  const target = ids[0];
  const m = mode.value;
  mode.value = null;
  if (!target || !m) return;
  const selected = props.selection.ids.value;
  await withBusy(async () => {
    if (m === 'add-folder') {
      await vault.batchAddToFolder(selected, target);
      await toast(`已將 ${selected.length} 篇加入「${vault.folderById.get(target)?.name}」`, 'success');
    } else if (m === 'remove-folder') {
      await vault.batchRemoveFromFolder(selected, target);
      await toast(`已將 ${selected.length} 篇移出「${vault.folderById.get(target)?.name}」`, 'success');
    } else if (m === 'add-tag') {
      await vault.batchAddTag(selected, target);
      await toast(`已為 ${selected.length} 篇加上「${vault.tagById.get(target)?.name}」`, 'success');
    } else {
      await vault.batchRemoveTag(selected, target);
      await toast(`已從 ${selected.length} 篇移除「${vault.tagById.get(target)?.name}」`, 'success');
    }
  });
}

async function onCreate(name: string) {
  const m = mode.value;
  mode.value = null;
  const selected = props.selection.ids.value;
  await withBusy(async () => {
    if (m === 'add-folder') {
      const f = await vault.createFolder({ name });
      await vault.batchAddToFolder(selected, f.id);
      await toast(`已建立「${f.name}」並加入 ${selected.length} 篇`, 'success');
    } else if (m === 'add-tag') {
      const t = await vault.ensureTag(name);
      await vault.batchAddTag(selected, t.id);
      await toast(`已為 ${selected.length} 篇加上「${t.name}」`, 'success');
    }
  });
}

async function removeFromFolder() {
  if (!requireSelection()) return;
  // 在資料夾內頁時，直接從目前資料夾移出
  if (props.contextFolderId) {
    const folder = vault.folderById.get(props.contextFolderId);
    const ok = await confirm({
      header: '移出資料夾',
      message: `將 ${count.value} 篇收藏移出「${folder?.name ?? ''}」？收藏本身不會被刪除。`,
      confirmText: '移出',
    });
    if (ok) await onPickDirect('remove-folder', props.contextFolderId);
    return;
  }
  mode.value = 'remove-folder';
}

async function onPickDirect(m: Exclude<Mode, null>, id: string) {
  mode.value = m;
  await onPick([id]);
}

async function openTagMenu() {
  if (!requireSelection()) return;
  const sheet = await actionSheetController.create({
    header: `${count.value} 篇收藏的標籤`,
    buttons: [
      { text: '加上標籤', data: 'add' },
      { text: '移除標籤', data: 'remove' },
      { text: '取消', role: 'cancel' },
    ],
  });
  await sheet.present();
  const { data } = await sheet.onDidDismiss<'add' | 'remove'>();
  if (data === 'add') mode.value = 'add-tag';
  else if (data === 'remove') mode.value = 'remove-tag';
}

async function deleteSelected() {
  if (!requireSelection()) return;
  const ok = await confirm({
    header: '刪除收藏',
    message: `確定要刪除 ${count.value} 篇收藏嗎？這會一併移除它們的分類、標籤與備註，且無法復原。`,
    confirmText: '刪除',
    destructive: true,
  });
  if (!ok) return;
  const n = count.value;
  await withBusy(async () => {
    await vault.batchDelete(props.selection.ids.value);
    props.selection.clear();
    await toast(`已刪除 ${n} 篇收藏`, 'success');
  });
}
</script>

<template>
  <ion-toolbar class="batch">
    <ion-title size="small">已選取 {{ count }} 篇</ion-title>
    <ion-buttons slot="end">
      <ion-button :disabled="busy" aria-label="加入資料夾" @click="requireSelection() && (mode = 'add-folder')">
        <ion-icon slot="icon-only" :icon="folderOutline" />
      </ion-button>
      <ion-button :disabled="busy" aria-label="移出資料夾" @click="removeFromFolder">
        <ion-icon slot="icon-only" :icon="removeCircleOutline" />
      </ion-button>
      <ion-button :disabled="busy" aria-label="標籤" @click="openTagMenu">
        <ion-icon slot="icon-only" :icon="pricetagOutline" />
      </ion-button>
      <ion-button :disabled="busy" color="danger" aria-label="刪除" @click="deleteSelected">
        <ion-icon slot="icon-only" :icon="trashOutline" />
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
  <SelectListModal
    :is-open="mode !== null"
    :title="modalTitle"
    :items="modalItems"
    :create-label="mode === 'add-folder' ? '建立資料夾' : mode === 'add-tag' ? '建立標籤' : undefined"
    @dismiss="mode = null"
    @confirm="onPick"
    @create="onCreate"
  />
</template>
