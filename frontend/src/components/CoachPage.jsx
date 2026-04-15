import { useState, useEffect } from 'react'
import { API_BASE as DEFAULT_API_BASE, fmt } from '../constants'

export const CoachPage = ({ t, currency, data, authToken, authHeaders, API_BASE: apiBase, userName }) => {
  const [plan, setPlan] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState(null)
  const [orbState, setOrbState] = useState('idle')
  const [cachedAt, setCachedAt] = useState(null)
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
        // Stream ended without done event -- try non-streaming fallback
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
  const strategies = p.strategy || p.strategies || []
  const risks = p.risks || []

  return (<>
    {/* AI Orb */}
    <div style={{ textAlign: 'center', marginBottom: '32px', paddingTop: '16px' }}>
      <div className={`ai-orb ${orbState}`} style={{ margin: '0 auto 20px' }} />
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
        {streaming ? 'Analyzing your finances...' : plan ? `Here's your plan, ${userName || 'there'}` : 'Your AI Money Coach'}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '8px' }}>
        {cachedAt && !streaming && <span style={{ fontSize: '12px', color: t.textMuted }}>Updated {Math.round((Date.now() - cachedAt.getTime()) / 60000)} min ago</span>}
        <button onClick={fetchStream} disabled={streaming} style={{ padding: '6px 16px', borderRadius: '20px', border: `1px solid ${t.border}`, cursor: streaming ? 'not-allowed' : 'pointer', background: streaming ? 'transparent' : t.card, color: t.teal, fontSize: '12px', fontWeight: 600, opacity: streaming ? 0.5 : 1, backdropFilter: 'blur(10px)', transition: 'all 0.2s' }}>
          {streaming ? 'Generating...' : 'Refresh'}
        </button>
      </div>
    </div>

    {/* Streaming text */}
    {streaming && !plan && streamText && (
      <div style={{ ...glass, marginBottom: '24px' }}>
        <p className="streaming-cursor" style={{ fontSize: '14px', color: t.textLight, margin: 0, lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{streamText}</p>
      </div>
    )}

    {/* Loading skeleton */}
    {streaming && !plan && !streamText && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...glass, height: '120px' }}>
            <div style={{ height: '12px', width: '40%', borderRadius: '6px', background: `${t.textMuted}20`, marginBottom: '12px' }} />
            <div style={{ height: '10px', width: '80%', borderRadius: '6px', background: `${t.textMuted}15`, marginBottom: '8px' }} />
            <div style={{ height: '10px', width: '60%', borderRadius: '6px', background: `${t.textMuted}10` }} />
          </div>
        ))}
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

    {/* Plan cards */}
    {plan && !streaming && (
      <div className="fade-in">
        {/* Summary */}
        {p.summary && (
          <div style={{ ...glass, marginBottom: '20px', background: t.gradient || `linear-gradient(135deg, ${t.tealDark}, ${t.accentPurple || t.tealDeep})`, border: 'none' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 10px' }}>Summary</p>
            <p style={{ fontSize: '15px', fontWeight: 500, color: '#ffffff', margin: 0, lineHeight: '1.7' }}>{p.summary}</p>
          </div>
        )}

        {/* Daily Budget + Savings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ ...glass, textAlign: 'center', padding: '32px 24px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 8px' }}>Daily Budget</p>
            <p style={{ fontSize: '48px', fontWeight: 800, color: t.teal, margin: '0', letterSpacing: '-2px', lineHeight: 1 }}>
              {currency}{p.daily_budget != null ? fmt(p.daily_budget, 0) : '--'}
            </p>
            <span style={{ fontSize: '16px', fontWeight: 500, color: t.textMuted }}>/day</span>
          </div>
          <div style={{ ...glass }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 12px' }}>Savings Tip</p>
            <p style={{ fontSize: '14px', fontWeight: 500, color: t.text, margin: 0, lineHeight: '1.6' }}>{p.savings_tip || 'Keep tracking to unlock tips.'}</p>
          </div>
        </div>

        {/* Strategy grid */}
        {strategies.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 14px', paddingLeft: '4px' }}>Strategy</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
              {strategies.map((tip, i) => (
                <div key={i} style={{ ...glass, padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: `${t.tealDark}20`, color: t.tealDark, fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                  <p style={{ fontSize: '13px', color: t.textLight, margin: 0, lineHeight: '1.5' }}>{tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks */}
        {risks.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 14px', paddingLeft: '4px' }}>Risks</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {risks.map((risk, i) => (
                <div key={i} style={{ ...glass, padding: '12px 16px', borderLeft: `3px solid ${t.red}`, borderRadius: '12px' }}>
                  <p style={{ fontSize: '13px', color: t.textLight, margin: 0, lineHeight: '1.5' }}>{risk}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debt */}
        {p.debt_advice && (
          <div style={{ ...glass, marginBottom: '20px', borderLeft: `3px solid ${t.sand}` }}>
            <p style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 10px' }}>Debt Progress</p>
            <p style={{ fontSize: '13px', color: t.textLight, margin: 0, lineHeight: '1.5' }}>{p.debt_advice}</p>
          </div>
        )}

        {/* Encouragement */}
        {p.encouragement && (
          <div style={{ textAlign: 'center', padding: '20px', marginTop: '8px' }}>
            <p style={{ fontSize: '14px', fontWeight: 500, color: t.teal, margin: 0, fontStyle: 'italic', opacity: 0.8 }}>{p.encouragement}</p>
          </div>
        )}
      </div>
    )}
  </>)
}
