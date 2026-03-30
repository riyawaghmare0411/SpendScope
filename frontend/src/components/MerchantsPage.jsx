import { Sphere } from './ui'
import { fmt, fmtShort } from '../constants'

export const MerchantsPage = ({ t, currency, dc, lc, merchantDetails, expandedMerchant, setExpandedMerchant }) => {
  return (<>
            {merchantDetails.length > 0 && (
              <div style={{ ...dc, padding: '24px 28px', marginBottom: '24px', background: `linear-gradient(135deg, ${t.cardAlt}, ${t.tealDeep}90)` }}>
                <Sphere size="80px" color={t.teal} top="-20px" right="20px" opacity={0.3} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><p style={{ color: '#8FA3B0', fontSize: '11px', margin: '0 0 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Top Merchant</p><h2 style={{ fontSize: '22px', fontWeight: 700, color: t.cardAltText, margin: '0 0 4px' }}>{merchantDetails[0].name}</h2><p style={{ fontSize: '13px', color: '#8FA3B0', margin: 0 }}>{merchantDetails[0].count} transaction{merchantDetails[0].count !== 1 ? 's' : ''} &middot; {currency}{fmt(merchantDetails[0].avg)} avg</p></div>
                  <div style={{ textAlign: 'right' }}><p style={{ fontSize: '28px', fontWeight: 700, color: t.teal, margin: 0 }}>{currency}{fmtShort(merchantDetails[0].total)}</p><p style={{ fontSize: '12px', fontWeight: 600, color: merchantDetails[0].trend < -0.05 ? t.green : merchantDetails[0].trend > 0.05 ? t.red : t.textMuted, margin: '4px 0 0' }}>{merchantDetails[0].trend < -0.05 ? '\u2193 Decreasing' : merchantDetails[0].trend > 0.05 ? '\u2191 Increasing' : '\u2192 Stable'}</p></div>
                </div>
              </div>
            )}
            <div style={lc}>
              <div style={{ display: 'flex', padding: '10px 16px', borderBottom: `1px solid ${t.border}`, fontSize: '10px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}><span style={{ flex: 2 }}>Merchant</span><span style={{ flex: 1 }}>Category</span><span style={{ flex: 1, textAlign: 'right' }}>Total</span><span style={{ flex: 1, textAlign: 'right' }}>Txns</span><span style={{ flex: 1, textAlign: 'right' }}>Avg</span><span style={{ flex: 1, textAlign: 'right' }}>Trend</span></div>
              {merchantDetails.slice(0, 30).map((m, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${t.border}40`, cursor: 'pointer', transition: 'background 0.2s' }} onClick={() => setExpandedMerchant(expandedMerchant === m.name ? null : m.name)} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}06`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ flex: 2, fontSize: '13px', fontWeight: 500, color: t.text }}>{m.name}</span><span style={{ flex: 1, fontSize: '11px', color: t.textLight }}>{m.category}</span><span style={{ flex: 1, textAlign: 'right', fontSize: '13px', fontWeight: 600, color: t.text }}>{currency}{fmt(m.total)}</span><span style={{ flex: 1, textAlign: 'right', fontSize: '12px', color: t.textLight }}>{m.count}</span><span style={{ flex: 1, textAlign: 'right', fontSize: '12px', color: t.textLight }}>{currency}{fmt(m.avg)}</span>
                    <span style={{ flex: 1, textAlign: 'right', fontSize: '13px', fontWeight: 600, color: m.trend < -0.05 ? t.green : m.trend > 0.05 ? t.red : t.textMuted }}>{m.trend < -0.05 ? '\u2193' : m.trend > 0.05 ? '\u2191' : '\u2192'} {Math.abs(m.trend * 100).toFixed(0)}%</span>
                  </div>
                  {expandedMerchant === m.name && (
                    <div style={{ padding: '12px 16px 16px 60px', background: `${t.teal}04`, borderBottom: `1px solid ${t.border}40` }}>
                      <p style={{ fontSize: '11px', color: t.textMuted, margin: '0 0 8px' }}>First: {m.firstSeen} &middot; Last: {m.lastSeen}</p>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{Object.entries(m.monthlyData).sort(([a], [b]) => a.localeCompare(b)).map(([mo, val]) => <div key={mo} style={{ textAlign: 'center' }}><div style={{ width: '36px', height: `${Math.max(4, (val / (m.total / Object.keys(m.monthlyData).length)) * 24)}px`, background: `linear-gradient(180deg, ${t.teal}, ${t.tealDark})`, borderRadius: '4px 4px 0 0', minHeight: '4px' }} /><p style={{ fontSize: '8px', color: t.textMuted, margin: '2px 0 0' }}>{mo.slice(5)}</p></div>)}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
  </>)
}
