import { useState } from 'react'

export const AuthPages = ({ t, mode, setMode, authPage, setAuthPage, authError, setAuthError, authLoading, handleLogin, handleSignup, COUNTRIES, CURRENCIES }) => {
    const AuthLoginForm = () => {
      const [email, setEmail] = useState(''), [password, setPassword] = useState('')
      return (
        <form onSubmit={e => { e.preventDefault(); handleLogin(email, password) }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Your password" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: authLoading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', fontSize: 15, fontWeight: 600, boxShadow: '0 4px 20px rgba(59,130,246,0.4)', opacity: authLoading ? 0.7 : 1, marginTop: 4 }}>{authLoading ? 'Signing in...' : 'Sign In'}</button>
        </form>
      )
    }
    const AuthSignupForm = () => {
      const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [country, setCountry] = useState('United States'), [curr, setCurr] = useState('USD')
      return (
        <form onSubmit={e => { e.preventDefault(); if (password.length < 6) { setAuthError('Password must be at least 6 characters'); return }; handleSignup(email, password, name, country, curr) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 6 characters" minLength={6} style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)} style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box', appearance: 'auto' }}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Currency</label>
              <select value={curr} onChange={e => setCurr(e.target.value)} style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: `1px solid ${t.border}`, background: 'rgba(255,255,255,0.05)', color: '#ffffff', fontSize: 13, outline: 'none', boxSizing: 'border-box', appearance: 'auto' }}>
                {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol === '$' ? 'USD' : c.symbol === '\u00A3' ? 'GBP' : c.symbol === '\u20AC' ? 'EUR' : c.symbol === '\u20B9' ? 'INR' : c.symbol === '\u00A5' ? 'JPY' : c.symbol === 'A$' ? 'AUD' : 'CAD'}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: authLoading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', fontSize: 15, fontWeight: 600, boxShadow: '0 4px 20px rgba(59,130,246,0.4)', opacity: authLoading ? 0.7 : 1, marginTop: 4 }}>{authLoading ? 'Creating account...' : 'Create Account'}</button>
        </form>
      )
    }
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0e1a, #151d2e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ width: '100%', maxWidth: '420px', padding: '40px', background: t.card, borderRadius: '24px', boxShadow: t.cardShadow, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 22 }}>S</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', margin: '12px 0 4px' }}>SpendScope</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{authPage === 'login' ? 'Sign in to your account' : 'Create your account'}</p>
          </div>
          {authError && <div style={{ background: 'rgba(212,98,94,0.1)', border: '1px solid rgba(212,98,94,0.2)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, color: t.red, fontSize: 13 }}>{authError}</div>}
          {authPage === 'login' ? <AuthLoginForm /> : <AuthSignupForm />}
          <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 20 }}>
            {authPage === 'login' ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => { setAuthPage(authPage === 'login' ? 'signup' : 'login'); setAuthError('') }} style={{ color: t.teal, cursor: 'pointer', fontWeight: 600 }}>
              {authPage === 'login' ? 'Sign up' : 'Log in'}
            </span>
          </p>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 12, cursor: 'pointer' }}>
              {mode === 'light' ? 'Dark' : 'Light'} Mode
            </button>
          </div>
        </div>
      </div>
    )

}
