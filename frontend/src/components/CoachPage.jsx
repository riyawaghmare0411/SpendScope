import { useState, useEffect } from 'react'
import { fmt } from '../constants'

export const CoachPage = ({ t, currency, data, authToken, authHeaders, API_BASE, userName }) => {
  // Cache plan in sessionStorage so it persists across page switches (not tab closes)
  const [plan, setPlan] = useState(() => {
    try { const cached = sessionStorage.getItem('spendscope_coach_plan'); return cached ? JSON.parse(cached) : null } catch { return null }
  })
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState(null)

  const fetchPlan = async () => {
    if (!authToken || data.length === 0) return
    setPlanLoading(true)
    setPlanError(null)
    try {
      const r = await fetch(`${API_BASE}/api/coaching/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      })
      const result = await r.json()
      if (result.error) setPlanError(result.error)
      else { setPlan(result); sessionStorage.setItem('spendscope_coach_plan', JSON.stringify(result)) }
    } catch (e) { setPlanError('Could not generate plan. Try again later.') }
    finally { setPlanLoading(false) }
  }

  // Only auto-fetch if no cached plan exists
  useEffect(() => { if (!plan) fetchPlan() }, [authToken, data.length])

  const card = { background: t.card, borderRadius: '16px', boxShadow: t.cardShadow, padding: '24px 28px', position: 'relative', overflow: 'hidden' }
  const cardDark = { ...card, background: t.cardAlt, color: t.cardAltText }
  const sectionTitle = { fontSize: '13px', fontWeight: 600, color: t.textLight, letterSpacing: '0.5px', textTransform: 'uppercase', margin: '0 0 12px' }

  // No transactions yet
  if (data.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '60px 28px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x1F4CA;</div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>No data yet</h2>
        <p style={{ fontSize: '14px', color: t.textMuted, margin: 0 }}>Import some transactions first to get personalized coaching.</p>
      </div>
    )
  }

  return (<>
    {/* Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: 0 }}>Your Money Plan</h2>
        {userName && <p style={{ fontSize: '13px', color: t.textMuted, margin: '4px 0 0' }}>Personalized for {userName}</p>}
      </div>
      <button onClick={fetchPlan} disabled={planLoading} style={{ padding: '8px 20px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: planLoading ? 'not-allowed' : 'pointer', background: 'transparent', color: t.teal, fontSize: '12px', fontWeight: 600, opacity: planLoading ? 0.5 : 1, transition: 'all 0.2s' }} onMouseEnter={e => { if (!planLoading) e.currentTarget.style.background = `${t.teal}15` }} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {planLoading ? 'Generating...' : '\u21BB Refresh Plan'}
      </button>
    </div>

    {/* Loading skeleton */}
    {planLoading && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...card, height: '120px' }}>
            <div style={{ height: '12px', width: '40%', borderRadius: '6px', background: `${t.textMuted}20`, marginBottom: '12px' }} />
            <div style={{ height: '10px', width: '80%', borderRadius: '6px', background: `${t.textMuted}15`, marginBottom: '8px' }} />
            <div style={{ height: '10px', width: '60%', borderRadius: '6px', background: `${t.textMuted}10` }} />
          </div>
        ))}
      </div>
    )}

    {/* Error state */}
    {!planLoading && planError && (
      <div style={{ ...card, textAlign: 'center', padding: '48px 28px' }}>
        <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#x2699;</div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>AI coaching is being set up</h3>
        <p style={{ fontSize: '14px', color: t.textMuted, margin: 0 }}>Check back soon.</p>
      </div>
    )}

    {/* Plan loaded */}
    {!planLoading && !planError && plan && (() => {
      // API returns { error, plan: { summary, daily_budget, strategy, risks, ... }, summary: { period, total_income, ... } }
      const p = plan.plan || plan
      const strategies = p.strategy || p.strategies || []
      const risks = p.risks || []
      return (<>
      {/* Summary */}
      <div style={{ ...cardDark, marginBottom: '20px', padding: '28px 32px', background: `linear-gradient(135deg, ${t.cardAlt}, ${t.tealDeep}90)` }}>
        <p style={{ ...sectionTitle, color: '#8FA3B0' }}>Summary</p>
        <p style={{ fontSize: '16px', fontWeight: 500, color: t.cardAltText, margin: 0, lineHeight: '1.6' }}>{p.summary || ''}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Daily Budget */}
        <div style={{ ...card, textAlign: 'center', padding: '32px 28px' }}>
          <p style={sectionTitle}>Daily Budget</p>
          <p style={{ fontSize: '42px', fontWeight: 700, color: t.teal, margin: '8px 0 4px', letterSpacing: '-1px' }}>{currency}{p.daily_budget != null ? fmt(p.daily_budget, 0) : '--'}<span style={{ fontSize: '18px', fontWeight: 500, color: t.textMuted }}>/day</span></p>
        </div>

        {/* Savings Tip */}
        <div style={{ ...card }}>
          <p style={sectionTitle}>&#x1F4A1; Savings Tip</p>
          <p style={{ fontSize: '15px', fontWeight: 500, color: t.text, margin: 0, lineHeight: '1.6' }}>{p.savings_tip || 'Keep tracking your spending to unlock personalized tips.'}</p>
        </div>
      </div>

      {/* Strategy */}
      {strategies.length > 0 && (
        <div style={{ ...card, marginBottom: '20px' }}>
          <p style={sectionTitle}>&#x1F3AF; Strategy</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {strategies.map((tip, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: `${t.teal}15`, color: t.teal, fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>{i + 1}</div>
                <p style={{ fontSize: '14px', color: t.text, margin: 0, lineHeight: '1.5' }}>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Risks */}
        {risks.length > 0 && (
          <div style={{ ...card, borderLeft: `3px solid ${t.red}` }}>
            <p style={sectionTitle}>&#x26A0; Risks</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {risks.map((risk, i) => (
                <p key={i} style={{ fontSize: '13px', color: t.text, margin: 0, lineHeight: '1.5', paddingLeft: '8px' }}>{risk}</p>
              ))}
            </div>
          </div>
        )}

        {/* Debt Progress */}
        {p.debt_advice && (
          <div style={{ ...card, borderLeft: `3px solid ${t.sand}` }}>
            <p style={sectionTitle}>&#x1F4B3; Debt Progress</p>
            <p style={{ fontSize: '13px', color: t.text, margin: 0, lineHeight: '1.5' }}>{p.debt_advice}</p>
          </div>
        )}
      </div>

      {/* Encouragement */}
      {p.encouragement && (
        <div style={{ textAlign: 'center', padding: '24px 20px', marginTop: '8px' }}>
          <p style={{ fontSize: '15px', fontWeight: 500, color: t.teal, margin: 0, fontStyle: 'italic' }}>{p.encouragement}</p>
        </div>
      )}
    </>)})()}
  </>)
}
