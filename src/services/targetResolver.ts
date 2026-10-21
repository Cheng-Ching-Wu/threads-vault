import type { Folder, Tag } from '@/shared/types/models';
import { newId } from '@/shared/utils/id';
import { nameKey, normalizeName } from '@/shared/utils/text';
import { DEFAULT_FOLDER_COLOR, DEFAULT_FOLDER_ICON, DEFAULT_TAG_COLOR } from '@/shared/utils/palette';

/**
 * 以名稱找到資料夾 / 標籤（不分大小寫），不存在時建立新的物件（尚未寫入資料庫）。
 * 匯入與自動分類規則共用，確保兩邊建立的資料夾、標籤格式一致。
 */
export function createTargetResolver(folders: Folder[], tags: Tag[], now: string) {
  const folderByKey = new Map(folders.map((f) => [nameKey(f.name), f]));
  const tagByKey = new Map(tags.map((t) => [nameKey(t.name), t]));
  const newFolders: Folder[] = [];
  const newTags: Tag[] = [];
  let sortOrder = folders.reduce((m, f) => Math.max(m, f.sortOrder), 0);

  return {
    newFolders,
    newTags,
    folder(name: string): Folder | null {
      const k = nameKey(name);
      if (!k) return null;
      let f = folderByKey.get(k);
      if (!f) {
        f = {
          id: newId(),
          name: normalizeName(name),
          icon: DEFAULT_FOLDER_ICON,
          color: DEFAULT_FOLDER_COLOR,
          sortOrder: ++sortOrder,
          createdAt: now,
          updatedAt: now,
        };
        folderByKey.set(k, f);
        newFolders.push(f);
      }
      return f;
    },
    tag(name: string): Tag | null {
      const k = nameKey(name);
      if (!k) return null;
      let t = tagByKey.get(k);
      if (!t) {
        t = { id: newId(), name: normalizeName(name), color: DEFAULT_TAG_COLOR, createdAt: now };
        tagByKey.set(k, t);
        newTags.push(t);
      }
      return t;
    },
  };
}
