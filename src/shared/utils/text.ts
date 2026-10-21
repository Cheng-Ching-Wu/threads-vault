/** 搜尋用的字串正規化：全形轉半形、英文小寫、合併空白。中文不受影響。 */
export function normalizeForSearch(text: string | null | undefined): string {
  if (!text) return '';
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

/** 標籤 / 資料夾名稱正規化：去頭尾空白、去掉開頭的 #、合併空白。 */
export function normalizeName(name: string): string {
  return name.normalize('NFKC').trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim();
}

export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
