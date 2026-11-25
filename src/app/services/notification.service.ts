import { Injectable } from '@angular/core';

const ICON = '/icons/icon-192x192.svg';
const BADGE = '/icons/icon-72x72.svg';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  get supported(): boolean {
    return 'Notification' in window;
  }

  get permission(): NotificationPermission | 'unsupported' {
    return this.supported ? Notification.permission : 'unsupported';
  }

  async enable(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.supported) return 'unsupported';

    if (Notification.permission === 'granted') {
      await this.show('UTEQGram', { body: '¡Las notificaciones ya están activadas! 👍' });
      return 'granted';
    }
    if (Notification.permission === 'denied') return 'denied';

    // Debe llamarse desde un gesto del usuario (click).
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await this.show('Notificaciones activadas', {
        body: 'Te avisaremos cuando haya novedades en UTEQGram.',
      });
    }
    return permission;
  }

  async show(
    title: string,
    options: { body?: string; url?: string; tag?: string } = {},
  ): Promise<void> {
    const notificationOptions: NotificationOptions & { vibrate: number[] } = {
      body: options.body || '',
      icon: ICON,
      badge: BADGE,
      vibrate: [100, 50, 100],
      tag: options.tag || 'uteqgram',
      data: { url: options.url || '/' },
    };

    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, notificationOptions);
        return;
      } catch (error) {
        console.warn('[Notificaciones] Error con el Service Worker', error);
      }
    }

    try {
      new Notification(title, notificationOptions);
    } catch (error) {
      console.warn('[Notificaciones] No se pudo mostrar', error);
    }
  }
}
