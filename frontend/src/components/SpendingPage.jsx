import { HealthRing, VelocityGauge } from './ui'
import { COLORS, CAT_COLORS, fmt } from '../constants'

export const SpendingPage = ({ t, currency, lc, catData, out, monthCount, catByMonth, lastMonth, prevMonth, budgets, setBudgets, editingBudget, setEditingBudget, budgetInputVal, setBudgetInputVal, healthScore, lowDataHealth, currMonthSpend, prevMonthSpend }) => {
  return (<>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
              <div style={{ ...lc, display: 'flex', alignItems: 'center', gap: '32px', padding: '28px 32px' }}>
                <HealthRing score={healthScore} t={t} />
                <div><h3 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>Financial Health Score</h3><p style={{ fontSize: '13px', color: t.textLight, lineHeight: '1.6', margin: 0 }}>Based on savings rate, spending consistency, subscriptions, anomalies, and trends. {healthScore >= 70 ? 'You are managing your money well.' : healthScore >= 40 ? 'Some areas could use improvement.' : 'Consider reviewing your spending habits.'}{lowDataHealth ? ' Select a longer date range for a more accurate score.' : ''}</p></div>
              </div>
              <div style={lc}><h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 20px' }}>Spending Velocity</h3><VelocityGauge current={currMonthSpend} previous={prevMonthSpend} t={t} /></div>
            </div>
            {Object.keys(budgets).length > 0 && <div style={{ ...lc, marginBottom: '20px', padding: '16px 24px' }}><h3 style={{ fontSize: '14px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>Budget Goals</h3><p style={{ fontSize: '12px', color: t.textLight, margin: 0 }}>{catData.filter(c => budgets[c.name] && (c.value / monthCount) <= budgets[c.name]).length} of {catData.filter(c => budgets[c.name]).length} budgeted categories on track this month</p></div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              {catData.map((c, i) => {
                const thisM = lastMonth && catByMonth[c.name] ? (catByMonth[c.name][lastMonth] || 0) : 0, prevM = prevMonth && catByMonth[c.name] ? (catByMonth[c.name][prevMonth] || 0) : 0
                const mChange = prevM > 0 ? ((thisM - prevM) / prevM) * 100 : 0, budget = budgets[c.name], monthlySpent = c.value / monthCount
                const budgetPct = budget ? (monthlySpent / budget) * 100 : 0, budgetColor = budgetPct > 100 ? t.red : budgetPct > 80 ? t.sand : t.green
                return (
                  <div key={i} style={{ ...lc, padding: '20px 24px', transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${CAT_COLORS[c.name] || COLORS[i % COLORS.length]}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: '14px', height: '14px', borderRadius: '50%', background: CAT_COLORS[c.name] || COLORS[i % COLORS.length], boxShadow: `0 2px 8px ${CAT_COLORS[c.name] || COLORS[i % COLORS.length]}40` }} /></div>
                        <div><p style={{ color: t.text, fontSize: '14px', fontWeight: 600, margin: 0 }}>{c.name}</p><p style={{ color: t.textMuted, fontSize: '12px', margin: '2px 0 0' }}>{(() => { const n = out.filter(x => x.category === c.name).length; return `${n} transaction${n !== 1 ? 's' : ''}` })()}</p></div>
                      </div>
                      <div style={{ textAlign: 'right' }}><p style={{ color: t.red, fontSize: '18px', fontWeight: 700, margin: 0 }}>{currency}{fmt(c.value)}</p>{prevM > 0 && lastMonth && <p style={{ fontSize: '11px', fontWeight: 600, margin: '2px 0 0', color: mChange <= 0 ? t.green : t.red }}>{mChange <= 0 ? '\u2193' : '\u2191'} {Math.abs(mChange).toFixed(0)}% vs last month</p>}</div>
                    </div>
                    {editingBudget === c.name ? (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                        <input type="number" placeholder="Monthly budget" value={budgetInputVal} onChange={e => setBudgetInputVal(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter') { setBudgets(prev => ({ ...prev, [c.name]: Number(budgetInputVal) })); setEditingBudget(null) } }} />
                        <button onClick={() => { if (budgetInputVal) setBudgets(prev => ({ ...prev, [c.name]: Number(budgetInputVal) })); setEditingBudget(null) }} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: t.tealDark, color: 'white', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                        <button onClick={() => setEditingBudget(null)} style={{ padding: '6px 8px', borderRadius: '8px', border: `1px solid ${t.border}`, background: 'transparent', color: t.textMuted, fontSize: '11px', cursor: 'pointer' }}>X</button>
                      </div>
                    ) : (
                      <div style={{ marginTop: '10px' }}>
                        {budget ? (<><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: t.textMuted, marginBottom: '4px' }}><span>{currency}{fmt(monthlySpent, 0)}/mo</span><span style={{ color: budgetColor }}>{budgetPct.toFixed(0)}% of {currency}{fmt(budget, 0)}</span></div><div style={{ height: '4px', borderRadius: '2px', background: `${t.border}` }}><div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(budgetPct, 100)}%`, background: budgetColor, transition: 'width 0.8s ease' }} /></div></>) : (
                          <button onClick={() => { setEditingBudget(c.name); setBudgetInputVal('') }} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px dashed ${t.textMuted}40`, background: 'transparent', color: t.textMuted, fontSize: '10px', cursor: 'pointer', marginTop: '2px' }}>+ Set Budget</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
  </>)
}
