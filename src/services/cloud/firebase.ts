import { Capacitor } from '@capacitor/core';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from 'firebase/firestore';

/**
 * Firebase 專案設定。這些值本來就會公開在網頁程式中（不是密碼）；
 * 資料的保護靠 Firestore 安全規則（firestore.rules）：每個人只能讀寫自己的資料。
 * 刻意不啟用 Analytics，不收集使用行為。
 */
const firebaseConfig = {
  apiKey: 'AIzaSyDMHRFk-Mzrm3zC4N7l-UDDkKll7P9Xzi8',
  authDomain: 'threads-saved-filter.firebaseapp.com',
  projectId: 'threads-saved-filter',
  storageBucket: 'threads-saved-filter.firebasestorage.app',
  messagingSenderId: '216486536331',
  appId: '1:216486536331:web:dc4751915609dcc8f6a08e',
};

/** 開發用：設定 VITE_FIREBASE_EMULATOR=true 時改連本機模擬器，不會碰到真正的雲端資料 */
export const USE_EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === 'true';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  app ??= initializeApp(USE_EMULATOR ? { ...firebaseConfig, projectId: 'demo-threads-vault' } : firebaseConfig);
  return app;
}

export function firebaseAuth(): Auth {
  if (auth) return auth;
  const native = Capacitor.isNativePlatform();
  // App 內的 WebView 不支援彈出視窗登入，只在瀏覽器載入彈出視窗相關功能
  auth = initializeAuth(firebaseApp(), {
    persistence: native ? indexedDBLocalPersistence : [indexedDBLocalPersistence, browserLocalPersistence],
    ...(native ? {} : { popupRedirectResolver: browserPopupRedirectResolver }),
  });
  if (USE_EMULATOR) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return auth;
}

/** 取得 Firestore（開啟離線快取：沒網路時照樣能讀寫，恢復連線後自動同步） */
export function firestore(): Firestore {
  if (db) return db;
  db = initializeFirestore(firebaseApp(), {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (USE_EMULATOR) connectFirestoreEmulator(db, '127.0.0.1', 8085);
  return db;
}

/** 登出時呼叫：關閉連線並清除這台裝置上的雲端資料快取 */
export async function shutdownFirestore(): Promise<void> {
  if (!db) return;
  const current = db;
  db = null;
  await terminate(current);
  try {
    await clearIndexedDbPersistence(current);
  } catch (err) {
    // 其他分頁還開著時無法清除；資料仍受登入保護，下次登入同一帳號會重複使用
    console.warn('[cloud] 無法清除離線快取', err instanceof Error ? err.message : err);
  }
}
