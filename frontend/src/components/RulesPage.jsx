import { useRef } from 'react'

export default function RulesPage({ t, currency, rulesVersion, setRulesVersion, data, setData, setUploadStatus, uploadStatus, categorizeWithRules, ALL_CATEGORIES, CAT_COLORS, lc }) {
  void rulesVersion // referenced to trigger re-render on rule changes
  const learnedRules = JSON.parse(localStorage.getItem('spendscope_learned_rules') || '[]')
  const bulkRules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
  const ruleFileInputRef = useRef(null)
  return (<>
    <p style={{ fontSize: '13px', color: t.textLight, margin: '-20px 0 20px' }}>Manage how transactions are categorized. Learned rules come from inline edits on the Transactions page. Bulk rules let you define custom matching patterns.</p>

    {/* Add New Bulk Rule */}
    <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Add New Rule</h3>
      <form onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.target)
        const matchType = fd.get('match_type'), matchValue = fd.get('match_value'), category = fd.get('category'), priority = parseInt(fd.get('priority')) || 0
        if (!matchValue || !category) return
        const rules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
        rules.push({ match_type: matchType, match_value: matchValue, category, priority, created_at: new Date().toISOString().slice(0, 10) })
        localStorage.setItem('spendscope_bulk_rules', JSON.stringify(rules))
        e.target.reset()
        setRulesVersion(v => v + 1) // force re-render
      }} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Match Type</label>
          <select name="match_type" defaultValue="contains" style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
            <option value="contains">Contains</option>
            <option value="starts_with">Starts With</option>
            <option value="exact">Exact Match</option>
            <option value="regex">Regex</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Match Value</label>
          <input name="match_value" type="text" placeholder="e.g., starbucks" required style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Category</label>
          <select name="category" defaultValue="Other" style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
            {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div style={{ width: '80px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Priority</label>
          <input name="priority" type="number" defaultValue={0} style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button type="submit" style={{ padding: '8px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30` }}>Add Rule</button>
      </form>
    </div>

    {/* Learned Rules */}
    <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: 0 }}>Learned Rules <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({learnedRules.length})</span></h3>
        {learnedRules.length > 0 && <button onClick={() => { localStorage.setItem('spendscope_learned_rules', '[]'); setRulesVersion(v => v + 1) }} style={{ padding: '5px 14px', borderRadius: '8px', border: `1px solid ${t.red}40`, cursor: 'pointer', background: `${t.red}08`, color: t.red, fontSize: '11px', fontWeight: 600 }}>Clear All Learned</button>}
      </div>
      {learnedRules.length === 0 ? <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>No learned rules yet. Edit a category on the Transactions page to create one.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {learnedRules.map((rule, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}06`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: t.text, flex: 1 }}>{rule.merchant}</span>
              <span style={{ fontSize: '12px', color: t.textMuted, margin: '0 12px' }}>{'\u2192'}</span>
              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: (CAT_COLORS[rule.category] || '#9AABBA') + '18', color: CAT_COLORS[rule.category] || t.textLight }}>{rule.category}</span>
              <span style={{ fontSize: '10px', color: t.textMuted, margin: '0 12px' }}>{rule.learned_at}</span>
              <button onClick={() => {
                const rules = JSON.parse(localStorage.getItem('spendscope_learned_rules') || '[]')
                rules.splice(i, 1)
                localStorage.setItem('spendscope_learned_rules', JSON.stringify(rules))
                setRulesVersion(v => v + 1)
              }} style={{ padding: '3px 10px', borderRadius: '6px', border: `1px solid ${t.red}30`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '11px', fontWeight: 600 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Bulk Rules */}
    <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Bulk Rules <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({bulkRules.length})</span></h3>
      {bulkRules.length === 0 ? <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>No bulk rules yet. Use the form above to create custom matching rules.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', padding: '6px 12px', fontSize: '10px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ flex: 1 }}>Match Type</span><span style={{ flex: 2 }}>Match Value</span><span style={{ flex: 1 }}>Category</span><span style={{ width: '60px', textAlign: 'center' }}>Priority</span><span style={{ width: '60px' }}></span>
          </div>
          {bulkRules.map((rule, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', borderBottom: `1px solid ${t.border}40`, transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}06`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ flex: 1, fontSize: '12px', color: t.textLight, fontStyle: 'italic' }}>{rule.match_type}</span>
              <span style={{ flex: 2, fontSize: '13px', fontWeight: 500, color: t.text }}>{rule.match_value}</span>
              <span style={{ flex: 1 }}><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: (CAT_COLORS[rule.category] || '#9AABBA') + '18', color: CAT_COLORS[rule.category] || t.textLight }}>{rule.category}</span></span>
              <span style={{ width: '60px', textAlign: 'center', fontSize: '12px', color: t.textMuted }}>{rule.priority || 0}</span>
              <button onClick={() => {
                const rules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
                rules.splice(i, 1)
                localStorage.setItem('spendscope_bulk_rules', JSON.stringify(rules))
                setRulesVersion(v => v + 1)
              }} style={{ padding: '3px 10px', borderRadius: '6px', border: `1px solid ${t.red}30`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '11px', fontWeight: 600, width: '60px' }}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Actions */}
    <div style={{ ...lc, padding: '20px 24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Actions</h3>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => {
          setData(prev => prev.map(tx => ({ ...tx, category: categorizeWithRules(tx.merchant || tx.description || '') })))
          setUploadStatus({ type: 'success', message: `Re-categorized ${data.length} transactions using current rules.` })
          setTimeout(() => setUploadStatus(null), 3000)
        }} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30` }}>Apply Rules to All Transactions</button>
        <button onClick={() => {
          const exportData = { learned_rules: learnedRules, bulk_rules: bulkRules, exported_at: new Date().toISOString() }
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `spendscope_rules_${new Date().toISOString().slice(0, 10)}.json`; a.click()
          URL.revokeObjectURL(url)
        }} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '13px', fontWeight: 600 }}>Export Rules</button>
        <button onClick={() => ruleFileInputRef.current?.click()} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '13px', fontWeight: 600 }}>Import Rules</button>
        <input ref={el => ruleFileInputRef.current = el} type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
          const file = e.target.files?.[0]; if (!file) return
          const reader = new FileReader()
          reader.onload = ev => {
            try {
              const imported = JSON.parse(ev.target.result)
              if (imported.learned_rules) localStorage.setItem('spendscope_learned_rules', JSON.stringify(imported.learned_rules))
              if (imported.bulk_rules) localStorage.setItem('spendscope_bulk_rules', JSON.stringify(imported.bulk_rules))
              setUploadStatus({ type: 'success', message: `Imported ${(imported.learned_rules || []).length} learned rules and ${(imported.bulk_rules || []).length} bulk rules.` })
              setTimeout(() => setUploadStatus(null), 3000)
              setRulesVersion(v => v + 1)
            } catch { setUploadStatus({ type: 'error', message: 'Invalid JSON file.' }); setTimeout(() => setUploadStatus(null), 3000) }
          }
          reader.readAsText(file)
          e.target.value = ''
        }} />
      </div>
      {uploadStatus && <div style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '10px', background: uploadStatus.type === 'success' ? `${t.green}08` : `${t.red}08`, border: `1px solid ${uploadStatus.type === 'success' ? t.green : t.red}20` }}><p style={{ margin: 0, fontSize: '13px', color: t.text, fontWeight: 500 }}>{uploadStatus.message}</p></div>}
    </div>
  </>)
}
