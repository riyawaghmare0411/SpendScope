"""E2E test of Phase E envelope encryption against local backend.

Drives the REAL shipped frontend JS -- frontend/src/lib/crypto.js and
frontend/src/lib/keyManager.js -- via a small Node harness (tests/js_harness.mjs),
NOT a Python reimplementation. A prior version of this file re-implemented
PBKDF2/AES-GCM in Python and passed 16/16 while the actual browser login path
threw on the same data (it unwrapped envelope.password; App.jsx passed the
whole envelope). This version cannot make that mistake because it never
touches the crypto math itself -- it only shells out to Node, which imports
the actual modules and runs them.

Run: python tests/test_encryption.py
"""
import asyncio, httpx, time, asyncpg, os, sys, json, subprocess
import cleanup

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")
DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")

_HERE = os.path.dirname(os.path.abspath(__file__))
JS_HARNESS = os.path.join(_HERE, "js_harness.mjs")


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


def call_js(action, **kwargs):
    """Shell out to js_harness.mjs, which imports and runs frontend/src/lib/crypto.js
    and keyManager.js verbatim under Node's WebCrypto -- the real shipped code,
    not a lookalike. Returns {"ok": True, "result": ...} or {"ok": False, "error": ...}
    for an *expected* crypto failure -- wrong password/recovery code (an AES-GCM
    auth-tag failure) or a malformed wrapped-blob shape. A harness crash (Node
    missing, unknown action, bad JSON) is a hard, loud failure -- never silently
    treated as a passed/skipped test.
    """
    try:
        p = subprocess.run(
            ["node", JS_HARNESS], input=json.dumps({"action": action, **kwargs}),
            capture_output=True, text=True, timeout=30,
        )
    except FileNotFoundError:
        print("FATAL: `node` not found on PATH. This test must drive the real frontend "
              "JS via Node -- it cannot fall back to a Python reimplementation.")
        sys.exit(1)
    if p.returncode != 0:
        print(f"FATAL: js_harness.mjs crashed (action={action}). stderr:\n{p.stderr}")
        sys.exit(1)
    try:
        return json.loads(p.stdout)
    except json.JSONDecodeError:
        print(f"FATAL: js_harness.mjs produced non-JSON output (action={action}).\n"
              f"stdout={p.stdout!r}\nstderr={p.stderr!r}")
        sys.exit(1)


async def main():
    failures = 0
    email = f"enctest+{int(time.time())}@example.com"
    email2 = None
    try:
      async with httpx.AsyncClient(timeout=30.0) as c:
        # 1. Signup (plain -- matches the real UI: encryption is enabled after
        # signup via /api/auth/encryption-setup, not at signup time).
        r = await c.post(f"{BASE}/api/auth/signup", json={
            "email": email, "password": "testpassword123", "name": "EncTest",
            "country": "GB", "currency": "GBP",
        })
        if not step("signup", r.status_code == 200, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); sys.exit(1)
        token = r.json()["access_token"]
        user_id = r.json()["user"]["id"]
        H = {"Authorization": f"Bearer {token}"}
        print(f"     user_id={user_id}  email={email}")

        # 2. Enable encryption via the REAL keyManager.setupEncryption(password) --
        # generates salt + DEK, wraps under the password KEK and under 10 real
        # recovery-code KEKs (generateRecoveryCodes(), not a test stand-in).
        password = "testpassword123"
        r = call_js("setup", password=password)
        if not step("node harness: setupEncryption(password)", r.get("ok"), r.get("error", "")):
            sys.exit(1)
        setup = r["result"]
        salt, dek_raw = setup["salt"], setup["dekRaw"]
        wrapped_password, wrapped_recovery, recovery_codes = (
            setup["wrappedPassword"], setup["wrappedRecovery"], setup["recoveryCodes"]
        )
        step("setupEncryption produced 10 recovery codes", len(recovery_codes) == 10, f"got {len(recovery_codes)}")
        if len(recovery_codes) != 10: failures += 1

        # Envelope shape exactly as EncryptionSettings.jsx builds it before POSTing.
        envelope = {"v": 1, "password": wrapped_password, "recovery": wrapped_recovery}

        r = await c.post(f"{BASE}/api/auth/encryption-setup", headers=H, json={
            "encryption_salt": salt, "wrapped_dek": envelope,
        })
        if not step("POST /api/auth/encryption-setup", r.status_code == 200, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); failures += 1

        # 3. THE WORST-BUG REGRESSION TEST. Login must return BOTH encryption_salt
        # and wrapped_dek in the user object. If this ever regresses, the key can
        # never be re-derived after closing the tab -- closing the tab permanently
        # destroys the user's data again.
        r = await c.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
        login_ok = r.status_code == 200
        if not step("login HTTP 200", login_ok, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); failures += 1
        login_user = r.json().get("user", {}) if login_ok else {}
        has_salt = bool(login_user.get("encryption_salt"))
        has_wrapped = bool(login_user.get("wrapped_dek"))
        if not step(
            "login response user object contains encryption_salt AND wrapped_dek "
            "(regression: if this fails, closing the tab destroys the user's data again)",
            has_salt and has_wrapped,
            f"encryption_salt present={has_salt}, wrapped_dek present={has_wrapped}",
        ):
            failures += 1

        server_envelope = None
        if has_wrapped:
            server_envelope = login_user["wrapped_dek"]
            if isinstance(server_envelope, str):
                server_envelope = json.loads(server_envelope)

        # 4. THE BLOCKER THIS SUITE PREVIOUSLY MISSED. App.jsx's login handler does:
        #   wrappedPassword = typeof wrapped_dek === 'string' ? JSON.parse(wrapped_dek) : wrapped_dek
        #   dek = await unlockWithPassword(password, encryption_salt, wrappedPassword)
        # unlockWithPassword/unwrapDek expect a SINGLE {iv, ct} blob -- envelope.password --
        # not the whole envelope {v, password, recovery}. Passing the whole envelope
        # throws (base64 decode of a missing .iv field), which is exactly what shipped
        # and broke every encrypted user's login. Assert BOTH directions explicitly.
        r_correct = call_js("unlock_password", password=password, salt=login_user.get("encryption_salt"),
                             wrapped=(server_envelope or {}).get("password"))
        correct_shape_ok = bool(server_envelope) and r_correct.get("ok") and r_correct["result"]["dekRaw"] == dek_raw
        if not step(
            "unlockWithPassword(password, salt, envelope.password) succeeds and returns the ORIGINAL DEK "
            "(the correct call shape)",
            correct_shape_ok, json.dumps(r_correct)[:200],
        ):
            failures += 1

        r_whole = call_js("unlock_password", password=password, salt=login_user.get("encryption_salt"),
                           wrapped=server_envelope)
        whole_envelope_fails = bool(server_envelope) and r_whole.get("ok") is False
        if not step(
            "unlockWithPassword(password, salt, WHOLE envelope) FAILS -- the exact shape mismatch "
            "that broke the real login path must not silently succeed",
            whole_envelope_fails, json.dumps(r_whole)[:200],
        ):
            failures += 1

        # 5. RECOVERY CODE ACTUALLY WORKS -- via unlockWithRecoveryCode, the real
        # function EncryptionSettings.jsx calls. Check slot 0 and the last slot (9)
        # both unwrap to the SAME DEK as the password route.
        for idx in (0, 9):
            r_rec = call_js("unlock_recovery", code=recovery_codes[idx], salt=login_user.get("encryption_salt"),
                             wrappedRecoveryArray=(server_envelope or {}).get("recovery"))
            rec_ok = bool(server_envelope) and r_rec.get("ok") and r_rec["result"]["dekRaw"] == dek_raw
            if not step(f"recovery code[{idx}] unwraps to the SAME DEK as the password (recovery actually works)",
                        rec_ok, json.dumps(r_rec)[:200]):
                failures += 1

        # 6. Wrong password / wrong recovery code fails cleanly: unwrapping with a
        # bad secret must raise (GCM auth tag failure), never silently return garbage.
        r_wrong_pw = call_js("unlock_password", password="totally-wrong-password",
                              salt=login_user.get("encryption_salt"), wrapped=(server_envelope or {}).get("password"))
        wrong_pw_ok = (r_wrong_pw.get("ok") is False and
                       r_wrong_pw.get("error") == "The operation failed for an operation-specific reason")
        if not step("wrong password raises the AES-GCM auth-tag failure on unwrap (not garbage)",
                     wrong_pw_ok, json.dumps(r_wrong_pw)[:200]):
            failures += 1

        r_wrong_code = call_js("unlock_recovery", code="WRONGCODE", salt=login_user.get("encryption_salt"),
                                wrappedRecoveryArray=(server_envelope or {}).get("recovery"))
        wrong_code_ok = r_wrong_code.get("ok") is False and r_wrong_code.get("error") == "Invalid recovery code"
        if not step("wrong recovery code raises 'Invalid recovery code' after every slot's AES-GCM "
                     "auth-tag check fails (not garbage)",
                     wrong_code_ok, json.dumps(r_wrong_code)[:200]):
            failures += 1

        # 7. crypto.js's own pre-flight self-test (verifyRoundTrip), the same check
        # EncryptionSettings.jsx runs before ever telling the server encryption is on.
        r_vrt = call_js("verify_roundtrip", dekRaw=dek_raw)
        if not step("crypto.js verifyRoundTrip(dek) self-test passes",
                     r_vrt.get("ok") and r_vrt["result"]["roundtripOk"] is True, json.dumps(r_vrt)[:200]):
            failures += 1

        # 8. Import an encrypted transaction: encrypt via the REAL encryptFields(dek, obj)
        # -- exactly the 2-arg call App.jsx makes -- then assert Option A shape via the
        # API. Cross-checked against the DB below by decrypting it back.
        row_ctx = {"date_iso": "2026-06-01", "amount": 42.5, "direction": "OUT"}
        plaintext_fields = {"merchant": "Secret Merchant Ltd", "description": "a private note"}
        r_enc = call_js("encrypt_fields", dekRaw=dek_raw, obj=plaintext_fields)
        if not step("node harness: encryptFields(dek, obj) [App.jsx arity]", r_enc.get("ok"), r_enc.get("error", "")):
            sys.exit(1)
        enc_blob = r_enc["result"]

        r = await c.post(f"{BASE}/api/transactions/import", headers=H, json={
            "transactions": [{
                "date_iso": row_ctx["date_iso"], "encrypted_data": enc_blob,
                "amount": row_ctx["amount"], "category": "Groceries", "direction": row_ctx["direction"],
            }],
            "account_name": "EncAcct", "filename": "enctest.csv", "source_type": "csv",
            "encrypted": True,
        })
        if not step("import encrypted transaction", r.status_code == 200, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); failures += 1

        # 9. encrypted flag validation: a user WITHOUT encryption configured
        # sending encrypted: true must be rejected (400).
        email2 = f"enctest-noenc+{int(time.time())}@example.com"
        r = await c.post(f"{BASE}/api/auth/signup", json={
            "email": email2, "password": "testpassword123", "name": "NoEncTest",
            "country": "GB", "currency": "GBP",
        })
        if not step("signup (second user, encryption never configured)", r.status_code == 200, f"HTTP {r.status_code}"):
            failures += 1
        else:
            H2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
            r = await c.post(f"{BASE}/api/transactions/import", headers=H2, json={
                "transactions": [{
                    "date_iso": "2026-06-01", "encrypted_data": enc_blob,
                    "amount": 10, "category": "Other", "direction": "OUT",
                }],
                "account_name": "NoEncAcct", "filename": "noenc.csv", "source_type": "csv",
                "encrypted": True,
            })
            if not step("encrypted=true rejected for a user without encryption configured (400)",
                        r.status_code == 400, f"HTTP {r.status_code}"):
                failures += 1

        # DB-level verification via asyncpg
        try:
            conn = await asyncpg.connect(DB_URL)

            # 10. Server stores no secrets: recovery_codes_hash NULL/unused, and no
            # plaintext recovery code anywhere in the users row.
            user_row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
            if user_row is None:
                step("DB: users row exists", False); failures += 1
            else:
                row_dict = dict(user_row)
                no_hash = row_dict.get("recovery_codes_hash") in (None, "")
                if not step("DB: recovery_codes_hash is NULL/unused for the new user", no_hash,
                            f"got {row_dict.get('recovery_codes_hash')!r}"):
                    failures += 1
                row_text = json.dumps(row_dict, default=str)
                leaked = [code for code in recovery_codes if code in row_text]
                if not step("DB: no plaintext recovery code appears anywhere in the users row",
                            len(leaked) == 0, f"leaked={leaked}"):
                    failures += 1

            # 11. Option A shape: encrypted_data IS NOT NULL, amount is the REAL amount
            # (not 0), category is preserved -- Coach/stats still work. Then cross-check
            # that the blob the server actually stored decrypts, via the REAL
            # decryptFields, back to the original merchant/description -- proving
            # cross-compatibility between what the browser wrote and what the server holds.
            txn_row = await conn.fetchrow(
                "SELECT encrypted_data, amount, category, merchant FROM transactions "
                "WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
                user_id,
            )
            if txn_row is None:
                step("DB: encrypted transaction row exists", False); failures += 1
            else:
                enc_not_null = txn_row["encrypted_data"] is not None
                if not step("DB: encrypted_data IS NOT NULL", enc_not_null):
                    failures += 1
                real_amount = txn_row["amount"] is not None and float(txn_row["amount"]) == 42.5
                if not step("DB: amount is the REAL amount (42.5, not 0)", real_amount,
                            f"got {txn_row['amount']}"):
                    failures += 1
                category_ok = txn_row["category"] == "Groceries"
                if not step("DB: category is preserved ('Groceries')", category_ok,
                            f"got {txn_row['category']!r}"):
                    failures += 1

                if enc_not_null:
                    stored_blob = txn_row["encrypted_data"]
                    stored_blob = json.loads(stored_blob) if isinstance(stored_blob, str) else stored_blob
                    r_dec = call_js("decrypt_fields", dekRaw=dek_raw, blob=stored_blob)
                    dec_ok = r_dec.get("ok") and r_dec["result"] == plaintext_fields
                    if not step("DB-stored encrypted_data decrypts (via REAL decryptFields) back to the "
                                "original merchant/description", dec_ok, json.dumps(r_dec)[:200]):
                        failures += 1

            await conn.close()
        except Exception as e:
            step("DB-level cross-check", False, f"db error: {e}")
            failures += 1
    finally:
        await cleanup.cleanup_test_user(email, DB_URL)
        if email2:
            await cleanup.cleanup_test_user(email2, DB_URL)

    print()
    print("=" * 60)
    if failures == 0:
        print("ENCRYPTION E2E: ALL PASS -- envelope encryption + recovery works correctly, "
              "driven through the real frontend JS")
    else:
        print(f"ENCRYPTION E2E: {failures} FAILURES -- see above")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
