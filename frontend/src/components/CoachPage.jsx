import { useState, useEffect } from 'react'
import { API_BASE as DEFAULT_API_BASE, fmt, fmtShort } from '../constants'

export const CoachPage = ({ t, currency, data, authToken, authHeaders, API_BASE: apiBase, userName }) => {
  const [plan, setPlan] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState(null)
  const [orbState, setOrbState] = useState('idle')
  const [cachedAt, setCachedAt] = useState(null)
  const [expanded, setExpanded] = useState({}) // { strategyIdx: true } -- which cards are expanded
  const [expandedRisk, setExpandedRisk] = useState(null)
  const [doneStrategies, setDoneStrategies] = useState({}) // user-marked done
  const base = apiBase || DEFAULT_API_BASE

  const fetchCached = async () => {
    if (!authToken) return false
    try {
      const r = await fetch(`${base}/api/coaching/plan-cached`, { headers: authHeaders() })
      if (r.ok) {
        const result = await r.json()
        if (result.plan) { setPlan(result); setCachedAt(result.cached_at ? new Date(result.cached_at * 1000) : null); setOrbState('done'); return true }
      }
    } catch {}
    return false
  }

  const fetchStream = async () => {
    if (!authToken || data.length === 0) return
    setStreaming(true); setStreamText(''); setPlan(null); setError(null); setOrbState('thinking')
    setExpanded({}); setExpandedRisk(null)
    try {
      const r = await fetch(`${base}/api/coaching/plan-stream`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } })
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buffer = '', accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.token) { accumulated += event.token; setStreamText(accumulated) }
            if (event.done) { setPlan(event); setCachedAt(new Date()); setOrbState('done') }
            if (event.error) { setError(event.error); setOrbState('idle') }
          } catch {}
        }
      }
      if (!plan && accumulated && !error) {
        try {
          const r2 = await fetch(`${base}/api/coaching/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } })
          const result = await r2.json()
          if (result.error) setError(result.error)
          else { setPlan(result); setOrbState('done'); setCachedAt(new Date()) }
        } catch { setError('Could not generate plan.') }
      }
    } catch {
      try {
        const r = await fetch(`${base}/api/coaching/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } })
        const result = await r.json()
        if (result.error) setError(result.error)
        else { setPlan(result); setOrbState('done'); setCachedAt(new Date()) }
      } catch { setError('Could not generate plan.') }
    }
    setStreaming(false)
  }

  useEffect(() => { const init = async () => { const cached = await fetchCached(); if (!cached && data.length > 0) fetchStream() }; init() }, [authToken, data.length])

  const glass = { background: t.card, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.cardShadow, padding: '24px', position: 'relative', overflow: 'hidden' }
  const label = { fontSize: '11px', fontWeight: 700, color: t.textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }

  if (data.length === 0) {
    return (
      <div style={{ ...glass, textAlign: 'center', padding: '60px 28px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>&#x1F4CA;</div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>No data yet</h2>
        <p style={{ fontSize: '14px', color: t.textMuted, margin: 0 }}>Import some transactions first to get personalized coaching.</p>
      </div>
    )
  }

  const p = plan?.plan || plan || {}
  // New schema: strategies as objects. Fallback to legacy: strategy/strategies as strings.
  const rawStrategies = p.strategies || p.strategy || []
  const strategies = rawStrategies.map((s, i) => {
    if (typeof s === 'string') {
      // Legacy fallback: old plan format
      return { icon: '🎯', category: `Tip ${i + 1}`, action: s, detail: '', current_amount: null, savings_amount: null, savings_period: 'month' }
    }
    return s
  })
  const rawRisks = p.risks || []
  const risks = rawRisks.map((r) => typeof r === 'string' ? { label: 'Risk', detail: r } : r)
  const savingsTip = typeof p.savings_tip === 'object' ? p.savings_tip : (p.savings_tip ? { action: p.savings_tip, amount: null, detail: '' } : null)

  // Total potential weekly savings (for hero subtitle)
  const totalWeeklySavings = strategies.reduce((sum, s) => {
    if (!s.savings_amount) return sum
    return sum + (s.savings_period === 'month' ? s.savings_amount / 4 : s.savings_amount)
  }, 0)

  const toggle = (i) => setExpanded(e => ({ ...e, [i]: !e[i] }))
  const toggleDone = (i) => setDoneStrategies(d => ({ ...d, [i]: !d[i] }))

  return (<>
    {/* Compact AI Orb */}
    <div style={{ textAlign: 'center', marginBottom: '24px', paddingTop: '8px' }}>
      <div className={`ai-orb ${orbState}`} style={{ margin: '0 auto 16px', width: '70px', height: '70px' }} />
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
        {streaming ? 'Analyzing...' : plan ? `Here's your plan, ${userName || 'there'}` : 'Your AI Money Coach'}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '6px' }}>
        {cachedAt && !streaming && <span style={{ fontSize: '11px', color: t.textMuted }}>Updated {Math.round((Date.now() - cachedAt.getTime()) / 60000)} min ago</span>}
        <button onClick={fetchStream} disabled={streaming} style={{ padding: '5px 14px', borderRadius: '20px', border: `1px solid ${t.border}`, cursor: streaming ? 'not-allowed' : 'pointer', background: 'transparent', color: t.teal, fontSize: '11px', fontWeight: 600, opacity: streaming ? 0.5 : 1 }}>
          {streaming ? 'Generating...' : 'Refresh'}
        </button>
      </div>
    </div>

    {/* Streaming text feedback */}
    {streaming && !plan && streamText && (
      <div style={{ ...glass, marginBottom: '24px', maxHeight: '150px', overflow: 'hidden', position: 'relative' }}>
        <p className="streaming-cursor" style={{ fontSize: '12px', color: t.textMuted, margin: 0, lineHeight: '1.6', whiteSpace: 'pre-wrap', opacity: 0.6 }}>{streamText.slice(-300)}</p>
      </div>
    )}

    {/* Loading skeleton */}
    {streaming && !plan && !streamText && (
      <div style={{ ...glass, height: '200px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: t.textMuted, fontSize: '13px' }}>Reading your transactions...</p>
      </div>
    )}

    {/* Error */}
    {error && !streaming && (
      <div style={{ ...glass, textAlign: 'center', padding: '48px 28px' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>&#x2699;</div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>AI coaching is being set up</h3>
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>Check back soon.</p>
      </div>
    )}

    {/* Plan loaded */}
    {plan && !streaming && (
      <div className="fade-in">

        {/* HERO: Daily budget as the focal point */}
        <div style={{ ...glass, marginBottom: '20px', padding: '36px 28px', textAlign: 'center', background: t.gradient || `linear-gradient(135deg, ${t.tealDark}, ${t.accentPurple || t.tealDeep})`, border: 'none' }}>
          <p style={{ ...label, color: 'rgba(255,255,255,0.7)' }}>Your Daily Budget</p>
          <p style={{ fontSize: '64px', fontWeight: 800, color: '#ffffff', margin: '8px 0 0', letterSpacing: '-3px', lineHeight: 1 }}>
            {currency}{p.daily_budget != null ? fmt(p.daily_budget, 0) : '--'}
            <span style={{ fontSize: '20px', fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginLeft: '4px' }}>/day</span>
          </p>
          {totalWeeklySavings > 0 && (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: '14px 0 0', fontWeight: 500 }}>
              Stick to this and save {currency}{fmtShort(totalWeeklySavings * 4)} this month
            </p>
          )}
          {p.summary && (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', margin: '12px 0 0', lineHeight: '1.5', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>{p.summary}</p>
          )}
        </div>

        {/* SAVINGS TIP -- gradient bordered callout */}
        {savingsTip && savingsTip.action && (
          <div style={{ position: 'relative', marginBottom: '24px', padding: '1px', borderRadius: '20px', background: t.gradient || `linear-gradient(135deg, ${t.tealDark}, ${t.accentPurple || t.tealDeep})` }}>
            <div style={{ ...glass, margin: 0, borderRadius: '19px', border: 'none', display: 'flex', alignItems: 'center', gap: '16px', padding: '20px 24px' }}>
              <div style={{ fontSize: '32px' }}>✨</div>
              <div style={{ flex: 1 }}>
                <p style={{ ...label, color: t.teal, marginBottom: '4px' }}>Smart Move</p>
                <p style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 2px' }}>
                  {savingsTip.action}
                  {savingsTip.amount != null && <span style={{ color: t.teal, marginLeft: '8px' }}>({currency}{fmt(savingsTip.amount, 0)})</span>}
                </p>
                {savingsTip.detail && <p style={{ fontSize: '12px', color: t.textMuted, margin: 0, lineHeight: '1.5' }}>{savingsTip.detail}</p>}
              </div>
            </div>
          </div>
        )}

        {/* STRATEGIES -- impact cards in 2-col grid */}
        {strategies.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <p style={{ ...label, marginBottom: '14px', paddingLeft: '4px' }}>Action Plan</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
              {strategies.map((s, i) => {
                const isExpanded = expanded[i]
                const isDone = doneStrategies[i]
                return (
                  <div key={i} style={{ ...glass, padding: '20px', opacity: isDone ? 0.5 : 1, transition: 'opacity 0.3s', borderColor: isDone ? `${t.green}40` : t.border }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '28px', lineHeight: 1 }}>{s.icon || '🎯'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {s.savings_amount != null ? (
                          <>
                            <p style={{ fontSize: '24px', fontWeight: 800, color: t.green, margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>
                              Save {currency}{fmt(s.savings_amount, 0)}
                              <span style={{ fontSize: '13px', fontWeight: 500, color: t.textMuted, marginLeft: '4px' }}>/{s.savings_period || 'month'}</span>
                            </p>
                            {s.category && s.current_amount != null && (
                              <p style={{ fontSize: '12px', color: t.textMuted, margin: '6px 0 0' }}>
                                {s.category} · {currency}{fmt(s.current_amount, 0)} now
                              </p>
                            )}
                          </>
                        ) : (
                          <p style={{ fontSize: '15px', fontWeight: 700, color: t.text, margin: 0 }}>{s.category || `Tip ${i + 1}`}</p>
                        )}
                      </div>
                    </div>

                    <p style={{ fontSize: '14px', fontWeight: 600, color: t.text, margin: '0 0 12px', lineHeight: '1.4' }}>{s.action}</p>

                    {isExpanded && s.detail && (
                      <p style={{ fontSize: '13px', color: t.textLight, margin: '0 0 14px', lineHeight: '1.6', paddingTop: '4px', borderTop: `1px solid ${t.border}` }}>{s.detail}</p>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${t.border}` }}>
                      <button onClick={() => toggleDone(i)} style={{ flex: 1, padding: '8px 12px', borderRadius: '10px', border: `1px solid ${isDone ? t.green : t.border}`, background: isDone ? `${t.green}20` : 'transparent', color: isDone ? t.green : t.textLight, fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                        {isDone ? '✓ Done' : 'Mark Done'}
                      </button>
                      {s.detail && (
                        <button onClick={() => toggle(i)} style={{ flex: 1, padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: 'transparent', color: t.teal, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                          {isExpanded ? 'Less' : 'How →'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* RISKS as pills */}
        {risks.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <p style={{ ...label, marginBottom: '12px', paddingLeft: '4px' }}>Watch Out</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {risks.map((risk, i) => (
                <button key={i} onClick={() => setExpandedRisk(expandedRisk === i ? null : i)}
                  style={{ padding: '8px 14px', borderRadius: '20px', border: `1px solid ${t.red}40`, background: `${t.red}15`, color: t.red, fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ⚠ {risk.label || `Risk ${i + 1}`}
                </button>
              ))}
            </div>
            {expandedRisk !== null && risks[expandedRisk]?.detail && (
              <div style={{ ...glass, marginTop: '12px', padding: '14px 18px', borderLeft: `3px solid ${t.red}` }}>
                <p style={{ fontSize: '13px', color: t.textLight, margin: 0, lineHeight: '1.5' }}>{risks[expandedRisk].detail}</p>
              </div>
            )}
          </div>
        )}

        {/* DEBT -- inline if present */}
        {p.debt_advice && (
          <div style={{ ...glass, marginBottom: '20px', borderLeft: `3px solid ${t.sand}`, padding: '16px 20px' }}>
            <p style={{ ...label, marginBottom: '6px' }}>💳 Debt</p>
            <p style={{ fontSize: '13px', color: t.textLight, margin: 0, lineHeight: '1.5' }}>{p.debt_advice}</p>
          </div>
        )}

        {/* ENCOURAGEMENT */}
        {p.encouragement && (
          <div style={{ textAlign: 'center', padding: '16px', marginTop: '4px' }}>
            <p style={{ fontSize: '13px', fontWeight: 500, color: t.teal, margin: 0, fontStyle: 'italic', opacity: 0.85 }}>{p.encouragement}</p>
          </div>
        )}
      </div>
    )}
  </>)
}
