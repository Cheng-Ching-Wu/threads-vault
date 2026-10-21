import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { commitImport } from '@/services/import/importService';
import { parseMetaSavedThreads } from '@/services/import/metaParser';
import { repoFactories } from '../helpers/fixtures';

/**
 * 選用：以你自己的 saved_threads.json 驗證匯入。
 * 不會把資料寫進快照或 console，只檢查統計數字。
 *
 *   PowerShell： $env:SAVED_THREADS_PATH="C:\path\saved_threads.json"; npm test
 */
const path = process.env.SAVED_THREADS_PATH;
const enabled = !!path && existsSync(path);

describe.skipIf(!enabled)('真實 Meta 匯出檔', () => {
  it.each(repoFactories)('完整匯入且重複匯入不增加資料（%s）', async (_n, factory) => {
    const raw: unknown = JSON.parse(readFileSync(path!, 'utf8'));
    const parse = await parseMetaSavedThreads(raw);
    expect(parse.failures).toEqual([]);
    expect(parse.candidates.length + parse.duplicatesInFile).toBe(parse.total);

    const repo = await factory();
    const first = await commitImport(repo, parse, 'meta_json');
    expect(first.job.status).toBe('completed');
    expect(await repo.countBookmarks()).toBe(parse.candidates.length);

    const second = await commitImport(repo, await parseMetaSavedThreads(raw), 'meta_json');
    expect(second.job.counts.added).toBe(0);
    expect(await repo.countBookmarks()).toBe(parse.candidates.length);

    const all = await repo.listBookmarks();
    // 修復後不應殘留典型 mojibake 片段（例如 "Ã"、"â\u0080"、"ð\u009f"）
    const residual = all.filter((b) => b.content && /[\u00c2-\u00f4][\u0080-\u00bf]/.test(b.content)).length;
    expect(residual).toBe(0);

    console.warn(
      `[real-data] total=${parse.total} imported=${parse.candidates.length} missingUrl=${parse.missingUrlCount} ` +
        `repaired=${parse.repairedTextCount} withContent=${all.filter((b) => b.content).length}`,
    );
    await repo.close();
  });
});
