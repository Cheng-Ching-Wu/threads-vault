import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

/* Ionic 必要樣式 */
import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';
/* 深色模式：以 .ion-palette-dark 類別切換（支援「跟隨系統 / 亮色 / 深色」） */
import '@ionic/vue/css/palettes/dark.class.css';

import './app/theme.css';

import App from './App.vue';
import { router } from './app/router';
import { initTheme } from './features/settings/theme';

initTheme();

const app = createApp(App).use(IonicVue, { mode: 'ios' }).use(createPinia()).use(router);

router.isReady().then(() => app.mount('#app'));
