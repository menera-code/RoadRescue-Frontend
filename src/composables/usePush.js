const API = 'https://roadrescue-backend-swdv.onrender.com';

function urlBase64ToUint8Array(base64String) {
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
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;

    if (!('PushManager' in window)) {
      alert('PushManager is missing. You may need to update your iPhone to iOS 16.4 or later.');
      return;
    }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert('Notification permission was denied.');
      return;
    }

    // Let's explicitly test the fetch to catch the error
    let key;
    try {
      const res = await fetch(`${API}/api/push/vapid-public-key`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      key = data.key;
    } catch (err) {
      alert('Network error fetching key. CORS or offline? Error: ' + err.message);
      return;
    }
    
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    try {
      await fetch(`${API}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responder_id: responderId, subscription: sub.toJSON() }),
      });
    } catch (err) {
      alert('Network error saving subscription. CORS? Error: ' + err.message);
      return;
    }
    
    alert('Push notifications enabled successfully!');
  } catch (error) {
    console.error('Push subscription failed:', error);
    alert('Failed to enable push. Error: ' + error.message);
  }
}
