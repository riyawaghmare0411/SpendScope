import { CAT_COLORS, fmt } from '../constants'

export const TransactionsPage = ({ t, currency, lc, filteredData, data, searchTerm, setSearchTerm, filterCat, setFilterCat, catTotals, editingTxnCat, setEditingTxnCat, flashedTxnIdx, setFlashedTxnIdx, setData, ALL_CATEGORIES }) => {
  return (<>
            <div style={{ marginBottom: '16px' }}><div style={{ position: 'relative', maxWidth: '400px' }}><span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: t.textMuted, fontSize: '16px' }}>{'\u2315'}</span><input type="text" placeholder="Search merchants, categories..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: '14px', border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: '13px', outline: 'none', boxShadow: t.cardShadow }} onFocus={e => e.target.style.borderColor = t.teal} onBlur={e => e.target.style.borderColor = t.border} /></div></div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>{['All', ...Object.keys(catTotals).sort()].map(cat => <button key={cat} onClick={() => setFilterCat(cat)} style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500, transition: 'all 0.2s', background: filterCat === cat ? t.tealDark : `${t.teal}10`, color: filterCat === cat ? 'white' : t.textLight, boxShadow: filterCat === cat ? `0 2px 8px ${t.tealDark}30` : 'none' }}>{cat}</button>)}</div>
            <div style={lc}>{(() => {
              const filtered = [...filteredData].reverse().filter(x => { if (searchTerm) { const term = searchTerm.toLowerCase(); if (!x.merchant.toLowerCase().includes(term) && !x.category.toLowerCase().includes(term)) return false } if (filterCat !== 'All' && x.category !== filterCat) return false; return true })
              const grouped = {}; filtered.forEach(x => { if (!grouped[x.date_iso]) grouped[x.date_iso] = []; grouped[x.date_iso].push(x) }); const dateKeys = Object.keys(grouped)
              const filterSummary = filterCat !== 'All' ? (() => { const total = filtered.reduce((s, x) => s + (x.direction === 'OUT' ? x.money_out : x.money_in), 0); return { count: filtered.length, total, avg: filtered.length > 0 ? total / filtered.length : 0 } })() : null
              return (<>{filterSummary && <div style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '12px', background: `${t.teal}08`, border: `1px solid ${t.teal}15` }}><p style={{ margin: 0, fontSize: '13px', color: t.text, fontWeight: 500 }}>{filterSummary.count} {filterCat} transaction{filterSummary.count !== 1 ? 's' : ''} totaling {currency}{fmt(filterSummary.total)} (avg {currency}{fmt(filterSummary.avg)}/txn)</p></div>}
                {dateKeys.length === 0 ? <p style={{ textAlign: 'center', color: t.textMuted, padding: '40px 0' }}>No transactions match your search.</p> : dateKeys.map(date => (
                  <div key={date} style={{ marginBottom: '20px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: t.textMuted, margin: '0 0 8px', letterSpacing: '0.5px', textTransform: 'uppercase', paddingLeft: '4px' }}>{new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    {grouped[date].map((x, i) => {
                      const dataIdx = data.indexOf(x)
                      const isFlashed = flashedTxnIdx === dataIdx
                      const isEditingThis = editingTxnCat && editingTxnCat.index === dataIdx
                      return <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', marginBottom: '4px', transition: 'background 0.4s', cursor: 'default', background: isFlashed ? 'rgba(42,157,143,0.15)' : 'transparent' }} onMouseEnter={e => { if (!isFlashed) e.currentTarget.style.background = `${t.teal}08` }} onMouseLeave={e => { if (!isFlashed) e.currentTarget.style.background = 'transparent' }}>
                        <div style={{ width: '4px', height: '32px', borderRadius: '2px', background: CAT_COLORS[x.category] || t.teal, marginRight: '14px', boxShadow: `0 0 6px ${CAT_COLORS[x.category] || t.teal}40` }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: 0 }}>{x.merchant}</p>
                          {isEditingThis ? (
                            <select autoFocus value={x.category} onChange={e => {
                              const newCat = e.target.value
                              setData(prev => prev.map((tx, ti) => ti === dataIdx ? { ...tx, category: newCat } : tx))
                              // Save learned rule
                              const merchant = (x.merchant || x.description || '').trim()
                              if (merchant) {
                                const rules = JSON.parse(localStorage.getItem('spendscope_learned_rules') || '[]')
                                const existing = rules.findIndex(r => r.merchant.toLowerCase() === merchant.toLowerCase())
                                const entry = { merchant, category: newCat, learned_at: new Date().toISOString().slice(0, 10) }
                                if (existing >= 0) rules[existing] = entry; else rules.push(entry)
                                localStorage.setItem('spendscope_learned_rules', JSON.stringify(rules))
                              }
                              setEditingTxnCat(null)
                              setFlashedTxnIdx(dataIdx)
                              setTimeout(() => setFlashedTxnIdx(null), 800)
                            }} onBlur={() => setEditingTxnCat(null)} style={{ padding: '2px 6px', borderRadius: '6px', border: `1px solid ${t.teal}`, background: t.bg, color: t.text, fontSize: '11px', outline: 'none', cursor: 'pointer', marginTop: '2px' }}>
                              {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          ) : (
                            <span onClick={() => setEditingTxnCat({ index: dataIdx, currentCat: x.category })} style={{ cursor: 'pointer', display: 'inline-block', padding: '1px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, marginTop: '2px', background: (CAT_COLORS[x.category] || '#9AABBA') + '18', color: CAT_COLORS[x.category] || t.textLight, transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.7'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>{x.category}</span>
                          )}
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: x.direction === 'IN' ? t.green : t.red }}>{x.direction === 'IN' ? '+' : '-'}{currency}{fmt(x.direction === 'IN' ? x.money_in : x.money_out)}</span>
                      </div>
                    })}
                  </div>
                ))}</>)
            })()}</div>
  </>)
}
