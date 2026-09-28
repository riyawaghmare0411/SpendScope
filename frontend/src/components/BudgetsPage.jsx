import { useState, useEffect, useCallback } from 'react'
import * as planApi from '../lib/planApi'
import { CAT_COLORS } from '../constants'
import { PlanCard, SectionHeader, EmptyState } from './plan/primitives'

// Budget management view. Talks to /api/budgets (frozen contract, built by a different lane
// in Wave 2) via planApi.js -- full-replace semantics on save, per GET/PUT /api/budgets.
// No actual-vs-budget progress here: App.jsx doesn't pass category totals into this page,
// and the task calls for not inventing a new data-fetch path for that -- budget management only.

const PERIODS = ['weekly', 'monthly', 'yearly']
const ISO_CURRENCIES = ['USD', 'GBP', 'EUR', 'INR', 'JPY', 'AUD', 'CAD']
const CATEGORY_OPTIONS = Object.keys(CAT_COLORS)

const blankRow = (currency) => ({ category: '', amount: '', period: 'monthly', currency })

const inputStyle = (t) => ({ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none' })

export default function BudgetsPage({ t, authHeaders, authUser }) {
  const defaultCurrency = authUser?.currency || 'USD'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError(false); setSaved(false)
    planApi.getBudgets(authHeaders)
      .then(data => setRows((data?.items || []).map(b => ({ ...b, amount: String(b.amount) }))))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [authHeaders])

  // Mount-only fetch: load() sets state synchronously before its async call, so this trips
  // react-hooks/set-state-in-effect same as PlaidConnect.jsx's fetch-on-mount effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const updateRow = (i, field, value) => { setSaved(false); setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r)) }
  const addRow = () => { setSaved(false); setRows(rs => [...rs, blankRow(defaultCurrency)]) }
  const removeRow = (i) => { setSaved(false); setRows(rs => rs.filter((_, idx) => idx !== i)) }

  const save = () => {
    const items = rows
      .filter(r => r.category.trim() && Number(r.amount) > 0)
      .map(r => ({ category: r.category.trim(), amount: Math.round(Number(r.amount) * 100) / 100, period: r.period || 'monthly', currency: r.currency || defaultCurrency }))
    setSaving(true); setSaveError(null); setSaved(false)
    planApi.putBudgets(items, authHeaders)
      .then(data => { setRows((data?.items || items).map(b => ({ ...b, amount: String(b.amount) }))); setSaved(true) })
      .catch(() => setSaveError("Couldn't save budgets -- check back soon."))
      .finally(() => setSaving(false))
  }

  if (loading) {
    return <PlanCard t={t} title="Budgets"><p style={{ color: t.textMuted, fontSize: '13px', margin: 0 }}>Loading budgets...</p></PlanCard>
  }
  if (error) {
    return <PlanCard t={t} title="Budgets"><EmptyState t={t} message="Budgets aren't available yet -- check back once it ships." /></PlanCard>
  }

  return (<>
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>Budgets</h2>
      <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>Set a spending limit per category and period.</p>
    </div>

    <PlanCard t={t} title="Category budgets" accent={t.teal}>
      <SectionHeader t={t} title="Your budgets" subtitle={`${rows.length} categor${rows.length === 1 ? 'y' : 'ies'} budgeted`}
        action={<button onClick={addRow} style={{ padding: '6px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '12px', fontWeight: 600 }}>+ Add budget</button>} />

      {rows.length === 0 ? (
        <div style={{ margin: '16px 0' }}><EmptyState t={t} message="No budgets set yet -- add one above." /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 14px', borderRadius: '12px', border: `1px solid ${t.border}`, background: `${t.teal}05` }}>
              <input list="budgets-category-options" placeholder="Category" value={r.category} onChange={e => updateRow(i, 'category', e.target.value)} style={{ ...inputStyle(t), flex: '2 1 140px' }} />
              <input type="number" step="0.01" min="0" placeholder="Amount" value={r.amount} onChange={e => updateRow(i, 'amount', e.target.value)} style={{ ...inputStyle(t), flex: '1 1 100px' }} />
              <select value={r.period} onChange={e => updateRow(i, 'period', e.target.value)} style={{ ...inputStyle(t), flex: '1 1 100px' }}>
                {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={r.currency} onChange={e => updateRow(i, 'currency', e.target.value)} style={{ ...inputStyle(t), flex: '1 1 80px' }}>
                {ISO_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={() => removeRow(i)} style={{ padding: '8px 10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: '11px', cursor: 'pointer' }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <datalist id="budgets-category-options">
        {CATEGORY_OPTIONS.map(c => <option key={c} value={c} />)}
      </datalist>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
        <button onClick={save} disabled={saving} style={{ padding: '8px 18px', borderRadius: '10px', border: 'none', cursor: saving ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save changes'}</button>
        {saved && !saving && <span style={{ fontSize: '12px', color: t.green }}>Saved</span>}
        {saveError && <span style={{ fontSize: '12px', color: t.textMuted }}>{saveError}</span>}
      </div>
    </PlanCard>
  </>)
}
