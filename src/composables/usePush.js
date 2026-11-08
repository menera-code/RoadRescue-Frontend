const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function urlBase64ToUint8Array(base64String) {
  // Aggressively strip whitespace and padding (=) to satisfy strict iOS Safari rules
  const cleanBase64 = base64String.replace(/\s+/g, '').replace(/=/g, '');
  const padding = '='.repeat((4 - (cleanBase64.length % 4)) % 4);
  const base64 = (cleanBase64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(responderId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push is not supported on this browser.');
    return;
  }

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (isIOS && !window.navigator.standalone) {
    alert('On iPhone: Tap Share → Add to Home Screen, open the app from the icon, then click Enable Push again.');
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    alert('Notification permission was denied.');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await fetch(`${API}/api/push/vapid-public-key`).then((r) => r.json());
    
    // Pass the key to our cleaner function
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
