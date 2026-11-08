const API = import.meta.env.VITE_API_BASE || 'https://your-backend-url.onrender.com';

function urlBase64ToUint8Array(base64String) {
  // Strip whitespace and padding for iOS Safari
  const cleanBase64 = base64String.replace(/\s+/g, '').replace(/=/g, '');
  const padding = '='.repeat((4 - (cleanBase64.length % 4)) % 4);
  const base64 = (cleanBase64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(responderId) {
  if (!('serviceWorker' in navigator)) {
    alert('Push is not supported: Service Worker missing.');
    return;
  }

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIOS && !window.navigator.standalone) {
    alert('On iPhone: Tap Share → Add to Home Screen, open the app from the icon, then click Enable Push again.');
    return;
  }

  try {
    // Force register the service worker (fixes iOS lazy-loading issue)
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;

    // Check for PushManager AFTER the service worker is ready
    if (!('PushManager' in window)) {
      alert('PushManager is missing. You may need to update your iPhone to iOS 16.4 or later.');
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert('Notification permission was denied.');
      return;
    }

    const { key } = await fetch(`${API}/api/push/vapid-public-key`).then((r) => r.json());
    
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await fetch(`${API}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responder_id: responderId, subscription: sub.toJSON() }),
    });
    
    alert('Push notifications enabled successfully!');
  } catch (error) {
    console.error('Push subscription failed:', error);
    alert('Failed to enable push. Error: ' + error.message);
  }
}
