/* OtherMe service worker.
 *
 * Deliberately minimal: this exists to receive web push and to make the app
 * installable. It does not cache aggressively — stale relationship data is
 * worse than a spinner.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "OtherMe", body: event.data ? event.data.text() : "" };
  }

  const {
    title = "OtherMe",
    body = "",
    url = "/",
    tag,
    renotify = false,
    icon = "/icons/icon-192.png",
    badge = "/icons/badge.png",
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      renotify,
      data: { url },
      vibrate: [40, 60, 40],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if the app is already open.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
