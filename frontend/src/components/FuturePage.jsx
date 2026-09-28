import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import * as planApi from '../lib/planApi'
import { PlanCard, RiskBadge, MoneyStat, SectionHeader, EmptyState } from './plan/primitives'

// Phase: Future/plan-engine forecast page. Anchored on the REAL today's date
// (via planApi, backend-driven), unlike CalendarPage which stays anchored on
// filteredData/globalRange. Do not touch CalendarPage.jsx.

const RANGE_OPTIONS = [7, 14, 30, 60, 90]

const riskColor = (t, level) => level === 'danger' ? t.red : level === 'watch' ? (t.sand || '#f59e0b') : t.green

const formatDayLabel = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function FuturePage({ t, authHeaders, authUser }) {
  const [rangeDays, setRangeDays] = useState(30)
  const [forecast, setForecast] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [overspendAmount, setOverspendAmount] = useState('')
  const [overspendResult, setOverspendResult] = useState(null)
  const [overspendLoading, setOverspendLoading] = useState(false)
  const [overspendError, setOverspendError] = useState(null)

  const forecastSeqRef = useRef(0)

  const fetchForecast = useCallback(async (days) => {
    const seq = ++forecastSeqRef.current
    setLoading(true); setError(null)
    try {
      const res = await planApi.getForecast(days, authHeaders)
      if (seq !== forecastSeqRef.current) return // stale response, a newer range was requested
      setForecast(res)
    } catch {
      if (seq !== forecastSeqRef.current) return
      // Wave 1: /api/plan/forecast may not exist yet -- keep this calm, not alarming.
      setError("Forecast isn't available yet -- check back soon.")
    } finally {
      if (seq === forecastSeqRef.current) setLoading(false)
    }
  // authHeaders is a new function identity every render (see App.jsx) -- omitted here so
  // this only recreates when rangeDays-driven calls need it, matching BudgetsPage/CoachPage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { fetchForecast(rangeDays) }, [rangeDays, fetchForecast])

  const days = useMemo(() => forecast?.days || [], [forecast])
  const maxBalance = useMemo(() => days.length ? Math.max(...days.map(d => d.balance)) : 0, [days])
  const minBalance = useMemo(() => days.length ? Math.min(...days.map(d => d.balance)) : 0, [days])
  const balanceRange = Math.max(maxBalance - minBalance, 1)

  const submitOverspend = async (e) => {
    e.preventDefault()
    const amt = parseFloat(overspendAmount)
    if (!amt || amt <= 0) return
    setOverspendLoading(true); setOverspendError(null); setOverspendResult(null)
    try {
      const res = await planApi.postOverspend(amt, authUser?.currency, authHeaders)
      setOverspendResult(res)
    } catch {
      setOverspendError("Couldn't run that what-if yet -- check back soon.")
    } finally { setOverspendLoading(false) }
  }

  const rangeSelector = (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {RANGE_OPTIONS.map(n => (
        <button key={n} onClick={() => setRangeDays(n)} style={{
          padding: '6px 12px', borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
          border: `1px solid ${rangeDays === n ? t.teal : t.border}`,
          background: rangeDays === n ? `${t.teal}20` : 'transparent',
          color: rangeDays === n ? t.teal : t.textLight,
        }}>{n}d</button>
      ))}
    </div>
  )

  return (<>
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>Future</h2>
      <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
        Your day-by-day cash outlook, starting today.
      </p>
    </div>

    <PlanCard t={t} title="Forecast" accent={t.teal}>
      <SectionHeader t={t} title={`Next ${rangeDays} days`} subtitle="Starting today" action={rangeSelector} />

      {loading && <p style={{ fontSize: '13px', color: t.textMuted, margin: '16px 0' }}>Loading forecast...</p>}
      {error && !loading && <p style={{ fontSize: '13px', color: t.textMuted, margin: '16px 0' }}>{error}</p>}
      {!loading && !error && days.length === 0 && (
        <div style={{ margin: '16px 0' }}>
          <EmptyState t={t} message="No forecast data yet." />
        </div>
      )}

      {!loading && !error && days.length > 0 && (<>
        {/* Bar strip: relative balance overview, colored by risk level */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '80px', margin: '16px 0', overflowX: 'auto' }}>
          {days.map((d, i) => {
            const h = 8 + ((d.balance - minBalance) / balanceRange) * 64
            return (
              <div key={i} title={`${formatDayLabel(d.date)}: ${forecast.currency} ${d.balance}`} style={{
                flex: '1 0 6px', minWidth: '6px', height: `${h}px`, borderRadius: '3px',
                background: riskColor(t, d.risk_level), opacity: 0.85,
              }} />
            )
          })}
        </div>

        {/* Day-by-day list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {days.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', flexWrap: 'wrap',
              borderRadius: '12px', border: `1px solid ${t.border}`, background: `${t.teal}05`,
            }}>
              <div style={{ minWidth: '96px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: '0 0 4px' }}>{formatDayLabel(d.date)}</p>
                <RiskBadge t={t} level={d.risk_level} />
              </div>
              <MoneyStat t={t} label="Balance" amount={d.balance} currency={forecast.currency} size="sm" />
              <MoneyStat t={t} label="Spendable" amount={d.spendable} currency={forecast.currency} size="sm" />
              {d.events && d.events.length > 0 && (
                <div style={{ flex: 1, minWidth: '160px' }}>
                  <p style={{ fontSize: '11px', color: t.textMuted, margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>What's landing</p>
                  <p style={{ fontSize: '12px', color: t.textLight, margin: '2px 0 0' }}>{d.events.join(', ')}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </>)}
    </PlanCard>

    <div style={{ marginTop: '16px' }}>
      <PlanCard t={t} title="What if I overspend today?" accent={t.sand}>
        <form onSubmit={submitOverspend} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number" step="0.01" min="0" placeholder="Amount"
            value={overspendAmount} onChange={(e) => setOverspendAmount(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: 'transparent', color: t.text, fontSize: '13px', width: '140px' }}
          />
          <button type="submit" disabled={overspendLoading} style={{
            padding: '8px 18px', borderRadius: '10px', border: 'none', cursor: overspendLoading ? 'wait' : 'pointer',
            background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600,
            opacity: overspendLoading ? 0.6 : 1,
          }}>{overspendLoading ? 'Checking...' : 'See impact'}</button>
        </form>

        {overspendError && <p style={{ fontSize: '13px', color: t.textMuted, margin: '12px 0 0' }}>{overspendError}</p>}

        {overspendResult && (
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <RiskBadge t={t} level={overspendResult.new_risk_level} />
            <MoneyStat t={t} label="Lowest point (baseline)" amount={overspendResult.baseline_lowest} currency={overspendResult.currency} size="sm" />
            <MoneyStat t={t} label="Lowest point (adjusted)" amount={overspendResult.adjusted_lowest} currency={overspendResult.currency} size="sm" />
            {overspendResult.days_reduced && overspendResult.days_reduced.length > 0 && (
              <div>
                <p style={{ fontSize: '11px', color: t.textMuted, margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Days affected</p>
                <p style={{ fontSize: '12px', color: t.textLight, margin: '2px 0 0' }}>{overspendResult.days_reduced.join(', ')}</p>
              </div>
            )}
          </div>
        )}
      </PlanCard>
    </div>
  </>)
}
