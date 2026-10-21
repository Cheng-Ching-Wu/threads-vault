import { IndexedDbVaultRepository } from '@/database/adapters/indexeddb/IndexedDbVaultRepository';
import { SqliteVaultRepository } from '@/database/adapters/sqlite/SqliteVaultRepository';
import type { VaultRepository } from '@/database/repositories/VaultRepository';
import { SqlJsDriver } from './sqlJsDriver';
import { createEmulatorRepo, emulatorAvailable } from './firestoreEmulator';

/** 把正常字串轉成 Meta 匯出的亂碼形式（UTF-8 位元組 → Latin-1 字元） */
export function toMojibake(text: string): string {
  return Buffer.from(text, 'utf8').toString('latin1');
}

let dbCounter = 0;

export const repoFactories: Array<[string, () => Promise<VaultRepository>]> = [
  [
    'IndexedDB',
    async () => {
      const repo = new IndexedDbVaultRepository(`test-db-${Date.now()}-${dbCounter++}`);
      await repo.init();
      return repo;
    },
  ],
  [
    'SQLite',
    async () => {
      const repo = new SqliteVaultRepository(new SqlJsDriver());
      await repo.init();
      return repo;
    },
  ],
  // 只有在 Firebase 模擬器執行中（npm run test:firestore）才會加入
  ...(emulatorAvailable ? [['Firestore', () => createEmulatorRepo()] as [string, () => Promise<VaultRepository>]] : []),
];

interface FakeItem {
  fbid?: string | number;
  timestamp?: number;
  url?: string;
  caption?: string;
  /** true → 完全不輸出 Caption 欄位（真實資料中存在這種情況） */
  noCaption?: boolean;
}

/** 產生合成的 Meta saved_threads.json 項目（不含任何真實收藏） */
export function metaItem(item: FakeItem): Record<string, unknown> {
  const labelValues: unknown[] = [{ label: 'URL', value: item.url ?? '', href: item.url ?? '' }];
  if (!item.noCaption) {
    labelValues.push({ label: 'Caption', value: toMojibake(item.caption ?? '') });
    labelValues.push({ label: 'Title', value: '' });
  }
  labelValues.push({ dict: [], title: 'Hashtags' }, { dict: [], title: 'Owner' }, { dict: [], title: 'Brand partner' });
  return {
    timestamp: item.timestamp ?? 1_760_000_000,
    media: [],
    label_values: labelValues,
    ...(item.fbid !== undefined ? { fbid: item.fbid } : {}),
  };
}

export function sampleExport(): Record<string, unknown>[] {
  return [
    metaItem({ fbid: '1001', url: 'https://www.threads.com/t/AbCdE12345', caption: '改網頁的小技巧 😀\n第二行' }),
    metaItem({ fbid: '1002', url: 'https://www.threads.com/t/FgHiJ67890', caption: '日本語のテキスト' }),
    metaItem({ fbid: '1003', url: '', caption: '沒有網址的收藏' }),
    metaItem({ fbid: '1004', url: 'https://www.threads.com/t/KlMnO11111', noCaption: true }),
    metaItem({ fbid: '1005', url: 'https://www.threads.com/t/PqRsT22222', caption: '한국어 텍스트 입니다' }),
  ];
}
