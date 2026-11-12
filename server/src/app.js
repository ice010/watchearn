const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { catalog } = require('./catalog');
const { verifySsv } = require('./admobSsv');
const { sendPayout } = require('./payouts');

function createApp({ db, config, keyProvider, payout = sendPayout }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json());

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT id, email, name, country, created_at FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (email, password_hash, name, country) VALUES (?, ?, ?, ?)'),
    balance: db.prepare('SELECT COALESCE(SUM(delta), 0) AS points FROM ledger WHERE user_id = ?'),
    adsToday: db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND kind IN ('ad', 'sandbox_ad') AND created_at >= datetime('now', 'start of day')`),
    insertLedger: db.prepare('INSERT OR IGNORE INTO ledger (user_id, delta, kind, ref, note) VALUES (?, ?, ?, ?, ?)'),
    history: db.prepare('SELECT delta, kind, note, created_at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50'),
    insertWithdrawal: db.prepare('INSERT INTO withdrawals (user_id, points, amount_usd, method, details, status) VALUES (?, ?, ?, ?, ?, ?)'),
    withdrawalById: db.prepare('SELECT * FROM withdrawals WHERE id = ?'),
    withdrawalByRef: db.prepare('SELECT * FROM withdrawals WHERE provider_ref = ?'),
    userWithdrawals: db.prepare('SELECT id, points, amount_usd, method, status, error, created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC'),
    pendingWithdrawals: db.prepare(`SELECT w.*, u.email FROM withdrawals w JOIN users u ON u.id = w.user_id WHERE status = 'pending_review' ORDER BY w.id`),
    setWithdrawal: db.prepare(`UPDATE withdrawals SET status = ?, provider_ref = COALESCE(?, provider_ref), error = ?, updated_at = datetime('now') WHERE id = ?`),
  };

  const sign = (user) => jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '30d' });
  const usd = (points) => Math.floor((points / config.pointsPerUsd) * 100) / 100;
  const summary = (userId) => {
    const points = q.balance.get(userId).points;
    return { points, usd: usd(points), adsToday: q.adsToday.get(userId).n, maxAdsPerDay: config.maxAdsPerDay };
  };

  function auth(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    try {
      req.userId = jwt.verify(token, config.jwtSecret).sub;
      if (!q.userById.get(req.userId)) throw new Error('no user');
      next();
    } catch {
      res.status(401).json({ error: 'Unauthorized' });
    }
  }

  function admin(req, res, next) {
    const t = req.headers['x-admin-token'] || '';
    const ok = config.adminToken && t.length === config.adminToken.length &&
      crypto.timingSafeEqual(Buffer.from(t), Buffer.from(config.adminToken));
    return ok ? next() : res.status(401).json({ error: 'Unauthorized' });
  }

  function creditAd(userId, kind, ref, note) {
    if (q.adsToday.get(userId).n >= config.maxAdsPerDay) return { credited: false, reason: 'daily_limit' };
    const r = q.insertLedger.run(userId, config.pointsPerAd, kind, ref, note);
    return r.changes ? { credited: true } : { credited: false, reason: 'duplicate' };
  }

  async function processWithdrawal(w) {
    try {
      const r = await payout(config, w);
      q.setWithdrawal.run(r.status, r.providerRef, null, w.id);
    } catch (e) {
      failWithdrawal(w, e.message);
    }
    return q.withdrawalById.get(w.id);
  }

  function failWithdrawal(w, error) {
    db.transaction(() => {
      q.setWithdrawal.run('failed', null, error, w.id);
      q.insertLedger.run(w.user_id, w.points, 'refund', `w${w.id}`, `Refund: ${error}`);
    })();
  }

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.get('/config', (_req, res) => res.json({
    pointsPerAd: config.pointsPerAd,
    pointsPerUsd: config.pointsPerUsd,
    minWithdrawUsd: config.minWithdrawUsd,
    maxAdsPerDay: config.maxAdsPerDay,
    sandboxRewards: config.sandboxRewards,
    payoutMode: config.payoutMode,
    payoutMethods: ['paypal', 'bank', 'mobile_money'],
  }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });
  const credentials = z.object({
    email: z.string().email().transform((s) => s.toLowerCase()),
    password: z.string().min(8),
    name: z.string().max(80).optional(),
    country: z.string().max(2).optional(),
  });

  app.post('/auth/register', authLimiter, (req, res) => {
    const p = credentials.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Valid email and 8+ character password required' });
    if (q.userByEmail.get(p.data.email)) return res.status(409).json({ error: 'Email already registered' });
    const r = q.insertUser.run(p.data.email, bcrypt.hashSync(p.data.password, 10), p.data.name || null, p.data.country || null);
    const user = q.userById.get(r.lastInsertRowid);
    res.status(201).json({ token: sign(user), user });
  });

  app.post('/auth/login', authLimiter, (req, res) => {
    const p = credentials.pick({ email: true, password: true }).safeParse(req.body);
    const u = p.success && q.userByEmail.get(p.data.email);
    if (!u || !bcrypt.compareSync(p.data.password, u.password_hash)) return res.status(401).json({ error: 'Wrong email or password' });
    res.json({ token: sign(u), user: q.userById.get(u.id) });
  });

  app.get('/me', auth, (req, res) => res.json({ user: q.userById.get(req.userId), wallet: summary(req.userId) }));

  app.get('/videos', (req, res) => {
    const type = req.query.type;
    res.json({ videos: type ? catalog.filter((v) => v.type === type) : catalog });
  });

  app.get('/wallet', auth, (req, res) => res.json({
    wallet: summary(req.userId),
    history: q.history.all(req.userId),
    withdrawals: q.userWithdrawals.all(req.userId),
  }));

  // AdMob calls this after a rewarded ad completes. user_id is set by the app via serverSideVerificationOptions.
  app.get('/admob/ssv', async (req, res) => {
    const raw = req.originalUrl.split('?')[1] || '';
    try {
      const v = await verifySsv(raw, config.admobVerifierKeysUrl, keyProvider);
      if (!v.ok) return res.status(400).json({ error: v.reason });
      const userId = Number(v.params.get('user_id'));
      if (!q.userById.get(userId)) return res.status(200).json({ credited: false, reason: 'unknown_user' });
      const r = creditAd(userId, 'ad', v.params.get('transaction_id'), `Ad reward (${v.params.get('custom_data') || 'video'})`);
      res.json(r);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Dev/web-preview only: credits a simulated ad. Disabled when SANDBOX_REWARDS=false.
  const sandboxLimiter = rateLimit({ windowMs: 10 * 1000, limit: 1, keyGenerator: (req) => String(req.userId) });
  app.post('/rewards/sandbox', auth, sandboxLimiter, (req, res) => {
    if (!config.sandboxRewards) return res.status(403).json({ error: 'Sandbox rewards disabled' });
    const r = creditAd(req.userId, 'sandbox_ad', crypto.randomUUID(), `Ad reward (${String(req.body.videoId || 'video').slice(0, 40)})`);
    res.json({ ...r, wallet: summary(req.userId) });
  });

  const withdrawalSchema = z.discriminatedUnion('method', [
    z.object({ method: z.literal('paypal'), amountUsd: z.number().positive(), details: z.object({ email: z.string().email() }) }),
    z.object({
      method: z.enum(['bank', 'mobile_money']),
      amountUsd: z.number().positive(),
      details: z.object({
        accountName: z.string().min(2).max(100),
        accountNumber: z.string().min(5).max(34),
        bankCode: z.string().min(2).max(20),
        currency: z.string().length(3),
        country: z.string().length(2).optional(),
      }),
    }),
  ]);

  app.post('/withdrawals', auth, async (req, res) => {
    const p = withdrawalSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Invalid withdrawal details', issues: p.error.issues });
    const { method, amountUsd, details } = p.data;
    if (amountUsd < config.minWithdrawUsd) return res.status(400).json({ error: `Minimum withdrawal is $${config.minWithdrawUsd}` });
    const points = Math.round(amountUsd * config.pointsPerUsd);

    const create = db.transaction(() => {
      if (q.balance.get(req.userId).points < points) return null;
      const status = config.autoApproveWithdrawals ? 'approved' : 'pending_review';
      const r = q.insertWithdrawal.run(req.userId, points, amountUsd, method, JSON.stringify(details), status);
      q.insertLedger.run(req.userId, -points, 'withdrawal', `w${r.lastInsertRowid}`, `Cash out via ${method}`);
      return q.withdrawalById.get(r.lastInsertRowid);
    });
    let w = create();
    if (!w) return res.status(400).json({ error: 'Insufficient balance' });
    if (w.status === 'approved') w = await processWithdrawal(w);
    res.status(201).json({ withdrawal: { id: w.id, status: w.status, amount_usd: w.amount_usd, method: w.method, error: w.error }, wallet: summary(req.userId) });
  });

  app.get('/admin/withdrawals', admin, (_req, res) => res.json({ withdrawals: q.pendingWithdrawals.all() }));

  app.post('/admin/withdrawals/:id/approve', admin, async (req, res) => {
    const w = q.withdrawalById.get(Number(req.params.id));
    if (!w || w.status !== 'pending_review') return res.status(404).json({ error: 'Not pending' });
    q.setWithdrawal.run('approved', null, null, w.id);
    res.json({ withdrawal: await processWithdrawal(w) });
  });

  app.post('/admin/withdrawals/:id/reject', admin, (req, res) => {
    const w = q.withdrawalById.get(Number(req.params.id));
    if (!w || w.status !== 'pending_review') return res.status(404).json({ error: 'Not pending' });
    failWithdrawal(w, String(req.body.reason || 'Rejected'));
    res.json({ withdrawal: q.withdrawalById.get(w.id) });
  });

  // Flutterwave transfer status webhook.
  app.post('/webhooks/flutterwave', (req, res) => {
    if (!config.flutterwave.webhookHash || req.headers['verif-hash'] !== config.flutterwave.webhookHash) return res.sendStatus(401);
    const data = req.body.data || {};
    const w = q.withdrawalByRef.get(String(data.id));
    if (w && w.status === 'processing') {
      if (data.status === 'SUCCESSFUL') q.setWithdrawal.run('paid', null, null, w.id);
      else if (data.status === 'FAILED') failWithdrawal(w, data.complete_message || 'Transfer failed');
    }
    res.sendStatus(200);
  });

  return app;
}

module.exports = { createApp };
