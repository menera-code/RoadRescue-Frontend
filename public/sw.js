self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'RoadRescue', {
      body: data.body || 'New incident assigned',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: data.data || {},
      requireInteraction: true, // Keeps it on screen until tapped
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
      return clients.openWindow(url);
    })
  );
});

// 👇 THIS KEEPS iOS FROM SLEEPING THE SERVICE WORKER
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-incidents') {
    event.waitUntil(fetch('https://roadrescue-backend-swdv.onrender.com/health'));
  }
});
