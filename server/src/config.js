require('dotenv').config();

const bool = (v, d = false) => (v === undefined ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

const config = {
  port: num(process.env.PORT, 4000),
  dbPath: process.env.DB_PATH || './data/watchearn.db',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  adminToken: process.env.ADMIN_TOKEN || '',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:4000',

  pointsPerAd: num(process.env.POINTS_PER_AD, 5),
  pointsPerUsd: num(process.env.POINTS_PER_USD, 1000),
  minWithdrawUsd: num(process.env.MIN_WITHDRAW_USD, 5),
  maxAdsPerDay: num(process.env.MAX_ADS_PER_DAY, 50),

  // Lets the web preview / simulator credit ads without AdMob. MUST be false in production.
  sandboxRewards: bool(process.env.SANDBOX_REWARDS, true),
  admobVerifierKeysUrl: process.env.ADMOB_VERIFIER_KEYS_URL || 'https://www.gstatic.com/admob/reward/verifier-keys.json',

  // sandbox = simulate payouts; live = call providers.
  payoutMode: process.env.PAYOUT_MODE || 'sandbox',
  autoApproveWithdrawals: bool(process.env.AUTO_APPROVE_WITHDRAWALS, false),

  flutterwave: {
    secretKey: process.env.FLW_SECRET_KEY || '',
    webhookHash: process.env.FLW_WEBHOOK_HASH || '',
    baseUrl: process.env.FLW_BASE_URL || 'https://api.flutterwave.com/v3',
  },
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    baseUrl: process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com',
  },
};

module.exports = config;
