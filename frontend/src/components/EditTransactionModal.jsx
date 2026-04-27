import { useState, useEffect, useMemo } from 'react'
import { fmt } from '../constants'

// Phase 11B: full-row edit modal -- direction, category, merchant, amount.
// Phase 11C: optional "apply to all matching merchants" + persist learned rule to backend.

export default function EditTransactionModal({ t, currency, txn, ALL_CATEGORIES, CAT_COLORS, onClose, onSave, allTransactions, API_BASE, authHeaders }) {
  const [direction, setDirection] = useState(txn.direction || 'OUT')
  const [category, setCategory] = useState(txn.category || 'Other')
  const [merchant, setMerchant] = useState(txn.merchant || '')
  const [amount, setAmount] = useState(String(Number(txn.direction === 'IN' ? txn.money_in : txn.money_out) || txn.amount || 0))
  const [applyAll, setApplyAll] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Find sibling transactions with same merchant (case-insensitive). Same-direction match
  // is what "apply to all" targets -- we don't auto-flip OTHER directions of the same name.
  const matching = useMemo(() => {
    const norm = (txn.merchant || '').trim().toLowerCase()
    if (!norm) return []
    return (allTransactions || []).filter(x => (x.merchant || '').trim().toLowerCase() === norm && x.direction === txn.direction && x.id && x.id !== txn.id)
  }, [txn, allTransactions])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const directionChanged = direction !== txn.direction
  const amountNum = parseFloat(amount)
  const amountChanged = !isNaN(amountNum) && amountNum > 0 && Math.abs(amountNum - (Number(txn.direction === 'IN' ? txn.money_in : txn.money_out) || txn.amount || 0)) > 0.001

  const handleSave = async () => {
    setError('')
    if (!merchant.trim()) { setError('Merchant cannot be empty'); return }
    if (isNaN(amountNum) || amountNum <= 0) { setError('Amount must be a positive number'); return }
    setSaving(true)
    try {
      const changes = {}
      if (category !== txn.category) changes.category = category
      if (direction !== txn.direction) changes.direction = direction
      if (amountChanged) changes.amount = amountNum
      if (merchant.trim() !== (txn.merchant || '').trim()) changes.merchant = merchant.trim()
      if (Object.keys(changes).length === 0) { onClose(); return }

      // Always patch the primary row
      if (txn.id && API_BASE && authHeaders) {
        const r = await fetch(`${API_BASE}/api/transactions/${txn.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(changes),
        })
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j.detail || `HTTP ${r.status}`)
        }
      }

      // Phase 11C: bulk-apply to siblings
      if (applyAll && matching.length > 0 && API_BASE && authHeaders) {
        const ids = matching.map(m => m.id).filter(Boolean)
        if (ids.length > 0) {
          await fetch(`${API_BASE}/api/transactions/batch-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ ids, changes }),
          })
        }
        // Also persist as a server-side category rule keyed on merchant + direction
        try {
          await fetch(`${API_BASE}/api/category-rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ merchant: merchant.trim(), direction, category, learned_at: new Date().toISOString().slice(0, 10) }),
          })
        } catch {}
      }

      onSave({ changes, applyAll, matchingIds: applyAll ? matching.map(m => m.id).filter(Boolean) : [] })
    } catch (e) {
      setError(e.message || 'Save failed')
      setSaving(false)
    }
  }

  const card = {
    background: t.card,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${t.border}`,
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
    padding: '28px 32px',
    width: '92%',
    maxWidth: '440px',
    color: t.text,
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: t.text, margin: 0 }}>Edit Transaction</h3>
          <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '8px', border: 'none', background: 'transparent', color: t.textMuted, fontSize: '16px', cursor: 'pointer', padding: 0 }}>{'\u00D7'}</button>
        </div>
        <p style={{ fontSize: '11px', color: t.textMuted, margin: '0 0 16px' }}>
          {new Date((txn.date_iso || '') + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        {/* Direction toggle (the real Wingstop fix) */}
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Direction</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {[
            { v: 'IN', label: 'Money In', color: t.green },
            { v: 'OUT', label: 'Money Out', color: t.red },
          ].map(opt => (
            <button key={opt.v} onClick={() => setDirection(opt.v)}
              style={{
                flex: 1, padding: '10px', borderRadius: '12px', border: `1px solid ${direction === opt.v ? opt.color : t.border}`,
                background: direction === opt.v ? `${opt.color}15` : 'transparent',
                color: direction === opt.v ? opt.color : t.textLight,
                fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {direction === opt.v ? (opt.v === 'IN' ? '+ ' : '- ') : ''}{opt.label}
            </button>
          ))}
        </div>

        {/* Category dropdown */}
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Category</p>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', marginBottom: '14px', cursor: 'pointer', boxSizing: 'border-box' }}>
          {ALL_CATEGORIES.map(c => <option key={c} value={c} style={{ background: t.bg, color: t.text }}>{c}</option>)}
        </select>

        {/* Merchant rename */}
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Merchant</p>
        <input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Merchant name"
          style={{ width: '100%', padding: '10px 12px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', marginBottom: '14px', boxSizing: 'border-box' }} />

        {/* Amount */}
        <p style={{ fontSize: '11px', fontWeight: 700, color: t.textMuted, margin: '0 0 6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Amount ({currency})</p>
        <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', marginBottom: '14px', boxSizing: 'border-box' }} />

        {/* Apply to all matching */}
        {matching.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '12px', background: `${t.teal}10`, border: `1px solid ${t.teal}30`, marginBottom: '16px', cursor: 'pointer' }}>
            <input type="checkbox" checked={applyAll} onChange={e => setApplyAll(e.target.checked)} style={{ marginTop: '2px', cursor: 'pointer' }} />
            <span style={{ fontSize: '12px', color: t.text, lineHeight: 1.4 }}>
              Also apply to <strong>{matching.length}</strong> other {direction === 'IN' ? 'incoming' : 'outgoing'} transaction{matching.length === 1 ? '' : 's'} from <strong>{txn.merchant}</strong>
              <span style={{ display: 'block', fontSize: '11px', color: t.textMuted, marginTop: '2px' }}>
                Saves a rule so future imports auto-categorize this merchant.
              </span>
            </span>
          </label>
        )}

        {error && <p style={{ fontSize: '12px', color: t.red, margin: '0 0 12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: '11px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: saving ? 'wait' : 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 500 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '11px', borderRadius: '12px', border: 'none', cursor: saving ? 'wait' : 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, opacity: saving ? 0.7 : 1, boxShadow: `0 4px 14px ${t.tealDark}40` }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
