// Relays capture payloads to the local Listen app. Runs in the service
// worker because the page's CSP can block content-script fetches to localhost.
const LISTEN_URL = 'http://localhost:3000/api/capture';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'capture') return;
  fetch(LISTEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg.payload),
  })
    .then(async r => sendResponse({ ok: r.ok, data: await r.json() }))
    .catch(e => sendResponse({ ok: false, error: String(e) }));
  return true; // keep the message channel open for the async response
});
