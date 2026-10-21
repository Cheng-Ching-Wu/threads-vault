import { Capacitor } from '@capacitor/core';

/**
 * 檔案存取：Web 使用瀏覽器下載 / 檔案選擇；
 * 原生 App 寫入暫存資料夾後開啟系統分享面板，讓使用者自行選擇儲存位置。
 * 資料不會上傳到任何伺服器。
 */
export async function saveTextFile(fileName: string, text: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: fileName, files: [uri] });
    return;
  }
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 開啟檔案選擇器，回傳選取的檔案（取消時回傳 null） */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    let settled = false;
    const finish = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export async function readFileText(file: File): Promise<string> {
  return file.text();
}

/** 以系統瀏覽器 / 新分頁開啟外部連結 */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
