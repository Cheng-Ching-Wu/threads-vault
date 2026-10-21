import { describe, expect, it } from 'vitest';
import { extractThreadsUrl, parseThreadsUrl } from '@/services/import/threadsUrl';

describe('parseThreadsUrl', () => {
  it('支援 threads.com/t/ID', () => {
    expect(parseThreadsUrl('https://www.threads.com/t/Xy9Kp2LmQ4r')).toEqual({
      postId: 'Xy9Kp2LmQ4r',
      username: null,
      canonicalUrl: 'https://www.threads.com/t/Xy9Kp2LmQ4r',
    });
  });

  it('支援 threads.net/t/ID 並統一成 threads.com', () => {
    expect(parseThreadsUrl('https://www.threads.net/t/Xy9Kp2LmQ4r')?.canonicalUrl).toBe(
      'https://www.threads.com/t/Xy9Kp2LmQ4r',
    );
    expect(parseThreadsUrl('https://threads.net/t/Xy9Kp2LmQ4r')?.postId).toBe('Xy9Kp2LmQ4r');
  });

  it('支援 @user/post/ID 並取得使用者名稱', () => {
    const r = parseThreadsUrl('https://www.threads.com/@some.user_1/post/C1a2B3c4D5e');
    expect(r?.postId).toBe('C1a2B3c4D5e');
    expect(r?.username).toBe('some.user_1');
    expect(r?.canonicalUrl).toBe('https://www.threads.com/@some.user_1/post/C1a2B3c4D5e');
  });

  it('移除追蹤參數與 hash', () => {
    expect(parseThreadsUrl('https://www.threads.com/t/Xy9Kp2LmQ4r?xmt=AQGz&slof=1#top')?.canonicalUrl).toBe(
      'https://www.threads.com/t/Xy9Kp2LmQ4r',
    );
    expect(
      parseThreadsUrl('https://www.threads.net/@user/post/Xy9Kp2LmQ4r/?igshid=abc&utm_source=ig')?.postId,
    ).toBe('Xy9Kp2LmQ4r');
  });

  it('不同格式的同一貼文得到相同 postId', () => {
    const ids = [
      'https://www.threads.com/t/Xy9Kp2LmQ4r',
      'https://www.threads.net/t/Xy9Kp2LmQ4r?x=1',
      'https://www.threads.com/@abc/post/Xy9Kp2LmQ4r',
      'threads.com/t/Xy9Kp2LmQ4r',
    ].map((u) => parseThreadsUrl(u)?.postId);
    expect(new Set(ids)).toEqual(new Set(['Xy9Kp2LmQ4r']));
  });

  it('拒絕非 Threads 網址與空值', () => {
    for (const u of ['', '   ', 'https://example.com/t/ABCDEF', 'https://www.threads.com/', 'https://www.threads.com/@user', 'not a url', null, undefined]) {
      expect(parseThreadsUrl(u)).toBeNull();
    }
  });
});

describe('extractThreadsUrl', () => {
  it('從分享文字中找出網址', () => {
    expect(extractThreadsUrl('看看這篇 https://www.threads.com/@user/post/C1a2B3c4D5e?xmt=1 很有趣')).toBe(
      'https://www.threads.com/@user/post/C1a2B3c4D5e?xmt=1',
    );
    expect(extractThreadsUrl('沒有網址')).toBeNull();
  });
});
