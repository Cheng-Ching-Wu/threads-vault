# Threads Vault

整理 Threads 收藏的分類管理 App。匯入 Meta 官方匯出的 `saved_threads.json`，修復中文亂碼，用資料夾、標籤、備註管理收藏，並能一鍵回到 Threads 原文。

- **本機模式（預設）**：資料只存在你的裝置（Web 版用 IndexedDB、Android / iOS 用 SQLite），不需登入、不上傳任何伺服器。
- **雲端同步（選用）**：登入後改用 Cloud Firestore，手機與電腦即時同步；離線也能用，恢復連線後自動上傳。
- **網頁版**：https://cheng-ching-wu.github.io/threads-vault/ （推送到 `main` 後由 GitHub Actions 自動測試、建置並部署，設定在 [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml)）
- **技術**：Vue 3 + TypeScript（strict）+ Vite + Ionic Vue + Pinia + Vue Router + Capacitor + Zod + Vitest。

---

## 1. Windows 環境建置

需要：

| 項目 | 版本 |
|---|---|
| Windows 10 / 11 | — |
| Node.js | 22 LTS 以上（已在 22.23 測試） |
| npm | 10 以上 |
| VS Code（建議） | 安裝 Vue - Official 擴充套件 |

```powershell
cd threads-vault-import-poc
npm install
```

## 2. 開發與執行

```powershell
npm run dev        # 開發伺服器 → http://localhost:5173
npm run build      # 型別檢查 + 正式建置（輸出到 dist/）
npm run preview    # 預覽正式建置
```

## 3. 測試與檢查

```powershell
npm run typecheck  # vue-tsc 型別檢查
npm run lint       # ESLint
npm test           # Vitest 單元測試
```

### 雲端同步（Firestore）測試

以下指令會啟動 Firebase 模擬器，把整套測試在 Firestore 上再跑一次，並驗證安全規則、離線寫入與分批寫入。不需要真的 Firebase 專案，也不會連到任何雲端服務：

```powershell
npm run test:firestore
```

模擬器需要 Java 21 以上：會依序使用 `JAVA_HOME`、PATH 上的 `java`，或 `%USERPROFILE%\.threads-vault-tools\jdk-extract\` 底下的免安裝版 JDK。安全規則在 [firestore.rules](firestore.rules)。

### 用你自己的匯出檔做驗證（選用）

測試資料全部是合成資料，不含任何真實收藏。若想用自己的 `saved_threads.json` 跑一次完整匯入驗證（只印統計數字、不印內容）：

```powershell
$env:SAVED_THREADS_PATH="C:\Users\你的帳號\Downloads\threads\saved_threads.json"; npm test
Remove-Item Env:SAVED_THREADS_PATH
```

### 命令列匯入工具（不開 App 也能檢查匯出檔）

```powershell
npm run import:cli -- "C:\Users\你的帳號\Downloads\threads\saved_threads.json" ./output
```

輸出 `output/bookmarks.json`（修復後的收藏）與 `output/report.json`（統計）。`output/` 已排除在 Git 之外。

## 4. 匯入 Threads 收藏

1. 在 Threads / Instagram 開啟「帳號管理中心 → 你的資訊和權限 → 下載你的資訊」。
2. 選擇 Threads，格式選 **JSON**，等 Meta 通知後下載 ZIP 並解壓縮。
3. 開啟 App →「設定 → 匯入 Meta 收藏 / JSON / CSV」→ 選擇 `threads/saved_threads.json`。
4. 檢查預覽（新增 / 更新 / 略過 / 失敗筆數、亂碼修復數、缺網址數），按「確認匯入」。

匯入規則：

- **不會修改原始檔案**。
- **可重複匯入**：以貼文代碼（網址中的 `DetGsVPE0bP`）為主、`fbid` 為輔判斷是否為同一篇，不會產生重複收藏。
- **保留你的整理**：重新匯入只會補齊或更新來源資料（內文、網址、日期），不會動到你設定的資料夾、標籤與備註。
- **沒有網址的收藏也會匯入**：以 `fbid` 識別、標記為「原始連結不可用」，不會捏造網址。
- **失敗不會破壞資料**：整批匯入在單一資料庫交易內完成，任何錯誤都會完整回滾。

### 實際匯出檔分析結果（2026-10-20 的匯出）

| 項目 | 筆數 |
|---|---|
| 收藏總數 | 630 |
| 有 Threads 網址 | 602 |
| 沒有網址（只有 fbid） | 28 |
| 有內文 | 625（另 5 筆匯出中完全沒有 Caption 欄位） |
| 修復亂碼 | 625（全部可完整還原，0 筆殘留） |
| 檔案內重複 | 0 |
| 匯入失敗 | 0 |

Meta 匯出目前**沒有提供**作者、標題、Hashtags 與圖片（這些欄位全為空），所以 App 不顯示作者，除非之後以 `@user/post/ID` 格式網址新增。

### 自動分類規則

「設定 → 自動分類規則」可以設定關鍵字，讓收藏自動放進資料夾或加上標籤：

- **資料夾規則**由上往下比對，每篇只放進第一個符合的資料夾；已經在資料夾裡的收藏不會被移動。
- **標籤規則**全部套用，符合幾條就加幾個標籤。
- 可設定「需要全部關鍵字都出現」，例如 `🐈‍⬛ + 🐿️` 要同時出現才算殼蘭。
- 比對不分大小寫、全形半形視為相同；emoji 完整比對（🐻 不會比對到 🐻‍❄️）；英數關鍵字看單字邊界（`AI` 不會比對到 `said`）。
- **何時套用**：匯入時套用到「新增」的收藏（預覽頁可關閉）、從 Threads 分享進來時、以及按「套用到現有收藏」時。重新匯入不會把規則套到既有收藏，避免加回你手動移除的標籤。
- **只會補上分類，不會移除**任何資料夾或標籤。資料夾 / 標籤改名時，指向它的規則會跟著改名。
- 「載入建議規則」提供一組依目前收藏整理的起始規則（選手、CP、美食、遊戲等），可自行修改。
- 規則會包含在 JSON 備份中。全部在本機比對，不會傳送內容到外部服務。

## 5. 一般 JSON / CSV 匯入、備份與還原

「設定」頁提供：

| 功能 | 說明 |
|---|---|
| 匯出備份（JSON） | 完整保留收藏、資料夾、標籤、關聯、備註、匯入紀錄、自動分類規則（備份格式 v2，仍可還原 v1 備份） |
| 還原備份 | 以備份**取代**目前資料（單一交易，失敗不會清空現有資料） |
| 匯出 CSV | UTF-8 BOM，可直接用 Excel 開啟；已防範 CSV 公式注入 |
| 匯入 JSON / CSV | 合併匯入。欄位：`url`、`content`、`author`、`title`、`saved_at`、`notes`、`folders`、`tags`（多個以 `;` 分隔），也接受 `link`、`text`、`caption` 等別名 |

Web 版與 Android 版的備份格式相同，可以互相搬移（已有測試驗證 IndexedDB → SQLite）。

## 6. 專案結構

```text
src/
├── app/                    # 路由、版面（底部分頁）、主題
├── features/
│   ├── bookmarks/          # 收藏首頁、詳細頁、Pinia store、批次操作
│   ├── folders/            # 資料夾 / 標籤管理
│   ├── imports/            # 匯入頁（預覽 → 確認 → 結果）
│   ├── rules/              # 自動分類規則頁與規則編輯
│   ├── search/             # 搜尋引擎（記憶體索引）、篩選 UI
│   ├── settings/           # 設定、深色模式
│   └── share/              # 系統分享接收（Android）
├── database/
│   ├── repositories/       # VaultRepository 介面（所有資料存取的唯一入口）
│   ├── adapters/indexeddb/ # Web：IndexedDB
│   ├── adapters/sqlite/    # 原生：SQLite（SqlDriver 抽象 + Capacitor 驅動）
│   └── migrations/         # IndexedDB / SQLite 版本遷移
├── services/
│   ├── encoding/           # repairMojibake()
│   ├── import/             # Meta parser（Zod 驗證）、一般 JSON/CSV parser、去重與匯入計畫
│   ├── rules/              # 自動分類：比對引擎、套用計畫、建議規則
│   ├── backup/             # 備份 / CSV 格式
│   ├── platform/           # 檔案下載、選擇（Web / 原生）
│   └── vaultService.ts     # 資料夾、標籤、批次分類等業務邏輯
└── shared/                 # 型別、共用元件、工具
tests/unit/                 # Vitest（同一套 repository 測試同時跑 IndexedDB 與 SQLite）
scripts/import-cli.ts       # 命令列匯入工具
android/                    # Capacitor Android 專案
```

架構重點：Vue 元件 → Pinia store → `VaultService` / 匯入服務 → `VaultRepository` 介面 → IndexedDB 或 SQLite。元件不直接碰資料庫。SQLite 的 SQL 在測試中以 [sql.js](https://github.com/sql-js/sql.js)（WASM SQLite）執行，所以在 Windows 上也能驗證。

## 7. Android（Capacitor）

### 需要額外安裝

目前這台電腦**沒有** JDK 與 Android SDK，所以 Android 專案已產生、但尚未實際編譯。請先安裝：

1. [Android Studio](https://developer.android.com/studio)（內含 JDK 21 與 Android SDK）。
2. 開啟 Android Studio → SDK Manager，安裝最新的 Android SDK Platform 與 Build-Tools。

### 建置與執行

```powershell
npm run cap:android      # 建置 Web → 同步到 android/ → 開啟 Android Studio
```

在 Android Studio 按 ▶ 執行到模擬器或實機。命令列打包 debug APK：

```powershell
npm run build; npx cap sync android
cd android; .\gradlew.bat assembleDebug
# 產出：android\app\build\outputs\apk\debug\app-debug.apk
```

### 系統分享（已實作，待實機驗證）

- `AndroidManifest.xml` 加入 `ACTION_SEND`（`text/plain`）intent-filter。
- `ShareReceiverPlugin.java`（自訂 Capacitor 外掛，不依賴第三方外掛）接收分享文字；`MainActivity` 在 `onCreate` / `onNewIntent` 轉交。
- Web 層 `src/features/share/shareReceiver.ts` 從文字中找出 Threads 網址並新增收藏；已存在時不重複新增。
- 在 Threads App 按「分享 → Threads Vault」即可。**這段原生程式碼尚未在模擬器或實機上測試。**
- `android:allowBackup="false"`：避免收藏被自動備份到 Google 雲端。

## 8. iOS（規劃，尚未實作）

沒有 macOS 無法建置 iOS，以下為規劃：

1. 在 Mac 上 `npm install && npx cap add ios && npx cap open ios`。
2. Xcode 新增 **Share Extension** target，`NSExtensionActivationRule` 只接受網址與文字。
3. App 與 Extension 加入同一個 **App Group**（例如 `group.app.threadsvault.mobile`）。
4. Extension 把分享的網址寫入 App Group 的 `UserDefaults` 佇列後關閉。
5. 主 App 實作同名的 `ShareReceiver` 外掛（Swift），`getPendingShares()` 讀出並清空佇列；App 回到前景時再讀一次。JS 端已依此介面設計，只需在 `initShareReceiver()` 中開放 iOS 平台。

SQLite（`@capacitor-community/sqlite`）同樣支援 iOS，資料層不需修改。

## 9. 雲端同步（Firebase）

「設定 → 雲端同步」登入後啟用（Google 帳號或 Email／密碼）：

- **登入 = 雲端模式，登出 = 本機模式**。本機資料一直保留，登入期間不會被修改。
- 登入後可按「上傳本機資料到雲端」：雲端是空的會完整複製；已有資料則合併，同一篇不會重複，雲端上的備註與分類會保留。
- 其他裝置的修改會即時出現，不需重新整理。沒網路時照常使用，恢復連線後自動上傳。
- 登出時會清除這台裝置上的雲端快取；雲端資料不受影響。
- 資料存在 `users/{uid}/…`，[firestore.rules](firestore.rules) 只允許本人讀寫。**規則需在 Firebase Console → Firestore → 規則 發布**，否則雲端模式會顯示「雲端資料庫拒絕存取」。
- Firebase 設定在 [src/services/cloud/firebase.ts](src/services/cloud/firebase.ts)（這些值本來就公開於前端，不是密碼）。未啟用 Analytics。

已知限制：

- **Android App 的 Google 登入尚未實作**（需要原生外掛），App 內目前只能用 Email 登入；瀏覽器兩種都可以。
- 大量寫入（例如匯入上千篇）會分批送出；若網路在中途中斷，已送出的部分不會回滾，重新匯入即可補齊。
- 兩台裝置「同時」匯入同一篇收藏時，有很小的機率產生重複。

開發時連到本機模擬器（不碰真正的雲端資料）：

```powershell
# 終端機 1：啟動模擬器（需要 Java 21，見上方「雲端同步（Firestore）測試」）
npx firebase emulators:start --only firestore,auth --project demo-threads-vault
# 終端機 2：以模擬器模式啟動 App
$env:VITE_FIREBASE_EMULATOR="true"; npx vite --port 5174
```

## 10. 隱私與 Git

- `.gitignore` 已排除 `saved_threads*.json`、`threads-*/`、`output/`、`tmp-private/`、備份 / CSV 匯出檔、資料庫檔與 Android 建置產物。
- 程式不會在 Console 輸出收藏內容；CLI 與測試只印統計數字。
- 自動分類規則只在本機比對關鍵字，不使用 AI、不會把內容送到任何外部服務。

## 11. 已知限制

- Meta 匯出沒有作者、標題、圖片，App 無法補齊（不使用 Threads 未公開 API，也不爬取網頁）。
- Ionic 元件整包被打進主程式（gzip 約 250 KB）。本機載入影響不大，之後可再優化。
- 搜尋使用子字串比對，不支援繁簡互通或拼音。
- Android 尚未實際編譯；iOS 只有規劃。
