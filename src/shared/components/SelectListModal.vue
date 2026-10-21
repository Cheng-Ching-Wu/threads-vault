<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSearchbar,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { addCircleOutline } from 'ionicons/icons';
import { normalizeForSearch } from '@/shared/utils/text';

export interface SelectItem {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  count?: number;
}

/**
 * 通用選擇視窗：選資料夾 / 標籤。
 * multiple=false 時點一下就確定；multiple=true 時勾選後按「完成」。
 */
const props = defineProps<{
  isOpen: boolean;
  title: string;
  items: SelectItem[];
  multiple?: boolean;
  initialSelected?: string[];
  createLabel?: string;
}>();

const emit = defineEmits<{
  dismiss: [];
  confirm: [ids: string[]];
  create: [name: string];
}>();

const filter = ref('');
const selected = ref(new Set<string>());

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      filter.value = '';
      selected.value = new Set(props.initialSelected ?? []);
    }
  },
);

const filtered = computed(() => {
  const q = normalizeForSearch(filter.value).trim();
  return q ? props.items.filter((i) => normalizeForSearch(i.name).includes(q)) : props.items;
});
const canCreate = computed(
  () =>
    !!props.createLabel &&
    filter.value.trim() !== '' &&
    !props.items.some((i) => normalizeForSearch(i.name) === normalizeForSearch(filter.value.trim())),
);

function toggle(id: string) {
  if (!props.multiple) {
    emit('confirm', [id]);
    return;
  }
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
</script>

<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="emit('dismiss')">取消</ion-button>
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons v-if="multiple" slot="end">
          <ion-button strong @click="emit('confirm', [...selected])">完成</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="filter" placeholder="搜尋或輸入新名稱" />
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item v-if="canCreate" button @click="emit('create', filter.trim())">
          <ion-icon slot="start" :icon="addCircleOutline" color="primary" aria-hidden="true" />
          <ion-label color="primary">{{ createLabel }}「{{ filter.trim() }}」</ion-label>
        </ion-item>
        <ion-item v-for="item in filtered" :key="item.id" button :detail="false" @click="toggle(item.id)">
          <ion-checkbox v-if="multiple" slot="start" :checked="selected.has(item.id)" aria-hidden="true" />
          <span v-if="item.color" slot="start" class="tv-dot" :style="{ background: item.color }" />
          <ion-label>{{ item.name }}</ion-label>
          <ion-note v-if="item.count !== undefined" slot="end">{{ item.count }}</ion-note>
        </ion-item>
        <ion-item v-if="filtered.length === 0 && !canCreate" lines="none">
          <ion-label class="tv-muted">沒有項目</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-modal>
</template>
