export default function Sidebar({ t, mode, setMode, page, setPage, globalRange, setGlobalRange, currency, setCurrency, CURRENCIES, NAV, userName, setShowProfile, handleLogout, insightsSeen, setInsightsSeen, anomalies, accounts, activeAccount, setActiveAccount }) {
  return (
    <div style={{ width: '220px', background: t.sidebar, padding: '28px 16px', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 10, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingLeft: '8px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '18px', boxShadow: `0 6px 20px ${t.tealDark}50, inset 0 1px 1px rgba(255,255,255,0.2)` }}>S</div>
        <div><p style={{ color: '#F0EDE8', fontSize: '16px', fontWeight: 700, margin: 0 }}>SpendScope</p><p style={{ color: '#8FA3B0', fontSize: '10px', margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>Intelligence</p></div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => { setPage(n.id); if (n.id === 'insights') setInsightsSeen(true) }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', background: page === n.id ? `${t.tealDark}25` : 'transparent', color: page === n.id ? t.teal : '#8FA3B0', fontWeight: page === n.id ? 600 : 400, fontSize: '14px', transition: 'all 0.2s', borderLeft: page === n.id ? `3px solid ${t.teal}` : '3px solid transparent' }}
            onMouseEnter={e => { if (page !== n.id) e.currentTarget.style.background = t.sidebarHover }} onMouseLeave={e => { if (page !== n.id) e.currentTarget.style.background = 'transparent' }}>
            <span style={{ fontSize: '16px' }}>{n.icon}</span> {n.label}
            {n.id === 'insights' && anomalies.length > 0 && !insightsSeen && <span style={{ marginLeft: 'auto', background: t.red, color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>{anomalies.length}</span>}
          </button>
        ))}
      </nav>
      <div style={{ padding: '8px 8px 0' }}>
        <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '0 0 6px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Date Range</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
          {['1D', '1W', '1M', '3M', '6M', '1Y', 'All'].map(r => <button key={r} onClick={() => setGlobalRange(r)} style={{ flex: '1 1 auto', padding: '5px 0', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600, background: globalRange === r ? t.tealDark : 'rgba(255,255,255,0.05)', color: globalRange === r ? 'white' : '#8FA3B0', transition: 'all 0.2s' }}>{r}</button>)}
        </div>
      </div>
      <div style={{ padding: '8px 8px 0', marginTop: '8px' }}>
        <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '0 0 6px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Currency</p>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '12px', fontWeight: 500, cursor: 'pointer', outline: 'none', appearance: 'auto' }}>
          {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol} style={{ background: '#1C2230', color: '#8FA3B0' }}>{c.label}</option>)}
        </select>
      </div>
      {accounts.length > 0 && (
        <div style={{ padding: '8px 8px 0', marginTop: '8px' }}>
          <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '0 0 6px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Account</p>
          <select value={activeAccount} onChange={e => setActiveAccount(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '12px', fontWeight: 500, cursor: 'pointer', outline: 'none', appearance: 'auto' }}>
            <option value="All" style={{ background: '#1C2230', color: '#8FA3B0' }}>All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.name} style={{ background: '#1C2230', color: '#8FA3B0' }}>{a.name}</option>)}
          </select>
        </div>
      )}
      <div style={{ padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '12px' }}>
        <button onClick={() => setShowProfile(true)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s', marginBottom: '8px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
          <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>{(userName || 'H')[0].toUpperCase()}</div>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName || 'Happy'}</span>
        </button>
        <button onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s', marginBottom: '8px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
          <span style={{ fontSize: '18px' }}>{mode === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F'}</span>{mode === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
        <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,98,94,0.12)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
          <span style={{ fontSize: '16px' }}>{'\u2192'}</span>Log Out
        </button>
        <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '12px 0 0 4px', letterSpacing: '0.5px' }}>Built by Riya</p>
      </div>
    </div>
  )
}
