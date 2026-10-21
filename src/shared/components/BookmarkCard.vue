<script setup lang="ts">
import { computed } from 'vue';
import { IonCheckbox, IonIcon } from '@ionic/vue';
import { linkOutline, pricetagOutline, warningOutline } from 'ionicons/icons';
import type { Bookmark, Folder, Tag } from '@/shared/types/models';
import { formatDate } from '@/shared/utils/date';
import { openExternal } from '@/services/platform/fileService';

const props = defineProps<{
  bookmark: Bookmark;
  folders: Folder[];
  tags: Tag[];
  view: 'card' | 'list';
  selecting?: boolean;
  selected?: boolean;
}>();

const emit = defineEmits<{ open: [id: string]; toggle: [id: string] }>();

const link = computed(() => props.bookmark.canonicalUrl ?? props.bookmark.originalUrl);
const text = computed(() => props.bookmark.content?.trim() || props.bookmark.title || '（沒有內文）');

function onClick() {
  if (props.selecting) emit('toggle', props.bookmark.id);
  else emit('open', props.bookmark.id);
}

function openLink(e: Event) {
  e.stopPropagation();
  if (link.value) openExternal(link.value);
}
</script>

<template>
  <article
    class="bm tv-card"
    :class="[`bm--${view}`, { 'bm--selected': selected }]"
    role="button"
    tabindex="0"
    :aria-pressed="selecting ? selected : undefined"
    @click="onClick"
    @keydown.enter.prevent="onClick"
  >
    <ion-checkbox
      v-if="selecting"
      class="bm__check"
      :checked="selected"
      aria-label="選取這篇收藏"
      @click.stop="emit('toggle', bookmark.id)"
    />
    <div class="bm__body">
      <div class="bm__meta">
        <span v-if="bookmark.author" class="bm__author">@{{ bookmark.author }}</span>
        <span class="tv-muted">{{ formatDate(bookmark.savedAt) }}</span>
        <span v-if="bookmark.status === 'missing_url'" class="bm__warn">
          <ion-icon :icon="warningOutline" aria-hidden="true" /> 原始連結不可用
        </span>
      </div>
      <p class="bm__text tv-pre" :class="{ 'bm__text--empty': !bookmark.content }">{{ text }}</p>
      <div v-if="folders.length || tags.length" class="bm__chips">
        <span v-for="f in folders" :key="f.id" class="chip">
          <span class="tv-dot" :style="{ background: f.color }" />{{ f.name }}
        </span>
        <span v-for="t in tags" :key="t.id" class="chip chip--tag">
          <ion-icon :icon="pricetagOutline" aria-hidden="true" />{{ t.name }}
        </span>
      </div>
    </div>
    <button v-if="link && !selecting" class="bm__link" type="button" :aria-label="'在 Threads 開啟原始貼文'" @click="openLink">
      <ion-icon :icon="linkOutline" aria-hidden="true" />
    </button>
  </article>
</template>

<style scoped>
.bm {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  margin: 0 12px 10px;
  cursor: pointer;
  transition: border-color 0.15s;
  outline: none;
}
.bm:focus-visible,
.bm:hover {
  border-color: var(--ion-color-primary);
}
.bm--selected {
  border-color: var(--ion-color-primary);
  background: rgba(var(--ion-color-primary-rgb), 0.08);
}
.bm--list {
  padding: 10px 12px;
  margin-bottom: 6px;
}
.bm__check {
  flex-shrink: 0;
  margin-top: 2px;
}
.bm__body {
  flex: 1;
  min-width: 0;
}
.bm__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  margin-bottom: 4px;
}
.bm__author {
  font-weight: 600;
}
.bm__warn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--ion-color-warning-shade);
}
.bm__text {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
}
.bm--list .bm__text {
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-size: 14px;
}
.bm__text--empty {
  color: var(--tv-text-muted);
  font-style: italic;
}
.bm__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--tv-surface-muted);
  border: 1px solid var(--tv-border);
}
.chip--tag ion-icon {
  font-size: 11px;
}
.bm__link {
  flex-shrink: 0;
  align-self: flex-start;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--tv-border);
  background: transparent;
  color: var(--ion-color-primary);
  display: grid;
  place-items: center;
  cursor: pointer;
  font-size: 18px;
}
.bm__link:hover {
  background: rgba(var(--ion-color-primary-rgb), 0.1);
}
</style>
