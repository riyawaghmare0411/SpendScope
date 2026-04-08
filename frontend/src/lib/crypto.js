// SpendScope Zero-Knowledge Encryption Library
// Uses Web Crypto API (AES-256-GCM + PBKDF2) -- no external dependencies

const PBKDF2_ITERATIONS = 100_000;
const IV_LENGTH = 12; // 12 bytes for AES-GCM
const SALT_LENGTH = 16;

// Fields that get encrypted on each transaction
const ENCRYPTED_FIELDS = [
  'description', 'merchant', 'category', 'type',
  'money_in', 'money_out', 'amount', 'balance',
  'direction', 'is_redacted', 'category_source',
];

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

// --- Core crypto functions ---

/**
 * Derive an AES-256-GCM key from a password and salt using PBKDF2.
 * @param {string} password - User's password
 * @param {string} salt - Base64-encoded salt
 * @returns {Promise<CryptoKey>} AES-GCM key usable for encrypt/decrypt
 */
export async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
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
    true, // extractable -- needed for JWK export in keyManager
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a JavaScript object into an AES-256-GCM blob.
 * Each call generates a fresh random 12-byte IV.
 * @param {CryptoKey} key - AES-GCM key from deriveKey()
 * @param {Object} plainObject - Data to encrypt
 * @returns {Promise<{iv: string, ciphertext: string}>} Base64-encoded IV and ciphertext
 */
export async function encrypt(key, plainObject) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = encoder.encode(JSON.stringify(plainObject));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return {
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypt an AES-256-GCM blob back to a JavaScript object.
 * @param {CryptoKey} key - AES-GCM key from deriveKey()
 * @param {{iv: string, ciphertext: string}} encryptedBlob - Base64-encoded IV and ciphertext
 * @returns {Promise<Object>} The original JavaScript object
 */
export async function decrypt(key, encryptedBlob) {
  const decoder = new TextDecoder();
  const iv = base64ToUint8(encryptedBlob.iv);
  const ciphertext = base64ToUint8(encryptedBlob.ciphertext);

  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return JSON.parse(decoder.decode(plaintextBuffer));
}

/**
 * Encrypt an array of transaction objects individually.
 * Preserves `date_iso` unencrypted for server-side date range queries.
 * @param {CryptoKey} key - AES-GCM key
 * @param {Array<Object>} transactions - Array of transaction objects
 * @returns {Promise<Array<{iv: string, ciphertext: string, date_iso: string}>>}
 */
export async function encryptTransactions(key, transactions) {
  return Promise.all(
    transactions.map(async (tx) => {
      // Separate encrypted fields from the date
      const sensitiveData = {};
      for (const field of ENCRYPTED_FIELDS) {
        if (field in tx) sensitiveData[field] = tx[field];
      }

      const blob = await encrypt(key, sensitiveData);
      return {
        ...blob,
        date_iso: tx.date_iso || tx.date || null,
      };
    }),
  );
}

/**
 * Decrypt an array of encrypted transaction blobs.
 * Re-attaches the unencrypted `date_iso` to each result.
 * @param {CryptoKey} key - AES-GCM key
 * @param {Array<{iv: string, ciphertext: string, date_iso: string}>} encryptedArray
 * @returns {Promise<Array<Object>>} Decrypted transaction objects with date_iso
 */
export async function decryptTransactions(key, encryptedArray) {
  return Promise.all(
    encryptedArray.map(async (blob) => {
      const decrypted = await decrypt(key, blob);
      return { ...decrypted, date_iso: blob.date_iso };
    }),
  );
}

/**
 * Generate a random 16-byte salt, returned as a base64 string.
 * @returns {string} Base64-encoded salt
 */
export function generateSalt() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  return uint8ToBase64(salt);
}
