import {
  airplaneOutline,
  bookOutline,
  bookmarkOutline,
  briefcaseOutline,
  bulbOutline,
  cartOutline,
  codeSlashOutline,
  filmOutline,
  fitnessOutline,
  folderOutline,
  gameControllerOutline,
  heartOutline,
  musicalNotesOutline,
  restaurantOutline,
  schoolOutline,
  starOutline,
} from 'ionicons/icons';

/** 只打包用得到的圖示，避免整包 ionicons 進入 bundle */
const ICONS: Record<string, string> = {
  'folder-outline': folderOutline,
  'bookmark-outline': bookmarkOutline,
  'star-outline': starOutline,
  'heart-outline': heartOutline,
  'bulb-outline': bulbOutline,
  'book-outline': bookOutline,
  'code-slash-outline': codeSlashOutline,
  'restaurant-outline': restaurantOutline,
  'airplane-outline': airplaneOutline,
  'cart-outline': cartOutline,
  'school-outline': schoolOutline,
  'briefcase-outline': briefcaseOutline,
  'musical-notes-outline': musicalNotesOutline,
  'game-controller-outline': gameControllerOutline,
  'fitness-outline': fitnessOutline,
  'film-outline': filmOutline,
};

export function folderIcon(name: string): string {
  return ICONS[name] ?? folderOutline;
}
