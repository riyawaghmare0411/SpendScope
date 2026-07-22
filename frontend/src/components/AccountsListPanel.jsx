import { useState } from 'react'

// Phase 17: Accounts list on Upload page.
// Shows every account the user has, with Open/Rename/Delete actions.
// Uses existing /api/accounts (GET/PATCH/DELETE) endpoints.

export function AccountsListPanel({ t, lc, accounts, setActiveAccount, setPage, API_BASE, authHeaders, refreshAccounts, refreshTransactions, handleLogout }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!accounts || accounts.length === 0) return null  // hide entirely when there are no accounts

  const onOpen = (acct) => {
    setActiveAccount(acct.name)
    setPage('transactions')
  }

  const onRenameStart = (acct) => {
    setEditingId(acct.id)
    setEditName(acct.name || '')
    setError('')
  }

  const onRenameSave = async (acct) => {
    const next = editName.trim()
    if (!next || next === acct.name) { setEditingId(null); return }
    setBusy(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/api/accounts/${acct.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: next }),
      })
      if (r.status === 401) {
        setError('Session expired. Please log in again.')
        setTimeout(() => { if (handleLogout) handleLogout() }, 1500)
        return
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await refreshAccounts()
      setEditingId(null)
    } catch (e) {
      setError(`Could not rename: ${e.message}`)
    } finally { setBusy(false) }
  }

  const onDelete = async (acct) => {
    const msg = acct.is_plaid
      ? `"${acct.name}" is a Plaid-connected account. Disconnecting it will stop auto-sync. Transactions in the database stay (you'll need to wipe them separately if you want them gone). Continue?`
      : `Delete "${acct.name}"? Transactions linked to this account will keep existing in the DB but lose their account_id (they'll show in "All Accounts" view). This cannot be undone.`
    if (!window.confirm(msg)) return
    setBusy(true); setError('')
    try {
      const r = await fetch(`${API_BASE}/api/accounts/${acct.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      if (r.status === 401) {
        setError('Session expired. Please log in again.')
        setTimeout(() => { if (handleLogout) handleLogout() }, 1500)
        return
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      await refreshAccounts()
      if (refreshTransactions) await refreshTransactions()
    } catch (e) {
      setError(`Could not delete: ${e.message}`)
    } finally { setBusy(false) }
  }

  const formatLastSync = (iso) => {
    if (!iso) return 'never'
    try {
      const d = new Date(iso)
      const days = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (days === 0) return 'today'
      if (days === 1) return 'yesterday'
      if (days < 30) return `${days} days ago`
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    } catch { return iso }
  }

  return (
    <div style={{ ...lc, marginBottom: '20px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: t.text, margin: 0 }}>
          Your Accounts
          <span style={{ fontSize: '12px', fontWeight: 500, color: t.textMuted, marginLeft: '8px' }}>
            ({accounts.length})
          </span>
        </h3>
        <p style={{ fontSize: '11px', color: t.textMuted, margin: 0 }}>
          Open to view transactions, rename, or remove
        </p>
      </div>
      {error && <p style={{ fontSize: '12px', color: t.red, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {accounts.map(a => {
          const isEditing = editingId === a.id
          const subtitle = [
            a.bank_name || a.subtype || null,
            a.mask ? `••${a.mask}` : null,
            a.transaction_count != null ? `${a.transaction_count} txn${a.transaction_count !== 1 ? 's' : ''}` : null,
            a.last_synced_at ? `synced ${formatLastSync(a.last_synced_at)}` : null,
          ].filter(Boolean).join(' · ')
          return (
            <div key={a.id} style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${t.border}`,
              gap: '12px',
            }}>
              {/* Identity */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onRenameSave(a)
                      else if (e.key === 'Escape') setEditingId(null)
                    }}
                    style={{
                      width: '60%', padding: '6px 10px', borderRadius: '8px',
                      border: `1px solid ${t.teal}`, background: t.bg, color: t.text,
                      fontSize: '13px', outline: 'none',
                    }}
                  />
                ) : (
                  <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.name || 'Unnamed'}
                    {a.is_plaid && (
                      <span style={{ fontSize: '10px', fontWeight: 600, color: t.teal, marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', background: `${t.teal}15` }}>
                        PLAID
                      </span>
                    )}
                  </p>
                )}
                {!isEditing && subtitle && (
                  <p style={{ fontSize: '11px', color: t.textMuted, margin: '3px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {subtitle}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={() => onRenameSave(a)}
                      disabled={busy}
                      style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: busy ? 'wait' : 'pointer', background: t.teal, color: 'white', fontSize: '12px', fontWeight: 600 }}>
                      {busy ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '12px', fontWeight: 500 }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onOpen(a)}
                      title="Filter Transactions to this account"
                      style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '12px', fontWeight: 600 }}>
                      Open
                    </button>
                    <button
                      onClick={() => onRenameStart(a)}
                      title="Rename this account"
                      style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '12px', fontWeight: 500 }}>
                      Rename
                    </button>
                    <button
                      onClick={() => onDelete(a)}
                      disabled={busy}
                      title={a.is_plaid ? 'Disconnect this Plaid account' : 'Delete this account (transactions stay)'}
                      style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.red}40`, cursor: busy ? 'wait' : 'pointer', background: 'transparent', color: t.red, fontSize: '12px', fontWeight: 600 }}>
                      {a.is_plaid ? 'Disconnect' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
