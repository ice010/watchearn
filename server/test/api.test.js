const crypto = require('crypto');
const request = require('supertest');

const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const keyProvider = async () => new Map([['123', publicKey.export({ type: 'spki', format: 'pem' })]]);

function ssvQuery(userId, txn) {
  const msg = `ad_network=5450213213286189855&ad_unit=1234&custom_data=bbb&reward_amount=1&reward_item=points&timestamp=${Date.now()}&transaction_id=${txn}&user_id=${userId}`;
  const sig = crypto.sign('sha256', Buffer.from(msg), privateKey).toString('base64url');
  return `${msg}&signature=${sig}&key_id=123`;
}

const baseConfig = {
  jwtSecret: 'test', adminToken: 'admintoken', publicUrl: 'http://x',
  pointsPerAd: 500, pointsPerUsd: 1000, minWithdrawUsd: 1, maxAdsPerDay: 3,
  sandboxRewards: true, payoutMode: 'sandbox', autoApproveWithdrawals: false,
  flutterwave: {}, paypal: {},
};

const sent = [];
const messenger = async (_cfg, channel, target, code) => { sent.push({ channel, target, code }); return { sandbox: true }; };

async function signup(a, email) {
  const r = await request(a).post('/auth/register').send({ email, password: 'password123' });
  const v = await request(a).post('/auth/verify-email').send({ email, code: r.body.devCode });
  return v.body;
}
async function verifyPhone(a, tok, phone = '+255712345678') {
  const s = await request(a).post('/phone/start').set('Authorization', `Bearer ${tok}`).send({ phone, channel: 'whatsapp' });
  return request(a).post('/phone/verify').set('Authorization', `Bearer ${tok}`).send({ code: s.body.devCode });
}

let app, token, userId;
beforeEach(async () => {
  sent.length = 0;
  app = createApp({ db: openDb(':memory:'), config: { ...baseConfig }, keyProvider, messenger });
  const r = await signup(app, 'A@b.com');
  token = r.token; userId = r.user.id;
});
const authed = (req) => req.set('Authorization', `Bearer ${token}`);

describe('email verification', () => {
  it('requires the emailed code before issuing a token', async () => {
    const r = await request(app).post('/auth/register').send({ email: 'new@x.com', password: 'password123' });
    expect(r.status).toBe(201);
    expect(r.body.token).toBeUndefined();
    expect(sent.at(-1)).toMatchObject({ channel: 'email', target: 'new@x.com', code: r.body.devCode });

    const login = await request(app).post('/auth/login').send({ email: 'new@x.com', password: 'password123' });
    expect(login.status).toBe(403);
    expect(login.body.verificationRequired).toBe(true);

    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    expect((await request(app).post('/auth/verify-email').send({ email: 'new@x.com', code: wrong })).body.error).toBe('Wrong code');
    const ok = await request(app).post('/auth/verify-email').send({ email: 'new@x.com', code: r.body.devCode });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email_verified).toBe(true);
    expect((await request(app).get('/me').set('Authorization', `Bearer ${ok.body.token}`)).status).toBe(200);
  });

  it('locks a code after 5 wrong attempts and rate-limits resends', async () => {
    const r = await request(app).post('/auth/register').send({ email: 'lock@x.com', password: 'password123' });
    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await request(app).post('/auth/verify-email').send({ email: 'lock@x.com', code: wrong });
    const v = await request(app).post('/auth/verify-email').send({ email: 'lock@x.com', code: r.body.devCode });
    expect(v.body.error).toMatch(/Too many attempts/);
    expect((await request(app).post('/auth/resend-code').send({ email: 'lock@x.com' })).status).toBe(429);
  });
});

describe('phone verification', () => {
  it('verifies a phone by WhatsApp/SMS code and blocks reuse on another account', async () => {
    const bad = await authed(request(app).post('/phone/start')).send({ phone: '0712345678', channel: 'sms' });
    expect(bad.status).toBe(400);
    const v = await verifyPhone(app, token);
    expect(v.body.user).toMatchObject({ phone: '+255712345678', phone_verified: true });
    expect(sent.at(-1).channel).toBe('whatsapp');

    const other = await signup(app, 'other@x.com');
    const s = await request(app).post('/phone/start').set('Authorization', `Bearer ${other.token}`).send({ phone: '+255712345678' });
    expect(s.status).toBe(409);
  });
});

describe('auth', () => {
  it('logs in and rejects bad password', async () => {
    expect((await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'password123' })).status).toBe(200);
    expect((await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'nope12345' })).status).toBe(401);
    expect((await request(app).get('/me')).status).toBe(401);
  });
});

describe('AdMob SSV', () => {
  it('credits a valid callback once and rejects tampering', async () => {
    const q = ssvQuery(userId, 'tx1');
    expect((await request(app).get(`/admob/ssv?${q}`)).body).toEqual({ credited: true });
    expect((await request(app).get(`/admob/ssv?${q}`)).body).toEqual({ credited: false, reason: 'duplicate' });
    const tampered = q.replace('user_id=', 'user_id=9');
    expect((await request(app).get(`/admob/ssv?${tampered}`)).status).toBe(400);
    expect((await authed(request(app).get('/me'))).body.wallet.points).toBe(500);
  });

  it('enforces the daily ad cap', async () => {
    for (const t of ['a', 'b', 'c']) await request(app).get(`/admob/ssv?${ssvQuery(userId, t)}`);
    expect((await request(app).get(`/admob/ssv?${ssvQuery(userId, 'd')}`)).body.reason).toBe('daily_limit');
  });
});

describe('withdrawals', () => {
  async function earn(n) { for (let i = 0; i < n; i++) await request(app).get(`/admob/ssv?${ssvQuery(userId, `t${i}`)}`); }

  it('requires a verified phone, and mobile money must go to that phone', async () => {
    await earn(2);
    const details = { accountName: 'Jane Doe', accountNumber: '255700000000', bankCode: 'MPS', currency: 'TZS' };
    const r = await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 1, details });
    expect(r.status).toBe(403);
    expect(r.body.phoneVerificationRequired).toBe(true);
    await verifyPhone(app, token);
    expect((await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 1, details })).status).toBe(400);
    const ok = await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 1, details: { ...details, accountNumber: '255712345678' } });
    expect(ok.status).toBe(201);
  });

  it('holds points, then pays on admin approval', async () => {
    await earn(2);
    await verifyPhone(app, token); // 1000 pts = $1
    const w = await authed(request(app).post('/withdrawals')).send({ method: 'paypal', amountUsd: 1, details: { email: 'x@y.com' } });
    expect(w.status).toBe(201);
    expect(w.body.withdrawal.status).toBe('pending_review');
    expect(w.body.wallet.points).toBe(0);
    const a = await request(app).post(`/admin/withdrawals/${w.body.withdrawal.id}/approve`).set('x-admin-token', 'admintoken');
    expect(a.body.withdrawal.status).toBe('paid');
  });

  it('rejects insufficient balance and refunds rejected withdrawals', async () => {
    await earn(2);
    await verifyPhone(app, token);
    const details = { accountName: 'Jane Doe', accountNumber: '255712345678', bankCode: 'MPS', currency: 'TZS' };
    expect((await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 2, details })).body.error).toBe('Insufficient balance');
    const w = await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 1, details });
    await request(app).post(`/admin/withdrawals/${w.body.withdrawal.id}/reject`).set('x-admin-token', 'admintoken').send({ reason: 'test' });
    expect((await authed(request(app).get('/me'))).body.wallet.points).toBe(1000);
  });

  it('refunds when the provider fails', async () => {
    const failing = createApp({ db: openDb(':memory:'), config: { ...baseConfig, autoApproveWithdrawals: true }, keyProvider, messenger, payout: async () => { throw new Error('boom'); } });
    const r = { body: await signup(failing, 'c@d.com') };
    await verifyPhone(failing, r.body.token);
    for (const t of ['x', 'y']) await request(failing).get(`/admob/ssv?${ssvQuery(r.body.user.id, t)}`);
    const w = await request(failing).post('/withdrawals').set('Authorization', `Bearer ${r.body.token}`).send({ method: 'paypal', amountUsd: 1, details: { email: 'x@y.com' } });
    expect(w.body.withdrawal.status).toBe('failed');
    expect(w.body.wallet.points).toBe(1000);
  });
});
