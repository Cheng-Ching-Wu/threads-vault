<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import type { Folder } from '@/shared/types/models';
import { FOLDER_COLORS, FOLDER_ICONS } from '@/shared/utils/palette';
import { folderIcon } from '../folderIcons';

const props = defineProps<{ isOpen: boolean; folder?: Folder | null }>();
const emit = defineEmits<{ dismiss: []; save: [value: { name: string; icon: string; color: string }] }>();

const name = ref('');
const icon = ref<string>(FOLDER_ICONS[0]);
const color = ref<string>(FOLDER_COLORS[0]);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    name.value = props.folder?.name ?? '';
    icon.value = props.folder?.icon ?? FOLDER_ICONS[0];
    color.value = props.folder?.color ?? FOLDER_COLORS[0];
  },
);

function save() {
  emit('save', { name: name.value, icon: icon.value, color: color.value });
}
</script>

<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-button @click="emit('dismiss')">取消</ion-button></ion-buttons>
        <ion-title>{{ folder ? '編輯資料夾' : '新增資料夾' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong :disabled="!name.trim()" @click="save">儲存</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="preview">
        <span class="preview__icon" :style="{ background: color }">
          <ion-icon :icon="folderIcon(icon)" aria-hidden="true" />
        </span>
        <ion-input
          v-model="name"
          label="名稱"
          label-placement="stacked"
          placeholder="例如：前端技術、旅遊、食譜"
          :maxlength="50"
          :clear-input="true"
          @keyup.enter="name.trim() && save()"
        />
      </div>

      <h3 class="tv-section-title">顏色</h3>
      <div class="grid" role="radiogroup" aria-label="顏色">
        <button
          v-for="c in FOLDER_COLORS"
          :key="c"
          type="button"
          role="radio"
          :aria-checked="c === color"
          :aria-label="c"
          class="swatch"
          :class="{ active: c === color }"
          :style="{ background: c }"
          @click="color = c"
        />
      </div>

      <h3 class="tv-section-title">圖示</h3>
      <div class="grid" role="radiogroup" aria-label="圖示">
        <button
          v-for="i in FOLDER_ICONS"
          :key="i"
          type="button"
          role="radio"
          :aria-checked="i === icon"
          :aria-label="i"
          class="icon-btn"
          :class="{ active: i === icon }"
          @click="icon = i"
        >
          <ion-icon :icon="folderIcon(i)" aria-hidden="true" />
        </button>
      </div>
    </ion-content>
  </ion-modal>
</template>

<style scoped>
.preview {
  display: flex;
  align-items: center;
  gap: 12px;
}
.preview__icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 24px;
  flex-shrink: 0;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 10px;
  padding: 0 4px;
}
.swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
}
.swatch.active {
  border-color: var(--ion-text-color, #000);
  box-shadow: 0 0 0 2px var(--ion-background-color) inset;
}
.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--tv-border);
  background: var(--tv-surface);
  color: inherit;
  font-size: 22px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-btn.active {
  border-color: var(--ion-color-primary);
  color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.1);
}
</style>
