/**
 * 命令列匯入工具（由舊版 PoC 遷移）：不開 App 也能檢查 Meta 匯出檔。
 *
 *   npm run import:cli -- "C:\path\saved_threads.json" ./output
 *
 * 輸出：
 *   output/bookmarks.json  正規化後的收藏（含修復後內文）
 *   output/report.json     匯入統計
 * 原始檔案不會被修改。output/ 已列入 .gitignore。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseMetaSavedThreads } from '../src/services/import/metaParser';

const input = process.argv[2];
const outputDir = resolve(process.argv[3] ?? './output');

if (!input) {
  console.error('用法：npm run import:cli -- "C:\\path\\saved_threads.json" ./output');
  process.exit(1);
}

try {
  const raw: unknown = JSON.parse(await readFile(resolve(input), 'utf8'));
  const result = await parseMetaSavedThreads(raw);
  const report = {
    total: result.total,
    imported: result.candidates.length,
    duplicatesInFile: result.duplicatesInFile,
    withUrl: result.candidates.filter((c) => c.status === 'normal').length,
    missingUrl: result.missingUrlCount,
    withContent: result.candidates.filter((c) => c.content).length,
    repairedText: result.repairedTextCount,
    failed: result.failures.length,
    failures: result.failures,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, 'bookmarks.json'), JSON.stringify(result.candidates, null, 2), 'utf8');
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  // 只印統計，不印收藏內容
  console.warn('匯入統計：', JSON.stringify({ ...report, failures: report.failures.length }, null, 2));
  console.warn(`輸出位置：${outputDir}`);
} catch (error) {
  console.error('匯入失敗：', error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
