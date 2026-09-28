import { useState, useMemo, useRef, useEffect } from 'react'
import { API_BASE } from '../constants'
import { PlaidConnect } from './PlaidConnect'
import * as planApi from '../lib/planApi'
import { PlanCard, SectionHeader, EmptyState, MoneyStat } from './plan/primitives'
import DataVisibilityNote from './DataVisibilityNote'

// Wave 1: full Accounts page -- every account across every bank, grouped and totaled
// per currency (currencies are never summed together). Separate from AccountsListPanel
// (Upload page) and AccountCardsRow (Dashboard) -- those stay as-is.
// Talks to the existing /api/accounts (GET/PATCH/POST, unchanged) plus the Wave-2
// planApi.syncAllPlaid for the manual refresh button.

const KIND_OPTIONS = [
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'loan', label: 'Loan' },
  { value: 'bnpl', label: 'BNPL' },
  { value: 'friend_loan', label: 'Friend/Family Loan' },
]

const EMPTY_FORM = { kind: 'credit_card', name: '', currency: '', balance: '', apr_bps: '', minimum_payment: '', next_due_date: '', term_months: '' }

const inputStyle = (t) => ({
  padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`,
  background: 'transparent', color: t.text, fontSize: '13px',
})

// Cash accounts: available_balance is spendable cash. Debt accounts (credit card/loan/
// BNPL/friend loan): current_balance is the amount owed -- available_balance on a credit
// account is available CREDIT, not held cash, so it must never lead for a debt account.
// statement_balance is the last-resort fallback for manually added accounts, which the
// backend never populates current_balance/available_balance for.
const balanceFor = (a) => a.counts_as_cash
  ? (a.available_balance ?? a.current_balance ?? a.statement_balance)
  : (a.current_balance ?? a.statement_balance ?? a.available_balance)

export default function AccountsPage({ t, authHeaders, authUser, accounts, refreshAccounts }) {
  const [error, setError] = useState('')
  const [togglingId, setTogglingId] = useState(null)

  const [syncing, setSyncing] = useState(false)
  const [syncCooldown, setSyncCooldown] = useState(false)
  const [syncError, setSyncError] = useState(null)
  const pollTimers = useRef([])
  useEffect(() => () => { pollTimers.current.forEach(clearTimeout) }, [])

  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM, currency: authUser?.currency || 'USD' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)

  const grouped = useMemo(() => {
    const map = {}
    for (const a of (accounts || [])) {
      const code = a.currency || 'USD'
      if (!map[code]) map[code] = []
      map[code].push(a)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [accounts])

  const toggleCountsAsCash = async (acct) => {
    setTogglingId(acct.id); setError('')
    try {
      const r = await fetch(`${API_BASE}/api/accounts/${acct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ counts_as_cash: !acct.counts_as_cash }),
      })
      if (r.status === 401) { setError('Session expired. Please log in again.'); return }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await refreshAccounts()
    } catch (e) {
      setError(`Could not update: ${e.message}`)
    } finally {
      setTogglingId(null)
    }
  }

  const handleManualRefresh = async () => {
    if (syncing || syncCooldown) return
    setSyncing(true); setSyncError(null); setSyncCooldown(true)
    try {
      await planApi.syncAllPlaid(authHeaders)
    } catch {
      // Wave 1: /api/plaid/sync itself exists, but the bulk-sync cooldown route this calls
      // through planApi may not be wired up yet -- keep this calm, not alarming.
      setSyncError("Refresh isn't available yet -- check back soon.")
    } finally {
      setSyncing(false)
    }
    // Simple polling: re-fetch accounts a couple times over ~10s so newly synced
    // balances/transactions show up without a manual page reload.
    pollTimers.current.push(setTimeout(() => refreshAccounts(), 4000))
    pollTimers.current.push(setTimeout(() => refreshAccounts(), 9000))
    pollTimers.current.push(setTimeout(() => setSyncCooldown(false), 30000))
  }

  const submitAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setAddError('Name is required'); return }
    setAdding(true); setAddError(null)
    try {
      const body = {
        kind: form.kind,
        name: form.name.trim(),
        currency: form.currency || 'USD',
        // This form only adds debt-type accounts (see KIND_OPTIONS) -- never checking/savings --
        // so it must never fall back to the backend's checking/savings default of true.
        counts_as_cash: false,
        statement_balance: form.balance === '' ? null : parseFloat(form.balance),
        apr_bps: form.apr_bps === '' ? null : parseInt(form.apr_bps, 10),
        minimum_payment: form.minimum_payment === '' ? null : parseFloat(form.minimum_payment),
        next_due_date: form.next_due_date || null,
        term_months: form.term_months === '' ? null : parseInt(form.term_months, 10),
      }
      const r = await fetch(`${API_BASE}/api/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      if (r.status === 401) { setAddError('Session expired. Please log in again.'); return }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      await refreshAccounts()
      setForm({ ...EMPTY_FORM, currency: authUser?.currency || 'USD' })
      setShowAddForm(false)
    } catch (e) {
      setAddError(`Could not add: ${e.message}`)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
          Accounts{authUser?.name ? `, ${authUser.name}` : ''}
        </h2>
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
          Every account across every bank, grouped and totaled per currency -- currencies are never mixed together.
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        {/* PlaidConnect needs a truthy authToken only to gate its own effects/fetches --
            the real bearer token is sent via authHeaders() on every request, and this page
            isn't handed the raw authToken string, so authUser stands in as that truthy gate. */}
        <PlaidConnect t={t} authToken={authUser} authHeaders={authHeaders} onSyncComplete={refreshAccounts} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleManualRefresh}
            disabled={syncing || syncCooldown}
            style={{
              padding: '8px 16px', borderRadius: '10px', border: `1px solid ${t.border}`,
              background: 'transparent', color: t.teal, fontSize: '12px', fontWeight: 600,
              cursor: (syncing || syncCooldown) ? 'not-allowed' : 'pointer',
              opacity: (syncing || syncCooldown) ? 0.5 : 1,
            }}
          >
            {syncing ? 'Refreshing...' : 'Refresh all banks'}
          </button>
          {syncError && <span style={{ fontSize: '12px', color: t.textMuted }}>{syncError}</span>}
        </div>
      </div>

      {error && <p style={{ fontSize: '12px', color: t.red, margin: '0 0 14px' }}>{error}</p>}

      {(!accounts || accounts.length === 0) ? (
        <EmptyState t={t} message="No accounts yet -- connect a bank above or add one manually below." />
      ) : (
        grouped.map(([code, list]) => {
          const cashList = list.filter(a => a.counts_as_cash)
          const debtList = list.filter(a => !a.counts_as_cash)
          const total = cashList.reduce((sum, a) => sum + (balanceFor(a) ?? 0), 0)
          const debtTotal = debtList.reduce((sum, a) => sum + (balanceFor(a) ?? 0), 0)
          const hasPlaid = list.some(a => a.is_plaid)
          return (
            <div key={code} style={{ marginBottom: '16px' }}>
              <PlanCard t={t} title={code} accent={t.teal}>
                <SectionHeader
                  t={t}
                  title={`${list.length} account${list.length !== 1 ? 's' : ''}`}
                  action={
                    <div style={{ display: 'flex', gap: '20px' }}>
                      <MoneyStat t={t} label="Total (cash)" amount={total} currency={code} size="md" />
                      {debtList.length > 0 && <MoneyStat t={t} label="Owed (debt)" amount={debtTotal} currency={code} size="md" />}
                    </div>
                  }
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {list.map(a => {
                    const balance = balanceFor(a)
                    const subtitle = [a.bank_name || null, a.mask ? `••${a.mask}` : null, a.kind || null].filter(Boolean).join(' · ')
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
                        padding: '10px 14px', borderRadius: '12px',
                        background: 'rgba(255,255,255,0.03)', border: `1px solid ${t.border}`,
                      }}>
                        <div style={{ flex: 1, minWidth: '140px' }}>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: 0 }}>
                            {a.name || 'Unnamed'}
                            {a.is_plaid && (
                              <span style={{ fontSize: '10px', fontWeight: 600, color: t.teal, marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', background: `${t.teal}15` }}>
                                PLAID
                              </span>
                            )}
                          </p>
                          {subtitle && <p style={{ fontSize: '11px', color: t.textMuted, margin: '3px 0 0' }}>{subtitle}</p>}
                        </div>
                        <MoneyStat t={t} label="" amount={balance ?? 0} currency={code} size="md" />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: t.textLight, cursor: togglingId === a.id ? 'wait' : 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!a.counts_as_cash}
                            disabled={togglingId === a.id}
                            onChange={() => toggleCountsAsCash(a)}
                          />
                          Counts as cash
                        </label>
                      </div>
                    )
                  })}
                </div>
                {hasPlaid && <DataVisibilityNote t={t} source="plaid" />}
              </PlanCard>
            </div>
          )
        })
      )}

      <div style={{ marginTop: '20px' }}>
        <PlanCard t={t} title="Add a debt, BNPL, or loan" accent={t.sand}>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{ padding: '8px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600 }}
            >
              + Add manually
            </button>
          ) : (
            <form onSubmit={submitAdd} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} style={{ ...inputStyle(t), minWidth: '140px' }}>
                  {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <input type="text" placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle(t), flex: 1, minWidth: '160px' }} />
                <input type="text" placeholder="Currency (e.g. USD)" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} style={{ ...inputStyle(t), width: '140px' }} maxLength={3} />
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input type="number" step="0.01" placeholder="Balance" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} style={{ ...inputStyle(t), width: '140px' }} />
                <input type="number" placeholder="APR (bps)" value={form.apr_bps} onChange={e => setForm(f => ({ ...f, apr_bps: e.target.value }))} style={{ ...inputStyle(t), width: '140px' }} />
                <input type="number" step="0.01" placeholder="Min. payment" value={form.minimum_payment} onChange={e => setForm(f => ({ ...f, minimum_payment: e.target.value }))} style={{ ...inputStyle(t), width: '140px' }} />
                <input type="date" placeholder="Next due date" value={form.next_due_date} onChange={e => setForm(f => ({ ...f, next_due_date: e.target.value }))} style={{ ...inputStyle(t), width: '160px' }} />
                <input type="number" placeholder="Term (months)" value={form.term_months} onChange={e => setForm(f => ({ ...f, term_months: e.target.value }))} style={{ ...inputStyle(t), width: '140px' }} />
              </div>
              {addError && <p style={{ fontSize: '12px', color: t.red, margin: 0 }}>{addError}</p>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={adding} style={{ padding: '8px 18px', borderRadius: '10px', border: 'none', cursor: adding ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, opacity: adding ? 0.6 : 1 }}>
                  {adding ? 'Adding...' : 'Add account'}
                </button>
                <button type="button" onClick={() => { setShowAddForm(false); setAddError(null) }} style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 500 }}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </PlanCard>
      </div>
    </div>
  )
}
