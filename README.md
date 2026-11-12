# WatchEarn

iPhone app (Expo / React Native) + Node backend where users watch rewarded ads, trailers, movies and short videos — no surveys, no tasks — and cash out by mobile money, bank transfer or PayPal.

```
app/     Expo SDK 58 app (Expo Router): Watch feed, Shorts, Wallet, Account
server/  Express API: auth, points ledger, AdMob SSV rewards, withdrawals, payouts
```

## Accounts and verification

- **Sign-up:** the user must enter a 6-digit code that is emailed to them. No token is issued until `POST /api/auth/verify-email` succeeds. Signing in with an unverified email sends a new code.
- **Before the first withdrawal:** the user must verify a phone number (international format, e.g. `+255712345678`) with a code sent by **WhatsApp or SMS**. Each number can be verified on only one account, and mobile-money payouts go only to the verified number.
- **Codes:** each code expires after 10 minutes and allows at most 5 attempts. A new code can be requested after 60 seconds. Codes are stored as HMAC hashes, not plain text.
- **Identity verification (KYC):** works like Binance. Right after verifying their email, a new user must choose an ID type (national ID, passport or driver's licence) and enter their details (18+ only). They then photograph the ID front and back and take a **live selfie** while doing a random gesture shown on screen, such as "touch your left ear". Until they submit, the user cannot get past this screen. Cash-out stays locked until an admin approves. The same ID number cannot be used on a second account. Images are stored in `KYC_DIR`, which defaults to `server/data/kyc`, with owner-only file permissions.
- **Duplicate check on submission:** every submission is compared with other accounts.
  - **Blocked** (`409`, "already registered to another account"): the same document (country + type + number) is pending or approved elsewhere, or any photo is byte-identical to one used on another account. Submissions where the ID front, ID back and selfie are not all different photos are also refused.
  - **Flagged for the reviewer** (listed first in `GET /api/admin/kyc`, with matching accounts in `flags`): `same_person` (same name, in any word order or case, plus the same date of birth), `same_id_number` (same number on a different document type or country), and `rejected_before` (these details were rejected on another account).
  - Spotting the same face in different photos needs a provider with face de-duplication, such as Sumsub, Smile ID or Rekognition.
- **Automated face match / liveness:** to remove manual review, connect a KYC provider such as Sumsub, Onfido, Veriff or Smile ID (Africa coverage). Call it from `POST /api/kyc` and set the status from the provider's webhook.
- **Sandbox (`MESSAGING_MODE=sandbox`):** codes are not sent. They are logged on the server and shown in the app so you can test the flow.

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
| Resend account with a verified sending domain → `RESEND_API_KEY`, `EMAIL_FROM`; set `MESSAGING_MODE=live` | resend.com |
| Twilio account → `TWILIO_ACCOUNT_SID/AUTH_TOKEN`, SMS number `TWILIO_SMS_FROM`, WhatsApp sender `TWILIO_WHATSAPP_FROM` + approved authentication template `TWILIO_WHATSAPP_CONTENT_SID` | Twilio console |
| Flutterwave business account (KYC) → `FLW_SECRET_KEY`, `FLW_WEBHOOK_HASH`; webhook `…/api/webhooks/flutterwave` | Flutterwave dashboard |
| PayPal business account with Payouts enabled → `PAYPAL_CLIENT_ID/SECRET`, `PAYPAL_BASE_URL=https://api-m.paypal.com` | PayPal developer |
| Terms, privacy policy, age limit (18+), tax/KYC rules for each country you pay out to | legal |
| Only license content you're allowed to stream (the catalog uses public-domain / Creative Commons films) | `server/src/catalog.js` |
| Build & submit: `npx eas-cli@latest build -p ios` then `npx eas-cli@latest submit -p ios` | EAS |

Apple may reject apps that pay cash for watching ads (Guideline 3.2.2). Present it as a rewards program funded by ads, and do not reward users for rating or reviewing the app.

## Admin

```bash
curl -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/withdrawals
# KYC review
curl -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/kyc
curl -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/kyc/1/selfie -o selfie.jpg   # front | back | selfie
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/kyc/1/approve
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"reason":"Blurry photo"}' https://api.your-domain.com/api/admin/kyc/1/reject
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/withdrawals/1/approve
curl -X POST -H "x-admin-token: $ADMIN_TOKEN" https://api.your-domain.com/api/admin/withdrawals/1/reject
```
