<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { checkmarkCircle, closeCircle, documentTextOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { commitImport, planImport, type ImportPlan } from '@/services/import/importService';
import { pickFile } from '@/services/platform/fileService';
import type { ImportJob } from '@/shared/types/models';
import { truncate } from '@/shared/utils/text';
import { formatDate } from '@/shared/utils/date';
import { errorMessage, toast } from '@/shared/utils/ui';
import { parseImportFile, type ParsedImportFile } from '../parseImportFile';


type Step = 'pick' | 'parsing' | 'preview' | 'committing' | 'done' | 'error';

const vault = useVaultStore();
const router = useRouter();
const step = ref<Step>('pick');
const fileName = ref<string | null>(null);
const parsed = shallowRef<ParsedImportFile | null>(null);
const plan = shallowRef<ImportPlan | null>(null);
const job = shallowRef<ImportJob | null>(null);
const error = ref<string | null>(null);
/** 套用自動分類規則到這次新增的收藏（有啟用的規則時預設開啟） */
const applyRules = ref(true);
const enabledRuleCount = computed(() => vault.autoRules.filter((r) => r.enabled).length);
const importOptions = () => (applyRules.value && enabledRuleCount.value ? { autoRules: vault.autoRules } : {});

const SOURCE_LABEL: Record<string, string> = {
  meta_json: 'Meta 官方匯出（saved_threads.json）',
  json: '一般 JSON',
  csv: 'CSV',
};

const previewItems = computed(() => (plan.value?.items ?? []).slice(0, 30));

async function choose(accept: string) {
  const file = await pickFile(accept);
  if (!file) return;
  fileName.value = file.name;
  step.value = 'parsing';
  error.value = null;
  try {
    await vault.whenReady();
    parsed.value = await parseImportFile(file);
    plan.value = await planImport(
      await vault.getRepo(),
      parsed.value.parse,
      parsed.value.sourceType,
      file.name,
      importOptions(),
    );
    step.value = 'preview';
  } catch (e) {
    error.value = errorMessage(e);
    step.value = 'error';
  }
}

async function confirmImport() {
  if (!parsed.value) return;
  step.value = 'committing';
  try {
    const res = await commitImport(
      await vault.getRepo(),
      parsed.value.parse,
      parsed.value.sourceType,
      fileName.value,
      importOptions(),
    );
    job.value = res.job;
    await vault.reloadAll();
    step.value = 'done';
    if (res.job.status === 'failed') {
      error.value = res.job.errorMessage;
    } else {
      await toast('匯入完成', 'success');
    }
  } catch (e) {
    error.value = errorMessage(e);
    step.value = 'error';
  }
}

async function onToggleRules(checked: boolean) {
  applyRules.value = checked;
  if (!parsed.value) return;
  try {
    plan.value = await planImport(
      await vault.getRepo(),
      parsed.value.parse,
      parsed.value.sourceType,
      fileName.value,
      importOptions(),
    );
  } catch (e) {
    error.value = errorMessage(e);
    step.value = 'error';
  }
}

function reset() {
  step.value = 'pick';
  parsed.value = null;
  plan.value = null;
  job.value = null;
  error.value = null;
  fileName.value = null;
}

const actionLabel = { add: '新增', update: '更新', skip: '略過' } as const;
const actionColor = { add: 'success', update: 'primary', skip: 'medium' } as const;
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/tabs/settings" text="返回" /></ion-buttons>
        <ion-title>匯入收藏</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="tv-container">
        <!-- 1. 選擇檔案 -->
        <template v-if="step === 'pick'">
          <section class="tv-card box">
            <h2>匯入 Threads 官方收藏</h2>
            <ol class="steps tv-muted">
              <li>在 Threads 或 Instagram 開啟「帳號管理中心 → 你的資訊和權限 → 下載你的資訊」。</li>
              <li>選擇 Threads、格式選 <strong>JSON</strong>，等待 Meta 通知後下載 ZIP 並解壓縮。</li>
              <li>選擇資料夾中的 <code>threads/saved_threads.json</code>。</li>
            </ol>
            <ion-button expand="block" @click="choose('.json,application/json')">
              <ion-icon slot="start" :icon="documentTextOutline" />選擇 saved_threads.json
            </ion-button>
          </section>

          <section class="tv-card box">
            <h2>匯入一般 JSON / CSV</h2>
            <p class="tv-muted">
              支援 Threads Vault 匯出的 CSV、備份 JSON，或自行整理的清單。欄位：url、content、author、title、saved_at、notes、folders、tags（多個以分號分隔）。
            </p>
            <ion-button expand="block" fill="outline" @click="choose('.json,.csv,application/json,text/csv')">選擇 JSON 或 CSV</ion-button>
          </section>

          <p class="privacy tv-muted">
            <ion-icon :icon="shieldCheckmarkOutline" aria-hidden="true" />
            檔案只在你的裝置上處理，不會上傳到任何伺服器，原始檔案也不會被修改。重複匯入不會產生重複收藏。
          </p>
        </template>

        <!-- 2. 解析 / 寫入中 -->
        <div v-else-if="step === 'parsing' || step === 'committing'" class="center">
          <ion-spinner />
          <p>{{ step === 'parsing' ? '正在讀取與分析檔案…' : '正在寫入資料庫…' }}</p>
        </div>

        <!-- 3. 預覽 -->
        <template v-else-if="step === 'preview' && plan && parsed">
          <h2>匯入預覽</h2>
          <p class="tv-muted">{{ fileName }} · {{ SOURCE_LABEL[parsed.sourceType] }}</p>
          <p v-if="parsed.isBackup" class="note">
            這是 Threads Vault 備份檔，會以「合併」方式匯入（保留現有資料）。若要完整還原，請到「設定 → 還原備份」。
          </p>

          <div class="counts">
            <div class="count tv-card"><strong>{{ plan.counts.total }}</strong><span>檔案筆數</span></div>
            <div class="count tv-card ok"><strong>{{ plan.counts.added }}</strong><span>新增</span></div>
            <div class="count tv-card upd"><strong>{{ plan.counts.updated }}</strong><span>更新</span></div>
            <div class="count tv-card"><strong>{{ plan.counts.skipped }}</strong><span>略過（已存在）</span></div>
            <div class="count tv-card" :class="{ bad: plan.counts.failed }"><strong>{{ plan.counts.failed }}</strong><span>失敗</span></div>
          </div>
          <ul class="facts tv-muted">
            <li>修復中文亂碼：{{ parsed.parse.repairedTextCount }} 筆</li>
            <li>缺少原始網址（仍會匯入，以 fbid 識別）：{{ parsed.parse.missingUrlCount }} 筆</li>
            <li v-if="parsed.parse.duplicatesInFile">檔案內重複：{{ parsed.parse.duplicatesInFile }} 筆</li>
            <li v-if="plan.newFolderNames.length">將建立資料夾：{{ plan.newFolderNames.join('、') }}</li>
            <li v-if="plan.newTagNames.length">將建立標籤：{{ plan.newTagNames.join('、') }}</li>
            <li>你手動設定的分類、標籤與備註都會保留。</li>
          </ul>

          <ion-list v-if="enabledRuleCount" inset class="rules">
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <h3>套用自動分類規則</h3>
                <p v-if="applyRules">{{ plan.autoClassifiedCount }} 篇新收藏會自動分類（{{ enabledRuleCount }} 條規則啟用中）</p>
                <p v-else>新收藏不會自動分類</p>
              </ion-label>
              <ion-toggle
                slot="end"
                :checked="applyRules"
                aria-label="套用自動分類規則"
                @ion-change="onToggleRules($event.detail.checked)"
              />
            </ion-item>
          </ion-list>
          <p v-else class="tv-muted small">
            想讓新收藏自動分好類？到「設定 → 自動分類規則」設定關鍵字。
          </p>

          <div class="actions">
            <ion-button :disabled="plan.counts.added + plan.counts.updated === 0 && !plan.newTagNames.length && !plan.newFolderNames.length" @click="confirmImport">
              確認匯入
            </ion-button>
            <ion-button fill="outline" @click="reset">重新選擇</ion-button>
          </div>
          <p v-if="plan.counts.added + plan.counts.updated === 0" class="tv-muted">所有收藏都已經存在，不需要再匯入。</p>

          <h3 class="tv-section-title">前 {{ previewItems.length }} 筆內容</h3>
          <ion-list inset class="preview">
            <ion-item v-for="it in previewItems" :key="it.candidate.sourceIndex">
              <ion-label class="ion-text-wrap">
                <p class="preview__meta">
                  {{ formatDate(it.candidate.savedAt) }}
                  <span v-if="it.candidate.status === 'missing_url'" class="warn">· 原始連結不可用</span>
                </p>
                <h3>{{ truncate(it.candidate.content ?? '（沒有內文）', 90) }}</h3>
              </ion-label>
              <ion-badge slot="end" :color="actionColor[it.action]">{{ actionLabel[it.action] }}</ion-badge>
            </ion-item>
          </ion-list>

          <template v-if="parsed.parse.failures.length">
            <h3 class="tv-section-title">無法匯入的項目</h3>
            <ion-list inset>
              <ion-item v-for="f in parsed.parse.failures.slice(0, 50)" :key="f.index">
                <ion-label class="ion-text-wrap">第 {{ f.index + 1 }} 筆：{{ f.reason }}</ion-label>
              </ion-item>
            </ion-list>
          </template>
        </template>

        <!-- 4. 結果 -->
        <template v-else-if="step === 'done' && job">
          <div class="center">
            <ion-icon
              :icon="job.status === 'completed' ? checkmarkCircle : closeCircle"
              :color="job.status === 'completed' ? 'success' : 'danger'"
              class="big-icon"
              aria-hidden="true"
            />
            <h2>{{ job.status === 'completed' ? '匯入完成' : '匯入失敗' }}</h2>
            <p v-if="job.status === 'failed'" class="error">
              {{ error }}<br />既有資料沒有任何變動，可以修正後重新匯入。
            </p>
          </div>
          <div class="counts">
            <div class="count tv-card ok"><strong>{{ job.counts.added }}</strong><span>新增</span></div>
            <div class="count tv-card upd"><strong>{{ job.counts.updated }}</strong><span>更新</span></div>
            <div class="count tv-card"><strong>{{ job.counts.skipped }}</strong><span>略過</span></div>
            <div class="count tv-card" :class="{ bad: job.counts.failed }"><strong>{{ job.counts.failed }}</strong><span>失敗</span></div>
          </div>
          <p class="tv-muted center-text">目前共有 {{ vault.bookmarks.length }} 篇收藏</p>
          <div class="actions">
            <ion-button @click="router.replace('/tabs/bookmarks')">查看收藏</ion-button>
            <ion-button fill="outline" @click="reset">再匯入一個檔案</ion-button>
          </div>
        </template>

        <!-- 錯誤 -->
        <template v-else-if="step === 'error'">
          <div class="center">
            <ion-icon :icon="closeCircle" color="danger" class="big-icon" aria-hidden="true" />
            <h2>無法匯入</h2>
            <p class="error">{{ error }}</p>
            <p class="tv-muted">既有資料沒有任何變動。</p>
            <ion-button @click="reset">重新選擇檔案</ion-button>
          </div>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.box {
  padding: 16px;
  margin-bottom: 16px;
}
.box h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.steps {
  padding-left: 20px;
  line-height: 1.7;
  font-size: 14px;
}
.privacy {
  display: flex;
  gap: 8px;
  font-size: 13px;
  align-items: flex-start;
}
.privacy ion-icon {
  flex-shrink: 0;
  font-size: 18px;
  color: var(--ion-color-success);
}
.center {
  display: grid;
  place-items: center;
  text-align: center;
  padding: 32px 8px 8px;
}
.center-text {
  text-align: center;
}
.big-icon {
  font-size: 64px;
}
.counts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  margin: 12px 0;
}
.count {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
}
.count strong {
  font-size: 22px;
}
.count span {
  font-size: 12px;
  color: var(--tv-text-muted);
}
.count.ok strong {
  color: var(--ion-color-success);
}
.count.upd strong {
  color: var(--ion-color-primary);
}
.count.bad strong {
  color: var(--ion-color-danger);
}
.facts {
  font-size: 14px;
  line-height: 1.8;
  padding-left: 20px;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin: 12px 0;
}
.note {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(var(--ion-color-primary-rgb), 0.1);
  font-size: 14px;
}
.preview {
  margin: 0;
}
.rules {
  margin: 8px 0;
}
.small {
  font-size: 13px;
}
.preview__meta {
  font-size: 12px;
}
.warn {
  color: var(--ion-color-warning-shade);
}
.error {
  color: var(--ion-color-danger);
}
</style>
