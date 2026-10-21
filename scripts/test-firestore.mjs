// 啟動 Firebase 模擬器（Firestore + Auth），在模擬器上執行完整測試後自動關閉。
// 不需要真的 Firebase 專案（使用 demo- 開頭的專案 ID，不會連到任何雲端服務）。
//
// 模擬器需要 Java 21 以上：會依序使用 JAVA_HOME、PATH 上的 java，
// 或 %USERPROFILE%\.threads-vault-tools\jdk-extract\ 底下的免安裝版 JDK。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const env = { ...process.env };
const hasJava = (home) => home && existsSync(join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));

if (!hasJava(env.JAVA_HOME)) {
  const onPath = spawnSync('java', ['-version'], { stdio: 'ignore', shell: true }).status === 0;
  if (!onPath) {
    const base = join(homedir(), '.threads-vault-tools', 'jdk-extract');
    const found = existsSync(base) && readdirSync(base).map((d) => join(base, d)).find(hasJava);
    if (!found) {
      console.error('找不到 Java。Firebase 模擬器需要 Java 21 以上，請安裝後設定 JAVA_HOME。');
      process.exit(1);
    }
    env.JAVA_HOME = found;
    env.PATH = `${join(found, 'bin')}${process.platform === 'win32' ? ';' : ':'}${env.PATH}`;
  }
}

const args = process.argv.slice(2).join(' ');
const result = spawnSync(
  `npx firebase emulators:exec --only firestore,auth --project demo-threads-vault "npx vitest run ${args}"`,
  { stdio: 'inherit', shell: true, env },
);
process.exit(result.status ?? 1);
