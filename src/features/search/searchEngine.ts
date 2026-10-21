import type { Bookmark } from '@/shared/types/models';
import { normalizeForSearch } from '@/shared/utils/text';

export type SearchField = 'all' | 'content' | 'title' | 'author' | 'notes';
export type SortOrder = 'saved_desc' | 'saved_asc' | 'imported_desc';

export interface SearchQuery {
  text: string;
  field: SearchField;
  folderIds: string[];
  tagIds: string[];
  /** 'all' 符合全部所選標籤；'any' 符合任一即可 */
  tagMode: 'all' | 'any';
  onlyUncategorized: boolean;
  onlyMissingUrl: boolean;
  sort: SortOrder;
}

export const emptyQuery = (): SearchQuery => ({
  text: '',
  field: 'all',
  folderIds: [],
  tagIds: [],
  tagMode: 'any',
  onlyUncategorized: false,
  onlyMissingUrl: false,
  sort: 'saved_desc',
});

interface IndexedEntry {
  content: string;
  title: string;
  author: string;
  notes: string;
  all: string;
}

/**
 * 記憶體內搜尋索引。10,000 筆收藏約數 MB，搜尋一次在毫秒等級。
 * 中文沒有空白分詞，因此使用子字串比對；多個關鍵字以空白分隔，需全部符合。
 */
export class SearchIndex {
  private entries = new Map<string, IndexedEntry>();

  rebuild(bookmarks: Bookmark[]): void {
    this.entries.clear();
    for (const b of bookmarks) this.upsert(b);
  }

  upsert(b: Bookmark): void {
    const content = normalizeForSearch(b.content);
    const title = normalizeForSearch(b.title);
    const author = normalizeForSearch(b.author);
    const notes = normalizeForSearch(b.notes);
    this.entries.set(b.id, { content, title, author, notes, all: [title, author, content, notes].join('\n') });
  }

  remove(id: string): void {
    this.entries.delete(id);
  }

  matches(id: string, tokens: string[], field: SearchField): boolean {
    if (tokens.length === 0) return true;
    const e = this.entries.get(id);
    if (!e) return false;
    const hay = e[field];
    return tokens.every((t) => hay.includes(t));
  }
}

export function tokenize(text: string): string[] {
  return normalizeForSearch(text).split(' ').filter(Boolean);
}

export interface RelationLookup {
  foldersOf: Map<string, Set<string>>;
  tagsOf: Map<string, Set<string>>;
}

export function searchBookmarks(
  bookmarks: Bookmark[],
  index: SearchIndex,
  rel: RelationLookup,
  q: SearchQuery,
): Bookmark[] {
  const tokens = tokenize(q.text);
  const folderFilter = new Set(q.folderIds);
  const result = bookmarks.filter((b) => {
    if (q.onlyMissingUrl && b.status !== 'missing_url') return false;
    const folders = rel.foldersOf.get(b.id);
    if (q.onlyUncategorized && folders && folders.size > 0) return false;
    if (folderFilter.size > 0) {
      if (!folders) return false;
      let hit = false;
      for (const f of folders) if (folderFilter.has(f)) hit = true;
      if (!hit) return false;
    }
    if (q.tagIds.length > 0) {
      const tags = rel.tagsOf.get(b.id);
      if (!tags) return false;
      const ok = q.tagMode === 'all' ? q.tagIds.every((t) => tags.has(t)) : q.tagIds.some((t) => tags.has(t));
      if (!ok) return false;
    }
    return index.matches(b.id, tokens, q.field);
  });
  return sortBookmarks(result, q.sort);
}

export function sortBookmarks(list: Bookmark[], sort: SortOrder): Bookmark[] {
  const key = (b: Bookmark) => (sort === 'imported_desc' ? b.importedAt : b.savedAt ?? b.importedAt);
  const dir = sort === 'saved_asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return a.id < b.id ? -1 : 1;
    return ka < kb ? -dir : dir;
  });
}
