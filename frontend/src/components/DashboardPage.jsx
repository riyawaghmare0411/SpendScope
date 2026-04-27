import { ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { Counter, Sphere, Tip, PieTip } from './ui'
import { COLORS, CAT_COLORS, fmt, fmtShort } from '../constants'
import AccountCardsRow from './AccountCardsRow'
import RemainingMonthWidget from './RemainingMonthWidget'
import AlertBanner from './AlertBanner'
import useAlerts from '../hooks/useAlerts'

export const DashboardPage = ({ t, mode, currency, dc, lc, userName, monthlyAvg, catData, lifeSpend, monthCount, net, totalIn, totalOut, filteredData, weekDiff, weekLabel, thisWeekSpend, weekPct, dData, chartRange, setChartRange, mData, topM, recentTxns, handleExportPDF, cashFlowChart, forecastMonths, accounts, activeAccount, setActiveAccount, onAddCard, onEditAccount }) => {
  const alerts = useAlerts(accounts, filteredData)
  return (<>
            <AlertBanner t={t} alerts={alerts} />
            <AccountCardsRow t={t} currency={currency} accounts={accounts} activeAccount={activeAccount} setActiveAccount={setActiveAccount} onAddCard={onAddCard} onEditAccount={onEditAccount} />
            <RemainingMonthWidget t={t} currency={currency} filteredData={filteredData} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
              <button onClick={handleExportPDF} style={{ padding: '8px 20px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}15`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Export PDF Report</button>
            </div>
            <div style={{ ...dc, padding: '32px 36px', marginBottom: '28px', background: `linear-gradient(135deg, ${t.cardAlt}, ${t.tealDeep}90)` }}>
              <Sphere size="120px" color={t.teal} top="-30px" right="30px" opacity={0.35} /><Sphere size="60px" color={t.sand} bottom="-15px" right="180px" opacity={0.25} /><Sphere size="40px" color={t.mint} top="10px" right="160px" opacity={0.2} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <h1 style={{ fontSize: '26px', fontWeight: 700, color: t.cardAltText, margin: '0 0 12px' }}>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, {userName || 'Happy'}</h1>
                <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                  <div><p style={{ color: '#8FA3B0', fontSize: '11px', margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Monthly Average</p><p style={{ color: t.teal, fontSize: '22px', fontWeight: 700, margin: 0 }}>{currency}{fmtShort(monthlyAvg)}</p></div>
                  <div><p style={{ color: '#8FA3B0', fontSize: '11px', margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Top Category</p><p style={{ color: t.sand, fontSize: '22px', fontWeight: 700, margin: 0 }}>{catData.length > 0 ? catData[0].name : 'N/A'}</p></div>
                  <div><p style={{ color: '#8FA3B0', fontSize: '11px', margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Monthly Lifestyle</p><p style={{ color: t.mint, fontSize: '22px', fontWeight: 700, margin: 0 }}>{currency}{fmtShort(lifeSpend / monthCount)}</p></div>
                  <div><p style={{ color: '#8FA3B0', fontSize: '11px', margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Status</p><p style={{ color: net >= 0 ? t.green : t.red, fontSize: '22px', fontWeight: 700, margin: 0 }}>{net >= 0 ? 'On Track' : 'Over Budget'}</p></div>
                </div>
              </div>
            </div>
            <div style={{ ...lc, padding: '20px 24px', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Recent Activity</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {recentTxns.map((x, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: '10px', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}08`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: CAT_COLORS[x.category] || t.teal, marginRight: '12px', boxShadow: `0 0 6px ${CAT_COLORS[x.category] || t.teal}40`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.merchant}</p></div>
                    <span style={{ fontSize: '11px', color: t.textMuted, margin: '0 16px', flexShrink: 0 }}>{new Date(x.date_iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: x.direction === 'IN' ? t.green : t.red, flexShrink: 0 }}>{x.direction === 'IN' ? '+' : '-'}{currency}{fmt(x.direction === 'IN' ? x.money_in : x.money_out)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '28px' }}>
              {[{ label: 'TOTAL INCOME', val: totalIn, pre: currency, color: t.green, dark: false },{ label: 'TOTAL SPENDING', val: totalOut, pre: currency, color: t.red, dark: false },{ label: 'NET BALANCE', val: Math.abs(net), pre: net >= 0 ? '+' + currency : '-' + currency, color: net >= 0 ? t.green : t.red, dark: true },{ label: 'TRANSACTIONS', val: filteredData.length, pre: '', color: t.teal, dark: true, dec: 0, noAbbrev: true }].map((c, i) => (
                <div key={i} style={{ ...(c.dark ? dc : lc), transition: 'transform 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                  <Sphere size="65px" color={c.color} top="-12px" right="-12px" opacity={0.2} />
                  <p style={{ color: c.dark ? '#8FA3B0' : t.textLight, fontSize: '11px', margin: '0 0 10px', fontWeight: 600, letterSpacing: '1px' }}>{c.label}</p>
                  <Counter end={c.val} prefix={c.pre} color={c.dark ? t.cardAltText : c.color} decimals={c.dec !== undefined ? c.dec : 2} abbreviate={!c.noAbbrev} />
                </div>
              ))}
              <div style={{ ...lc, transition: 'transform 0.2s', cursor: 'default', background: mode === 'light' ? `linear-gradient(145deg, ${t.card}, ${weekDiff <= 0 ? 'rgba(42,157,143,0.05)' : 'rgba(212,98,94,0.05)'})` : t.card }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <Sphere size="65px" color={weekDiff <= 0 ? t.green : t.red} top="-12px" right="-12px" opacity={0.2} />
                <p style={{ color: t.textLight, fontSize: '11px', margin: '0 0 2px', fontWeight: 600, letterSpacing: '1px' }}>LATEST WEEK</p>
                <p style={{ color: t.textMuted, fontSize: '10px', margin: '0 0 8px' }}>{weekLabel}</p>
                <span style={{ color: t.text, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px' }}>{currency}{fmtShort(thisWeekSpend)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                  <span style={{ fontSize: '16px', color: weekDiff <= 0 ? t.green : t.red }}>{weekDiff <= 0 ? '\u2193' : '\u2191'}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: weekDiff <= 0 ? t.green : t.red }}>{Math.abs(weekPct).toFixed(0)}%</span>
                  <span style={{ fontSize: '11px', color: t.textMuted }}>vs prev week</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={dc}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.cardAltText, margin: 0 }}>Daily Spending Trend</h2>
                  <div style={{ display: 'flex', gap: '4px' }}>{['1D','1W','1M','3M','6M','1Y','All'].map(range => <button key={range} onClick={() => setChartRange(range)} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600, background: chartRange === range ? t.tealDark : 'rgba(255,255,255,0.06)', color: chartRange === range ? 'white' : '#8FA3B0', transition: 'all 0.2s' }}>{range}</button>)}</div>
                </div>
                <ResponsiveContainer width="100%" height={260}><AreaChart data={dData}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.teal} stopOpacity={0.4} /><stop offset="100%" stopColor={t.teal} stopOpacity={0.02} /></linearGradient></defs><XAxis dataKey="date" stroke="#5A6C7A" fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke="#5A6C7A" fontSize={10} tickLine={false} axisLine={false} /><Tooltip content={<Tip currency={currency} />} /><Area type="monotone" dataKey="total" stroke={t.mint} strokeWidth={2.5} fill="url(#g1)" /></AreaChart></ResponsiveContainer>
              </div>
              <div style={lc}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 16px' }}>Spending Breakdown</h2>
                <ResponsiveContainer width="100%" height={200}><PieChart><Pie data={catData.slice(0, 8)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={3} strokeWidth={0}>{catData.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<PieTip currency={currency} total={totalOut} />} /></PieChart></ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px', justifyContent: 'center' }}>{catData.slice(0, 6).map((c, i) => { const pct = totalOut > 0 ? ((c.value / totalOut) * 100).toFixed(1) : '0'; return <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: t.textLight }}><div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i], boxShadow: `0 2px 6px ${COLORS[i]}40` }} />{c.name} ({pct}%)</div> })}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ ...lc, background: mode === 'light' ? `linear-gradient(145deg, ${t.card}, ${t.sandLight}30)` : t.card }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 20px' }}>Income vs Spending</h2>
                <ResponsiveContainer width="100%" height={260}><BarChart data={mData} barGap={6}><XAxis dataKey="month" stroke={t.textMuted} fontSize={11} tickLine={false} axisLine={false} /><YAxis stroke={t.textMuted} fontSize={10} tickLine={false} axisLine={false} /><Tooltip content={<Tip currency={currency} />} /><Bar dataKey="income" fill={t.teal} radius={[8,8,0,0]} barSize={30} name="Income" /><Bar dataKey="spending" fill={t.sand} radius={[8,8,0,0]} barSize={30} name="Spending" /></BarChart></ResponsiveContainer>
                <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '10px' }}>{[{ l: 'Income', c: t.teal }, { l: 'Spending', c: t.sand }].map((x, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.textLight }}><div style={{ width: '10px', height: '10px', borderRadius: '3px', background: x.c }} />{x.l}</div>)}</div>
              </div>
              <div style={{ ...dc, background: mode === 'light' ? `linear-gradient(145deg, ${t.cardAlt}, ${t.tealDeep}90)` : t.cardAlt }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.cardAltText, margin: '0 0 20px' }}>Top Merchants</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{topM.map((m, i) => <div key={i}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: t.cardAltText, fontWeight: 500 }}>{m.name}</span><span style={{ fontSize: '13px', color: t.sand, fontWeight: 700 }}>{currency}{fmt(m.value)}</span></div><div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}><div style={{ height: '100%', borderRadius: '3px', width: `${(m.value / topM[0].value) * 100}%`, background: `linear-gradient(90deg, ${t.tealDark}, ${t.mint})`, boxShadow: `0 0 8px ${t.teal}30`, transition: 'width 0.8s ease' }} /></div></div>)}</div>
              </div>
            </div>
            <div style={{ ...lc, marginTop: '24px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 16px' }}>Cash Flow Forecast</h2>
              <ResponsiveContainer width="100%" height={260}><AreaChart data={cashFlowChart}><defs><linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.teal} stopOpacity={0.3} /><stop offset="100%" stopColor={t.teal} stopOpacity={0.02} /></linearGradient><linearGradient id="gSpd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={t.sand} stopOpacity={0.3} /><stop offset="100%" stopColor={t.sand} stopOpacity={0.02} /></linearGradient></defs><XAxis dataKey="month" stroke={t.textMuted} fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke={t.textMuted} fontSize={10} tickLine={false} axisLine={false} /><Tooltip content={<Tip currency={currency} />} /><Area type="monotone" dataKey="income" stroke={t.teal} strokeWidth={2} fill="url(#gInc)" name="Income" /><Area type="monotone" dataKey="spending" stroke={t.sand} strokeWidth={2} fill="url(#gSpd)" name="Spending" /></AreaChart></ResponsiveContainer>
              <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '8px' }}>{[{ l: 'Income', c: t.teal }, { l: 'Spending', c: t.sand }, { l: 'Forecast', c: t.textMuted }].map((x, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: t.textLight }}><div style={{ width: '10px', height: '10px', borderRadius: '3px', background: x.c, border: i === 2 ? '1px dashed' : 'none' }} />{x.l}</div>)}</div>
              <p style={{ fontSize: '10px', color: t.textMuted, textAlign: 'center', margin: '8px 0 0' }}>Last {forecastMonths.length} months are projected based on your spending patterns</p>
            </div>
  </>)
}
