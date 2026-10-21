import { ref, watch } from 'vue';

const KEY = 'threads-vault:view';

function read(): 'card' | 'list' {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : 'card';
  } catch {
    return 'card';
  }
}

/** 清單 / 卡片檢視偏好（只是顯示偏好，存在 localStorage 即可） */
export const viewMode = ref<'card' | 'list'>(read());

watch(viewMode, (v) => {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* 忽略 */
  }
});
