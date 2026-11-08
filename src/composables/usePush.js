const API = 'https://roadrescue-backend-swdv.onrender.com';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) {
    outputArray[i] = raw.charCodeAt(i);
  }
  
  // Safari iOS strict requirement: must be the raw 65-byte point, not SPKI
  if (outputArray.length === 91 && outputArray[0] === 0x30) {
    return outputArray.slice(26);
  }
  return outputArray;
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