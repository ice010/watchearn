const crypto = require('crypto');

// Verifies AdMob rewarded-ad server-side verification (SSV) callbacks.
// https://developers.google.com/admob/android/ssv
let cache = { keys: null, fetchedAt: 0 };

async function getKeys(url) {
  if (cache.keys && Date.now() - cache.fetchedAt < 24 * 3600 * 1000) return cache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`verifier keys fetch failed: ${res.status}`);
  const body = await res.json();
  cache = { keys: new Map(body.keys.map((k) => [String(k.keyId), k.pem])), fetchedAt: Date.now() };
  return cache.keys;
}

// rawQuery is the query string without the leading "?". signature and key_id are always the last params.
async function verifySsv(rawQuery, keysUrl, keyProvider = getKeys) {
  const sigIdx = rawQuery.indexOf('&signature=');
  if (sigIdx < 0) return { ok: false, reason: 'missing signature' };
  const message = rawQuery.slice(0, sigIdx);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get('signature');
  const keyId = params.get('key_id');
  const keys = await keyProvider(keysUrl);
  const pem = keys.get(String(keyId));
  if (!pem) return { ok: false, reason: 'unknown key_id' };
  const ok = crypto.verify('sha256', Buffer.from(message), pem, Buffer.from(signature, 'base64url'));
  return ok ? { ok: true, params } : { ok: false, reason: 'bad signature' };
}

module.exports = { verifySsv, getKeys };
