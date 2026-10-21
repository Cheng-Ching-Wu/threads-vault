import type { ImportSourceType } from '@/shared/types/models';
import { isBackupFile } from '@/services/backup/backupFormat';
import { parseCsv, parseGenericJson } from '@/services/import/genericParser';
import { looksLikeMetaExport, parseMetaSavedThreads } from '@/services/import/metaParser';
import { ImportFormatError, type ParseResult } from '@/services/import/types';

export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

export interface ParsedImportFile {
  sourceType: ImportSourceType;
  parse: ParseResult;
  isBackup: boolean;
}

/** 讀取並解析使用者選擇的檔案，自動判斷 Meta JSON / 一般 JSON / CSV。 */
export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  if (file.size > MAX_IMPORT_BYTES) throw new ImportFormatError('檔案太大（上限 200 MB）');
  const text = await file.text();
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    return { sourceType: 'csv', parse: await parseCsv(text), isBackup: false };
  }

  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ImportFormatError('無法解析 JSON：檔案可能已損毀，或不是 JSON 格式');
  }
  if (looksLikeMetaExport(json)) {
    return { sourceType: 'meta_json', parse: await parseMetaSavedThreads(json), isBackup: false };
  }
  return { sourceType: 'json', parse: await parseGenericJson(json), isBackup: isBackupFile(json) };
}
