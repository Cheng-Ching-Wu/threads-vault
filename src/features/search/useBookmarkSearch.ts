import { computed, reactive, ref, watch } from 'vue';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { emptyQuery, searchBookmarks, type SearchQuery } from './searchEngine';

/** 單一頁面的搜尋狀態；fixedFolderId 用於資料夾內頁 */
export function useBookmarkSearch(options: { fixedFolderId?: () => string | undefined } = {}) {
  const vault = useVaultStore();
  const query = reactive<SearchQuery>(emptyQuery());

  // 輸入時稍作延遲，避免每打一個字就重新篩選上萬筆
  const debouncedText = ref('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(
    () => query.text,
    (t) => {
      clearTimeout(timer);
      timer = setTimeout(() => (debouncedText.value = t), 150);
    },
  );

  const results = computed(() => {
    void vault.indexVersion; // 索引更新時重新計算
    const fixed = options.fixedFolderId?.();
    return searchBookmarks(
      vault.bookmarks,
      vault.searchIndex,
      { foldersOf: vault.foldersOf, tagsOf: vault.tagsOf },
      { ...query, text: debouncedText.value, folderIds: fixed ? [fixed] : query.folderIds },
    );
  });

  const activeFilterCount = computed(
    () =>
      (options.fixedFolderId?.() ? 0 : query.folderIds.length) +
      query.tagIds.length +
      (query.onlyUncategorized ? 1 : 0) +
      (query.onlyMissingUrl ? 1 : 0),
  );

  function resetFilters() {
    query.folderIds = [];
    query.tagIds = [];
    query.onlyUncategorized = false;
    query.onlyMissingUrl = false;
  }

  return { query, results, activeFilterCount, resetFilters };
}

export type BookmarkSearch = ReturnType<typeof useBookmarkSearch>;
