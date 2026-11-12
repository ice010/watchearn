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
const { sendCode } = require('./messaging');
const path = require('path');
const kyc = require('./kyc');

const CODE_TTL_MIN = 10;
const CODE_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;
const E164 = /^\+[1-9]\d{7,14}$/;

function createApp({ db, config, keyProvider, payout = sendPayout, messenger = sendCode }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '30mb' }));
  app.use((req, _res, next) => { req.body ??= {}; next(); });

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT id, email, name, country, email_verified, phone, phone_verified_at, kyc_status, kyc_challenge, created_at FROM users WHERE id = ?'),
    setKyc: db.prepare('UPDATE users SET kyc_status = ?, kyc_challenge = COALESCE(?, kyc_challenge) WHERE id = ?'),
    setChallenge: db.prepare('UPDATE users SET kyc_challenge = ? WHERE id = ?'),
    insertKyc: db.prepare(`INSERT INTO kyc_submissions (user_id, full_name, date_of_birth, country, id_type, id_number, front_file, back_file, selfie_file,
        front_hash, back_hash, selfie_hash, name_key, flags, challenge)
      VALUES (@userId, @fullName, @dateOfBirth, @country, @idType, @idNumber, @front, @back, @selfie,
        @frontHash, @backHash, @selfieHash, @nameKey, @flags, @challenge)`),
    latestKyc: db.prepare('SELECT id, status, reviewer_note, created_at FROM kyc_submissions WHERE user_id = ? ORDER BY id DESC LIMIT 1'),
    kycById: db.prepare('SELECT * FROM kyc_submissions WHERE id = ?'),
    pendingKyc: db.prepare(`SELECT k.id, k.user_id, u.email, k.full_name, k.date_of_birth, k.country, k.id_type, k.id_number, k.challenge, k.flags, k.created_at
      FROM kyc_submissions k JOIN users u ON u.id = k.user_id WHERE k.status = 'pending' ORDER BY k.flags = '[]', k.id`),
    reviewKyc: db.prepare(`UPDATE kyc_submissions SET status = ?, reviewer_note = ?, reviewed_at = datetime('now') WHERE id = ?`),
    setEmailVerified: db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?'),
    setPhone: db.prepare(`UPDATE users SET phone = ?, phone_verified_at = datetime('now') WHERE id = ?`),
    phoneOwner: db.prepare('SELECT id FROM users WHERE phone = ? AND phone_verified_at IS NOT NULL AND id != ?'),
    insertCode: db.prepare(`INSERT INTO verification_codes (user_id, purpose, target, channel, code_hash, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+${CODE_TTL_MIN} minutes'))`),
    latestCode: db.prepare(`SELECT *, expires_at > datetime('now') AS fresh, created_at > datetime('now', '-${RESEND_COOLDOWN_SEC} seconds') AS recent FROM verification_codes WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1`),
    bumpAttempts: db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?'),
    useCode: db.prepare(`UPDATE verification_codes SET used_at = datetime('now') WHERE id = ?`),
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

  const publicUser = (u) => u && ({
    id: u.id, email: u.email, name: u.name, country: u.country,
    email_verified: !!u.email_verified, phone: u.phone, phone_verified: !!u.phone_verified_at,
    kyc_status: u.kyc_status,
  });
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
      req.user = q.userById.get(req.userId);
      if (!req.user) throw new Error('no user');
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!req.user.email_verified) return res.status(403).json({ error: 'Verify your email first', verificationRequired: true });
    next();
  }

  const hashCode = (userId, purpose, code) =>
    crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${purpose}:${code}`).digest('hex');

  // Creates and delivers a 6-digit code. Throws { status, message } on cooldown/provider errors.
  async function issueCode(userId, purpose, channel, target) {
    const last = q.latestCode.get(userId, purpose);
    if (last && last.recent && !last.used_at) {
      const err = new Error(`Please wait ${RESEND_COOLDOWN_SEC} seconds before requesting another code`);
      err.status = 429;
      throw err;
    }
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    q.insertCode.run(userId, purpose, target, channel, hashCode(userId, purpose, code));
    try {
      const r = await messenger(config, channel, target, code);
      return r.sandbox ? { sentTo: target, channel, devCode: code } : { sentTo: target, channel };
    } catch (e) {
      const err = new Error(`Could not send code: ${e.message}`);
      err.status = 502;
      throw err;
    }
  }

  function checkCode(userId, purpose, code) {
    const c = q.latestCode.get(userId, purpose);
    if (!c || c.used_at) return { ok: false, error: 'Request a new code' };
    if (!c.fresh) return { ok: false, error: 'Code expired. Request a new one' };
    if (c.attempts >= CODE_MAX_ATTEMPTS) return { ok: false, error: 'Too many attempts. Request a new code' };
    q.bumpAttempts.run(c.id);
    const a = Buffer.from(hashCode(userId, purpose, String(code || '')));
    if (!crypto.timingSafeEqual(a, Buffer.from(c.code_hash))) return { ok: false, error: 'Wrong code' };
    q.useCode.run(c.id);
    return { ok: true, target: c.target };
  }

  const sendErr = (res, e) => res.status(e.status || 500).json({ error: e.message });

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
    messagingMode: config.messagingMode,
    payoutMethods: ['paypal', 'bank', 'mobile_money'],
  }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });
  const credentials = z.object({
    email: z.string().email().transform((s) => s.toLowerCase()),
    password: z.string().min(8),
    name: z.string().max(80).optional(),
    country: z.string().max(2).optional(),
  });

  // Registration creates an unverified account and emails a code; a token is only issued after /auth/verify-email.
  app.post('/auth/register', authLimiter, async (req, res) => {
    const p = credentials.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Valid email and 8+ character password required' });
    if (q.userByEmail.get(p.data.email)) return res.status(409).json({ error: 'Email already registered' });
    const r = q.insertUser.run(p.data.email, bcrypt.hashSync(p.data.password, 10), p.data.name || null, p.data.country || null);
    try {
      res.status(201).json({ verificationRequired: true, ...(await issueCode(r.lastInsertRowid, 'email', 'email', p.data.email)) });
    } catch (e) {
      sendErr(res, e);
    }
  });

  app.post('/auth/login', authLimiter, async (req, res) => {
    const p = credentials.pick({ email: true, password: true }).safeParse(req.body);
    const u = p.success && q.userByEmail.get(p.data.email);
    if (!u || !bcrypt.compareSync(p.data.password, u.password_hash)) return res.status(401).json({ error: 'Wrong email or password' });
    if (!u.email_verified) {
      const sent = await issueCode(u.id, 'email', 'email', u.email).catch(() => ({ sentTo: u.email }));
      return res.status(403).json({ error: 'Verify your email to continue', verificationRequired: true, ...sent });
    }
    res.json({ token: sign(u), user: publicUser(q.userById.get(u.id)) });
  });

  const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
  app.post('/auth/verify-email', codeLimiter, (req, res) => {
    const email = String(req.body.email || '').toLowerCase();
    const u = q.userByEmail.get(email);
    if (!u) return res.status(400).json({ error: 'Wrong code' });
    if (!u.email_verified) {
      const c = checkCode(u.id, 'email', req.body.code);
      if (!c.ok) return res.status(400).json({ error: c.error });
      q.setEmailVerified.run(u.id);
    } else {
      return res.status(400).json({ error: 'Email already verified. Sign in instead' });
    }
    res.json({ token: sign(u), user: publicUser(q.userById.get(u.id)) });
  });

  app.post('/auth/resend-code', codeLimiter, async (req, res) => {
    const u = q.userByEmail.get(String(req.body.email || '').toLowerCase());
    if (!u || u.email_verified) return res.json({ ok: true });
    try {
      res.json({ ok: true, ...(await issueCode(u.id, 'email', 'email', u.email)) });
    } catch (e) {
      sendErr(res, e);
    }
  });

  app.get('/me', auth, (req, res) => res.json({ user: publicUser(req.user), wallet: summary(req.userId) }));

  // Identity verification (KYC): ID document photos + selfie with a random challenge, reviewed by an admin.
  app.get('/kyc', auth, (req, res) => {
    let challenge = req.user.kyc_challenge;
    if (!challenge) {
      challenge = kyc.randomChallenge();
      q.setChallenge.run(challenge, req.userId);
    }
    res.json({ status: req.user.kyc_status, challenge, idTypes: kyc.ID_TYPES, submission: q.latestKyc.get(req.userId) || null });
  });

  const kycSchema = z.object({
    fullName: z.string().trim().min(3).max(100),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    country: z.string().length(2).transform((s) => s.toUpperCase()),
    idType: z.enum(kyc.ID_TYPES),
    idNumber: z.string().trim().min(4).max(30).transform((s) => s.toUpperCase().replace(/\s+/g, '')),
    front: z.string(),
    back: z.string().optional(),
    selfie: z.string(),
  });
  const kycLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, keyGenerator: (req) => String(req.userId) });
  app.post('/kyc', auth, kycLimiter, (req, res) => {
    if (['pending', 'approved'].includes(req.user.kyc_status)) return res.status(409).json({ error: `Verification already ${req.user.kyc_status}` });
    const p = kycSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Fill in all identity details', issues: p.error.issues });
    const d = p.data;
    if (kyc.ageOn(d.dateOfBirth) < 18) return res.status(400).json({ error: 'You must be 18 or older' });
    const front = kyc.decodeImage(d.front);
    const back = d.back ? kyc.decodeImage(d.back) : null;
    const selfie = kyc.decodeImage(d.selfie);
    if (!front || !selfie || (d.idType !== 'passport' && !back)) {
      return res.status(400).json({ error: 'Clear photos of your ID (front and back) and a selfie are required (JPEG/PNG, max 8 MB)' });
    }
    const sub = {
      userId: req.userId, fullName: d.fullName, dateOfBirth: d.dateOfBirth, country: d.country, idType: d.idType, idNumber: d.idNumber,
      frontHash: kyc.imageHash(front), backHash: back ? kyc.imageHash(back) : null, selfieHash: kyc.imageHash(selfie), nameKey: kyc.nameKey(d.fullName),
    };
    if (sub.selfieHash === sub.frontHash || sub.selfieHash === sub.backHash || (back && sub.frontHash === sub.backHash)) {
      return res.status(400).json({ error: 'Each photo must be different: ID front, ID back and a new selfie' });
    }
    const dup = kyc.findDuplicates(db, req.userId, sub);
    if (dup.blocking.length) {
      const what = dup.blocking.includes('id_number') ? 'This ID document is' : 'One of these photos is';
      return res.status(409).json({ error: `${what} already registered to another account. If it belongs to you, contact support.`, duplicate: dup.blocking });
    }
    const challenge = req.user.kyc_challenge || kyc.randomChallenge();
    db.transaction(() => {
      q.insertKyc.run({
        ...sub, flags: JSON.stringify(dup.flags), challenge,
        front: kyc.saveImage(config.kycDir, front), back: back ? kyc.saveImage(config.kycDir, back) : null,
        selfie: kyc.saveImage(config.kycDir, selfie),
      });
      q.setKyc.run('pending', null, req.userId);
    })();
    res.status(201).json({ user: publicUser(q.userById.get(req.userId)), submission: q.latestKyc.get(req.userId) });
  });

  // Phone verification (required before withdrawing). Code goes out by SMS or WhatsApp.
  const phoneLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, keyGenerator: (req) => String(req.userId) });
  app.post('/phone/start', auth, phoneLimiter, async (req, res) => {
    const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
    const channel = req.body.channel === 'whatsapp' ? 'whatsapp' : 'sms';
    if (!E164.test(phone)) return res.status(400).json({ error: 'Enter the number in international format, e.g. +255712345678' });
    if (q.phoneOwner.get(phone, req.userId)) return res.status(409).json({ error: 'This number is already verified on another account' });
    try {
      res.json(await issueCode(req.userId, 'phone', channel, phone));
    } catch (e) {
      sendErr(res, e);
    }
  });

  app.post('/phone/verify', auth, phoneLimiter, (req, res) => {
    const c = checkCode(req.userId, 'phone', req.body.code);
    if (!c.ok) return res.status(400).json({ error: c.error });
    if (q.phoneOwner.get(c.target, req.userId)) return res.status(409).json({ error: 'This number is already verified on another account' });
    q.setPhone.run(c.target, req.userId);
    res.json({ user: publicUser(q.userById.get(req.userId)) });
  });

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
    if (req.user.kyc_status !== 'approved') {
      return res.status(403).json({ error: 'Your identity must be verified before withdrawing', kycRequired: true });
    }
    if (!req.user.phone_verified_at) {
      return res.status(403).json({ error: 'Verify your phone number before withdrawing', phoneVerificationRequired: true });
    }
    if (method === 'mobile_money' && details.accountNumber.replace(/\D/g, '') !== req.user.phone.replace(/\D/g, '')) {
      return res.status(400).json({ error: 'Mobile money payouts can only go to your verified phone number' });
    }
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

  app.get('/admin/kyc', admin, (_req, res) => res.json({ submissions: q.pendingKyc.all().map((k) => ({ ...k, flags: JSON.parse(k.flags) })) }));

  app.get('/admin/kyc/:id/:image', admin, (req, res) => {
    const k = q.kycById.get(Number(req.params.id));
    const file = k && { front: k.front_file, back: k.back_file, selfie: k.selfie_file }[req.params.image];
    if (!file) return res.sendStatus(404);
    res.sendFile(path.resolve(config.kycDir, file));
  });

  app.post('/admin/kyc/:id/:decision', admin, (req, res) => {
    const k = q.kycById.get(Number(req.params.id));
    const decision = { approve: 'approved', reject: 'rejected' }[req.params.decision];
    if (!k || k.status !== 'pending' || !decision) return res.status(404).json({ error: 'Not pending' });
    db.transaction(() => {
      q.reviewKyc.run(decision, req.body.reason ? String(req.body.reason).slice(0, 300) : null, k.id);
      // A rejected user gets a fresh selfie challenge for the next attempt.
      q.setKyc.run(decision, decision === 'rejected' ? kyc.randomChallenge() : null, k.user_id);
    })();
    res.json({ submission: q.kycById.get(k.id) });
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
