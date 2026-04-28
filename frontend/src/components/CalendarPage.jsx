import { useState, useMemo } from 'react'
import { CAT_COLORS, fmt, fmtShort } from '../constants'

// Phase 14B: Daily-spending calendar with subscription overlay.
// Each cell shows the day's total OUT, color-coded by % of daily allowance.
// Click a day -> expands a list of that day's transactions below.
// Subscription dots from subPredictions still appear on predicted charge days.

export const CalendarPage = ({ t, currency, lc, calendarMonth, setCalendarMonth, subPredictions, filteredData }) => {
  const [selectedDay, setSelectedDay] = useState(null)
  const [calY, calMo] = calendarMonth.split('-').map(Number)
  const daysInMonth = new Date(calY, calMo, 0).getDate()
  const firstDayOfWeek = (new Date(calY, calMo - 1, 1).getDay() + 6) % 7  // Mon = 0
  const calLabel = new Date(calY, calMo - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const ymPrefix = `${calY}-${String(calMo).padStart(2, '0')}`
  const monthTxns = useMemo(
    () => (filteredData || []).filter(x => (x.date_iso || '').startsWith(ymPrefix)),
    [filteredData, ymPrefix]
  )

  // Aggregate by day-of-month for OUT direction (spending only)
  const spendByDay = useMemo(() => {
    const m = {}
    for (const x of monthTxns) {
      if (x.direction !== 'OUT') continue
      const day = parseInt((x.date_iso || '').slice(8, 10))
      if (!day) continue
      m[day] = (m[day] || 0) + (Number(x.money_out) || Number(x.amount) || 0)
    }
    return m
  }, [monthTxns])

  const monthOut = Object.values(spendByDay).reduce((s, v) => s + v, 0)
  const monthIn = monthTxns.filter(x => x.direction === 'IN').reduce((s, x) => s + (Number(x.money_in) || 0), 0)
  const daysWithSpend = Object.keys(spendByDay).length
  const dailyAllowance = monthIn > 0 ? Math.max(0, (monthIn - monthOut) / Math.max(1, daysInMonth - new Date().getDate())) : 0
  // Reasonable per-day cap for color-coding: month income / days in month, falls back to month median
  const colorCap = monthIn > 0 ? monthIn / daysInMonth : (Object.values(spendByDay).sort((a, b) => a - b)[Math.floor(daysWithSpend / 2)] || 50)

  function cellColor(amount) {
    if (!amount) return null
    const pct = (amount / colorCap) * 100
    if (pct < 80) return t.green
    if (pct < 120) return t.sand || '#f59e0b'
    return t.red
  }

  const totalPredicted = (subPredictions || []).reduce((s, p) => s + p.amount, 0)
  const prevMo = () => { const d = new Date(calY, calMo - 2); setCalendarMonth(d.toISOString().slice(0, 7)); setSelectedDay(null) }
  const nextMo = () => { const d = new Date(calY, calMo); setCalendarMonth(d.toISOString().slice(0, 7)); setSelectedDay(null) }

  // Transactions for the selected day (any direction)
  const selectedDayTxns = useMemo(() => {
    if (!selectedDay) return []
    const dayStr = `${ymPrefix}-${String(selectedDay).padStart(2, '0')}`
    return monthTxns.filter(x => x.date_iso === dayStr).sort((a, b) => (b.money_out || b.money_in) - (a.money_out || a.money_in))
  }, [selectedDay, ymPrefix, monthTxns])

  return (<>
    {/* Month header */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
      <button onClick={prevMo} style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', fontSize: '14px' }}>{'\u2190'}</button>
      <h2 style={{ fontSize: '18px', fontWeight: 700, color: t.text, margin: 0 }}>{calLabel}</h2>
      <button onClick={nextMo} style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', fontSize: '14px' }}>{'\u2192'}</button>
    </div>

    {/* Month summary strip */}
    <div style={{ ...lc, padding: '16px 24px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
      <div>
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Spent this month</p>
        <p style={{ fontSize: '22px', fontWeight: 700, color: t.red, margin: 0 }}>{currency}{fmt(monthOut)}</p>
      </div>
      <div>
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Earned this month</p>
        <p style={{ fontSize: '22px', fontWeight: 700, color: t.green, margin: 0 }}>{currency}{fmt(monthIn)}</p>
      </div>
      <div>
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Days w/ spending</p>
        <p style={{ fontSize: '22px', fontWeight: 700, color: t.text, margin: 0 }}>{daysWithSpend}<span style={{ fontSize: '13px', color: t.textMuted, fontWeight: 500 }}> / {daysInMonth}</span></p>
      </div>
      {monthIn > 0 && (
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Daily allowance</p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: t.teal, margin: 0 }}>{currency}{fmt(dailyAllowance)}</p>
        </div>
      )}
    </div>

    {/* Calendar grid */}
    <div style={lc}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: t.textMuted, letterSpacing: '0.5px' }}>{d}</div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const spent = spendByDay[day] || 0
          const subs = (subPredictions || []).filter(p => p.predictedDay === day)
          const color = cellColor(spent)
          const isSelected = selectedDay === day

          return (
            <div key={day}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              style={{
                padding: '8px 6px', textAlign: 'center', minHeight: '70px',
                borderRadius: '10px',
                background: isSelected ? `${t.teal}20` : (color ? `${color}10` : (subs.length > 0 ? `${t.teal}06` : 'transparent')),
                border: `1px solid ${isSelected ? t.teal : (color ? `${color}40` : (subs.length > 0 ? `${t.teal}25` : `${t.border}40`))}`,
                cursor: spent > 0 || subs.length > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <p style={{ fontSize: '12px', fontWeight: 500, color: t.textMuted, margin: 0 }}>{day}</p>
              {spent > 0 ? (
                <p style={{ fontSize: '13px', fontWeight: 700, color: color || t.text, margin: '4px 0 0', letterSpacing: '-0.3px' }}>
                  {currency}{fmtShort(spent)}
                </p>
              ) : (
                <p style={{ fontSize: '11px', color: t.textMuted, margin: '4px 0 0', opacity: 0.4 }}>--</p>
              )}
              {subs.length > 0 && (
                <div style={{ display: 'flex', gap: '3px', marginTop: '4px' }}>
                  {subs.slice(0, 3).map((p, j) => (
                    <div key={j} title={`${p.merchant}: ${currency}${fmt(p.amount)}`}
                      style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.teal, boxShadow: `0 0 4px ${t.teal}60` }} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {monthOut === 0 && (subPredictions || []).length === 0 && (
        <p style={{ textAlign: 'center', color: t.textMuted, fontSize: '13px', padding: '24px 0 0', margin: 0 }}>
          No spending recorded for {calLabel}. Try a different month.
        </p>
      )}
    </div>

    {/* Selected day breakdown */}
    {selectedDay && selectedDayTxns.length > 0 && (
      <div style={{ ...lc, marginTop: '16px', padding: '16px 24px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: t.text, margin: '0 0 12px' }}>
          {new Date(calY, calMo - 1, selectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {selectedDayTxns.map((x, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: `${t.teal}06` }}>
              <div style={{ width: '4px', height: '24px', borderRadius: '2px', background: CAT_COLORS[x.category] || t.teal, marginRight: '12px' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.merchant || x.description}</p>
                <p style={{ fontSize: '11px', color: t.textMuted, margin: '2px 0 0' }}>{x.category || 'Other'}</p>
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: x.direction === 'IN' ? t.green : t.red, flexShrink: 0 }}>
                {x.direction === 'IN' ? '+' : '-'}{currency}{fmt(x.direction === 'IN' ? x.money_in : x.money_out)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Subscriptions panel (preserved from old version) */}
    <div style={{ ...lc, marginTop: '16px', padding: '16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: t.text, margin: 0 }}>Predicted Subscription Charges</h3>
        <span style={{ fontSize: '16px', fontWeight: 700, color: t.teal }}>{currency}{fmt(totalPredicted)}/mo</span>
      </div>
      {(subPredictions || []).length === 0 ? (
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>No recurring charges detected yet. Once you have a few months of data, recurring subscriptions will appear here with their predicted charge dates marked on the calendar above.</p>
      ) : (
        subPredictions.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < subPredictions.length - 1 ? `1px solid ${t.border}40` : 'none' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: 0 }}>{p.merchant}</p>
              <p style={{ fontSize: '11px', color: t.textMuted, margin: '2px 0 0' }}>Day {p.predictedDay} of each month</p>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: t.red }}>~{currency}{fmt(p.amount)}</span>
          </div>
        ))
      )}
    </div>
  </>)
}
