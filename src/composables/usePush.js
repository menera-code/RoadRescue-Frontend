const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function enablePush(responderId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push is not supported on this browser.');
    return;
  }

  // iOS Check
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
    // Fetch public key from backend
    const { key } = await fetch(`${API}/api/push/vapid-public-key`).then((r) => r.json());
    
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    // Send to backend
    await fetch(`${API}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responder_id: responderId, subscription: sub.toJSON() }),
    });
    
    alert('Push notifications enabled successfully!');
  } catch (error) {
    console.error('Push subscription failed:', error);
    alert('Failed to enable push notifications. Check the console for details.');
  }
}
