import { useMemo } from 'react'

// Phase 10G: derive alerts from accounts + this month's transactions.
// Three sources:
//   1. Credit utilization > 80% on any credit card
//   2. Payment due in <= 7 days
//   3. On pace to overspend the month (projected EOM negative)

function daysUntilDue(due_day) {
  if (!due_day) return null
  const today = new Date()
  const todayDay = today.getDate()
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  if (due_day >= todayDay) return due_day - todayDay
  return (daysInThisMonth - todayDay) + due_day
}

export default function useAlerts(accounts, filteredData) {
  return useMemo(() => {
    const alerts = []
    const now = Date.now()

    // 1. Credit utilization
    for (const a of accounts || []) {
      const isCredit = (a.subtype || '').toLowerCase().includes('credit') || (a.account_type || '').toLowerCase().includes('credit')
      if (isCredit && a.credit_limit && a.current_balance != null && a.credit_limit > 0) {
        const pct = (a.current_balance / a.credit_limit) * 100
        if (pct >= 80) {
          alerts.push({
            id: `util:${a.id}`,
            level: pct >= 95 ? 'danger' : 'warn',
            icon: '\uD83D\uDCB3',
            msg: `${a.name} is at ${pct.toFixed(0)}% utilization. Pay it down to protect your credit score.`,
            ts: now,
          })
        }
      }
    }

    // 2. Due date <= 7 days
    for (const a of accounts || []) {
      const days = daysUntilDue(a.due_day)
      if (days != null && days >= 0 && days <= 7) {
        alerts.push({
          id: `due:${a.id}`,
          level: days <= 2 ? 'danger' : 'warn',
          icon: '\u23F0',
          msg: days === 0 ? `${a.name} payment due today` : `${a.name} payment due in ${days} day${days === 1 ? '' : 's'}`,
          ts: now,
        })
      }
    }

    // 3. Pace overspend (this month)
    if (filteredData && filteredData.length > 0) {
      const today = new Date()
      const ymPrefix = today.toISOString().slice(0, 7)
      const monthData = filteredData.filter(d => (d.date_iso || '').startsWith(ymPrefix))
      if (monthData.length > 0) {
        const totalIn = monthData.reduce((s, d) => s + (d.direction === 'IN' ? +d.money_in : 0), 0)
        const totalOut = monthData.reduce((s, d) => s + (d.direction === 'OUT' ? +d.money_out : 0), 0)
        const dayOfMonth = today.getDate()
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
        const daysRemaining = Math.max(0, daysInMonth - dayOfMonth)
        const paceOut = dayOfMonth > 0 ? totalOut / dayOfMonth : 0
        const projectedSpend = totalOut + (paceOut * daysRemaining)
        const projectedEOM = totalIn - projectedSpend
        if (totalIn > 0 && projectedEOM < 0) {
          alerts.push({
            id: 'pace:eom',
            level: 'warn',
            icon: '\u26A0\uFE0F',
            msg: `On pace to overspend by ${Math.abs(projectedEOM).toFixed(0)} this month -- ease up to stay even.`,
            ts: now,
          })
        }
      }
    }

    return alerts
  }, [accounts, filteredData])
}
