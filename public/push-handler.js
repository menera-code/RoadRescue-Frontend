self.addEventListener('push', (event) => {
    let data = {
        title: 'RoadRescue',
        body: 'A new incident has been assigned to you.',
        url: '/'
    };

    if (event.data) {
        try {
            data = { ...data, ...event.data.json() };
        } catch (error) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {
            url: data.url || '/'
        },
        requireInteraction: true,
        tag: data.tag || 'roadrescue-incident'
    };

    event.waitUntil(
        self.registration.showNotification(
            data.title || 'RoadRescue',
            options
        )
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl =
        event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }

            return clients.openWindow(targetUrl);
        })
    );
});
