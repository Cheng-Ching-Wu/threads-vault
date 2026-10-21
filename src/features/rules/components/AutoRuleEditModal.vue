<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import { folderOutline, pricetagOutline, trashOutline } from 'ionicons/icons';
import type { AutoRule, AutoRuleMatchMode, AutoRuleTarget } from '@/shared/types/models';
import { useVaultStore } from '@/features/bookmarks/vaultStore';
import { bookmarkMatchText, compileRules, matchText, parseKeywords } from '@/services/rules/ruleEngine';
import type { AutoRuleInput } from '@/services/vaultService';
import { nameKey, truncate } from '@/shared/utils/text';

const props = defineProps<{ isOpen: boolean; rule?: AutoRule | null; defaultType?: AutoRuleTarget }>();
const emit = defineEmits<{ dismiss: []; save: [value: AutoRuleInput]; remove: [] }>();

const vault = useVaultStore();
const targetType = ref<AutoRuleTarget>('folder');
const targetName = ref('');
const keywordText = ref('');
const matchMode = ref<AutoRuleMatchMode>('any');
const enabled = ref(true);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    targetType.value = props.rule?.targetType ?? props.defaultType ?? 'folder';
    targetName.value = props.rule?.targetName ?? '';
    keywordText.value = (props.rule?.keywords ?? []).join('\n');
    matchMode.value = props.rule?.matchMode ?? 'any';
    enabled.value = props.rule?.enabled ?? true;
  },
);

const keywords = computed(() => parseKeywords(keywordText.value));
const canSave = computed(() => targetName.value.trim().length > 0 && keywords.value.length > 0);

/** 已存在的資料夾 / 標籤名稱，方便點選 */
const suggestions = computed(() => {
  const names = targetType.value === 'folder' ? vault.folders.map((f) => f.name) : vault.tags.map((t) => t.name);
  const q = nameKey(targetName.value);
  return names.filter((n) => (!q || nameKey(n).includes(q)) && nameKey(n) !== q).slice(0, 12);
});
const targetExists = computed(() => {
  const k = nameKey(targetName.value);
  const list = targetType.value === 'folder' ? vault.folders : vault.tags;
  return !k || list.some((x) => nameKey(x.name) === k);
});

/** 即時預覽：這條規則單獨會符合哪些收藏 */
const preview = computed(() => {
  if (!keywords.value.length) return { count: 0, samples: [] as string[] };
  const draft: AutoRule = {
    id: 'draft',
    targetType: 'tag',
    targetName: 'draft',
    keywords: keywords.value,
    matchMode: matchMode.value,
    enabled: true,
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };
  const compiled = compileRules([draft]);
  let count = 0;
  const samples: string[] = [];
  for (const b of vault.bookmarks) {
    if (matchText(bookmarkMatchText(b), compiled).tagNames.length) {
      count++;
      if (samples.length < 3) samples.push(truncate((b.content ?? b.notes ?? '').replace(/\s+/g, ' '), 70));
    }
  }
  return { count, samples };
});

function save() {
  if (!canSave.value) return;
  emit('save', {
    targetType: targetType.value,
    targetName: targetName.value,
    keywords: keywords.value,
    matchMode: matchMode.value,
    enabled: enabled.value,
  });
}
</script>

<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-button @click="emit('dismiss')">取消</ion-button></ion-buttons>
        <ion-title>{{ rule ? '編輯規則' : '新增規則' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button strong :disabled="!canSave" @click="save">儲存</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-segment v-model="targetType" aria-label="規則類型">
        <ion-segment-button value="folder">
          <ion-icon :icon="folderOutline" aria-hidden="true" /><ion-label>放進資料夾</ion-label>
        </ion-segment-button>
        <ion-segment-button value="tag">
          <ion-icon :icon="pricetagOutline" aria-hidden="true" /><ion-label>加上標籤</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-input
        v-model="targetName"
        class="field"
        :label="targetType === 'folder' ? '資料夾名稱' : '標籤名稱'"
        label-placement="stacked"
        :placeholder="targetType === 'folder' ? '例如：電競・選手日常' : '例如：Doran'"
        :maxlength="50"
        :clear-input="true"
      />
      <p v-if="!targetExists" class="hint tv-muted">
        還沒有這個{{ targetType === 'folder' ? '資料夾' : '標籤' }}，第一次套用規則時會自動建立。
      </p>
      <div v-if="suggestions.length" class="chips" :aria-label="targetType === 'folder' ? '現有資料夾' : '現有標籤'">
        <button v-for="n in suggestions" :key="n" type="button" class="chip" @click="targetName = n">{{ n }}</button>
      </div>

      <ion-textarea
        v-model="keywordText"
        class="field"
        label="關鍵字"
        label-placement="stacked"
        placeholder="每行一個，或用逗號分隔&#10;例如：&#10;崔多蘭&#10;Doran&#10;🐿"
        :auto-grow="true"
        :rows="5"
      />
      <p class="hint tv-muted">
        不分大小寫。emoji 會完整比對（🐻 不會比對到 🐻‍❄️），英文會看單字邊界（AI 不會比對到 said）。
      </p>

      <ion-list inset class="opts">
        <ion-item>
          <ion-label class="ion-text-wrap">
            <h3>需要全部關鍵字都出現</h3>
            <p>關閉時任一個出現就符合。例如「🐈‍⬛ + 🐿」要同時出現才算殼蘭。</p>
          </ion-label>
          <ion-toggle
            slot="end"
            :checked="matchMode === 'all'"
            aria-label="需要全部關鍵字都出現"
            @ion-change="matchMode = $event.detail.checked ? 'all' : 'any'"
          />
        </ion-item>
        <ion-item lines="none">
          <ion-label>啟用這條規則</ion-label>
          <ion-toggle slot="end" v-model="enabled" aria-label="啟用這條規則" />
        </ion-item>
      </ion-list>

      <section class="preview tv-card" aria-live="polite">
        <strong>目前收藏中符合 {{ preview.count }} 篇</strong>
        <ul v-if="preview.samples.length" class="tv-muted">
          <li v-for="(s, i) in preview.samples" :key="i">{{ s || '（沒有內文）' }}</li>
        </ul>
        <p v-if="targetType === 'folder'" class="tv-muted small">
          資料夾規則依清單順序比對，每篇只會放進第一個符合的資料夾；已經在資料夾裡的收藏不會被移動。
        </p>
      </section>

      <ion-button v-if="rule" expand="block" fill="clear" color="danger" class="delete" @click="emit('remove')">
        <ion-icon slot="start" :icon="trashOutline" />刪除這條規則
      </ion-button>
    </ion-content>
  </ion-modal>
</template>

<style scoped>
.field {
  margin-top: 16px;
}
.hint {
  font-size: 13px;
  margin: 6px 0 0;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.chip {
  border: 1px solid var(--tv-border);
  background: var(--tv-surface);
  color: inherit;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 13px;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--ion-color-primary);
}
.opts {
  margin: 16px 0;
}
.preview {
  padding: 12px 14px;
}
.preview ul {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.6;
}
.small {
  font-size: 12px;
  margin: 8px 0 0;
}
.delete {
  margin-top: 16px;
}
</style>
