// JSON-RPC-style CLI that drives the REAL shipped frontend crypto code -- not a
// reimplementation. tests/test_encryption.py shells out to this (one `node`
// process per call) so the encryption E2E test exercises the exact functions
// App.jsx / EncryptionSettings.jsx call: frontend/src/lib/crypto.js and
// frontend/src/lib/keyManager.js.
//
// Protocol: one JSON request object on stdin -> one JSON line on stdout.
//   Request:  {"action": "...", ...action-specific args}
//   Response: {"ok": true, "result": {...}} or {"ok": false, "error": "..."}
// A non-zero exit means the harness itself crashed (bad action, bad JSON) --
// an expected crypto failure (wrong password, malformed wrapped blob) is
// reported as {"ok": false, "error": "..."} with exit 0 so the Python caller
// can assert on it.
import { encryptFields, decryptFields, verifyRoundTrip } from '../frontend/src/lib/crypto.js';
import { setupEncryption, unlockWithPassword, unlockWithRecoveryCode } from '../frontend/src/lib/keyManager.js';

function b64(buf) { return Buffer.from(buf).toString('base64'); }
function unb64(s) { return new Uint8Array(Buffer.from(s, 'base64')); }

async function importRawDek(dekRawB64) {
  return crypto.subtle.importKey('raw', unb64(dekRawB64), { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function exportRawDek(dek) {
  return b64(await crypto.subtle.exportKey('raw', dek));
}

async function dispatch(req) {
  switch (req.action) {
    case 'setup': {
      // Mirrors EncryptionSettings.jsx handleEnable(): setupEncryption(password).
      const s = await setupEncryption(req.password);
      return {
        salt: s.salt,
        dekRaw: await exportRawDek(s.dek),
        wrappedPassword: s.wrappedPassword,
        recoveryCodes: s.recoveryCodes,
        wrappedRecovery: s.wrappedRecovery,
      };
    }
    case 'unlock_password': {
      // Mirrors App.jsx handleLogin()'s call to unlockWithPassword. `req.wrapped`
      // is whatever the caller passes -- used both for the correct-shape case
      // (envelope.password) and the buggy-shape case (the whole envelope).
      const dek = await unlockWithPassword(req.password, req.salt, req.wrapped);
      return { dekRaw: await exportRawDek(dek) };
    }
    case 'unlock_recovery': {
      // Mirrors EncryptionSettings.jsx handleRecoverSubmit()'s call to unlockWithRecoveryCode.
      const dek = await unlockWithRecoveryCode(req.code, req.salt, req.wrappedRecoveryArray);
      return { dekRaw: await exportRawDek(dek) };
    }
    case 'encrypt_fields': {
      // Deliberately 2-arg: this MUST mirror App.jsx's real call exactly. If a
      // third argument is ever reintroduced here, an arity mismatch in App.jsx
      // would pass this test while encryption is dead in the app -- which is
      // precisely how it broke before.
      const dek = await importRawDek(req.dekRaw);
      return await encryptFields(dek, req.obj);
    }
    case 'decrypt_fields': {
      const dek = await importRawDek(req.dekRaw);
      return await decryptFields(dek, req.blob);
    }
    case 'verify_roundtrip': {
      // Mirrors EncryptionSettings.jsx's pre-flight self-test (crypto.js uses
      // its own fixed internal sample; takes no obj arg here).
      const dek = await importRawDek(req.dekRaw);
      return { roundtripOk: await verifyRoundTrip(dek) };
    }
    default:
      throw new Error(`unknown action: ${req.action}`);
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const req = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  try {
    const result = await dispatch(req);
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } catch (e) {
    const message = String((e && e.message) || e);
    if (message.startsWith('unknown action: ')) {
      // A typo'd action name is a harness bug, not an expected crypto failure --
      // must fail loudly (non-zero exit) so it can never pass as a negative test.
      console.error(message);
      process.exit(1);
    }
    process.stdout.write(JSON.stringify({ ok: false, error: message }));
  }
}

main();
