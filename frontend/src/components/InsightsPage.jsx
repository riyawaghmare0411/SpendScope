import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { COLORS, fmt } from '../constants'

export const InsightsPage = ({ t, mode, currency, lc, dc, anomalies, streaks, savingsOpportunities, savingsReduction, setSavingsReduction, daySpan, peerCompData, dynamicInsights }) => {
  return (<>
            {anomalies.length > 0 && (
              <div style={{ ...lc, border: `1px solid ${t.red}20`, marginBottom: '24px', background: mode === 'light' ? `linear-gradient(135deg, ${t.card}, rgba(212,98,94,0.03))` : t.card }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}><div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${t.red}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{'\u26A0'}</div><h2 style={{ fontSize: '15px', fontWeight: 600, color: t.red, margin: 0 }}>Unusual Transactions ({anomalies.length})</h2></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{anomalies.slice(0, 5).map((a, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: '12px', background: `${t.red}06`, gap: '12px' }}><div style={{ width: '4px', height: '32px', borderRadius: '2px', background: t.red }} /><div style={{ flex: 1 }}><p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: 0 }}>{a.merchant} {'\u2014'} {a.date_iso}</p><p style={{ fontSize: '11px', color: t.textMuted, margin: '2px 0 0' }}>{a.reason}</p></div><span style={{ fontSize: '15px', fontWeight: 700, color: t.red }}>{currency}{fmt(a.money_out)}</span></div>)}</div>
              </div>
            )}
            {streaks.length > 0 && (
              <div style={{ ...lc, marginBottom: '24px', background: mode === 'light' ? `linear-gradient(135deg, ${t.card}, rgba(201,169,110,0.05))` : t.card }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}><span style={{ fontSize: '20px' }}>{'\uD83D\uDD25'}</span><h2 style={{ fontSize: '15px', fontWeight: 600, color: t.sand, margin: 0 }}>Spending Streaks</h2></div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{streaks.slice(0, 6).map((s, i) => <div key={i} style={{ padding: '10px 16px', borderRadius: '12px', background: `${t.sand}10`, border: `1px solid ${t.sand}20`, fontSize: '12px' }}><span style={{ fontWeight: 700, color: t.sand }}>{s.current}-month streak</span><span style={{ color: t.textLight }}> {s.cat} under {currency}{fmt(s.threshold, 0)}</span>{s.hasBudget && <span style={{ fontSize: '10px', color: t.textMuted }}> (budget)</span>}</div>)}</div>
                {streaks.some(s => s.improvement > 10) && <p style={{ fontSize: '12px', color: t.green, margin: '10px 0 0', fontWeight: 500 }}>Most improved: {streaks.sort((a, b) => b.improvement - a.improvement)[0].cat} ({'\u2193'}{streaks.sort((a, b) => b.improvement - a.improvement)[0].improvement.toFixed(0)}% this month)</p>}
              </div>
            )}
            {/* Savings (FIX 4: monthly/weekly) */}
            <div style={{ ...lc, marginBottom: '24px', background: mode === 'light' ? `linear-gradient(135deg, ${t.card}, rgba(168,230,207,0.08))` : t.card }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${t.green}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>{'\uD83D\uDCB0'}</div><h2 style={{ fontSize: '15px', fontWeight: 600, color: t.green, margin: 0 }}>Savings Opportunities</h2></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '12px', color: t.textMuted }}>Cut by</span><select value={savingsReduction} onChange={e => setSavingsReduction(Number(e.target.value))} style={{ padding: '4px 8px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.card, color: t.text, fontSize: '12px', fontWeight: 600, cursor: 'pointer', outline: 'none' }}>{[10,15,20,25,30,50].map(p => <option key={p} value={p}>{p}%</option>)}</select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                {savingsOpportunities.map((s, i) => (
                  <div key={i} style={{ padding: '18px', borderRadius: '16px', background: `${t.green}06`, border: `1px solid ${t.green}12`, textAlign: 'center', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                    <p style={{ fontSize: '24px', fontWeight: 700, color: t.green, margin: '0 0 4px' }}>{currency}{fmt(s.monthlySave, 0)}</p>
                    <p style={{ fontSize: '11px', color: t.textMuted, margin: '0 0 2px' }}>per month</p>
                    <p style={{ fontSize: '10px', color: t.textMuted, margin: '0 0 8px' }}>({currency}{fmt(s.weeklySave, 0)}/week)</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: t.text, margin: '0 0 4px' }}>{s.area}</p>
                    <p style={{ fontSize: '11px', color: t.textLight, margin: 0 }}>{s.tip}</p>
                    <p style={{ fontSize: '10px', color: t.textMuted, margin: '6px 0 0', fontStyle: 'italic' }}>Based on {daySpan} day{daySpan !== 1 ? 's' : ''} of data</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Peer Comparison */}
            <div style={{ ...lc, marginBottom: '24px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 16px' }}>How You Compare</h2>
              <ResponsiveContainer width="100%" height={Math.max(200, peerCompData.length * 40)}>
                <BarChart data={peerCompData} layout="vertical" barGap={2} barSize={10}><XAxis type="number" stroke={t.textMuted} fontSize={10} tickLine={false} axisLine={false} unit="%" /><YAxis type="category" dataKey="name" stroke={t.textMuted} fontSize={11} tickLine={false} axisLine={false} width={80} />
                  <Tooltip content={({ active, payload }) => active && payload && payload.length ? <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', border: '1px solid rgba(0,0,0,0.06)' }}><p style={{ margin: 0, fontSize: '12px', color: '#2C3E4A', fontWeight: 600 }}>{payload[0]?.payload?.name}</p>{payload.map((p, i) => <p key={i} style={{ margin: '2px 0 0', fontSize: '11px', color: p.color }}>{p.name}: {p.value}%</p>)}</div> : null} />
                  <Bar dataKey="you" fill={t.teal} radius={[0,4,4,0]} name="You" /><Bar dataKey="average" fill={t.sand} radius={[0,4,4,0]} name="Average" /><Legend wrapperStyle={{ fontSize: '11px' }} />
                </BarChart>
              </ResponsiveContainer>
              <p style={{ fontSize: '10px', color: t.textMuted, textAlign: 'center', margin: '8px 0 0' }}>Average benchmarks based on typical household spending patterns</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>{dynamicInsights.map((ins, i) => <div key={i} style={{ ...(ins.dark ? dc : lc), padding: '24px 28px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i % COLORS.length], boxShadow: `0 2px 8px ${COLORS[i % COLORS.length]}50` }} /><h3 style={{ fontSize: '15px', fontWeight: 600, color: ins.dark ? t.cardAltText : t.text, margin: 0 }}>{ins.title}</h3></div><p style={{ fontSize: '14px', lineHeight: '1.75', color: ins.dark ? '#8FA3B0' : t.textLight, margin: 0 }}>{ins.text}</p></div>)}</div>
  </>)
}
