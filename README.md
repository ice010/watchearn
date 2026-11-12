# WatchEarn

iPhone app (Expo / React Native) + Node backend where users watch rewarded ads, trailers, movies and short videos — no surveys, no tasks — and cash out by mobile money, bank transfer or PayPal.

```
app/     Expo SDK 58 app (Expo Router): Watch feed, Shorts, Wallet, Account
server/  Express API: auth, points ledger, AdMob SSV rewards, withdrawals, payouts
```

## How earning works

1. Every video starts with a **rewarded ad** (Google AdMob on iPhone).
2. When the ad finishes, Google calls `GET /api/admob/ssv` on your server. The signature is verified against Google's public keys, then points are credited. Duplicate callbacks are ignored and there is a daily cap.
3. Points convert to USD (`POINTS_PER_USD`). Once the user reaches `MIN_WITHDRAW_USD`, they can request a payout.
4. The points are deducted right away. An admin approves the payout, or you set auto-approve. The payout then goes out via **Flutterwave** (M-Pesa, Airtel, MTN, Tigo… and bank accounts in Africa and other regions) or **PayPal Payouts** (global). Failed or rejected payouts are refunded.

> Payouts are funded only by your ad revenue. Rewarded ads earn roughly $1–$15 per 1,000 views depending on country. Set `POINTS_PER_AD` / `POINTS_PER_USD` so you pay users less than you earn.

## Run locally (sandbox)

```bash
# backend + web build served on http://localhost:4000
cd app && npm install && npx expo export -p web
cd ../server && npm install && npm start

# tests
cd server && npm test
```

In sandbox mode (`SANDBOX_REWARDS=true`, `PAYOUT_MODE=sandbox`), web shows a simulated 15 s ad and payouts are faked.

### On an iPhone

The AdMob SDK is a native module, so Expo Go won't work. You need a development build:

```bash
cd app
EXPO_PUBLIC_API_URL=https://api.your-domain.com/api npx eas-cli@latest build --profile development --platform ios
```

## Go-live checklist

| Step | Where |
|---|---|
| Apple Developer account ($99/yr), set `ios.bundleIdentifier` | `app/app.json` |
| AdMob account → create iOS app + **rewarded** ad unit, enable **server-side verification** with callback `https://api.your-domain.com/api/admob/ssv` | AdMob console |
| Replace test IDs: `iosAppId` in `app.json`; set `EXPO_PUBLIC_ADMOB_REWARDED_IOS` and `EXPO_PUBLIC_API_URL` at build time | `app/` |
| Deploy server over HTTPS with a persistent disk (or move to Postgres for multi-instance) | any host |
| Set `JWT_SECRET`, `ADMIN_TOKEN`, `PUBLIC_URL`, `SANDBOX_REWARDS=false`, `PAYOUT_MODE=live` | `server/.env` (see `.env.example`) |
| Flutterwave business account (KYC) → `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH`; webhook `…/api/webhooks/flutterwave` | Flutterwave dashboard |
| PayPal business account with Payouts enabled → `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_BASE_URL=https://api-m.paypal.com` | PayPal developer |
| Terms, privacy policy, age limit (18+), tax/KYC rules for each country you pay out to | legal |
| Only license content you're allowed to stream (the catalog uses public-domain / Creative Commons films) | `server/src/catalog.js` |
| Build & submit: `npx eas-cli@latest build -p ios` then `npx eas-cli@latest submit -p ios` | EAS |

Apple may reject apps that pay cash for watching ads (Guideline 3.2.2). Present it as a rewards program funded by ads, and do not reward users for rating or reviewing the app.

## Admin

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/withdrawals
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/withdrawals/1/approve
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/withdrawals/1/reject
```
