/**
 * Threads 網址解析與正規化。
 *
 * 支援：
 *   https://www.threads.com/t/POST_ID
 *   https://www.threads.net/t/POST_ID
 *   https://www.threads.com/@user/post/POST_ID
 * 並移除追蹤參數（整個 query string 與 hash 都不影響貼文識別）。
 */

const THREADS_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);
const SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/;
const USERNAME = /^[A-Za-z0-9._]{1,64}$/;

export interface ParsedThreadsUrl {
  /** 貼文代碼 */
  postId: string;
  /** 若網址含 @username，回傳使用者名稱（不含 @） */
  username: string | null;
  /** 去掉追蹤參數後的正規網址 */
  canonicalUrl: string;
}

export function parseThreadsUrl(raw: string | null | undefined): ParsedThreadsUrl | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!THREADS_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));

  // /t/POST_ID
  if (segments[0] === 't' && segments[1] && SHORTCODE.test(segments[1])) {
    return build(segments[1], null);
  }
  // /@user/post/POST_ID
  if (segments[0]?.startsWith('@') && segments[1] === 'post' && segments[2] && SHORTCODE.test(segments[2])) {
    const username = segments[0].slice(1);
    return build(segments[2], USERNAME.test(username) ? username : null);
  }
  return null;
}

function build(postId: string, username: string | null): ParsedThreadsUrl {
  const canonicalUrl = username
    ? `https://www.threads.com/@${username}/post/${postId}`
    : `https://www.threads.com/t/${postId}`;
  return { postId, username, canonicalUrl };
}

/** 從任意文字（例如分享進來的內容）中找出第一個 Threads 網址。 */
export function extractThreadsUrl(text: string): string | null {
  const matches = text.match(/https?:\/\/(?:www\.)?threads\.(?:com|net)\/[^\s<>"']+/gi);
  if (!matches) return null;
  for (const m of matches) {
    if (parseThreadsUrl(m)) return m;
  }
  return null;
}
