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

module.exports = { CHALLENGES, ID_TYPES, randomChallenge, decodeImage, saveImage, ageOn };
