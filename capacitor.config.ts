import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.threadsvault.mobile',
  appName: 'Threads Vault',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      // 收藏只存在裝置上；目前不加密資料庫（之後可改用 SQLCipher 加密）
      androidIsEncryption: false,
      iosDatabaseLocation: 'Library/CapacitorDatabase',
    },
  },
};

export default config;
