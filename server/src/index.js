const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');

if (process.env.NODE_ENV === 'production' && (config.jwtSecret === 'dev-only-change-me' || config.sandboxRewards || config.messagingMode !== 'live')) {
  console.error('Refusing to start: set JWT_SECRET, SANDBOX_REWARDS=false and MESSAGING_MODE=live in production.');
  process.exit(1);
}

const api = createApp({ db: openDb(config.dbPath), config });
const root = express();
if (process.env.LOG_REQUESTS) {
  root.use((req, res, next) => {
    res.on('finish', () => console.log(res.statusCode, req.method, req.originalUrl));
    next();
  });
}
// API lives under /api so the web build can be served from the same origin.
root.use('/api', api);

// Optionally serve the Expo web build (npx expo export -p web) for browser previews.
const webDir = path.resolve(process.env.WEB_DIR || path.join(__dirname, '../../app/dist'));
if (fs.existsSync(webDir)) {
  root.use(express.static(webDir));
  root.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
}

root.listen(config.port, () => {
  console.log(`WatchEarn API on :${config.port} (rewards: ${config.sandboxRewards ? 'sandbox' : 'admob'}, payouts: ${config.payoutMode})`);
});
