// Payout providers. All amounts are USD.
// - paypal: PayPal Payouts API (email), available in 200+ countries.
// - bank / mobile_money: Flutterwave Transfers API (bank accounts and mobile money in Africa, plus USD/EUR/GBP banks).

async function flutterwaveRequest(cfg, method, path, body) {
  const res = await fetch(`${cfg.flutterwave.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${cfg.flutterwave.secretKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== 'success') throw new Error(json.message || `Flutterwave HTTP ${res.status}`);
  return json.data;
}

async function payFlutterwave(cfg, w, d) {
  const currency = (d.currency || 'USD').toUpperCase();
  let amount = w.amount_usd;
  if (currency !== 'USD') {
    const rate = await flutterwaveRequest(
      cfg, 'GET',
      `/transfers/rates?amount=${amount}&destination_currency=${currency}&source_currency=USD`,
    );
    amount = Math.floor(Number(rate.destination.amount) * 100) / 100;
  }
  const data = await flutterwaveRequest(cfg, 'POST', '/transfers', {
    account_bank: d.bankCode, // bank code, or mobile money network code e.g. "MPS" (M-Pesa)
    account_number: d.accountNumber, // bank account or phone number in international format
    amount,
    currency,
    debit_currency: 'USD',
    beneficiary_name: d.accountName,
    narration: 'WatchEarn payout',
    reference: `watchearn-${w.id}-${Date.now()}`,
    callback_url: `${cfg.publicUrl}/api/webhooks/flutterwave`,
  });
  return { providerRef: String(data.id), status: 'processing' };
}

async function paypalToken(cfg) {
  const res = await fetch(`${cfg.paypal.baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${cfg.paypal.clientId}:${cfg.paypal.clientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || `PayPal auth HTTP ${res.status}`);
  return json.access_token;
}

async function payPaypal(cfg, w, d) {
  const token = await paypalToken(cfg);
  const res = await fetch(`${cfg.paypal.baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: `watchearn-${w.id}`, email_subject: 'You have a payout from WatchEarn' },
      items: [{
        recipient_type: 'EMAIL',
        amount: { value: w.amount_usd.toFixed(2), currency: 'USD' },
        receiver: d.email,
        note: 'Thanks for watching!',
        sender_item_id: String(w.id),
      }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `PayPal HTTP ${res.status}`);
  return { providerRef: json.batch_header.payout_batch_id, status: 'processing' };
}

async function sendPayout(cfg, withdrawal) {
  const details = JSON.parse(withdrawal.details);
  if (cfg.payoutMode !== 'live') {
    return { providerRef: `sandbox-${withdrawal.id}`, status: 'paid' };
  }
  if (withdrawal.method === 'paypal') return payPaypal(cfg, withdrawal, details);
  return payFlutterwave(cfg, withdrawal, details);
}

module.exports = { sendPayout };
