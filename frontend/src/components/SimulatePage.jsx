import { useState } from 'react'
import * as planApi from '../lib/planApi'
import { PlanCard, SectionHeader, EmptyState } from './plan/primitives'
import { fmt } from '../constants'

// Wave 1: Debt payoff simulator -- "friend in debt sees exactly how to reduce it."
// Talks to /api/plan/simulate (built in Wave 2 by a different lane) via planApi.js.
// That route doesn't exist yet this wave, so a fetch failure renders as "not
// available yet" rather than a crash -- see FROZEN JSON CONTRACT in the Wave-1 plan.

const STRATEGIES = [
  { value: 'avalanche', label: 'Avalanche', hint: 'Highest interest rate first -- saves the most money' },
  { value: 'snowball', label: 'Snowball', hint: 'Smallest balance first -- fastest wins to stay motivated' },
]

export default function SimulatePage({ t, authHeaders, authUser }) {
  const [strategy, setStrategy] = useState('avalanche')
  const [extraPayment, setExtraPayment] = useState('')
  const [lumpSum, setLumpSum] = useState('')
  const [lumpSumTarget, setLumpSumTarget] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const currency = authUser?.currency

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    try {
      const body = {
        strategy,
        extra_payment: parseFloat(extraPayment) || 0,
        lump_sum: parseFloat(lumpSum) || 0,
        lump_sum_target_account_id: lumpSumTarget || null,
      }
      const res = await planApi.postSimulate(body, authHeaders)
      setResult(res)
    } catch {
      setError("Simulation isn't available yet -- check back soon.")
    } finally { setLoading(false) }
  }

  const inputStyle = {
    padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`,
    background: 'transparent', color: t.text, fontSize: '13px', width: '160px',
  }
  const labelStyle = { fontSize: '11px', color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'block', marginBottom: '6px' }

  return (<>
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>Payoff simulator</h2>
      <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
        See exactly how extra payments or a lump sum change your debt-free date.
      </p>
    </div>

    <PlanCard t={t} title="Run a scenario" accent={t.teal}>
      <form onSubmit={submit}>
        <div style={{ marginBottom: '18px' }}>
          <span style={labelStyle}>Strategy</span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {STRATEGIES.map(s => (
              <label key={s.value} style={{
                display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 14px',
                borderRadius: '12px', cursor: 'pointer', minWidth: '180px',
                border: `1px solid ${strategy === s.value ? t.teal : t.border}`,
                background: strategy === s.value ? `${t.teal}15` : 'transparent',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: t.text }}>
                  <input type="radio" name="strategy" value={s.value} checked={strategy === s.value} onChange={() => setStrategy(s.value)} />
                  {s.label}
                </span>
                <span style={{ fontSize: '11px', color: t.textMuted, paddingLeft: '22px' }}>{s.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div>
            <span style={labelStyle}>Extra monthly payment</span>
            <input type="number" step="0.01" min="0" placeholder="0.00" style={inputStyle}
              value={extraPayment} onChange={e => setExtraPayment(e.target.value)} />
          </div>
          <div>
            <span style={labelStyle}>One-time lump sum (optional)</span>
            <input type="number" step="0.01" min="0" placeholder="0.00" style={inputStyle}
              value={lumpSum} onChange={e => setLumpSum(e.target.value)} />
          </div>
          <div>
            <span style={labelStyle}>Lump sum target account</span>
            <input type="text" placeholder="Account ID" style={inputStyle}
              value={lumpSumTarget} onChange={e => setLumpSumTarget(e.target.value)} />
          </div>
        </div>

        <button type="submit" disabled={loading} style={{
          padding: '10px 22px', borderRadius: '12px', border: 'none', cursor: loading ? 'wait' : 'pointer',
          background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white',
          fontSize: '13px', fontWeight: 600, opacity: loading ? 0.6 : 1,
        }}>{loading ? 'Calculating...' : 'See my payoff plan'}</button>
      </form>

      {error && <p style={{ fontSize: '13px', color: t.textMuted, margin: '16px 0 0' }}>{error}</p>}
    </PlanCard>

    {result && (
      <div style={{ marginTop: '16px' }}>
        <PlanCard t={t} title="Your plan, side by side" accent={t.green}>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <div style={{ flex: '1 1 220px', minWidth: '220px' }}>
              <p style={{ fontSize: '11px', color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 10px' }}>Baseline (no change)</p>
              <p style={{ fontSize: '13px', color: t.text, margin: '0 0 4px' }}>Months to payoff: <strong>{result.baseline.months_to_payoff}</strong></p>
              <p style={{ fontSize: '13px', color: t.text, margin: '0 0 4px' }}>Total interest: <strong>{currency} {fmt(result.baseline.total_interest, 0)}</strong></p>
              <p style={{ fontSize: '13px', color: t.text, margin: 0 }}>Payoff date: <strong>{result.baseline.payoff_date}</strong></p>
            </div>
            <div style={{ flex: '1 1 220px', minWidth: '220px' }}>
              <p style={{ fontSize: '11px', color: t.teal, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 10px' }}>With this plan</p>
              <p style={{ fontSize: '13px', color: t.text, margin: '0 0 4px' }}>Months to payoff: <strong>{result.result.months_to_payoff}</strong></p>
              <p style={{ fontSize: '13px', color: t.text, margin: '0 0 4px' }}>Total interest: <strong>{currency} {fmt(result.result.total_interest, 0)}</strong></p>
              <p style={{ fontSize: '13px', color: t.text, margin: 0 }}>Payoff date: <strong>{result.result.payoff_date}</strong></p>
            </div>
          </div>

          <div style={{
            display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '16px 20px', borderRadius: '14px',
            background: `${t.green}15`, border: `1px solid ${t.green}40`, marginBottom: '18px',
          }}>
            <div>
              <p style={{ fontSize: '11px', color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 4px' }}>Interest saved</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: t.green, margin: 0 }}>{currency} {fmt(result.result.interest_saved, 0)}</p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: t.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 4px' }}>Months saved</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: t.green, margin: 0 }}>{result.result.months_saved}</p>
            </div>
          </div>

          <SectionHeader t={t} title="Per-debt breakdown" subtitle="How each account is paid off under this plan" />
          {(!result.result.per_debt_schedule || result.result.per_debt_schedule.length === 0) ? (
            <EmptyState t={t} message="No per-debt breakdown returned for this plan." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: t.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: `1px solid ${t.border}` }}>Account</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: t.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: `1px solid ${t.border}` }}>Months to payoff</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', color: t.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: `1px solid ${t.border}` }}>Total interest</th>
                  </tr>
                </thead>
                <tbody>
                  {result.result.per_debt_schedule.map(d => (
                    <tr key={d.account_id}>
                      <td style={{ padding: '8px 10px', color: t.text, borderBottom: `1px solid ${t.border}` }}>{d.name}</td>
                      <td style={{ padding: '8px 10px', color: t.text, textAlign: 'right', borderBottom: `1px solid ${t.border}` }}>{d.months_to_payoff}</td>
                      <td style={{ padding: '8px 10px', color: t.text, textAlign: 'right', borderBottom: `1px solid ${t.border}` }}>{currency} {fmt(d.total_interest, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PlanCard>
      </div>
    )}
  </>)
}
