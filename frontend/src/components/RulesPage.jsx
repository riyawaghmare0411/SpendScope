import { useRef, useState, useMemo } from 'react'

// Phase 14E: clearer, friendlier Rules page.
// Adds: how-it-works explainer, inline match-type help, rule preview (match count),
// sensible empty states, confirm dialog on destructive Apply action,
// rename "Bulk Rules" -> "Custom Rules (you set)" / "Learned Rules" -> "Smart matches (from your edits)"

const MATCH_TYPE_HELP = {
  contains: { label: 'Contains', help: 'Matches if the merchant text includes your value (case-insensitive). Most common.', example: 'tesco -> matches "TESCO STORES 1234"' },
  starts_with: { label: 'Starts with', help: 'Matches if the merchant text begins with your value.', example: 'amzn -> matches "AMZN MKTP*5L9..."' },
  exact: { label: 'Exact', help: 'Merchant text must equal your value exactly.', example: 'Spotify -> matches only "Spotify", not "Spotify Premium"' },
  regex: { label: 'Regex (advanced)', help: 'Pattern matching for power users. Skip unless you know regex.', example: '^uber.*eats$ -> Uber Eats only' },
}

export default function RulesPage({ t, currency, rulesVersion, setRulesVersion, data, setData, setUploadStatus, uploadStatus, categorizeWithRules, ALL_CATEGORIES, CAT_COLORS, lc }) {
  void rulesVersion // referenced to trigger re-render on rule changes
  const learnedRules = JSON.parse(localStorage.getItem('spendscope_learned_rules') || '[]')
  const bulkRules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
  const ruleFileInputRef = useRef(null)
  const [showHelp, setShowHelp] = useState(false)
  const [previewType, setPreviewType] = useState('contains')
  const [previewValue, setPreviewValue] = useState('')

  // Live preview: count how many existing transactions a typed match value would match
  const previewMatchCount = useMemo(() => {
    if (!previewValue.trim() || !data) return null
    const v = previewValue.trim().toLowerCase()
    return data.filter(tx => {
      const m = (tx.merchant || tx.description || '').toLowerCase()
      if (previewType === 'contains') return m.includes(v)
      if (previewType === 'starts_with') return m.startsWith(v)
      if (previewType === 'exact') return m === v
      if (previewType === 'regex') {
        try { return new RegExp(previewValue, 'i').test(m) } catch { return false }
      }
      return false
    }).length
  }, [previewValue, previewType, data])

  return (<>
    <p style={{ fontSize: '13px', color: t.textLight, margin: '-20px 0 12px' }}>
      Tell SpendScope how to categorize transactions automatically. Two kinds of rules: ones you define explicitly, and ones the app learns from your edits on the Transactions page.
    </p>

    {/* How-it-works explainer (collapsible) */}
    <div style={{ ...lc, marginBottom: '20px', padding: '14px 20px', borderLeft: `3px solid ${t.teal}` }}>
      <button onClick={() => setShowHelp(s => !s)} style={{
        background: 'transparent', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
        color: t.teal, fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        {showHelp ? '\u25BC' : '\u25B6'} How categorization works (read me)
      </button>
      {showHelp && (
        <div style={{ marginTop: '12px', fontSize: '13px', color: t.textLight, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 8px' }}>When a new transaction comes in, SpendScope tries to categorize it in this order:</p>
          <ol style={{ margin: '0 0 8px', paddingLeft: '20px' }}>
            <li><strong style={{ color: t.text }}>Custom rules (you set)</strong> -- highest priority. Match a string, get a category.</li>
            <li><strong style={{ color: t.text }}>Smart matches</strong> -- the app remembers categories you set on the Transactions page and applies them to similar merchants.</li>
            <li><strong style={{ color: t.text }}>Built-in starter pack</strong> -- ~80 common merchants like Tesco, Walmart, Spotify, Netflix.</li>
            <li><strong style={{ color: t.text }}>"Other"</strong> -- if nothing else matches.</li>
          </ol>
          <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>
            All matching runs locally on your device + your private database. No transaction data leaves SpendScope.
          </p>
        </div>
      )}
    </div>

    {/* Add New Custom Rule */}
    <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 6px' }}>Add a custom rule</h3>
      <p style={{ fontSize: '12px', color: t.textMuted, margin: '0 0 14px' }}>
        Example: rule "contains <em>tesco</em> -> Groceries" categorizes every Tesco transaction as Groceries automatically.
      </p>
      <form onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.target)
        const matchType = fd.get('match_type'), matchValue = fd.get('match_value'), category = fd.get('category'), priority = parseInt(fd.get('priority')) || 0
        if (!matchValue || !category) return
        const rules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
        rules.push({ match_type: matchType, match_value: matchValue, category, priority, created_at: new Date().toISOString().slice(0, 10) })
        localStorage.setItem('spendscope_bulk_rules', JSON.stringify(rules))
        e.target.reset()
        setPreviewValue(''); setPreviewType('contains')
        setRulesVersion(v => v + 1)
      }} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Match type</label>
          <select name="match_type" value={previewType} onChange={e => setPreviewType(e.target.value)} style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
            {Object.entries(MATCH_TYPE_HELP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Value to match</label>
          <input name="match_value" type="text" placeholder="e.g., starbucks" value={previewValue} onChange={e => setPreviewValue(e.target.value)} required style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Category</label>
          <select name="category" defaultValue="Other" style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
            {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div style={{ width: '70px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }} title="Higher priority rules win when multiple match">Priority</label>
          <input name="priority" type="number" defaultValue={0} title="Higher = wins over lower priority rules" style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <button type="submit" style={{ padding: '8px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30` }}>Add rule</button>
      </form>
      {/* Inline match-type help */}
      <p style={{ fontSize: '11px', color: t.textMuted, margin: '10px 0 0', lineHeight: 1.4 }}>
        <strong style={{ color: t.text }}>{MATCH_TYPE_HELP[previewType].label}:</strong> {MATCH_TYPE_HELP[previewType].help} <em style={{ color: t.teal }}>{MATCH_TYPE_HELP[previewType].example}</em>
      </p>
      {/* Rule preview */}
      {previewMatchCount !== null && (
        <p style={{ fontSize: '12px', color: previewMatchCount > 0 ? t.green : t.textMuted, margin: '6px 0 0', fontWeight: 500 }}>
          {previewMatchCount > 0
            ? `${'\u2713'} This rule would match ${previewMatchCount} existing transaction${previewMatchCount === 1 ? '' : 's'}`
            : `${'\u2300'} No existing transactions match yet (rule will apply to future imports)`}
        </p>
      )}
    </div>

    {/* Custom rules table */}
    <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Custom rules <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({bulkRules.length})</span></h3>
      {bulkRules.length === 0 ? (
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>No custom rules yet. Use the form above to create your first one.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', padding: '6px 12px', fontSize: '10px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ flex: 1 }}>Match type</span><span style={{ flex: 2 }}>Match value</span><span style={{ flex: 1 }}>Category</span><span style={{ width: '60px', textAlign: 'center' }}>Priority</span><span style={{ width: '60px' }}></span>
          </div>
          {bulkRules.map((rule, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', borderBottom: `1px solid ${t.border}40`, transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}06`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ flex: 1, fontSize: '12px', color: t.textLight, fontStyle: 'italic' }}>{MATCH_TYPE_HELP[rule.match_type]?.label || rule.match_type}</span>
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

    {/* Smart matches (formerly "Learned Rules") */}
    <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: 0 }}>Smart matches (from your edits) <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({learnedRules.length})</span></h3>
        {learnedRules.length > 0 && <button onClick={() => {
          if (confirm('Clear all learned smart matches? This will not affect transactions, just the auto-categorization memory.')) {
            localStorage.setItem('spendscope_learned_rules', '[]'); setRulesVersion(v => v + 1)
          }
        }} style={{ padding: '5px 14px', borderRadius: '8px', border: `1px solid ${t.red}40`, cursor: 'pointer', background: `${t.red}08`, color: t.red, fontSize: '11px', fontWeight: 600 }}>Clear all</button>}
      </div>
      <p style={{ fontSize: '12px', color: t.textMuted, margin: '0 0 12px' }}>
        Every time you re-categorize a transaction on the Transactions page, the app remembers it here. Future imports of similar merchants will auto-categorize correctly.
      </p>
      {learnedRules.length === 0 ? (
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0, padding: '12px 0', fontStyle: 'italic' }}>
          No smart matches yet. Click any transaction on the Transactions page and change its category -- it'll appear here.
        </p>
      ) : (
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
              }} style={{ padding: '3px 10px', borderRadius: '6px', border: `1px solid ${t.red}30`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '11px', fontWeight: 600 }}>Forget</button>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Actions */}
    <div style={{ ...lc, padding: '20px 24px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 6px' }}>Bulk actions</h3>
      <p style={{ fontSize: '12px', color: t.textMuted, margin: '0 0 14px' }}>
        Re-run rules across your existing transactions, or back up / restore your rules.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => {
          if (!confirm(`Re-categorize all ${data.length} transactions using the current rules? This will overwrite existing categories you've manually set.`)) return
          setData(prev => prev.map(tx => ({ ...tx, category: categorizeWithRules(tx.merchant || tx.description || '') })))
          setUploadStatus({ type: 'success', message: `Re-categorized ${data.length} transactions using current rules.` })
          setTimeout(() => setUploadStatus(null), 3000)
        }} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30` }} title="Overwrites manual categorizations -- confirm before running">Apply rules to all transactions</button>
        <button onClick={() => {
          const exportData = { learned_rules: learnedRules, bulk_rules: bulkRules, exported_at: new Date().toISOString() }
          const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = `spendscope_rules_${new Date().toISOString().slice(0, 10)}.json`; a.click()
          URL.revokeObjectURL(url)
        }} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '13px', fontWeight: 600 }}>Export rules (JSON)</button>
        <button onClick={() => ruleFileInputRef.current?.click()} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '13px', fontWeight: 600 }}>Import rules</button>
        <input ref={el => ruleFileInputRef.current = el} type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
          const file = e.target.files?.[0]; if (!file) return
          const reader = new FileReader()
          reader.onload = ev => {
            try {
              const imported = JSON.parse(ev.target.result)
              if (imported.learned_rules) localStorage.setItem('spendscope_learned_rules', JSON.stringify(imported.learned_rules))
              if (imported.bulk_rules) localStorage.setItem('spendscope_bulk_rules', JSON.stringify(imported.bulk_rules))
              setUploadStatus({ type: 'success', message: `Imported ${(imported.learned_rules || []).length} smart matches and ${(imported.bulk_rules || []).length} custom rules.` })
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
