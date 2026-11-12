const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      country TEXT,
      email_verified INTEGER NOT NULL DEFAULT 0,
      phone TEXT,
      phone_verified_at TEXT,
      kyc_status TEXT NOT NULL DEFAULT 'none', -- none | pending | approved | rejected
      kyc_challenge TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    -- Append-only points ledger. Balance = SUM(delta). (kind, ref) dedupes ad callbacks.
    CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      delta INTEGER NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(kind, ref)
    );
    CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created_at);
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      points INTEGER NOT NULL,
      amount_usd REAL NOT NULL,
      method TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_ref TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kyc_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      full_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      country TEXT NOT NULL,
      id_type TEXT NOT NULL,
      id_number TEXT NOT NULL,
      front_file TEXT NOT NULL,
      back_file TEXT,
      selfie_file TEXT NOT NULL,
      challenge TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewer_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS kyc_doc ON kyc_submissions(country, id_type, id_number);
    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      purpose TEXT NOT NULL, -- 'email' | 'phone'
      target TEXT NOT NULL,
      channel TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS verification_user ON verification_codes(user_id, purpose, id);
  `);
  // Columns added after the first release.
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!cols.includes('email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('phone')) db.exec('ALTER TABLE users ADD COLUMN phone TEXT');
  if (!cols.includes('phone_verified_at')) db.exec('ALTER TABLE users ADD COLUMN phone_verified_at TEXT');
  if (!cols.includes('kyc_status')) db.exec(`ALTER TABLE users ADD COLUMN kyc_status TEXT NOT NULL DEFAULT 'none'`);
  if (!cols.includes('kyc_challenge')) db.exec('ALTER TABLE users ADD COLUMN kyc_challenge TEXT');
  return db;
}

module.exports = { openDb };
