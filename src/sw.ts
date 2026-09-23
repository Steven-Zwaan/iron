/// <reference lib="webworker" />
/**
 * Service worker (§11.3). Precache the whole app shell so a cold launch works with
 * the network off. AI calls (/api/*) are never cached. Also carries the best-effort
 * background rest notification.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

let restTimer: ReturnType<typeof setTimeout> | null = null;

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; endsAt?: number; title?: string; body?: string } | undefined;
  if (!data?.type) return;
  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }
  if (data.type === 'REST_CANCEL') {
    if (restTimer) clearTimeout(restTimer);
    restTimer = null;
    void self.registration.getNotifications({ tag: 'iron-rest' }).then((ns) => ns.forEach((n) => n.close()));
    return;
  }
  if (data.type === 'REST_SCHEDULE' && data.endsAt) {
    if (restTimer) clearTimeout(restTimer);
    const delay = Math.max(0, data.endsAt - Date.now());
    restTimer = setTimeout(() => {
      restTimer = null;
      void self.clients.matchAll({ type: 'window' }).then((clients) => {
        const visible = clients.some((c) => c.visibilityState === 'visible');
        if (visible) return; // the page itself chimes
        return self.registration.showNotification(data.title ?? 'Rest over', {
          body: data.body ?? '',
          tag: 'iron-rest',
          vibrate: [120, 70, 120],
        } as NotificationOptions);
      });
    }, delay);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const c = clients[0];
      if (c) return c.focus();
      return self.clients.openWindow('/#/runner');
    }),
  );
});
