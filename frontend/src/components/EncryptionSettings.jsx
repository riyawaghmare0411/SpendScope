import { useState, useEffect } from 'react'
import { PAYLOAD_VERSION, ENCRYPTED_FIELDS, verifyRoundTrip, deriveKek, wrapDek } from '../lib/crypto'
import { setupEncryption, unlockWithRecoveryCode, unlockWithPassword, storeDek, clearDek } from '../lib/keyManager'

// EncryptionSettings -- the enable / status / recover surface for Phase E envelope
// encryption. The old system had no UI at all: it silently auto-enabled on signup
// with a recovery scheme that could never actually recover anything. This is the
// user-facing replacement.
//
// Props:
//   t                - theme object (colors), same shape ProfileModal/RulesPage use
//   onClose          - () => void, dismiss this panel (ignored while showing
//                      unsaved recovery codes -- user must confirm first)
//   API_BASE         - string, API origin
//   authToken        - string, current JWT (only used to gate fetches)
//   authHeaders      - () => object, returns { Authorization: 'Bearer ...' } or {}
//   authUser         - object|null, cached user (may carry encryption_salt/wrapped_dek)
//   setAuthUser      - (updaterFn) => void, used to refresh the cached user after
//                      enabling encryption or setting a new password
//   onSessionExpired - () => void, called on any 401 (mirrors handleLogout elsewhere)
//   Sphere           - optional decorative component (size/color/top/right/opacity props)
//
// There is exactly ONE password anywhere in this component: the account login
// password. Enabling encryption re-derives the wrapping key from it, but first
// verifies it against POST /api/auth/login so a typo can never silently produce
// a KEK that login can never reproduce (that was a permanent-lockout bug).
//
// Flows covered: status display -> enable (verify account password via login,
// then wrap the DEK under it + one-time recovery codes); "forgot password" ->
// unlock with a recovery code to regain access to encrypted data in this browser
// for the session only (it does NOT change the account password -- that flow is
// unauthenticated and deferred); and Change password, for a logged-in user who
// knows their current password, which re-wraps the DEK under the new password's
// KEK (recovery slots unchanged) and calls POST /api/auth/change-password.

const FIELD_LABELS = {
  merchant: 'merchant names', description: 'transaction descriptions', category: 'categories',
  amount: 'amounts', date: 'dates', direction: 'money in/out direction', type: 'transaction type', balance: 'balances',
}
const ALL_TXN_FIELDS = ['merchant', 'description', 'amount', 'date', 'direction', 'category', 'type', 'balance']

function fieldsText(fields) {
  const labels = fields.map(f => FIELD_LABELS[f] || f)
  if (labels.length === 0) return 'nothing'
  if (labels.length === 1) return labels[0]
  return labels.slice(0, -1).join(', ') + ' and ' + labels[labels.length - 1]
}

export default function EncryptionSettings({ t, onClose, API_BASE, authToken, authHeaders, authUser, setAuthUser, onSessionExpired, Sphere }) {
  const [view, setView] = useState('status') // status | enable | codes | recoverCode | recovered | changePassword
  const [me, setMe] = useState(authUser || null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState(null)
  const [plaidConnected, setPlaidConnected] = useState(false)
  const [banner, setBanner] = useState(null)

  const [password, setPassword] = useState('')
  const [enableLoading, setEnableLoading] = useState(false)
  const [enableError, setEnableError] = useState(null)
  const [setupResult, setSetupResult] = useState(null)
  const [codesSaved, setCodesSaved] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')

  const [recoveryCodeInput, setRecoveryCodeInput] = useState('')
  const [recoverLoading, setRecoverLoading] = useState(false)
  const [recoverError, setRecoverError] = useState(null)

  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpConfirm, setCpConfirm] = useState('')
  const [cpLoading, setCpLoading] = useState(false)
  const [cpError, setCpError] = useState(null)

  const fetchStatus = async () => {
    if (!authToken) return
    setStatusLoading(true); setStatusError(null)
    try {
      const r = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() })
      if (r.status === 401) { if (onSessionExpired) onSessionExpired(); return }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`) }
      const data = await r.json()
      setMe(data)
      if (setAuthUser) setAuthUser(prev => prev ? { ...prev, encryption_salt: data.encryption_salt, wrapped_dek: data.wrapped_dek } : prev)
    } catch (e) {
      setStatusError(e.message || 'Could not load encryption status')
    } finally { setStatusLoading(false) }
  }

  useEffect(() => { fetchStatus() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authToken) return
    fetch(`${API_BASE}/api/plaid/items`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(items => setPlaidConnected(Array.isArray(items) && items.length > 0))
      .catch(() => {}) // non-critical status decoration -- fine if it fails open
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = Boolean(me && me.wrapped_dek)
  const encryptedText = fieldsText(ENCRYPTED_FIELDS)
  const readableText = fieldsText(ALL_TXN_FIELDS.filter(f => !ENCRYPTED_FIELDS.includes(f)))

  const handleEnable = async (e) => {
    e.preventDefault()
    if (!password) { setEnableError('Enter your password to continue.'); return }
    setEnableLoading(true); setEnableError(null)
    try {
      // The password field here IS the account login password -- verify it against
      // the real login endpoint before deriving anything from it. Otherwise a typo
      // silently produces a KEK login can never reproduce (permanent lockout).
      const email = me?.email || authUser?.email
      if (!email) throw new Error('Could not verify your account -- reload the page and try again.')
      const verifyRes = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (verifyRes.status === 401) throw new Error('That is not your account password.')
      if (!verifyRes.ok) { const j = await verifyRes.json().catch(() => ({})); throw new Error(j.detail || `Could not verify your password (HTTP ${verifyRes.status})`) }

      const setup = await setupEncryption(password)
      const sample = {}
      for (const f of ENCRYPTED_FIELDS) sample[f] = `selftest-${f}`
      const ok = await verifyRoundTrip(setup.dek, sample)
      if (!ok) throw new Error("Encryption self-test failed in this browser -- refusing to enable. Try a different browser, or contact support.")

      // Hold the codes in state and cache the DEK in this browser BEFORE telling the
      // server anything. If the POST below fails or throws, the account was never
      // marked enabled server-side, so there is no reachable state where the server
      // says "enabled" but the codes were never shown -- the codes/dek are simply
      // discarded in the catch block below instead.
      setSetupResult(setup)
      await storeDek(setup.dek)

      const envelope = { v: PAYLOAD_VERSION, password: setup.wrappedPassword, recovery: setup.wrappedRecovery }
      const r = await fetch(`${API_BASE}/api/auth/encryption-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ encryption_salt: setup.salt, wrapped_dek: envelope }),
      })
      if (r.status === 401) { setSetupResult(null); clearDek(); if (onSessionExpired) onSessionExpired(); return }
      if (r.status === 409) throw new Error('Encryption is already enabled for this account.')
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`) }

      const wrappedDekStr = JSON.stringify(envelope)
      setMe(prev => ({ ...(prev || {}), encryption_salt: setup.salt, wrapped_dek: wrappedDekStr }))
      if (setAuthUser) setAuthUser(prev => prev ? { ...prev, encryption_salt: setup.salt, wrapped_dek: wrappedDekStr } : prev)

      setCodesSaved(false)
      setCopyStatus('')
      setPassword('')
      setView('codes')
    } catch (e) {
      // Server never confirmed "enabled" (or we bailed before finding out) -- discard
      // the generated codes and session DEK so nothing is left half-set-up.
      setSetupResult(null)
      clearDek()
      setEnableError(e.message || 'Could not enable encryption')
    } finally { setEnableLoading(false) }
  }

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(setupResult.recoveryCodes.join('\n'))
      setCopyStatus('Copied to clipboard.')
    } catch {
      setCopyStatus('Could not copy automatically -- select the codes above and copy manually.')
    }
    setTimeout(() => setCopyStatus(''), 3000)
  }

  const downloadCodes = () => {
    const blob = new Blob([setupResult.recoveryCodes.join('\n') + '\n'], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'spendscope-recovery-codes.txt'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const confirmCodesSaved = () => {
    setSetupResult(null)
    setView('status')
    setBanner(`Encryption enabled. Your ${encryptedText} will be encrypted from now on.`)
    setTimeout(() => setBanner(null), 5000)
  }

  const handleRecoverSubmit = async (e) => {
    e.preventDefault()
    const code = recoveryCodeInput.trim().toUpperCase()
    if (!code) { setRecoverError('Enter a recovery code.'); return }
    setRecoverLoading(true); setRecoverError(null)
    try {
      const r = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() })
      if (r.status === 401) { if (onSessionExpired) onSessionExpired(); return }
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || `HTTP ${r.status}`) }
      const data = await r.json()
      if (!data.encryption_salt || !data.wrapped_dek) throw new Error('Encryption is not set up on this account -- there is nothing to recover.')

      let envelope
      try { envelope = typeof data.wrapped_dek === 'string' ? JSON.parse(data.wrapped_dek) : data.wrapped_dek }
      catch { throw new Error("This account's stored encryption data looks corrupted and could not be read.") }

      const wrappedRecoveryArray = envelope.recovery || []
      if (!wrappedRecoveryArray.length) throw new Error('No recovery codes are on file for this account.')

      let dek
      try { dek = await unlockWithRecoveryCode(code, data.encryption_salt, wrappedRecoveryArray) }
      catch { throw new Error('That recovery code was not accepted. Check for typos -- codes are 8 characters, letters and numbers -- and try again.') }

      await storeDek(dek)
      setRecoveryCodeInput('')
      setView('recovered')
    } catch (e) {
      setRecoverError(e.message || 'Recovery failed')
    } finally { setRecoverLoading(false) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setCpError(null)
    if (!cpCurrent) { setCpError('Enter your current password.'); return }
    if (cpNew.length < 8) { setCpError('New password must be at least 8 characters.'); return }
    if (cpNew !== cpConfirm) { setCpError('New password and confirmation do not match.'); return }
    setCpLoading(true)
    try {
      const body = { current_password: cpCurrent, new_password: cpNew }
      let newDek = null

      if (enabled) {
        if (!me.encryption_salt || !me.wrapped_dek) throw new Error('Encryption status looks inconsistent -- reload the page and try again.')
        let envelope
        try { envelope = typeof me.wrapped_dek === 'string' ? JSON.parse(me.wrapped_dek) : me.wrapped_dek }
        catch { throw new Error("This account's stored encryption data looks corrupted and could not be read.") }

        let dek
        try { dek = await unlockWithPassword(cpCurrent, me.encryption_salt, envelope.password) }
        catch { throw new Error('Current password is incorrect.') }
        newDek = dek

        // Same DEK, same salt -- only re-wrap the password slot under the new KEK.
        // Recovery slots are unchanged; copy them verbatim from the existing envelope.
        const newKek = await deriveKek(cpNew, me.encryption_salt)
        const newWrappedPassword = await wrapDek(newKek, dek)
        body.wrapped_dek = { v: PAYLOAD_VERSION, password: newWrappedPassword, recovery: envelope.recovery }
      }

      const r = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.detail || (r.status === 401 ? 'Current password is incorrect.' : `HTTP ${r.status}`)) }

      if (newDek) await storeDek(newDek) // DEK itself is unchanged -- just re-cache it
      if (body.wrapped_dek) {
        // Keep the cached envelope in sync with what the server just committed --
        // otherwise a second Change password in this same panel open unwraps against
        // the STALE envelope (still wrapped under the OLD password) and fails
        // client-side even though the new password is correct. Mirrors handleEnable.
        const wrappedDekStr = JSON.stringify(body.wrapped_dek)
        setMe(prev => ({ ...(prev || {}), wrapped_dek: wrappedDekStr }))
        if (setAuthUser) setAuthUser(prev => prev ? { ...prev, wrapped_dek: wrappedDekStr } : prev)
      }
      setCpCurrent(''); setCpNew(''); setCpConfirm('')
      setView('status')
      setBanner('Password changed.')
      setTimeout(() => setBanner(null), 5000)
    } catch (e) {
      setCpError(e.message || 'Could not change password')
    } finally { setCpLoading(false) }
  }

  const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '15px', outline: 'none', marginBottom: '12px', boxSizing: 'border-box' }
  const primaryBtn = (disabled) => ({ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` })
  const secondaryBtn = { flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '14px', fontWeight: 500 }
  const errorBox = { fontSize: '12px', color: t.red, margin: '0 0 12px', lineHeight: 1.4, textAlign: 'left' }
  const heading = { fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }
  const subtext = { fontSize: '13px', color: t.textLight, margin: '0 0 20px', lineHeight: 1.5, textAlign: 'left' }

  const canDismiss = view !== 'codes' && !enableLoading

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={e => { if (canDismiss && e.target === e.currentTarget && onClose) onClose() }}>
      <div style={{ background: t.card, borderRadius: '24px', padding: '40px', maxWidth: '440px', width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center', position: 'relative' }}>
        {Sphere && <Sphere size="60px" color={t.teal} top="-15px" right="-15px" opacity={0.3} />}

        {view === 'status' && (
          <>
            <h2 style={heading}>Encryption</h2>
            <p style={subtext}>{me?.email || 'Your privacy settings'}</p>
            {banner && <div style={{ fontSize: '12px', color: t.green, background: `${t.green}12`, borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', textAlign: 'left' }}>{banner}</div>}
            {statusLoading && <p style={{ fontSize: '13px', color: t.textLight }}>Loading status...</p>}
            {statusError && (
              <div style={errorBox}>
                {statusError}
                <div><button onClick={fetchStatus} style={{ marginTop: '8px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: '12px', cursor: 'pointer' }}>Retry</button></div>
              </div>
            )}
            {!statusLoading && !statusError && (
              <>
                <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, letterSpacing: '0.5px', color: enabled ? t.green : t.textLight, background: enabled ? `${t.green}15` : `${t.textLight}15`, marginBottom: '16px' }}>
                  ENCRYPTION {enabled ? 'ON' : 'OFF'}
                </div>
                <p style={subtext}>
                  {enabled
                    ? `Your ${encryptedText} are encrypted in your browser -- we can never read them. Your ${readableText} stay in plain text so your charts, Coach, and insights keep working.`
                    : `When enabled, your ${encryptedText} are encrypted in your browser -- we can never read them. Your ${readableText} would stay in plain text so your charts, Coach, and insights keep working.`}
                </p>
                {plaidConnected && (
                  <div style={{ fontSize: '12px', color: t.sand, background: `${t.sand}15`, borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', textAlign: 'left', lineHeight: 1.4 }}>
                    Heads up: transactions synced from a connected bank (Plaid) are <strong>not</strong> encrypted -- this is a known gap in the current build. Only transactions you upload or edit manually get this protection right now.
                  </div>
                )}
                {!enabled && (
                  <button onClick={() => { setEnableError(null); setPassword(''); setView('enable') }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40`, marginBottom: '10px' }}>
                    Enable encryption
                  </button>
                )}
                {enabled && (
                  <button onClick={() => { setRecoverError(null); setRecoveryCodeInput(''); setView('recoverCode') }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>
                    Forgot your password? Recover with a code
                  </button>
                )}
              </>
            )}
            <button onClick={() => { setCpError(null); setCpCurrent(''); setCpNew(''); setCpConfirm(''); setView('changePassword') }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>
              Change password
            </button>
            <button onClick={onClose} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '14px', fontWeight: 500 }}>Close</button>
          </>
        )}

        {view === 'enable' && (
          <form onSubmit={handleEnable}>
            <h2 style={heading}>Enable encryption</h2>
            <p style={subtext}>
              Your {encryptedText} are encrypted in your browser -- we can never read them.
              Your {readableText} stay readable so your charts and Coach keep working.
            </p>
            <div style={{ fontSize: '12px', color: t.sand, background: `${t.sand}15`, borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', textAlign: 'left', lineHeight: 1.4 }}>
              This does not encrypt transactions you already imported -- only new imports, from the moment you enable this, are encrypted.
            </div>
            <p style={subtext}>Re-enter your account password below (the one you log in with). We verify it first, then use it in this browser to generate your encryption key -- the key itself never leaves your browser.</p>
            {enableError && <div style={errorBox}>{enableError}</div>}
            <input type="password" placeholder="Your account password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} autoFocus />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setView('status')} style={secondaryBtn} disabled={enableLoading}>Cancel</button>
              <button type="submit" style={primaryBtn(enableLoading)} disabled={enableLoading}>{enableLoading ? 'Enabling...' : 'Enable'}</button>
            </div>
          </form>
        )}

        {view === 'codes' && setupResult && (
          <>
            <h2 style={heading}>Save your recovery codes</h2>
            <p style={subtext}>
              These 10 codes are the <strong>only</strong> way to get your data back if you forget your password.
              We cannot recover it for you -- there is no "reset password" link and no support ticket that gets your
              encrypted data back. Save them somewhere safe right now.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', textAlign: 'left' }}>
              {setupResult.recoveryCodes.map((code, i) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: '14px', color: t.text, background: t.bg, border: `1px solid ${t.border}`, borderRadius: '8px', padding: '8px 10px' }}>
                  <span style={{ color: t.textLight, marginRight: '6px' }}>{i + 1}.</span>{code}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
              <button type="button" onClick={copyCodes} style={secondaryBtn}>Copy to clipboard</button>
              <button type="button" onClick={downloadCodes} style={secondaryBtn}>Download as text</button>
            </div>
            {copyStatus && <p style={{ fontSize: '12px', color: t.textLight, margin: '0 0 12px' }}>{copyStatus}</p>}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: t.text, margin: '12px 0 16px', cursor: 'pointer', textAlign: 'left' }}>
              <input type="checkbox" checked={codesSaved} onChange={e => setCodesSaved(e.target.checked)} style={{ marginTop: '2px' }} />
              <span>I have saved these codes.</span>
            </label>
            <button onClick={confirmCodesSaved} disabled={!codesSaved} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', cursor: codesSaved ? 'pointer' : 'default', opacity: codesSaved ? 1 : 0.5, background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>
              Done
            </button>
          </>
        )}

        {view === 'recoverCode' && (
          <form onSubmit={handleRecoverSubmit}>
            <h2 style={heading}>Recover with a code</h2>
            <p style={subtext}>Enter one of your 10 recovery codes to unlock your encrypted data in this browser.</p>
            {recoverError && <div style={errorBox}>{recoverError}</div>}
            <input type="text" placeholder="e.g. 8FQZ2K7T" value={recoveryCodeInput} onChange={e => setRecoveryCodeInput(e.target.value.toUpperCase())} style={{ ...inputStyle, fontFamily: 'monospace', textAlign: 'center', letterSpacing: '2px' }} autoFocus />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setView('status')} style={secondaryBtn} disabled={recoverLoading}>Cancel</button>
              <button type="submit" style={primaryBtn(recoverLoading)} disabled={recoverLoading}>{recoverLoading ? 'Checking...' : 'Unlock'}</button>
            </div>
          </form>
        )}

        {view === 'changePassword' && (
          <form onSubmit={handleChangePassword}>
            <h2 style={heading}>Change password</h2>
            <p style={subtext}>Enter your current password and choose a new one (at least 8 characters).</p>
            {cpError && <div style={errorBox}>{cpError}</div>}
            <input type="password" placeholder="Current password" value={cpCurrent} onChange={e => setCpCurrent(e.target.value)} style={inputStyle} autoFocus />
            <input type="password" placeholder="New password" value={cpNew} onChange={e => setCpNew(e.target.value)} style={inputStyle} />
            <input type="password" placeholder="Confirm new password" value={cpConfirm} onChange={e => setCpConfirm(e.target.value)} style={inputStyle} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setView('status')} style={secondaryBtn} disabled={cpLoading}>Cancel</button>
              <button type="submit" style={primaryBtn(cpLoading)} disabled={cpLoading}>{cpLoading ? 'Changing...' : 'Change password'}</button>
            </div>
          </form>
        )}

        {view === 'recovered' && (
          <>
            <h2 style={heading}>Data unlocked</h2>
            <p style={subtext}>
              That recovery code worked -- your encrypted data is unlocked in this browser for this session.
            </p>
            <div style={{ fontSize: '12px', color: t.sand, background: `${t.sand}15`, borderRadius: '10px', padding: '10px 12px', marginBottom: '16px', textAlign: 'left', lineHeight: 1.4 }}>
              This unlocks your data for this session only -- it does not change your account password.
              To set a new password, log in and use Change password.
            </div>
            <button onClick={() => { setView('status'); setBanner('Your data is unlocked in this browser for this session.'); setTimeout(() => setBanner(null), 5000) }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
