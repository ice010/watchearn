// Delivers verification codes.
// - email: Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email)
// - sms / whatsapp: Twilio Messages API. WhatsApp OTPs need an approved "authentication" Content template.
// In sandbox mode nothing is sent; the code is logged and returned to the client so the flow can be tested.

async function sendEmail(cfg, to, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.email.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: cfg.email.from,
      to: [to],
      subject: `${code} is your WatchEarn verification code`,
      text: `Your WatchEarn verification code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`Email provider HTTP ${res.status}`);
}

async function sendTwilio(cfg, channel, phone, code) {
  const t = cfg.twilio;
  const form = new URLSearchParams();
  if (channel === 'whatsapp') {
    form.set('To', `whatsapp:${phone}`);
    form.set('From', `whatsapp:${t.whatsappFrom}`);
    if (t.whatsappContentSid) {
      form.set('ContentSid', t.whatsappContentSid);
      form.set('ContentVariables', JSON.stringify({ 1: code }));
    } else {
      form.set('Body', `Your WatchEarn code is ${code}`);
    }
  } else {
    form.set('To', phone);
    form.set('From', t.smsFrom);
    form.set('Body', `Your WatchEarn code is ${code}. It expires in 10 minutes.`);
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${t.accountSid}:${t.authToken}`).toString('base64')}` },
    body: form,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.message || `SMS provider HTTP ${res.status}`);
  }
}

// Returns { sandbox: true } when the code was not actually delivered.
async function sendCode(cfg, channel, target, code) {
  if (cfg.messagingMode !== 'live') {
    console.log(`[sandbox ${channel}] code for ${target}: ${code}`);
    return { sandbox: true };
  }
  if (channel === 'email') await sendEmail(cfg, target, code);
  else await sendTwilio(cfg, channel, target, code);
  return { sandbox: false };
}

module.exports = { sendCode };
