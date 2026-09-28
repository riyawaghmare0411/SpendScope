import { useState, useEffect } from 'react'
import * as planApi from '../lib/planApi'
import { PlanCard, RiskBadge, MoneyStat, SectionHeader, EmptyState, ConfirmDismissRow } from './plan/primitives'
import DataVisibilityNote from './DataVisibilityNote'

// Wave 1: Today plan view -- safe-to-spend, risk, next income, recurring confirm queue.
// Talks to /api/plan/* (built in Wave 2 by a different lane) via planApi.js. Those routes
// don't exist yet this wave, so any fetch failure here renders as "not available yet"
// rather than a crash -- see FROZEN JSON CONTRACT in the Wave-1 plan.

export default function TodayPage({ t, authHeaders, authUser, accounts }) {
  const [plan, setPlan] = useState(null)
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    planApi.getToday(authHeaders)
      .then(data => {
        if (cancelled) return
        setPlan(data)
        setPending(data?.recurring_pending_review || [])
      })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Confirm-once-then-automatic: once acted on here, the item is dropped from the local
  // queue on success and (per the backend contract) never re-suggested.
  const confirmItem = (item) => {
    planApi.confirmRecurring(item.id, authHeaders)
      .then(() => setPending(p => p.filter(i => i.id !== item.id)))
      .catch(e => console.warn('TodayPage: confirm failed for', item.id, e))
  }
  const dismissItem = (item) => {
    planApi.dismissRecurring(item.id, authHeaders)
      .then(() => setPending(p => p.filter(i => i.id !== item.id)))
      .catch(e => console.warn('TodayPage: dismiss failed for', item.id, e))
  }

  if (loading) {
    return <PlanCard t={t} title="Today"><p style={{ color: t.textMuted, fontSize: '13px', margin: 0 }}>Loading today's plan...</p></PlanCard>
  }
  if (error || !plan) {
    return <PlanCard t={t} title="Today"><EmptyState t={t} message="Today's plan isn't available yet -- check back once it ships." /></PlanCard>
  }

  // The safe-to-spend figure aggregates every linked account. If any of them is Plaid-linked
  // the weaker (server-readable) guarantee applies, so surface that rather than overclaim
  // end-to-end encryption. Unknown (no accounts prop) defaults to the same conservative note.
  const visibilitySource = (!accounts || accounts.length === 0 || accounts.some(a => a.is_plaid)) ? 'plaid' : 'upload'

  return (<>
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
        Today{authUser?.name ? `, ${authUser.name}` : ''}
      </h2>
    </div>

    <PlanCard t={t} title="Safe to spend" accent={plan.overall_risk === 'danger' ? t.red : plan.overall_risk === 'watch' ? t.sand : t.green}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <MoneyStat t={t} label="Safe to spend today" amount={plan.safe_to_spend_today} currency={plan.currency} size="lg" />
        <RiskBadge t={t} level={plan.overall_risk} />
      </div>
      <div style={{ marginTop: '12px' }}>
        <MoneyStat t={t} label="Balance today" amount={plan.balance_today} currency={plan.currency} />
      </div>
      {plan.lowest_point && (
        <div style={{ marginTop: '8px' }}>
          <MoneyStat t={t} label={`Lowest point (${plan.lowest_point.date})`} amount={plan.lowest_point.amount} currency={plan.currency} size="sm" />
        </div>
      )}
      <DataVisibilityNote t={t} source={visibilitySource} />
    </PlanCard>

    {plan.next_income && (
      <PlanCard t={t} title="Next income">
        <MoneyStat t={t} label={plan.next_income.label} amount={plan.next_income.amount} currency={plan.currency} />
        <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>{plan.next_income.date}</p>
      </PlanCard>
    )}

    <div style={{ marginTop: '20px' }}>
      <SectionHeader t={t} title="Coming up -- confirm these" subtitle="Detected recurring transactions waiting on you" />
      {pending.length === 0 ? (
        <EmptyState t={t} message="Nothing waiting on you right now." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pending.map(item => (
            <ConfirmDismissRow key={item.id} t={t} item={item} onConfirm={() => confirmItem(item)} onDismiss={() => dismissItem(item)} />
          ))}
        </div>
      )}
    </div>
  </>)
}
