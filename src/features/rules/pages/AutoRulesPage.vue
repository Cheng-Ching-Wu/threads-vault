<script setup lang="ts">
import { computed, ref } from 'vue';
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
  IonListHeader,
  IonPage,
  IonTitle,
  IonToggle,
  IonToolbar,
  loadingController,
  onIonViewWillEnter,
} from '@ionic/vue';
import {
  add,
  arrowDownOutline,
  arrowUpOutline,
  colorWandOutline,
  folderOutline,
  pricetagOutline,
  sparklesOutline,
} from 'ionicons/icons';
import type { AutoRule, AutoRuleTarget } from '@/shared/types/models';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { countMatchesPerRule } from '@/services/rules/ruleEngine';
import type { AutoRuleInput } from '@/services/vaultService';
import { truncate } from '@/shared/utils/text';
import { confirm, toast, toastError } from '@/shared/utils/ui';
import AutoRuleEditModal from '../components/AutoRuleEditModal.vue';

const vault = useVaultStore();
const editorOpen = ref(false);
const editing = ref<AutoRule | null>(null);
const newType = ref<AutoRuleTarget>('folder');
const busy = ref(false);

onIonViewWillEnter(() => void vault.whenReady());

const folderRules = computed(() => vault.autoRules.filter((r) => r.targetType === 'folder'));
const tagRules = computed(() => vault.autoRules.filter((r) => r.targetType === 'tag'));
const enabledCount = computed(() => vault.autoRules.filter((r) => r.enabled).length);
const matchCounts = computed(() => countMatchesPerRule(vault.bookmarks, vault.autoRules));

function openNew(type: AutoRuleTarget) {
  editing.value = null;
  newType.value = type;
  editorOpen.value = true;
}
function openEdit(rule: AutoRule) {
  editing.value = rule;
  editorOpen.value = true;
}

async function save(value: AutoRuleInput) {
  try {
    if (editing.value) await vault.updateAutoRule(editing.value.id, value);
    else await vault.createAutoRule(value);
    editorOpen.value = false;
    await toast('規則已儲存', 'success');
  } catch (e) {
    await toastError(e);
  }
}

async function remove() {
  const rule = editing.value;
  if (!rule) return;
  const ok = await confirm({
    header: '刪除這條規則？',
    message: '已經分類好的收藏不會被改變，只是之後不再自動套用。',
    confirmText: '刪除',
    destructive: true,
  });
  if (!ok) return;
  try {
    await vault.deleteAutoRule(rule.id);
    editorOpen.value = false;
  } catch (e) {
    await toastError(e);
  }
}

async function toggle(rule: AutoRule, enabled: boolean) {
  try {
    await vault.updateAutoRule(rule.id, { enabled });
  } catch (e) {
    await toastError(e);
  }
}

async function move(rule: AutoRule, direction: -1 | 1) {
  try {
    await vault.moveAutoRule(rule.id, direction);
  } catch (e) {
    await toastError(e);
  }
}

async function loadSuggested() {
  try {
    const n = await vault.loadSuggestedRules();
    await toast(n ? `已加入 ${n} 條建議規則` : '建議規則都已經在清單裡了', n ? 'success' : 'medium');
  } catch (e) {
    await toastError(e);
  }
}

async function applyToAll() {
  if (busy.value) return;
  busy.value = true;
  try {
    const plan = await vault.planApplyRulesToAll();
    if (plan.affectedCount === 0) {
      await toast('目前的收藏都已經符合規則，沒有需要補上的分類', 'medium');
      return;
    }
    const parts = [
      plan.folderAssignments ? `${plan.folderAssignments} 篇未分類的收藏會放進資料夾` : '',
      plan.tagAssignments ? `會加上 ${plan.tagAssignments} 個標籤` : '',
      plan.newFolders.length ? `建立資料夾：${plan.newFolders.map((f) => f.name).join('、')}` : '',
      plan.newTags.length ? `建立標籤：${plan.newTags.map((t) => t.name).join('、')}` : '',
    ].filter(Boolean);
    const ok = await confirm({
      header: `套用到 ${plan.affectedCount} 篇收藏？`,
      message: `${parts.join('；')}。只會補上分類，不會移除你現有的資料夾或標籤。`,
      confirmText: '套用',
    });
    if (!ok) return;
    const loading = await loadingController.create({ message: '正在套用規則…' });
    await loading.present();
    try {
      const done = await vault.applyRulesToAll();
      await toast(`已更新 ${done.affectedCount} 篇收藏`, 'success');
    } finally {
      await loading.dismiss();
    }
  } catch (e) {
    await toastError(e);
  } finally {
    busy.value = false;
  }
}

const keywordSummary = (r: AutoRule) =>
  truncate(r.keywords.join(r.matchMode === 'all' ? ' + ' : '、'), 60);
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button default-href="/tabs/settings" text="返回" /></ion-buttons>
        <ion-title>自動分類規則</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="tv-container">
        <p class="intro tv-muted">
          內文出現關鍵字時，自動把收藏放進資料夾或加上標籤。匯入新收藏、從 Threads 分享進來時會自動套用；全部在這台裝置上處理，不會上傳內容。
        </p>

        <section v-if="!vault.autoRules.length" class="empty tv-card">
          <ion-icon :icon="sparklesOutline" class="empty__icon" aria-hidden="true" />
          <h2>還沒有規則</h2>
          <p class="tv-muted">可以先載入建議規則（依照你目前的收藏整理：選手、CP、美食、遊戲等），再依需要修改。</p>
          <ion-button @click="loadSuggested"><ion-icon slot="start" :icon="sparklesOutline" />載入建議規則</ion-button>
          <ion-button fill="outline" @click="openNew('folder')"><ion-icon slot="start" :icon="add" />自己新增</ion-button>
        </section>

        <template v-else>
          <div class="actions">
            <ion-button :disabled="busy || !enabledCount" @click="applyToAll">
              <ion-icon slot="start" :icon="colorWandOutline" />套用到現有收藏
            </ion-button>
            <ion-button fill="outline" @click="loadSuggested">
              <ion-icon slot="start" :icon="sparklesOutline" />載入建議規則
            </ion-button>
          </div>

          <ion-list inset>
            <ion-list-header>
              <ion-label>
                資料夾規則
                <p class="sub">由上往下比對，每篇只放進第一個符合的資料夾；已經有資料夾的收藏不會被移動。</p>
              </ion-label>
              <ion-button aria-label="新增資料夾規則" @click="openNew('folder')"><ion-icon :icon="add" /></ion-button>
            </ion-list-header>
            <ion-item v-if="!folderRules.length" lines="none"><ion-label class="tv-muted">沒有資料夾規則</ion-label></ion-item>
            <ion-item v-for="(r, i) in folderRules" :key="r.id" :class="{ off: !r.enabled }">
              <div slot="start" class="order">
                <ion-button fill="clear" size="small" :disabled="i === 0" aria-label="往上移" @click="move(r, -1)">
                  <ion-icon slot="icon-only" :icon="arrowUpOutline" />
                </ion-button>
                <ion-button
                  fill="clear"
                  size="small"
                  :disabled="i === folderRules.length - 1"
                  aria-label="往下移"
                  @click="move(r, 1)"
                >
                  <ion-icon slot="icon-only" :icon="arrowDownOutline" />
                </ion-button>
              </div>
              <ion-label class="ion-text-wrap clickable" @click="openEdit(r)">
                <h3><ion-icon :icon="folderOutline" aria-hidden="true" /> {{ r.targetName }}</h3>
                <p>{{ keywordSummary(r) }}</p>
              </ion-label>
              <ion-badge slot="end" color="light">{{ matchCounts.get(r.id) ?? 0 }} 篇</ion-badge>
              <ion-toggle
                slot="end"
                :checked="r.enabled"
                :aria-label="`啟用 ${r.targetName}`"
                @ion-change="toggle(r, $event.detail.checked)"
              />
            </ion-item>
          </ion-list>

          <ion-list inset>
            <ion-list-header>
              <ion-label>
                標籤規則
                <p class="sub">所有符合的標籤都會加上。</p>
              </ion-label>
              <ion-button aria-label="新增標籤規則" @click="openNew('tag')"><ion-icon :icon="add" /></ion-button>
            </ion-list-header>
            <ion-item v-if="!tagRules.length" lines="none"><ion-label class="tv-muted">沒有標籤規則</ion-label></ion-item>
            <ion-item v-for="r in tagRules" :key="r.id" :class="{ off: !r.enabled }">
              <ion-label class="ion-text-wrap clickable" @click="openEdit(r)">
                <h3><ion-icon :icon="pricetagOutline" aria-hidden="true" /> {{ r.targetName }}</h3>
                <p>{{ keywordSummary(r) }}</p>
              </ion-label>
              <ion-badge slot="end" color="light">{{ matchCounts.get(r.id) ?? 0 }} 篇</ion-badge>
              <ion-toggle
                slot="end"
                :checked="r.enabled"
                :aria-label="`啟用 ${r.targetName}`"
                @ion-change="toggle(r, $event.detail.checked)"
              />
            </ion-item>
          </ion-list>
          <p class="foot tv-muted">「篇」是這條規則單獨會符合的收藏數。點規則可以編輯關鍵字。</p>
        </template>
      </div>

      <AutoRuleEditModal
        :is-open="editorOpen"
        :rule="editing"
        :default-type="newType"
        @dismiss="editorOpen = false"
        @save="save"
        @remove="remove"
      />
    </ion-content>
  </ion-page>
</template>

<style scoped>
.intro {
  font-size: 14px;
  line-height: 1.6;
  margin: 16px;
}
.empty {
  margin: 16px;
  padding: 24px 16px;
  text-align: center;
}
.empty__icon {
  font-size: 40px;
  color: var(--ion-color-primary);
}
.empty h2 {
  margin: 8px 0;
  font-size: 18px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 16px;
}
.sub {
  font-size: 12px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--tv-text-muted);
  margin: 2px 0 0;
  white-space: normal;
}
.order {
  display: flex;
  flex-direction: column;
  margin-inline-end: 4px;
}
.order ion-button {
  --padding-start: 4px;
  --padding-end: 4px;
  height: 22px;
  margin: 0;
}
.clickable {
  cursor: pointer;
}
.clickable h3 ion-icon {
  vertical-align: -2px;
  color: var(--tv-text-muted);
}
ion-badge {
  margin-inline-end: 8px;
  font-weight: 500;
}
.off .clickable {
  opacity: 0.5;
}
.foot {
  font-size: 12px;
  text-align: center;
  padding: 0 16px 24px;
}
</style>
