import { useState, useEffect } from 'react'
import { API_BASE as DEFAULT_API_BASE, fmt, fmtShort } from '../constants'

// Phase 14D: Coach is now the action tracker, not a stats dashboard.
// Stats live on Dashboard / Spending / Insights / Merchants -- this page is
// dedicated to specific actions ranked by impact, with mark-done tracking.

const DONE_STORAGE_KEY = 'spendscope_done_actions'

function loadDone() {
  try {
    const raw = localStorage.getItem(DONE_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}
function saveDone(state) {
  try { localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(state)) } catch {}
}

const PRIORITY_BORDER = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
}

export const CoachPage = ({ t, currency, data, authToken, authHeaders, API_BASE: apiBase, userName, onSessionExpired }) => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [doneState, setDoneState] = useState(loadDone)
  const [expanded, setExpanded] = useState({})
  const base = apiBase || DEFAULT_API_BASE

  const fetchStats = async () => {
    if (!authToken) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${base}/api/coaching/stats`, { headers: authHeaders() })
      if (r.status === 401) {
        // JWT expired -- show a friendly re-login prompt instead of a bare error
        setError('SESSION_EXPIRED')
        return
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      setStats(await r.json())
    } catch (e) {
      setError(e.message || 'Could not load action plan')
    } finally { setLoading(false) }
  }

  useEffect(() => { if (authToken && data.length > 0) fetchStats() }, [authToken, data.length])
  useEffect(() => { saveDone(doneState) }, [doneState])

  const toggleDone = (id) => setDoneState(d => ({ ...d, [id]: !d[id] }))
  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const glass = {
    background: t.card,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${t.border}`,
    borderRadius: '20px',
    boxShadow: t.cardShadow,
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  }

  // No data yet
  if (data.length === 0 || stats?.empty) {
    return (
      <div style={{ ...glass, textAlign: 'center', padding: '60px 28px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>{'\u{1F3AF}'}</div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>Action plan unlocks with data</h2>
        <p style={{ fontSize: '14px', color: t.textMuted, margin: 0 }}>
          Import a few weeks of transactions to see what's worth working on.
        </p>
      </div>
    )
  }
  if (loading && !stats) {
    return <div style={{ ...glass, textAlign: 'center', padding: '60px 28px' }}>
      <p style={{ color: t.textMuted, fontSize: '13px', margin: 0 }}>Reading your spending...</p>
    </div>
  }
  if (error === 'SESSION_EXPIRED') {
    return (
      <div style={{ ...glass, textAlign: 'center', padding: '48px 28px' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>{'\u{1F512}'}</div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>Session expired</h3>
        <p style={{ fontSize: '13px', color: t.textMuted, margin: '0 0 18px' }}>
          Log in again to refresh your action plan. Your data is safe.
        </p>
        <button
          onClick={() => { if (onSessionExpired) onSessionExpired() }}
          style={{
            padding: '10px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white',
            fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30`,
          }}
        >Log in again</button>
      </div>
    )
  }
  if (error && !stats) {
    return <div style={{ ...glass, textAlign: 'center', padding: '48px 28px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>Couldn't load actions</h3>
      <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>{error}</p>
    </div>
  }
  if (!stats) return null

  const actions = stats.action_plan || []
  const wins = stats.wins || []
  const tm = stats.this_month || {}
  const totalUndoneImpact = actions
    .filter(a => !doneState[a.id] && a.impact_period === 'month')
    .reduce((s, a) => s + (a.impact_amount || 0), 0)

  const allDone = actions.length > 0 && actions.every(a => doneState[a.id])

  return (<>
    {/* Compact header -- no big stat hero (those live on Dashboard) */}
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
        Your moves this week, {userName || 'there'}
      </h2>
      <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
        Specific actions ranked by impact. Tick them off as you do them. All math runs on your device.
      </p>
    </div>

    {/* Total potential savings strip -- light, just one line */}
    {totalUndoneImpact > 0 && (
      <div style={{
        ...glass,
        marginBottom: '16px',
        padding: '14px 20px',
        background: `linear-gradient(135deg, ${t.tealDark}25, ${t.tealDeep || t.tealDark}40)`,
        border: `1px solid ${t.teal}30`,
      }}>
        <p style={{ fontSize: '11px', color: t.textMuted, margin: '0 0 2px', letterSpacing: '0.5px', textTransform: 'uppercase', fontWeight: 700 }}>Potential savings if you act</p>
        <p style={{ fontSize: '20px', fontWeight: 800, color: t.teal, margin: 0, letterSpacing: '-0.3px' }}>
          {currency}{fmt(totalUndoneImpact, 0)}<span style={{ fontSize: '12px', fontWeight: 500, color: t.textMuted, marginLeft: '6px' }}>/ month</span>
        </p>
      </div>
    )}

    {/* Empty action plan -- nothing to fix, that's actually good */}
    {actions.length === 0 && (
      <div style={{ ...glass, textAlign: 'center', padding: '36px 28px', marginBottom: '16px' }}>
        <div style={{ fontSize: '36px', marginBottom: '10px' }}>{'\u2728'}</div>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 6px' }}>Nothing flagged right now</h3>
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
          Your spending looks balanced -- no overspend, no category way above typical, no obvious subs to review. Keep going.
        </p>
      </div>
    )}

    {/* All-done celebration */}
    {allDone && (
      <div style={{
        ...glass,
        marginBottom: '16px',
        padding: '20px 24px',
        background: `linear-gradient(135deg, ${t.green}15, ${t.green}30)`,
        border: `1px solid ${t.green}50`,
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '15px', fontWeight: 700, color: t.green, margin: 0 }}>
          {'\u2713'} All actions checked off this week. Nice work.
        </p>
      </div>
    )}

    {/* Action cards */}
    {actions.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        {actions.map(a => {
          const isDone = !!doneState[a.id]
          const isExpanded = !!expanded[a.id]
          const borderColor = isDone ? `${t.green}50` : (PRIORITY_BORDER[a.priority] || t.border)

          return (
            <div key={a.id} style={{
              ...glass,
              padding: '18px 20px',
              borderLeft: `4px solid ${borderColor}`,
              opacity: isDone ? 0.55 : 1,
              transition: 'opacity 0.3s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                <div style={{ fontSize: '28px', lineHeight: 1, paddingTop: '2px' }}>{a.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12px', color: t.textMuted, fontWeight: 600, margin: '0 0 2px', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                    {a.title}{a.category && a.category !== a.title ? ` \u00B7 ${a.category}` : ''}
                  </p>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: t.text, margin: 0, textDecoration: isDone ? 'line-through' : 'none' }}>
                    {a.action_text}
                  </p>
                  <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>
                    Impact: <strong style={{ color: t.teal }}>{currency}{fmt(a.impact_amount, 0)}</strong> / {a.impact_period}
                  </p>
                  {isExpanded && a.detail && (
                    <p style={{ fontSize: '13px', color: t.textLight, margin: '12px 0 0', lineHeight: 1.5, paddingTop: '10px', borderTop: `1px solid ${t.border}` }}>
                      {a.detail}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button onClick={() => toggleDone(a.id)} style={{
                      padding: '6px 14px',
                      borderRadius: '10px',
                      border: `1px solid ${isDone ? t.green : t.border}`,
                      background: isDone ? `${t.green}20` : 'transparent',
                      color: isDone ? t.green : t.textLight,
                      fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    }}>
                      {isDone ? '\u2713 Done' : 'Mark done'}
                    </button>
                    {a.detail && (
                      <button onClick={() => toggleExpand(a.id)} style={{
                        padding: '6px 14px',
                        borderRadius: '10px',
                        border: `1px solid ${t.border}`,
                        background: 'transparent',
                        color: t.teal,
                        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      }}>
                        {isExpanded ? 'Hide details' : 'Why?'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )}

    {/* What's working */}
    {wins.length > 0 && (
      <div style={{ ...glass, padding: '16px 20px', marginBottom: '16px', background: `${t.green}06`, border: `1px solid ${t.green}25` }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 8px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>What's working</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {wins.map((w, i) => (
            <p key={i} style={{ fontSize: '13px', color: t.text, margin: 0, paddingLeft: '20px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, color: t.green }}>{'\u2713'}</span>
              {w}
            </p>
          ))}
        </div>
      </div>
    )}

    {/* Footer: subtle reference to daily allowance, not a whole card */}
    {tm.daily_allowance > 0 && tm.days_remaining > 0 && (
      <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 16px', textAlign: 'center' }}>
        Spend {currency}{fmt(tm.daily_allowance)}/day for the next {tm.days_remaining} day{tm.days_remaining === 1 ? '' : 's'} to stay on track this month.
      </p>
    )}

    {/* Refresh */}
    <div style={{ textAlign: 'center', marginTop: '4px' }}>
      <button onClick={fetchStats} disabled={loading} style={{
        padding: '8px 18px', borderRadius: '20px',
        border: `1px solid ${t.border}`, background: 'transparent', color: t.teal,
        fontSize: '12px', fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1,
      }}>{loading ? 'Refreshing...' : 'Refresh actions'}</button>
    </div>
  </>)
}
