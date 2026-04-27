import { useState } from 'react'

export default function ProfileModal({ t, authUser, showProfile, setShowProfile, profileInputRef, authToken, authHeaders, setAuthUser, API_BASE, userName, setUserName, handleLogout, Sphere, onWipeData }) {
  const [wipeStep, setWipeStep] = useState(0) // 0=hidden, 1=type-confirm, 2=in-progress
  const [wipeText, setWipeText] = useState('')
  const [wipeError, setWipeError] = useState('')

  const doWipe = async () => {
    if (wipeText.trim().toUpperCase() !== 'WIPE') { setWipeError('Type WIPE exactly to confirm'); return }
    setWipeStep(2); setWipeError('')
    try {
      const r = await fetch(`${API_BASE}/api/account/wipe-data`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } })
      if (!r.ok) { setWipeError(`Wipe failed (HTTP ${r.status})`); setWipeStep(1); return }
      // reset local state via parent callback (clears React state, preserves auth token)
      if (onWipeData) onWipeData()
      setShowProfile(false)
    } catch (e) {
      setWipeError(`Network error: ${e.message || 'unable to reach server'}`); setWipeStep(1)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowProfile(false) }}>
      <div style={{ background: t.card, borderRadius: '24px', padding: '40px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center', position: 'relative' }}>
        <Sphere size="60px" color={t.teal} top="-15px" right="-15px" opacity={0.3} />
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '20px', margin: '0 auto 20px', boxShadow: `0 6px 20px ${t.tealDark}50` }}>{(userName || 'H')[0].toUpperCase()}</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>Profile Settings</h2>
        <p style={{ fontSize: '13px', color: t.textLight, margin: '0 0 20px' }}>{authUser?.email || 'Update your profile'}</p>
        <input ref={profileInputRef} type="text" placeholder="Your name" defaultValue={userName} onKeyDown={e => { if (e.key === 'Enter') { const n = (profileInputRef.current?.value || '').trim() || 'Happy'; setUserName(n); localStorage.setItem('spendscope_name', n); if (authToken) fetch(`${API_BASE}/api/auth/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ name: n }) }).catch(console.error); setShowProfile(false) } }} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '15px', outline: 'none', textAlign: 'center', marginBottom: '12px', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowProfile(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '14px', fontWeight: 500 }}>Cancel</button>
          <button onClick={() => { const n = (profileInputRef.current?.value || '').trim() || 'Happy'; setUserName(n); localStorage.setItem('spendscope_name', n); if (authToken) fetch(`${API_BASE}/api/auth/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ name: n }) }).catch(console.error); setShowProfile(false) }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>Save</button>
        </div>
        <button onClick={() => { handleLogout(); setShowProfile(false) }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${t.red}30`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '14px', fontWeight: 500, marginTop: '16px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.red}08`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Log Out</button>

        {/* Danger Zone (Phase 10A) */}
        <div style={{ marginTop: '24px', padding: '16px', borderRadius: '12px', border: `1px solid ${t.red}40`, background: `${t.red}08`, textAlign: 'left' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: t.red, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Danger Zone</p>
          <p style={{ fontSize: '11px', color: t.textLight, margin: '0 0 10px', lineHeight: 1.4 }}>
            Permanently deletes every transaction, bank connection, account and rule on this profile. Your login stays. Cannot be undone.
          </p>
          {wipeStep === 0 && (
            <button onClick={() => { setWipeStep(1); setWipeText(''); setWipeError('') }} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: `1px solid ${t.red}60`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '13px', fontWeight: 600 }}>
              Wipe all my data
            </button>
          )}
          {wipeStep === 1 && (
            <>
              <p style={{ fontSize: '11px', color: t.text, margin: '0 0 6px' }}>Type <strong>WIPE</strong> below to confirm:</p>
              <input
                type="text"
                value={wipeText}
                onChange={e => setWipeText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doWipe() }}
                placeholder="WIPE"
                autoFocus
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `1px solid ${t.red}60`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', marginBottom: '8px', boxSizing: 'border-box' }}
              />
              {wipeError && <p style={{ fontSize: '11px', color: t.red, margin: '0 0 8px' }}>{wipeError}</p>}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => { setWipeStep(0); setWipeText(''); setWipeError('') }} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '12px', fontWeight: 500 }}>Cancel</button>
                <button onClick={doWipe} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: t.red, color: 'white', fontSize: '12px', fontWeight: 600 }}>Confirm wipe</button>
              </div>
            </>
          )}
          {wipeStep === 2 && (
            <p style={{ fontSize: '12px', color: t.textLight, margin: 0, textAlign: 'center' }}>Wiping...</p>
          )}
        </div>
      </div>
    </div>
  )
}
