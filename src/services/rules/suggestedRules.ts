import type { AutoRuleMatchMode, AutoRuleTarget } from '@/shared/types/models';

export interface SuggestedRule {
  targetType: AutoRuleTarget;
  targetName: string;
  keywords: string[];
  matchMode?: AutoRuleMatchMode;
}

/**
 * 建議規則：依照目前收藏的整理方式產生，可在「自動分類規則」頁一鍵載入後自行修改。
 * 資料夾規則的順序很重要，越前面越優先（每篇只會被放進第一個符合的資料夾）。
 */
export const SUGGESTED_RULES: SuggestedRule[] = [
  // ── 資料夾（依優先順序） ──
  {
    targetType: 'folder',
    targetName: '同人創作（圖・文・剪輯）',
    keywords: ['archiveofourown', '同人', '電繪', '插畫', '桌布', '頭貼', '頭像', '許願小圖', '畫了', '畫完'],
  },
  { targetType: 'folder', targetName: '殼蘭 🐈‍⬛🐿️', keywords: ['殼蘭', '壳兰', '殼兰', '壳蘭'] },
  { targetType: 'folder', targetName: '殼蘭 🐈‍⬛🐿️', keywords: ['🐈‍⬛', '🐿️'], matchMode: 'all' },
  { targetType: 'folder', targetName: '電競・賽事與分析', keywords: ['BP', '賽評', '解說', '觀賽', '敗採', '戰術', '數據', '採訪', '主播'] },
  {
    targetType: 'folder',
    targetName: '電競・選手日常',
    keywords: [
      'T1', '踢萬', 'LCK', '英雄聯盟', 'Faker', '李相赫', 'Doran', '崔多蘭', '崔玄準', '蘭尼', 'Keria', '柳岷析', '岷析',
      'Oner', '文炫竣', 'Peyz', '金修奐', '修奐', 'Gumayusi', '李珉炯', '珉炯', 'Canyon', '選手', '🐈‍⬛', '🐿️', '🐨',
      '殼', '蘭', '蕊', '小佩', '小K', '小文', '文歐', '姑媽', '部長', '相赫', '玄準', '主場日', 'MSI', '世界賽', '直播',
      '峽谷', '上路', '下路', '中路', '輔助', '打野', 'ADC', '排位', '🐯', '🐶', '🐻', '🦖', '🪷', '🔫', '🍄',
    ],
  },
  {
    targetType: 'folder',
    targetName: '美食',
    keywords: ['餐廳', '好吃', '美食', '燒肉', '咖啡廳', '吃到飽', '甜點', '料理', '義大利麵', '冰淇淋'],
  },
  {
    targetType: 'folder',
    targetName: '美妝・穿搭',
    keywords: ['美甲', '指甲', '底妝', '粉底', '香水', '保養', '穿搭', '妝', '身體乳'],
  },
  {
    targetType: 'folder',
    targetName: '遊戲（寶可夢・楓之谷等）',
    keywords: ['寶可夢', 'Pokemon', '楓之谷', '帕魯', 'Palworld', '星露谷', '動森'],
  },
  {
    targetType: 'folder',
    targetName: '科技・AI・實用工具',
    keywords: ['AI', 'prompt', 'GPT', 'ChatGPT', 'Claude', 'GitHub', 'App Store', '擴充功能', 'side project'],
  },
  {
    targetType: 'folder',
    targetName: '生活・居家好物',
    keywords: ['貓砂', '鍵盤', '買房', '驗屋', '廚房', '收納', '代購', '集運', '除臭'],
  },
  { targetType: 'folder', targetName: '動物・療癒', keywords: ['貓咪', '狗狗', '兔子', '寵物', '馬爾濟斯', '刺蝟'] },

  // ── 選手標籤 ──
  { targetType: 'tag', targetName: 'Faker', keywords: ['Faker', '李相赫', '相赫', '殼', '赫咪', '部長', '🐈‍⬛', 'hide on bush'] },
  { targetType: 'tag', targetName: 'Doran', keywords: ['Doran', '崔多蘭', '崔玄準', '玄準', '蘭', '🐿️', '도란'] },
  { targetType: 'tag', targetName: 'Oner', keywords: ['Oner', '文炫竣', '小文', '文歐', '🐯'] },
  { targetType: 'tag', targetName: 'Keria', keywords: ['Keria', '柳岷析', '岷析', '蕊', '🐶'] },
  { targetType: 'tag', targetName: 'Peyz', keywords: ['Peyz', '金修奐', '修奐', '小佩', '佩子', '🐨'] },
  { targetType: 'tag', targetName: 'Gumayusi', keywords: ['Gumayusi', 'Guma', '李珉炯', '珉炯', '姑媽', '🐻'] },
  { targetType: 'tag', targetName: 'Canyon', keywords: ['Canyon', '金建夫', '金建敷', '🐻‍❄️'] },

  // ── CP 標籤 ──
  { targetType: 'tag', targetName: '殼蘭', keywords: ['殼蘭', '壳兰', '殼兰', '壳蘭'] },
  { targetType: 'tag', targetName: '殼蘭', keywords: ['🐈‍⬛', '🐿️'], matchMode: 'all' },
  { targetType: 'tag', targetName: '佩蕊', keywords: ['佩蕊'] },
  { targetType: 'tag', targetName: '姑蕊', keywords: ['姑蕊'] },
  { targetType: 'tag', targetName: '文蘭', keywords: ['文蘭'] },
  { targetType: 'tag', targetName: '蕊蘭', keywords: ['蕊蘭', '蕊蕊蘭蘭'] },
  { targetType: 'tag', targetName: '佩蘭', keywords: ['佩蘭'] },
  { targetType: 'tag', targetName: '下路組', keywords: ['下路組', '下路雙人組'] },

  // ── 其他標籤 ──
  { targetType: 'tag', targetName: '中字翻譯', keywords: ['中字', '翻譯'] },
  { targetType: 'tag', targetName: '同人文', keywords: ['archiveofourown', '同人文'] },
  { targetType: 'tag', targetName: '桌布・頭貼', keywords: ['桌布', '頭貼', '頭像'] },
  { targetType: 'tag', targetName: '高雄', keywords: ['高雄', '楠梓', '左營', '鳳山'] },
  { targetType: 'tag', targetName: '楠梓', keywords: ['楠梓'] },
  { targetType: 'tag', targetName: '台中', keywords: ['台中', '臺中'] },
  { targetType: 'tag', targetName: '寶可夢', keywords: ['寶可夢', 'Pokemon'] },
  { targetType: 'tag', targetName: '楓之谷', keywords: ['楓之谷'] },
  { targetType: 'tag', targetName: '求推薦・問答', keywords: ['求推薦', '有推薦', '推薦嗎', '請問', '想請問'] },
  {
    targetType: 'tag',
    targetName: '廣告業配',
    keywords: ['折扣碼', '限量', '買1送1', '免費試用', '下單', '優惠', '團購', '現貨', 'reurl.cc', 'pse.is', 'lihi', '1shop', '.shop/'],
  },
];
