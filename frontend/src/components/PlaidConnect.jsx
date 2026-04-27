import { useState, useEffect, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { API_BASE } from '../constants'

/**
 * Inner launcher: only mounted once we have a non-null linkToken so
 * usePlaidLink isn't initialized on every render of the parent (which
 * causes the "Plaid script embedded more than once" warning and re-creates
 * the Plaid factory unnecessarily). Auto-opens as soon as `ready` flips true.
 */
const PlaidLauncher = ({ linkToken, onSuccess, onExit }) => {
  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit })
  useEffect(() => { if (ready) open() }, [ready, open])
  return null
}

/**
 * Plaid Connect component.
 *
 * Flow:
 *   1. On mount: GET /api/plaid/items to list connected banks
 *   2. User clicks "Connect Bank" -> POST /api/plaid/link-token -> get link_token
 *   3. PlaidLauncher mounts with token -> usePlaidLink -> open() -> Plaid modal
 *   4. onSuccess(public_token, metadata) -> POST /api/plaid/exchange-token -> backend syncs
 *   5. Refresh items list + signal parent to re-fetch transactions
 *
 * If backend returns 503 (no credentials) we show "Coming soon" instead of erroring.
 */
export const PlaidConnect = ({ t, authToken, authHeaders, onSyncComplete }) => {
  const [items, setItems] = useState([])
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(null) // item id being synced
  const [error, setError] = useState(null)
  const [unavailable, setUnavailable] = useState(false)

  const fetchItems = useCallback(async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/api/plaid/items`, { headers: authHeaders() })
      if (r.status === 503) { setUnavailable(true); return }
      if (r.ok) setItems(await r.json())
    } catch {}
  }, [authToken, authHeaders])

  useEffect(() => { fetchItems() }, [fetchItems])

  const fetchLinkToken = async () => {
    if (!authToken) { setError('Please log in to connect a bank'); return }
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/plaid/link-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() }
      })
      if (r.status === 503) { setUnavailable(true); setLoading(false); return }
      if (r.status === 401) { setError('Session expired -- please log in again'); setLoading(false); return }
      if (!r.ok) { setError(`Could not start bank connection (HTTP ${r.status})`); setLoading(false); return }
      const data = await r.json()
      if (!data.link_token) { setError('Bank connection unavailable -- missing token'); setLoading(false); return }
      setLinkToken(data.link_token)
    } catch (e) {
      setError(`Network error: ${e.message || 'unable to reach server'}`)
      setLoading(false)
    }
  }

  const onPlaidSuccess = useCallback(async (publicToken, metadata) => {
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/plaid/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          public_token: publicToken,
          institution: metadata?.institution || null,
        })
      })
      if (!r.ok) {
        setError('Could not connect bank')
      } else {
        await fetchItems()
        if (onSyncComplete) onSyncComplete()
      }
    } catch {
      setError('Network error during exchange')
    }
    setLoading(false)
    setLinkToken(null)
  }, [authHeaders, fetchItems, onSyncComplete])

  const onPlaidExit = useCallback(() => { setLoading(false); setLinkToken(null) }, [])

  const syncOne = async (itemId) => {
    setSyncing(itemId)
    try {
      const r = await fetch(`${API_BASE}/api/plaid/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ item_id: itemId })
      })
      if (r.ok && onSyncComplete) onSyncComplete()
      await fetchItems()
    } catch {}
    setSyncing(null)
  }

  const disconnect = async (itemId) => {
    if (!confirm('Disconnect this bank? Your transactions will stay, but auto-sync stops.')) return
    try {
      await fetch(`${API_BASE}/api/plaid/items/${itemId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      await fetchItems()
    } catch {}
  }

  const glass = {
    background: t.card,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${t.border}`,
    borderRadius: '20px',
    padding: '24px',
    boxShadow: t.cardShadow,
  }

  if (unavailable) {
    return (
      <div style={{ ...glass, textAlign: 'center', opacity: 0.6 }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏦</div>
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
          Bank auto-sync coming soon -- use manual upload below for now
        </p>
      </div>
    )
  }

  return (
    <div style={{ ...glass, marginBottom: '20px' }}>
      {linkToken && <PlaidLauncher linkToken={linkToken} onSuccess={onPlaidSuccess} onExit={onPlaidExit} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: items.length > 0 ? '14px' : '0' }}>
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
            🏦 Connect your bank
          </h3>
          <p style={{ fontSize: '12px', color: t.textMuted, margin: 0 }}>
            {items.length === 0 ? 'Sync transactions automatically -- no more uploads' : `${items.length} bank${items.length > 1 ? 's' : ''} connected`}
          </p>
        </div>
        <button
          onClick={fetchLinkToken}
          disabled={loading}
          style={{
            padding: '10px 20px',
            borderRadius: '12px',
            border: 'none',
            background: t.gradient || `linear-gradient(135deg, ${t.tealDark}, ${t.accentPurple || t.tealDeep})`,
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            boxShadow: '0 4px 14px rgba(59,130,246,0.3)',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Connecting...' : items.length === 0 ? 'Connect Bank' : '+ Add Another'}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: '12px', color: t.red, marginTop: '8px' }}>{error}</p>
      )}

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${t.border}`,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.institution_name || 'Bank'}
                </p>
                <p style={{ fontSize: '11px', color: t.textMuted, margin: '2px 0 0' }}>
                  {item.last_synced_at
                    ? `Synced ${new Date(item.last_synced_at).toLocaleString()}`
                    : 'Not yet synced'}
                  {item.sync_status !== 'active' && ` · ${item.sync_status}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => syncOne(item.id)}
                  disabled={syncing === item.id}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${t.border}`,
                    background: 'transparent',
                    color: t.teal,
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: syncing === item.id ? 'wait' : 'pointer',
                    opacity: syncing === item.id ? 0.5 : 1,
                  }}
                >
                  {syncing === item.id ? 'Syncing...' : 'Sync'}
                </button>
                <button
                  onClick={() => disconnect(item.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${t.border}`,
                    background: 'transparent',
                    color: t.red,
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
