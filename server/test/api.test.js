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

let app, token, userId;
beforeEach(async () => {
  app = createApp({ db: openDb(':memory:'), config: { ...baseConfig }, keyProvider });
  const r = await request(app).post('/auth/register').send({ email: 'A@b.com', password: 'password123' });
  token = r.body.token; userId = r.body.user.id;
});
const authed = (req) => req.set('Authorization', `Bearer ${token}`);

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

  it('holds points, then pays on admin approval', async () => {
    await earn(2); // 1000 pts = $1
    const w = await authed(request(app).post('/withdrawals')).send({ method: 'paypal', amountUsd: 1, details: { email: 'x@y.com' } });
    expect(w.status).toBe(201);
    expect(w.body.withdrawal.status).toBe('pending_review');
    expect(w.body.wallet.points).toBe(0);
    const a = await request(app).post(`/admin/withdrawals/${w.body.withdrawal.id}/approve`).set('x-admin-token', 'admintoken');
    expect(a.body.withdrawal.status).toBe('paid');
  });

  it('rejects insufficient balance and refunds rejected withdrawals', async () => {
    await earn(2);
    const details = { accountName: 'Jane Doe', accountNumber: '255700000000', bankCode: 'MPS', currency: 'TZS' };
    expect((await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 2, details })).body.error).toBe('Insufficient balance');
    const w = await authed(request(app).post('/withdrawals')).send({ method: 'mobile_money', amountUsd: 1, details });
    await request(app).post(`/admin/withdrawals/${w.body.withdrawal.id}/reject`).set('x-admin-token', 'admintoken').send({ reason: 'test' });
    expect((await authed(request(app).get('/me'))).body.wallet.points).toBe(1000);
  });

  it('refunds when the provider fails', async () => {
    const failing = createApp({ db: openDb(':memory:'), config: { ...baseConfig, autoApproveWithdrawals: true }, keyProvider, payout: async () => { throw new Error('boom'); } });
    const r = await request(failing).post('/auth/register').send({ email: 'c@d.com', password: 'password123' });
    for (const t of ['x', 'y']) await request(failing).get(`/admob/ssv?${ssvQuery(r.body.user.id, t)}`);
    const w = await request(failing).post('/withdrawals').set('Authorization', `Bearer ${r.body.token}`).send({ method: 'paypal', amountUsd: 1, details: { email: 'x@y.com' } });
    expect(w.body.withdrawal.status).toBe('failed');
    expect(w.body.wallet.points).toBe(1000);
  });
});
