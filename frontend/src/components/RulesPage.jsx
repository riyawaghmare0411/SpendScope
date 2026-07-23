import { useState, useEffect } from 'react'

// Phase C: Rules page rebuilt as a manager for real, backend-stored category
// rules (CategoryRule DB table via /api/category-rules). Previously this page
// only read/wrote localStorage (spendscope_bulk_rules, spendscope_learned_rules)
// and made zero network calls -- rules created here did nothing. Now it lists,
// edits, and deletes the rules that actually drive categorization.

const DIRECTION_LABEL = { IN: 'Income', OUT: 'Expense' }

export default function RulesPage({ t, authHeaders, API_BASE, ALL_CATEGORIES, CAT_COLORS, lc }) {
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const fetchRules = async () => {
    setLoading(true); setLoadError(null)
    try {
      const r = await fetch(`${API_BASE}/api/category-rules`, { headers: authHeaders() })
      if (r.status === 401) throw new Error('Session expired. Please log in again to see your rules.')
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      setRules(await r.json())
    } catch (e) {
      setLoadError(e.message || 'Could not load rules')
      setRules(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchRules() }, [])

  const startEdit = (rule) => {
    setEditingId(rule.id); setEditValue(rule.match_value); setEditCategory(rule.category); setActionError(null)
  }
  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (rule) => {
    const mv = editValue.trim()
    if (!mv) { setActionError('Match value cannot be empty'); return }
    setBusyId(rule.id); setActionError(null)
    try {
      const r = await fetch(`${API_BASE}/api/category-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ match_value: mv, category: editCategory }),
      })
      if (r.status === 401) throw new Error('Session expired. Please log in again.')
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      const updated = await r.json()
      setRules(rs => rs.map(x => x.id === rule.id ? updated : x))
      setEditingId(null)
    } catch (e) {
      setActionError(`Could not save rule: ${e.message}`)
    } finally { setBusyId(null) }
  }

  const onDelete = async (rule) => {
    if (!window.confirm(`Delete this rule -- "${rule.match_value}" -> ${rule.category}?`)) return
    setBusyId(rule.id); setActionError(null)
    try {
      const r = await fetch(`${API_BASE}/api/category-rules/${rule.id}`, { method: 'DELETE', headers: authHeaders() })
      if (r.status === 401) throw new Error('Session expired. Please log in again.')
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      setRules(rs => rs.filter(x => x.id !== rule.id))
    } catch (e) {
      setActionError(`Could not delete rule: ${e.message}`)
    } finally { setBusyId(null) }
  }

  return (<>
    <p style={{ fontSize: '13px', color: t.textLight, margin: '-20px 0 12px' }}>
      Rules that tell SpendScope how to categorize transactions automatically. Edit or delete any of them below.
    </p>

    {/* How-it-works explainer (collapsible) */}
    <div style={{ ...lc, marginBottom: '20px', padding: '14px 20px', borderLeft: `3px solid ${t.teal}` }}>
      <button onClick={() => setShowHelp(s => !s)} style={{
        background: 'transparent', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
        color: t.teal, fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {showHelp ? '▼' : '▶'} How categorization works (read me)
      </button>
      {showHelp && (
        <div style={{ marginTop: '12px', fontSize: '13px', color: t.textLight, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>When a new transaction comes in, SpendScope tries to categorize it in this order:</p>
          <ol style={{ margin: '0 0 8px', paddingLeft: '20px' }}>
            <li><strong style={{ color: t.text }}>Your rules (below)</strong> -- highest priority. Match a string, get a category.</li>
            <li><strong style={{ color: t.text }}>Built-in starter pack</strong> -- ~80 common merchants like Tesco, Walmart, Spotify, Netflix.</li>
            <li><strong style={{ color: t.text }}>"Other"</strong> -- if nothing else matches.</li>
          </ol>
          <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>
            Rules marked "Learned" were created automatically when you re-categorized a transaction and chose "apply to all matching" on the Transactions page. Every rule lives on the backend under your account -- editing or deleting one here changes the same data everywhere, not just this device.
          </p>
        </div>
      )}
    </div>

    {/* Rules list */}
    <div style={{ ...lc, padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: 0 }}>
          Your rules {rules && <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({rules.length})</span>}
        </h3>
        <button onClick={fetchRules} disabled={loading} style={{
          padding: '6px 14px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'transparent',
          color: t.teal, fontSize: '12px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1,
        }}>{loading ? 'Refreshing...' : 'Refresh'}</button>
      </div>

      {loadError && (
        <div style={{ margin: '10px 0', padding: '10px 16px', borderRadius: '10px', background: `${t.red}08`, border: `1px solid ${t.red}30` }}>
          <p style={{ margin: 0, fontSize: '13px', color: t.red, fontWeight: 500 }}>Couldn't load rules: {loadError}</p>
        </div>
      )}
      {actionError && (
        <div style={{ margin: '10px 0', padding: '10px 16px', borderRadius: '10px', background: `${t.red}08`, border: `1px solid ${t.red}30` }}>
          <p style={{ margin: 0, fontSize: '13px', color: t.red, fontWeight: 500 }}>{actionError}</p>
        </div>
      )}

      {loading && !rules && !loadError && (
        <p style={{ fontSize: '13px', color: t.textMuted, margin: '12px 0' }}>Loading your rules...</p>
      )}

      {!loading && rules && rules.length === 0 && !loadError && (
        <p style={{ fontSize: '13px', color: t.textMuted, margin: '12px 0', fontStyle: 'italic' }}>
          No rules yet. Re-categorize a transaction and choose "apply to all matching" on the Transactions page to create one.
        </p>
      )}

      {rules && rules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
          <div style={{ display: 'flex', padding: '6px 12px', fontSize: '10px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ flex: 2 }}>Match value</span>
            <span style={{ flex: 1 }}>Direction</span>
            <span style={{ flex: 1 }}>Category</span>
            <span style={{ width: '70px' }}>Type</span>
            <span style={{ width: '130px' }}></span>
          </div>
          {rules.map(rule => {
            const isEditing = editingId === rule.id
            const isBusy = busyId === rule.id
            return (
              <div key={rule.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', borderBottom: `1px solid ${t.border}40` }}>
                {isEditing ? (
                  <>
                    <span style={{ flex: 2, paddingRight: '8px' }}>
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: `1px solid ${t.teal}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                    </span>
                    <span style={{ flex: 1, fontSize: '12px', color: t.textMuted }}>{DIRECTION_LABEL[rule.direction] || 'Any'}</span>
                    <span style={{ flex: 1, paddingRight: '8px' }}>
                      <select value={editCategory} onChange={e => setEditCategory(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none', cursor: 'pointer' }}>
                        {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </span>
                    <span style={{ width: '70px' }} />
                    <span style={{ width: '130px', display: 'flex', gap: '6px' }}>
                      <button onClick={() => saveEdit(rule)} disabled={isBusy} style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: isBusy ? 'wait' : 'pointer', background: t.teal, color: 'white', fontSize: '11px', fontWeight: 600 }}>{isBusy ? '...' : 'Save'}</button>
                      <button onClick={cancelEdit} style={{ padding: '5px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '11px', fontWeight: 500 }}>Cancel</button>
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 2, fontSize: '13px', fontWeight: 500, color: t.text }}>{rule.match_value}</span>
                    <span style={{ flex: 1, fontSize: '12px', color: t.textMuted }}>{DIRECTION_LABEL[rule.direction] || 'Any'}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: (CAT_COLORS[rule.category] || '#9AABBA') + '18', color: CAT_COLORS[rule.category] || t.textLight }}>{rule.category}</span>
                    </span>
                    <span style={{ width: '70px', fontSize: '11px', color: t.textMuted }}>{rule.is_learned ? 'Learned' : 'Manual'}</span>
                    <span style={{ width: '130px', display: 'flex', gap: '6px' }}>
                      <button onClick={() => startEdit(rule)} style={{ padding: '5px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '11px', fontWeight: 600 }}>Edit</button>
                      <button onClick={() => onDelete(rule)} disabled={isBusy} style={{ padding: '5px 12px', borderRadius: '8px', border: `1px solid ${t.red}30`, cursor: isBusy ? 'wait' : 'pointer', background: 'transparent', color: t.red, fontSize: '11px', fontWeight: 600 }}>{isBusy ? '...' : 'Delete'}</button>
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  </>)
}
