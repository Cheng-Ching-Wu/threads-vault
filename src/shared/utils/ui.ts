import { alertController, toastController } from '@ionic/vue';

export async function toast(message: string, color: 'success' | 'danger' | 'warning' | 'medium' = 'medium'): Promise<void> {
  const t = await toastController.create({ message, color, duration: 2500, position: 'top' });
  await t.present();
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function toastError(e: unknown, prefix = '操作失敗'): Promise<void> {
  await toast(`${prefix}：${errorMessage(e)}`, 'danger');
}

/** 顯示確認對話框，按下確認時回傳 true */
export async function confirm(options: {
  header: string;
  message: string;
  confirmText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: options.confirmText ?? '確定', role: options.destructive ? 'destructive' : 'confirm' },
    ],
  });
  await alert.present();
  const { role } = await alert.onDidDismiss();
  return role === 'confirm' || role === 'destructive';
}

/** 單一文字輸入對話框，取消時回傳 null */
export async function prompt(options: { header: string; placeholder?: string; value?: string; confirmText?: string }) {
  const alert = await alertController.create({
    header: options.header,
    inputs: [{ name: 'value', type: 'text', placeholder: options.placeholder, value: options.value ?? '' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: options.confirmText ?? '確定', role: 'confirm' },
    ],
  });
  await alert.present();
  const { role, data } = await alert.onDidDismiss<{ values: { value: string } }>();
  if (role !== 'confirm') return null;
  return data?.values.value ?? '';
}
