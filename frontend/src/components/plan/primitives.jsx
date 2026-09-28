// FROZEN RE-SKIN PRIMITIVES -- shared building blocks for the plan/* pages (Today, Future,
// Simulate, Accounts, Budgets). Styled inline to match the existing app look (no Tailwind);
// a MoneyMap-style redesign is an explicit later phase, not this one.
import { fmt, fmtShort } from '../../constants'

// ISO currency code -> display symbol (mirrors the App.jsx currency-code table).
const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€', INR: '₹', JPY: '¥', CNY: '¥', AUD: 'A$', CAD: 'C$' }
const currencySymbol = (code) => CURRENCY_SYMBOLS[code] || `${code} `

export const PlanCard = ({ t, title, children, accent }) => (
  <div style={{ background: t.card, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '20px', border: `1px solid ${accent ? `${accent}40` : t.border}`, boxShadow: t.cardShadow, padding: '24px', position: 'relative', overflow: 'hidden' }}>
    {title && <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 16px' }}>{title}</h3>}
    {children}
  </div>
)

const RISK_LABELS = { good: 'Good', watch: 'Watch', danger: 'Danger' }

export const RiskBadge = ({ t, level }) => {
  const color = level === 'danger' ? t.red : level === 'watch' ? t.sand : t.green
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: `${color}18`, color }}>
      {RISK_LABELS[level] || level}
    </span>
  )
}

const MONEY_STAT_SIZES = { sm: 13, md: 18, lg: 28 }

export const MoneyStat = ({ t, label, amount, currency, size = 'md' }) => {
  const fontSize = MONEY_STAT_SIZES[size] || MONEY_STAT_SIZES.md
  const isNeg = Number(amount) < 0
  const value = size === 'sm' ? fmtShort(amount) : fmt(amount)
  return (
    <div>
      {label && <p style={{ fontSize: '12px', color: t.textMuted, margin: '0 0 4px', fontWeight: 500 }}>{label}</p>}
      <p style={{ fontSize: `${fontSize}px`, fontWeight: 700, color: isNeg ? t.red : t.text, margin: 0 }}>{isNeg ? '-' : ''}{currencySymbol(currency)}{value}</p>
    </div>
  )
}

export const SectionHeader = ({ t, title, subtitle, action }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
    <div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
    {action}
  </div>
)

export const EmptyState = ({ t, message }) => (
  <p style={{ textAlign: 'center', color: t.textMuted, padding: '40px 0', fontSize: '13px', margin: 0 }}>{message}</p>
)

// item: RecurringItem. Confirm-once-then-automatic UX -- confirming applies going forward
// without needing to re-review the same recurring item every time it recurs.
export const ConfirmDismissRow = ({ t, item, onConfirm, onDismiss }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${t.border}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ width: '4px', height: '32px', borderRadius: '2px', background: item.direction === 'IN' ? t.green : t.red }} />
      <div>
        <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: 0 }}>{item.label}</p>
        <p style={{ fontSize: '11px', color: t.textMuted, margin: '2px 0 0' }}>{item.cadence}{item.next_date ? ` • next ${item.next_date}` : ''}</p>
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '14px', fontWeight: 600, color: item.direction === 'IN' ? t.green : t.red }}>{item.direction === 'IN' ? '+' : '-'}{currencySymbol(item.currency)}{fmt(item.amount)}</span>
      <button onClick={() => onConfirm(item)} title="Confirm once -- future occurrences are then handled automatically" style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: t.tealDark, color: 'white', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
      <button onClick={() => onDismiss(item)} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
    </div>
  </div>
)
