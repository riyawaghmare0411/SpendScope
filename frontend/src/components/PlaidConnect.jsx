import { useState, useEffect, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { API_BASE } from '../constants'

/**
 * Inner launcher: only mounted once we have a non-null linkToken so
 * usePlaidLink isn't initialized on every render of the parent (which
 * causes the "Plaid script embedded more than once" warning and re-creates
 * the Plaid factory unnecessarily). Auto-opens as soon as `ready` flips true.
 */
const PlaidLauncher = ({ linkToken, onSuccess, onExit, receivedRedirectUri }) => {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    // Only set when resuming after a bank's OAuth sign-in. Passing it on a fresh launch makes
    // Plaid try to resume a session that does not exist.
    ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
  })
  useEffect(() => { if (ready) open() }, [ready, open])
  return null
}

// OAuth banks send the user to their own site and back, which reloads this page and wipes all
// React state. Plaid can only resume the session with the SAME link token that started it, so
// it has to survive the round trip somewhere. localStorage rather than sessionStorage because a
// bank's own mobile app can hand the user back in a new tab, which sessionStorage does not
// follow. A link token is short-lived and grants nothing on its own, and it is cleared the
// moment the flow ends either way.
const LINK_TOKEN_KEY = 'spendscope_plaid_link_token'
const isOAuthReturn = () => new URLSearchParams(window.location.search).has('oauth_state_id')
const readStoredLinkToken = () => { try { return localStorage.getItem(LINK_TOKEN_KEY) } catch { return null } }
const storeLinkToken = (t) => { try { localStorage.setItem(LINK_TOKEN_KEY, t) } catch { /* private mode */ } }
const clearLinkToken = () => { try { localStorage.removeItem(LINK_TOKEN_KEY) } catch { /* private mode */ } }
// Drop the ?oauth_state_id=... from the address bar once used, so a refresh does not try to
// resume a session that has already finished.
const clearOAuthParams = () => {
  if (isOAuthReturn()) window.history.replaceState(null, '', window.location.pathname === '/plaid-oauth' ? '/' : window.location.pathname)
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
export const PlaidConnect = ({ t, authToken, authHeaders, onSyncComplete, onSessionExpired }) => {
  const [items, setItems] = useState([])
  // Lazy initialisers, not an effect: when this mounts on the way back from a bank's OAuth
  // sign-in, resume immediately with the token that started the session.
  const [linkToken, setLinkToken] = useState(() => (isOAuthReturn() ? readStoredLinkToken() : null))
  const [receivedRedirectUri, setReceivedRedirectUri] = useState(
    () => (isOAuthReturn() && readStoredLinkToken() ? window.location.href : null)
  )
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(null) // item id being synced
  const [error, setError] = useState(() => (
    isOAuthReturn() && !readStoredLinkToken()
      ? 'Your bank sign-in could not be resumed. Please try connecting again.'
      : null
  ))
  const [unavailable, setUnavailable] = useState(false)

  // Whatever way a Plaid session ends, forget it, so the next "Connect" starts clean instead
  // of trying to resume a finished one.
  const endPlaidSession = useCallback(() => {
    clearLinkToken()
    clearOAuthParams()
    setReceivedRedirectUri(null)
    setLinkToken(null)
  }, [])

  const fetchItems = useCallback(async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/api/plaid/items`, { headers: authHeaders() })
      if (r.status === 503) { setUnavailable(true); return }
      if (r.status === 401) { if (onSessionExpired) onSessionExpired(); else setError('Session expired -- please log in again'); return }
      if (!r.ok) { setError(`Could not load connected banks (HTTP ${r.status})`); return }
      setItems(await r.json())
      setError(null)
    } catch (e) {
      setError(`Could not load connected banks: ${e.message || 'network error'}`)
    }
  }, [authToken, authHeaders, onSessionExpired])

  // Standard fetch-on-mount. setState occurs after the awaited fetch, not synchronously, so the
  // cascading-render warning does not apply here. The real improvement -- memoizing authHeaders in
  // App.jsx so this effect stops re-firing on every render -- is deferred to the Phase C auth work.
  // eslint-disable-next-line react-hooks/set-state-in-effect
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
      storeLinkToken(data.link_token)
      setReceivedRedirectUri(null)
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
    endPlaidSession()
  }, [authHeaders, fetchItems, onSyncComplete, endPlaidSession])

  const onPlaidExit = useCallback(() => { setLoading(false); endPlaidSession() }, [endPlaidSession])

  const syncOne = async (itemId) => {
    setSyncing(itemId)
    try {
      const r = await fetch(`${API_BASE}/api/plaid/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ item_id: itemId })
      })
      if (r.status === 401) { if (onSessionExpired) onSessionExpired(); else setError('Session expired -- please log in again'); return }
      if (!r.ok) { setError(`Sync failed (HTTP ${r.status})`); return }
      // Only refresh items (and clear the error) on the success branch -- fetchItems'
      // own setError(null) on a successful GET would otherwise wipe the failure
      // message we just set above, making a sync error invisible after one round trip.
      setError(null)
      await fetchItems()
      if (onSyncComplete) onSyncComplete()
    } catch (e) {
      setError(`Sync failed: ${e.message || 'network error'}`)
    } finally {
      setSyncing(null)
    }
  }

  const disconnect = async (itemId) => {
    if (!confirm('Disconnect this bank? Your transactions will stay, but auto-sync stops.')) return
    try {
      const r = await fetch(`${API_BASE}/api/plaid/items/${itemId}`, {
        method: 'DELETE',
        headers: authHeaders()
      })
      if (r.status === 401) { if (onSessionExpired) onSessionExpired(); else setError('Session expired -- please log in again'); return }
      if (!r.ok) { setError(`Could not disconnect (HTTP ${r.status})`); return }
      setError(null)
      await fetchItems()
    } catch (e) {
      setError(`Could not disconnect: ${e.message || 'network error'}`)
    }
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
      {linkToken && <PlaidLauncher linkToken={linkToken} onSuccess={onPlaidSuccess} onExit={onPlaidExit} receivedRedirectUri={receivedRedirectUri} />}
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
