const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Shown to the user before the selfie; a reviewer checks the selfie matches it (simple anti-spoofing).
const CHALLENGES = [
  'Hold your ID next to your face',
  'Show two fingers next to your face',
  'Show three fingers next to your face',
  'Give a thumbs up next to your face',
  'Touch your left ear',
  'Touch your right ear',
];
const ID_TYPES = ['passport', 'national_id', 'drivers_license'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const randomChallenge = () => CHALLENGES[crypto.randomInt(0, CHALLENGES.length)];

// Accepts raw base64 or a data URL; returns { buf, ext } for JPEG/PNG/WebP, else null.
function decodeImage(input) {
  if (typeof input !== 'string' || !input) return null;
  const buf = Buffer.from(input.replace(/^data:image\/[a-z+]+;base64,/i, ''), 'base64');
  if (buf.length < 1024 || buf.length > MAX_IMAGE_BYTES) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { buf, ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { buf, ext: 'png' };
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { buf, ext: 'webp' };
  return null;
}

function saveImage(dir, img) {
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomUUID()}.${img.ext}`;
  fs.writeFileSync(path.join(dir, name), img.buf, { mode: 0o600 });
  return name;
}

function ageOn(dob, now = new Date()) {
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return -1;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

const imageHash = (img) => crypto.createHash('sha256').update(img.buf).digest('hex');

// "Asha  Juma" and "JUMA, Asha" give the same key.
const nameKey = (name) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

/**
 * Looks for the submitted identity on other accounts.
 * blocking: exact matches (same document, or a photo reused from another account) - submission refused.
 * flags: likely matches (same person details, same number on another document type) - sent to the reviewer.
 */
function findDuplicates(db, userId, s) {
  const others = (sql, ...args) => db.prepare(`SELECT k.id, k.user_id, u.email, k.status FROM kyc_submissions k JOIN users u ON u.id = k.user_id
    WHERE k.user_id != ? AND ${sql}`).all(userId, ...args);
  const blocking = new Set();
  const flags = [];
  const add = (type, rows) => rows.forEach((r) => flags.push({ type, submissionId: r.id, userId: r.user_id, email: r.email, status: r.status }));

  const sameDoc = others(`k.country = ? AND k.id_type = ? AND k.id_number = ? AND k.status IN ('pending', 'approved')`, s.country, s.idType, s.idNumber);
  if (sameDoc.length) blocking.add('id_number');
  const hashes = [s.frontHash, s.backHash, s.selfieHash].filter(Boolean);
  const ph = hashes.map(() => '?').join(',');
  const samePhoto = others(`(k.front_hash IN (${ph}) OR k.back_hash IN (${ph}) OR k.selfie_hash IN (${ph}))`, ...hashes, ...hashes, ...hashes);
  if (samePhoto.length) blocking.add('photo');

  add('same_person', others(`k.name_key = ? AND k.date_of_birth = ? AND k.status != 'rejected'`, s.nameKey, s.dateOfBirth));
  add('same_id_number', others(`k.id_number = ? AND NOT (k.country = ? AND k.id_type = ?)`, s.idNumber, s.country, s.idType));
  add('rejected_before', others(`k.status = 'rejected' AND ((k.name_key = ? AND k.date_of_birth = ?) OR (k.country = ? AND k.id_type = ? AND k.id_number = ?))`,
    s.nameKey, s.dateOfBirth, s.country, s.idType, s.idNumber));
  return { blocking: [...blocking], flags };
}

module.exports = { CHALLENGES, ID_TYPES, randomChallenge, decodeImage, saveImage, ageOn, imageHash, nameKey, findDuplicates };
