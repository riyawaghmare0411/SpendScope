// SpendScope Zero-Knowledge Encryption Library -- Envelope Encryption
// Uses Web Crypto API (AES-256-GCM + PBKDF2) -- no external dependencies
//
// Envelope design: a random DEK (Data Encryption Key) encrypts transaction
// fields directly and is generated once, never changing. The DEK is
// "wrapped" (encrypted) under one or more KEKs (Key Encryption Keys) -- one
// derived from the password, one per recovery code. Unlocking means
// deriving a KEK and unwrapping the DEK; every route recovers the SAME DEK,
// which is what makes recovery codes actually work.

const PBKDF2_ITERATIONS = 600_000; // OWASP current guidance (PBKDF2-SHA256)
const IV_LENGTH = 12; // 12 bytes for AES-GCM
const SALT_LENGTH = 16;

// Every encrypted payload carries this so a future wider field-set
// (see ENCRYPTED_FIELDS) can be migrated to without breaking old blobs.
export const PAYLOAD_VERSION = 1;

// Fields encrypted on each transaction -- the SINGLE source of truth for
// what gets encrypted. encryptFields/decryptFields loop over this array, so
// widening it (Option C: encrypt everything) is a one-line change here and
// does not require touching any other code.
export const ENCRYPTED_FIELDS = ['merchant', 'description'];

// --- Base64 helpers (browser-safe) ---

function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Generate a random 16-byte salt, returned as a base64 string.
 * @returns {string} Base64-encoded salt
 */
export function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return uint8ToBase64(salt);
}

/**
 * Derive a Key Encryption Key (KEK) from a secret (password or recovery
 * code) and salt via PBKDF2. The KEK only ever wraps/unwraps the DEK --
 * it never touches transaction data directly, so it is non-extractable.
 * @param {string} secret - Password or recovery code
 * @param {string} salt - Base64-encoded salt
 * @returns {Promise<CryptoKey>} AES-GCM key usable for wrap/unwrap
 */
export async function deriveKek(secret, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToUint8(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // KEK never needs to be exported
    ['encrypt', 'decrypt'],
  );
}

/**
 * Generate a random Data Encryption Key (DEK): AES-256-GCM, extractable so
 * it can be wrapped under a KEK. Generated once per user; never changes.
 * @returns {Promise<CryptoKey>}
 */
export function generateDek() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable -- must be exportable to wrap under a KEK
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wrap (encrypt) a DEK under a KEK, producing a blob safe to store
 * server-side. Only someone who can re-derive the KEK can unwrap it.
 * @param {CryptoKey} kek
 * @param {CryptoKey} dek
 * @returns {Promise<{iv: string, ct: string}>} Base64-encoded IV and ciphertext
 */
export async function wrapDek(kek, dek) {
  const rawDek = await crypto.subtle.exportKey('raw', dek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ctBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawDek);
  return { iv: uint8ToBase64(iv), ct: uint8ToBase64(new Uint8Array(ctBuffer)) };
}

/**
 * Unwrap (decrypt) a DEK using a KEK. Throws if the GCM auth tag fails to
 * verify -- i.e. the password/recovery code used to derive the KEK was wrong.
 * @param {CryptoKey} kek
 * @param {{iv: string, ct: string}} wrapped
 * @returns {Promise<CryptoKey>}
 */
export async function unwrapDek(kek, wrapped) {
  const iv = base64ToUint8(wrapped.iv);
  const ct = base64ToUint8(wrapped.ct);
  const rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct); // throws on bad auth tag
  return crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// Oldest blob.v this build still decrypts. Widen the range by bumping
// PAYLOAD_VERSION when the field set changes -- old and new versions then
// coexist (incremental migration) instead of the reader rejecting either one.
const MIN_SUPPORTED_VERSION = 1;

// Pre-Phase-E blobs carry no `v` at all, used 100_000 PBKDF2 iterations and a
// much wider field set. They are not corrupt -- they need a dedicated
// migration, not routine decryption -- so we detect and name this case
// explicitly instead of letting it fall through to a generic auth-tag error.
const LEGACY_PAYLOAD_ERROR =
  'This blob has no version tag: it is a legacy pre-Phase-E payload ' +
  '(100,000 PBKDF2 iterations, wider field set), not corrupted data. ' +
  'It requires a dedicated migration path and cannot be read by decryptFields.';

// KNOWN, ACCEPTED LIMITATION -- no AAD row-binding.
// Blobs are not cryptographically bound to the row they belong to, so a
// malicious or buggy server could swap encrypted_data between two rows and the
// client would render the wrong merchant against the wrong amount.
// A previous revision bound the ciphertext to date_iso|amount|direction. That
// was REMOVED deliberately: those columns are user-editable, so correcting a
// typo'd amount permanently destroyed that row's merchant and description
// (auth tag could never validate again). Trading a row-swap hardening for
// one-click irreversible data loss is a bad trade.
// A correct fix needs an immutable per-row identifier that exists at encrypt
// time -- e.g. a client-generated UUID stored alongside the row and never
// mutated. That is a schema change, deliberately deferred.

/**
 * Encrypt only the ENCRYPTED_FIELDS present on obj, under the DEK.
 * Each call uses a fresh random IV -- never reuse an IV.
 * @param {CryptoKey} dek
 * @param {Object} obj - e.g. a transaction
 * @returns {Promise<{v: number, iv: string, ct: string}>}
 */
export async function encryptFields(dek, obj) {
  const encoder = new TextEncoder();
  const sensitive = {};
  for (const field of ENCRYPTED_FIELDS) {
    if (field in obj) sensitive[field] = obj[field];
  }

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = encoder.encode(JSON.stringify(sensitive));
  const ctBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, plaintext);

  return {
    v: PAYLOAD_VERSION,
    iv: uint8ToBase64(iv),
    ct: uint8ToBase64(new Uint8Array(ctBuffer)),
  };
}

/**
 * Decrypt a blob produced by encryptFields back into an object containing
 * just the encrypted fields. Validates the payload version. Throws if the
 * GCM auth tag fails (wrong key or corrupted ciphertext).
 * @param {CryptoKey} dek
 * @param {{v: number, iv: string, ct: string}} blob
 * @returns {Promise<Object>}
 */
export async function decryptFields(dek, blob) {
  if (blob.v === undefined || blob.v === null) {
    throw new Error(LEGACY_PAYLOAD_ERROR);
  }
  if (blob.v < MIN_SUPPORTED_VERSION || blob.v > PAYLOAD_VERSION) {
    throw new Error(`Unsupported encrypted payload version: ${blob.v} (supported: v${MIN_SUPPORTED_VERSION}-v${PAYLOAD_VERSION})`);
  }

  const decoder = new TextDecoder();
  const iv = base64ToUint8(blob.iv);
  const ct = base64ToUint8(blob.ct);
  const plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct);
  return JSON.parse(decoder.decode(plaintextBuffer));
}

/**
 * Encrypt then immediately decrypt a fixed synthetic sample (covering every
 * field in ENCRYPTED_FIELDS) and deep-compare against the original. Callers
 * should verify this returns true BEFORE treating encryption as usable in
 * this browser -- turns "unrecoverable garbage discovered in six months"
 * into "an error right now".
 * @param {CryptoKey} dek
 * @returns {Promise<boolean>}
 */
export async function verifyRoundTrip(dek) {
  // Fixed synthetic sample covering EVERY field in ENCRYPTED_FIELDS, so the
  // self-test cannot pass vacuously just because a caller's sample row was
  // missing those fields.
  const sample = {};
  for (const field of ENCRYPTED_FIELDS) sample[field] = `selftest-${field}`;

  const blob = await encryptFields(dek, sample);
  const decrypted = await decryptFields(dek, blob);

  return JSON.stringify(decrypted) === JSON.stringify(sample);
}
