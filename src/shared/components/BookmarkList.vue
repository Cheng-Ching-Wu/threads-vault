<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IonInfiniteScroll, IonInfiniteScrollContent, type InfiniteScrollCustomEvent } from '@ionic/vue';
import { useRouter } from 'vue-router';
import type { Bookmark } from '@/shared/types/models';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import BookmarkCard from './BookmarkCard.vue';

/**
 * 分頁載入的收藏清單：一次只渲染 PAGE_SIZE 筆，捲到底再載入下一頁，
 * 10,000 筆收藏也不會一次產生上萬個 DOM 節點。
 */
const PAGE_SIZE = 40;

const props = defineProps<{
  items: Bookmark[];
  view: 'card' | 'list';
  selecting?: boolean;
  selectedIds?: Set<string>;
}>();
const emit = defineEmits<{ toggle: [id: string] }>();

const vault = useVaultStore();
const router = useRouter();
const visible = ref(PAGE_SIZE);

// 搜尋條件改變時回到第一頁
watch(
  () => props.items,
  () => (visible.value = PAGE_SIZE),
);

const shown = computed(() => props.items.slice(0, visible.value));

async function loadMore(ev: InfiniteScrollCustomEvent) {
  visible.value = Math.min(visible.value + PAGE_SIZE, props.items.length);
  await ev.target.complete();
}

function open(id: string) {
  router.push(`/bookmarks/${id}`);
}
</script>

<template>
  <div class="list">
    <BookmarkCard
      v-for="b in shown"
      :key="b.id"
      :bookmark="b"
      :folders="vault.foldersFor(b.id)"
      :tags="vault.tagsFor(b.id)"
      :view="view"
      :selecting="selecting"
      :selected="selectedIds?.has(b.id)"
      @open="open"
      @toggle="emit('toggle', $event)"
    />
    <ion-infinite-scroll :disabled="visible >= items.length" @ion-infinite="loadMore">
      <ion-infinite-scroll-content loading-text="載入更多…" />
    </ion-infinite-scroll>
  </div>
</template>

<style scoped>
.list {
  padding-bottom: 12px;
}
</style>
