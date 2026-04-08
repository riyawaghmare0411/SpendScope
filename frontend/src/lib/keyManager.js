// SpendScope Encryption Key Manager
// Handles key lifecycle: derivation, session storage, recovery codes

import { deriveKey, generateSalt } from './crypto.js';

const SALT_KEY = 'spendscope_encryption_salt';
const SESSION_KEY = 'spendscope_session_key';
const RECOVERY_CODE_LENGTH = 8;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Initialize encryption for a user session.
 * Derives the AES key from the password, stores the salt persistently
 * and the key in sessionStorage (cleared on tab close).
 * @param {string} password - User's password
 * @param {string|null} existingSalt - Base64 salt from server (null for first-time setup)
 * @returns {Promise<{key: CryptoKey, salt: string}>} The derived key and salt
 */
export async function initializeEncryption(password, existingSalt = null) {
  const salt = existingSalt || generateSalt();

  // Persist salt in localStorage (not secret, just must be consistent)
  localStorage.setItem(SALT_KEY, salt);

  const key = await deriveKey(password, salt);
  await storeKey(key);

  return { key, salt };
}

/**
 * Get the current encryption key from sessionStorage.
 * Returns null if not initialized or tab was closed.
 * @returns {Promise<CryptoKey|null>}
 */
export async function getEncryptionKey() {
  const jwk = sessionStorage.getItem(SESSION_KEY);
  if (!jwk) return null;

  try {
    return await crypto.subtle.importKey(
      'jwk',
      JSON.parse(jwk),
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );
  } catch {
    // Corrupted key data -- clear it
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * Store a CryptoKey in sessionStorage as JWK.
 * Session storage is cleared when the tab closes.
 * @param {CryptoKey} key - AES-GCM key to store
 */
export async function storeKey(key) {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(jwk));
}

/**
 * Clear the encryption key from memory (call on logout).
 */
export function clearKey() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Generate 10 recovery codes for account recovery.
 * Each code is an 8-character alphanumeric string (A-Z, 0-9)
 * that can independently derive the encryption key.
 * @returns {string[]} Array of 10 recovery code strings
 */
export function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_LENGTH));
    let code = '';
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += RECOVERY_CODE_CHARS[bytes[j] % RECOVERY_CODE_CHARS.length];
    }
    codes.push(code);
  }
  return codes;
}

/**
 * Derive the encryption key from a recovery code.
 * Uses the same PBKDF2 process as password derivation but with the
 * recovery code as the password input.
 * @param {string} code - One of the generated recovery codes
 * @param {string} salt - Base64-encoded salt (same salt used for password derivation)
 * @returns {Promise<CryptoKey>} AES-GCM key
 */
export async function deriveKeyFromRecoveryCode(code, salt) {
  return deriveKey(code, salt);
}

/**
 * Check if encryption has been initialized (salt exists in localStorage).
 * @returns {boolean}
 */
export function isEncryptionInitialized() {
  return localStorage.getItem(SALT_KEY) !== null;
}

/**
 * Get the stored salt from localStorage.
 * @returns {string|null} Base64-encoded salt, or null if not initialized
 */
export function getSalt() {
  return localStorage.getItem(SALT_KEY);
}
