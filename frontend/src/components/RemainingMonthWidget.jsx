import { useMemo } from 'react'
import { fmt } from '../constants'

// Phase 10F: "Remaining money this month" widget.
// Compares this month's IN vs OUT and projects end-of-month surplus/deficit
// based on current spend pace (today's daily average).

export default function RemainingMonthWidget({ t, currency, filteredData }) {
  const stats = useMemo(() => {
    const today = new Date()
    const ymPrefix = today.toISOString().slice(0, 7) // 'YYYY-MM'
    const monthData = (filteredData || []).filter(d => (d.date_iso || '').startsWith(ymPrefix))
    if (monthData.length === 0) return null
    const totalIn = monthData.reduce((s, d) => s + (d.direction === 'IN' ? +d.money_in : 0), 0)
    const totalOut = monthData.reduce((s, d) => s + (d.direction === 'OUT' ? +d.money_out : 0), 0)
    const dayOfMonth = today.getDate()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const daysRemaining = Math.max(0, daysInMonth - dayOfMonth)
    const paceOut = dayOfMonth > 0 ? totalOut / dayOfMonth : 0
    const projectedSpend = totalOut + (paceOut * daysRemaining)
    const projectedEOM = totalIn - projectedSpend
    const remainingNow = totalIn - totalOut
    const dailyAllowance = daysRemaining > 0 ? Math.max(0, remainingNow / daysRemaining) : 0
    return { totalIn, totalOut, dayOfMonth, daysRemaining, paceOut, projectedSpend, projectedEOM, remainingNow, dailyAllowance }
  }, [filteredData])

  if (!stats) return null
  const { totalIn, totalOut, daysRemaining, projectedEOM, remainingNow, dailyAllowance } = stats
  const isOverspending = projectedEOM < 0
  const headlineColor = remainingNow >= 0 ? t.green : t.red
  const pctSpent = totalIn > 0 ? Math.min(100, (totalOut / totalIn) * 100) : 0

  return (
    <div style={{
      padding: '20px 24px',
      borderRadius: '20px',
      background: t.card,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: `1px solid ${t.border}`,
      boxShadow: t.cardShadow,
      marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ flex: '1 1 280px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>This Month</p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: headlineColor, margin: '0 0 4px', letterSpacing: '-0.5px' }}>
            {remainingNow >= 0 ? `${currency}${fmt(remainingNow)} left` : `${currency}${fmt(Math.abs(remainingNow))} over`}
          </p>
          <p style={{ fontSize: '12px', color: t.textMuted, margin: 0 }}>
            {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
            {daysRemaining > 0 && remainingNow > 0 ? ` \u00B7 ${currency}${fmt(dailyAllowance)}/day allowance` : ''}
          </p>
        </div>
        <div style={{ flex: '0 1 220px', textAlign: 'right' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Projected EOM</p>
          <p style={{ fontSize: '18px', fontWeight: 700, color: isOverspending ? t.red : t.green, margin: '0 0 4px' }}>
            {isOverspending ? '-' : '+'}{currency}{fmt(Math.abs(projectedEOM))}
          </p>
          <p style={{ fontSize: '11px', color: t.textMuted, margin: 0 }}>
            {isOverspending ? 'On pace to overspend' : 'On pace to save'}
          </p>
        </div>
      </div>
      <div style={{ marginTop: '12px' }}>
        <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${pctSpent}%`, height: '100%', background: pctSpent >= 100 ? t.red : pctSpent >= 80 ? (t.sand || '#f59e0b') : t.teal, transition: 'width 0.3s' }} />
        </div>
        <p style={{ fontSize: '11px', color: t.textMuted, margin: '6px 0 0' }}>
          Spent {currency}{fmt(totalOut)} of {currency}{fmt(totalIn)} earned ({pctSpent.toFixed(0)}%)
        </p>
      </div>
    </div>
  )
}
