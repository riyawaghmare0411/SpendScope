export default function ProfileModal({ t, authUser, showProfile, setShowProfile, profileInputRef, authToken, authHeaders, setAuthUser, API_BASE, userName, setUserName, handleLogout, Sphere }) {
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
      </div>
    </div>
  )
}
