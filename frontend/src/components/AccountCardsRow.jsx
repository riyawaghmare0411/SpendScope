import { fmt } from '../constants'

// Phase 10E: horizontal row of "card" tiles -- one per linked Account.
// Click a card to filter the dashboard to that account.
// Shows mask, balance, credit utilization, and due-date countdown.

function daysUntilDue(due_day) {
  if (!due_day) return null
  const today = new Date()
  const todayDay = today.getDate()
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  // If due_day is later this month, return diff. Otherwise wrap to next month.
  if (due_day >= todayDay) return due_day - todayDay
  // wrap to next month
  return (daysInThisMonth - todayDay) + due_day
}

function utilColor(t, pct) {
  if (pct == null) return t.teal
  if (pct >= 80) return t.red
  if (pct >= 50) return t.sand || '#f59e0b'
  return t.green
}

export default function AccountCardsRow({ t, currency, accounts, activeAccount, setActiveAccount, onAddCard, onEditAccount }) {
  if (!accounts || accounts.length === 0) {
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: t.text, margin: 0, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Your Cards</h3>
        </div>
        <div onClick={onAddCard} style={{
          padding: '24px',
          borderRadius: '20px',
          border: `1px dashed ${t.border}`,
          background: 'rgba(255,255,255,0.02)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = `${t.teal}10`}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}>
          <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
            No cards yet -- <span style={{ color: t.teal, fontWeight: 600 }}>connect one to track every account in one place</span>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: t.text, margin: 0, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Your Cards</h3>
        {activeAccount !== 'All' && (
          <button onClick={() => setActiveAccount('All')} style={{
            padding: '4px 10px', borderRadius: '8px', border: `1px solid ${t.border}`,
            background: 'transparent', color: t.textMuted, fontSize: '11px', fontWeight: 600, cursor: 'pointer'
          }}>Show all</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
        {accounts.map(a => {
          const isActive = activeAccount === a.name
          const isCredit = (a.subtype || '').toLowerCase().includes('credit') || (a.account_type || '').toLowerCase().includes('credit')
          const util = (isCredit && a.credit_limit && a.current_balance != null) ? Math.min(100, Math.max(0, (a.current_balance / a.credit_limit) * 100)) : null
          const utilC = utilColor(t, util)
          const dueDays = daysUntilDue(a.due_day)
          const balance = a.available_balance != null ? a.available_balance : a.current_balance

          return (
            <div key={a.id}
              onClick={() => setActiveAccount(a.name)}
              style={{
                minWidth: '220px',
                flex: '0 0 auto',
                padding: '16px 18px',
                borderRadius: '20px',
                background: t.card,
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: `1px solid ${isActive ? t.teal : t.border}`,
                boxShadow: isActive ? `0 6px 20px ${t.teal}30` : t.cardShadow,
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <span style={{ fontSize: '14px' }}>{isCredit ? '\uD83D\uDCB3' : '\uD83C\uDFE6'}</span>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: t.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{a.name}</p>
                </div>
                {a.mask && <span style={{ fontSize: '10px', color: t.textMuted, fontWeight: 600, letterSpacing: '0.5px' }}>{'\u2022\u2022'}{a.mask}</span>}
              </div>
              {balance != null ? (
                <p style={{ fontSize: '20px', fontWeight: 700, color: isCredit ? (a.current_balance > 0 ? t.red : t.text) : t.text, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
                  {isCredit && a.current_balance > 0 ? '-' : ''}{currency}{fmt(Math.abs(balance))}
                  {isCredit && a.credit_limit ? <span style={{ fontSize: '11px', fontWeight: 500, color: t.textMuted, marginLeft: '4px' }}>/ {currency}{fmt(a.credit_limit)}</span> : null}
                </p>
              ) : (
                <p style={{ fontSize: '12px', color: t.textMuted, margin: '6px 0' }}>No balance yet</p>
              )}
              {util != null && (
                <>
                  <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div style={{ width: `${util}%`, height: '100%', background: utilC, transition: 'width 0.3s' }} />
                  </div>
                  <p style={{ fontSize: '10px', color: utilC, fontWeight: 600, margin: '4px 0 0', letterSpacing: '0.3px' }}>{util.toFixed(0)}% used</p>
                </>
              )}
              {dueDays != null && (
                <p style={{ fontSize: '11px', color: dueDays <= 7 ? t.red : t.textMuted, fontWeight: 600, margin: util != null ? '6px 0 0' : '4px 0 0' }}>
                  {dueDays === 0 ? 'Due today' : `Due in ${dueDays}d`}
                </p>
              )}
              {onEditAccount && (
                <button onClick={(e) => { e.stopPropagation(); onEditAccount(a) }}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    width: '20px', height: '20px',
                    borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.05)',
                    color: t.textMuted, fontSize: '10px', cursor: 'pointer', padding: 0,
                  }}
                  title="Edit"
                >{'\u22EF'}</button>
              )}
            </div>
          )
        })}
        <div onClick={onAddCard} style={{
          minWidth: '120px',
          flex: '0 0 auto',
          padding: '16px',
          borderRadius: '20px',
          border: `1px dashed ${t.border}`,
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
          color: t.textMuted,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = `${t.teal}10`; e.currentTarget.style.borderColor = t.teal }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = t.border }}
        >
          <span style={{ fontSize: '20px', marginBottom: '4px' }}>+</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>Add Card</span>
        </div>
      </div>
    </div>
  )
}
