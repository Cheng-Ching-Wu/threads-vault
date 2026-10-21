import { Capacitor } from '@capacitor/core';
import { ref } from 'vue';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth, shutdownFirestore } from './firebase';

export interface CloudUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/** 目前登入的帳號（null = 未登入，使用本機模式） */
export const cloudUser = ref<CloudUser | null>(null);

const toCloudUser = (u: User | null): CloudUser | null =>
  u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null;

let readyPromise: Promise<CloudUser | null> | null = null;
const listeners = new Set<(user: CloudUser | null) => void>();

/**
 * 等待 Firebase 從裝置讀出上次的登入狀態（離線也可以）。
 * Firebase 載入失敗時視為未登入，App 照常以本機模式運作。
 */
export function authReady(): Promise<CloudUser | null> {
  readyPromise ??= new Promise((resolve) => {
    let first = true;
    try {
      onAuthStateChanged(
        firebaseAuth(),
        (u) => {
          const next = toCloudUser(u);
          const changed = cloudUser.value?.uid !== next?.uid;
          cloudUser.value = next;
          if (first) {
            first = false;
            resolve(next);
          } else if (changed) {
            listeners.forEach((l) => l(next));
          }
        },
        () => {
          if (first) {
            first = false;
            resolve(null);
          }
        },
      );
    } catch (err) {
      console.warn('[cloud] 無法初始化登入', err instanceof Error ? err.message : err);
      resolve(null);
    }
  });
  return readyPromise;
}

/** 登入或登出後通知（不含啟動時的第一次狀態） */
export function onCloudUserChange(listener: (user: CloudUser | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 原生 App 的 Google 登入需要另外的原生外掛（之後實作），目前只在瀏覽器提供 */
export const googleSignInAvailable = !Capacitor.isNativePlatform();

export async function signInWithGoogle(): Promise<void> {
  await authReady();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(firebaseAuth(), provider);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await authReady();
  await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  await authReady();
  await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email.trim());
}

/** 登出：先關閉雲端連線並清除這台裝置上的雲端快取，本機模式的資料不受影響 */
export async function signOut(): Promise<void> {
  await shutdownFirestore();
  await fbSignOut(firebaseAuth());
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email 或密碼不正確',
  'auth/wrong-password': 'Email 或密碼不正確',
  'auth/user-not-found': 'Email 或密碼不正確',
  'auth/invalid-email': 'Email 格式不正確',
  'auth/email-already-in-use': '這個 Email 已經註冊過了，請直接登入',
  'auth/weak-password': '密碼至少需要 6 個字元',
  'auth/missing-password': '請輸入密碼',
  'auth/too-many-requests': '嘗試次數太多，請稍後再試',
  'auth/network-request-failed': '無法連線，請檢查網路',
  'auth/popup-closed-by-user': '登入視窗已關閉',
  'auth/cancelled-popup-request': '登入視窗已關閉',
  'auth/popup-blocked': '瀏覽器擋住了登入視窗，請允許彈出視窗後再試一次',
  'auth/operation-not-allowed': 'Firebase 尚未開啟這種登入方式',
  'auth/unauthorized-domain': '這個網址未被允許登入，請到 Firebase Authentication → 設定 → 授權網域 加入',
  'permission-denied': '雲端資料庫拒絕存取，請確認 Firestore 安全規則已發布',
  unavailable: '暫時無法連線到雲端，請稍後再試',
};

export function cloudErrorMessage(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code]!;
  return e instanceof Error ? e.message : String(e);
}

/** 使用者自己關掉登入視窗，不需要顯示錯誤 */
export function isUserCancel(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request';
}
