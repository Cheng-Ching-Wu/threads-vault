import type { DBSchema } from 'idb';
import type { AutoRule, Bookmark, BookmarkFolder, BookmarkTag, Folder, ImportJob, Tag } from '@/shared/types/models';

export interface VaultDbSchema extends DBSchema {
  bookmarks: {
    key: string;
    value: Bookmark;
    indexes: { by_platformPostId: string; by_fbid: string; by_savedAt: string; by_importedAt: string };
  };
  folders: { key: string; value: Folder; indexes: { by_sortOrder: number } };
  tags: { key: string; value: Tag; indexes: { by_name: string } };
  bookmarkFolders: {
    key: [string, string];
    value: BookmarkFolder;
    indexes: { by_bookmarkId: string; by_folderId: string };
  };
  bookmarkTags: {
    key: [string, string];
    value: BookmarkTag;
    indexes: { by_bookmarkId: string; by_tagId: string };
  };
  importJobs: { key: string; value: ImportJob; indexes: { by_startedAt: string } };
  autoRules: { key: string; value: AutoRule; indexes: { by_sortOrder: number } };
}

export const ALL_STORES = [
  'bookmarks',
  'folders',
  'tags',
  'bookmarkFolders',
  'bookmarkTags',
  'importJobs',
  'autoRules',
] as const;
