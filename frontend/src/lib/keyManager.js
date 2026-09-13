// SpendScope Encryption Key Manager
// Handles DEK lifecycle: setup, unlock (password/recovery code), session cache

import { deriveKek, generateDek, wrapDek, unwrapDek, generateSalt } from './crypto.js';

const SESSION_KEY = 'spendscope_session_dek';
const RECOVERY_CODE_LENGTH = 8;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Pick a uniformly-random character from `chars` using rejection sampling,
 * so the result is not skewed by `256 % chars.length` (the old `% 36` bias).
 * @param {string} chars
 * @returns {string}
 */
function randomChar(chars) {
  const max = 256 - (256 % chars.length); // largest multiple of chars.length <= 256
  let byte;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (byte >= max);
  return chars[byte % chars.length];
}

/**
 * Generate 10 recovery codes for account recovery.
 * Each code is an 8-character alphanumeric string (A-Z, 0-9) that can
 * independently unwrap the DEK once wrapped under it.
 * @returns {string[]} Array of 10 recovery code strings
 */
export function generateRecoveryCodes() {
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    let code = '';
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += randomChar(RECOVERY_CODE_CHARS);
    }
    codes.push(code);
  }
  return codes;
}

/**
 * Set up encryption for a user for the first time. Generates a salt and a
 * DEK, then wraps that DEK under the password's KEK and under each of 10
 * recovery-code KEKs -- every route unwraps to the SAME DEK.
 * Only the wrapped blobs (never the password, DEK, or recovery codes) are
 * meant to be sent to the server.
 * @param {string} password
 * @returns {Promise<{salt: string, dek: CryptoKey, wrappedPassword: {iv: string, ct: string}, recoveryCodes: string[], wrappedRecovery: Array<{iv: string, ct: string}>}>}
 */
export async function setupEncryption(password) {
  const salt = generateSalt();
  const dek = await generateDek();

  const passwordKek = await deriveKek(password, salt);
  const wrappedPassword = await wrapDek(passwordKek, dek);

  const recoveryCodes = generateRecoveryCodes();
  const wrappedRecovery = [];
  for (const code of recoveryCodes) {
    const recoveryKek = await deriveKek(code, salt);
    wrappedRecovery.push(await wrapDek(recoveryKek, dek));
  }

  return { salt, dek, wrappedPassword, recoveryCodes, wrappedRecovery };
}

/**
 * Unlock (recover the DEK) using the password. Throws if the password is wrong.
 * @param {string} password
 * @param {string} salt - Base64-encoded salt
 * @param {{iv: string, ct: string}} wrappedPassword
 * @returns {Promise<CryptoKey>} DEK
 */
export async function unlockWithPassword(password, salt, wrappedPassword) {
  const kek = await deriveKek(password, salt);
  return unwrapDek(kek, wrappedPassword); // throws on wrong password (bad auth tag)
}

/**
 * Unlock (recover the DEK) using a recovery code. Tries each wrapped blob;
 * the GCM auth tag validating against a given blob IS the proof the code is
 * correct -- no code hashes are stored anywhere.
 * @param {string} code
 * @param {string} salt - Base64-encoded salt
 * @param {Array<{iv: string, ct: string}>} wrappedRecoveryArray
 * @returns {Promise<CryptoKey>} DEK
 */
export async function unlockWithRecoveryCode(code, salt, wrappedRecoveryArray) {
  const kek = await deriveKek(code, salt);
  for (const wrapped of wrappedRecoveryArray) {
    try {
      return await unwrapDek(kek, wrapped);
    } catch {
      // Auth tag failed against this slot -- not a match, try the next one.
    }
  }
  throw new Error('Invalid recovery code');
}

/**
 * Cache the DEK in sessionStorage (cleared automatically when the tab closes).
 *
 * DELIBERATE ACCEPTED TRADE-OFF: this requires the DEK to be extractable, so
 * it is stored here as a plain JWK -- readable by any script running in this
 * origin. A single XSS compromises all past and future data with no rotation
 * path. Making the DEK non-extractable would close that hole but breaks this
 * session-cache convenience (the key could never be exported to sessionStorage
 * in the first place, forcing re-derivation from password/recovery code on
 * every page load). Chosen deliberately, not an oversight.
 * @param {CryptoKey} dek
 */
export async function storeDek(dek) {
  const jwk = await crypto.subtle.exportKey('jwk', dek);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(jwk));
}

/**
 * Get the cached DEK from sessionStorage.
 * @returns {Promise<CryptoKey|null>} null if not present or corrupted
 */
export async function getDek() {
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
    sessionStorage.removeItem(SESSION_KEY); // corrupted -- clear it
    return null;
  }
}

/**
 * Clear the cached DEK (call on logout).
 */
export function clearDek() {
  sessionStorage.removeItem(SESSION_KEY);
}
