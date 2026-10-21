/**
 * 修復「UTF-8 位元組被誤當成 Latin-1 解碼」造成的亂碼（mojibake）。
 *
 * Meta 匯出的 JSON 會把每個 UTF-8 位元組存成一個 U+0000–U+00FF 的字元，
 * 例如「改網頁」會變成「æ\u0094¹ç¶²é \u0081」。
 *
 * 作法：UTF-8 多位元組序列的每個位元組都 ≥ 0x80，因此只要找出所有
 * 連續的 U+0080–U+00FF 字元，把它們還原成位元組，再用「嚴格模式」的
 * UTF-8 解碼器解碼。解碼失敗的片段（例如正常的 "café"）就原樣保留。
 * 已經正確的中文、emoji（碼位 > U+00FF）不會被這個流程碰到。
 */

const HIGH_LATIN1_RUN = /[\u0080-ÿ]+/g;

function decodeRun(run: string): string | null {
  const bytes = new Uint8Array(run.length);
  for (let i = 0; i < run.length; i++) bytes[i] = run.charCodeAt(i);
  try {
    // fatal: true → 遇到不合法的 UTF-8 直接丟錯，不會產生 U+FFFD
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export interface RepairResult {
  text: string;
  repaired: boolean;
}

export function repairMojibakeDetailed(input: string): RepairResult {
  if (!input) return { text: input, repaired: false };
  let repaired = false;
  const text = input.replace(HIGH_LATIN1_RUN, (run) => {
    // 單一字元不可能是 UTF-8 多位元組序列，保留原樣（例如 "é"、"©"）
    if (run.length < 2) return run;
    const decoded = decodeRun(run);
    if (decoded === null || decoded === run) return run;
    repaired = true;
    return decoded;
  });
  return { text, repaired };
}

/** 回傳修復後字串；無法修復時回傳原字串。 */
export function repairMojibake(input: string): string {
  return repairMojibakeDetailed(input).text;
}

/** 粗略判斷字串是否「看起來」含有 mojibake（供 UI 提示使用）。 */
export function looksLikeMojibake(input: string): boolean {
  return repairMojibakeDetailed(input).repaired;
}
