import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, terminate, type Firestore } from 'firebase/firestore';
import { FirestoreVaultRepository, type FirestoreRepoOptions } from '@/database/adapters/firestore/FirestoreVaultRepository';

/** firebase emulators:exec 會設定這兩個環境變數 */
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
export const emulatorAvailable = Boolean(FIRESTORE_HOST && AUTH_HOST);

let appCounter = 0;

export interface EmulatorClient {
  app: FirebaseApp;
  db: Firestore;
  uid: string;
  dispose: () => Promise<void>;
}

/** 建立一個獨立的模擬器連線，並以新的匿名帳號登入（每個測試的資料互不影響） */
export async function createEmulatorClient(): Promise<EmulatorClient> {
  if (!FIRESTORE_HOST || !AUTH_HOST) throw new Error('Firebase 模擬器未執行');
  const app = initializeApp({ projectId: 'demo-threads-vault', apiKey: 'demo-key' }, `test-${Date.now()}-${appCounter++}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const { user } = await signInAnonymously(auth);
  const db = initializeFirestore(app, {});
  const [host, port] = FIRESTORE_HOST.split(':') as [string, string];
  connectFirestoreEmulator(db, host, Number(port));
  return {
    app,
    db,
    uid: user.uid,
    dispose: async () => {
      await terminate(db);
      await deleteApp(app);
    },
  };
}

export async function createEmulatorRepo(options: FirestoreRepoOptions = { ackTimeoutMs: Infinity }) {
  const client = await createEmulatorClient();
  const repo = new FirestoreVaultRepository(client.db, client.uid, options);
  await repo.init();
  const close = repo.close.bind(repo);
  repo.close = async () => {
    await close();
    await client.dispose();
  };
  return repo;
}
