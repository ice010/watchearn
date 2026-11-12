const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');

if (process.env.NODE_ENV === 'production' && (config.jwtSecret === 'dev-only-change-me' || config.sandboxRewards)) {
  console.error('Refusing to start: set JWT_SECRET and SANDBOX_REWARDS=false in production.');
  process.exit(1);
}

const api = createApp({ db: openDb(config.dbPath), config });
const root = express();
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
