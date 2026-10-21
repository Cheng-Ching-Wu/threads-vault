import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import TabsLayout from '@/app/layouts/TabsLayout.vue';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tabs/bookmarks' },
  {
    path: '/tabs/',
    component: TabsLayout,
    children: [
      { path: '', redirect: '/tabs/bookmarks' },
      { path: 'bookmarks', component: () => import('@/features/bookmarks/pages/BookmarksPage.vue') },
      { path: 'folders', component: () => import('@/features/folders/pages/FoldersPage.vue') },
      { path: 'settings', component: () => import('@/features/settings/pages/SettingsPage.vue') },
    ],
  },
  { path: '/bookmarks/:id', component: () => import('@/features/bookmarks/pages/BookmarkDetailPage.vue'), props: true },
  { path: '/folders/:id', component: () => import('@/features/folders/pages/FolderDetailPage.vue'), props: true },
  { path: '/import', component: () => import('@/features/imports/pages/ImportPage.vue') },
  { path: '/rules', component: () => import('@/features/rules/pages/AutoRulesPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/tabs/bookmarks' },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
