import { ref } from 'vue';

export type ThemeMode = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'threads-vault:theme';

export const themeMode = ref<ThemeMode>('system');

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* 隱私模式等情況無法讀取 localStorage */
  }
  return 'system';
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function apply(): void {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'system' && !!media?.matches);
  document.documentElement.classList.toggle('ion-palette-dark', dark);
}

export function setThemeMode(mode: ThemeMode): void {
  themeMode.value = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* 忽略 */
  }
  apply();
}

export function initTheme(): void {
  themeMode.value = readStored();
  apply();
  media?.addEventListener('change', apply);
}
