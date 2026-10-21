<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { logoGoogle } from 'ionicons/icons';
import {
  cloudErrorMessage,
  googleSignInAvailable,
  isUserCancel,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/services/cloud/authService';
import { toast } from '@/shared/utils/ui';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ dismiss: []; signedIn: [] }>();

const mode = ref<'signin' | 'signup'>('signin');
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    password.value = '';
    error.value = null;
    busy.value = false;
  },
);

const canSubmit = computed(() => email.value.trim().length > 3 && password.value.length > 0 && !busy.value);

async function run(fn: () => Promise<void>) {
  busy.value = true;
  error.value = null;
  try {
    await fn();
    emit('signedIn');
  } catch (e) {
    if (!isUserCancel(e)) error.value = cloudErrorMessage(e);
  } finally {
    busy.value = false;
  }
}

const google = () => run(signInWithGoogle);
const submit = () => {
  if (!canSubmit.value) return;
  return run(() =>
    mode.value === 'signin' ? signInWithEmail(email.value, password.value) : signUpWithEmail(email.value, password.value),
  );
};

async function forgot() {
  if (!email.value.trim()) {
    error.value = '請先輸入 Email，再按「忘記密碼」';
    return;
  }
  try {
    await resetPassword(email.value);
    await toast('已寄出重設密碼的信，請查看信箱', 'success');
  } catch (e) {
    error.value = cloudErrorMessage(e);
  }
}
</script>

<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('dismiss')">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-button @click="emit('dismiss')">取消</ion-button></ion-buttons>
        <ion-title>雲端同步</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p class="intro tv-muted">
        登入後，收藏會存在你的 Firebase 雲端資料庫，手機和電腦登入同一個帳號就能看到同一份收藏。只有你自己的帳號能讀寫這些資料。
      </p>

      <template v-if="googleSignInAvailable">
        <ion-button expand="block" fill="outline" :disabled="busy" @click="google">
          <ion-icon slot="start" :icon="logoGoogle" aria-hidden="true" />使用 Google 帳號登入
        </ion-button>
        <div class="divider tv-muted"><span>或使用 Email</span></div>
      </template>
      <p v-else class="note tv-muted">App 版的 Google 登入還在開發中，目前請使用 Email 登入。</p>

      <ion-segment v-model="mode" aria-label="登入或註冊">
        <ion-segment-button value="signin"><ion-label>登入</ion-label></ion-segment-button>
        <ion-segment-button value="signup"><ion-label>註冊新帳號</ion-label></ion-segment-button>
      </ion-segment>

      <form class="form" @submit.prevent="submit">
        <ion-input
          v-model="email"
          type="email"
          label="Email"
          label-placement="stacked"
          autocomplete="email"
          inputmode="email"
          placeholder="you@example.com"
        />
        <ion-input
          v-model="password"
          type="password"
          label="密碼"
          label-placement="stacked"
          :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
          :placeholder="mode === 'signup' ? '至少 6 個字元' : ''"
          @keyup.enter="submit"
        />
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <ion-button expand="block" type="submit" :disabled="!canSubmit">
          <ion-spinner v-if="busy" name="crescent" />
          <template v-else>{{ mode === 'signin' ? '登入' : '建立帳號並登入' }}</template>
        </ion-button>
        <ion-button v-if="mode === 'signin'" expand="block" fill="clear" size="small" @click="forgot">忘記密碼</ion-button>
      </form>
    </ion-content>
  </ion-modal>
</template>

<style scoped>
.intro {
  font-size: 14px;
  line-height: 1.6;
  margin-top: 0;
}
.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  margin: 20px 0 12px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--tv-border);
}
.note {
  font-size: 13px;
}
.form {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.error {
  color: var(--ion-color-danger);
  font-size: 14px;
  margin: 0;
}
</style>
