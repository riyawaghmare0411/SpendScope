import { useState, useEffect } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { API_BASE as DEFAULT_API_BASE, CAT_COLORS, fmt, fmtShort } from '../constants'

// Phase 12E: Stats Coach. No streaming, no LLM, no outbound calls.
// All math runs server-side in src/stats_coach.py (or could move to client) and
// returns instantly. Replaces the previous Claude-streaming CoachPage.
export const CoachPage = ({ t, currency, data, authToken, authHeaders, API_BASE: apiBase, userName }) => {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const base = apiBase || DEFAULT_API_BASE

  const fetchStats = async () => {
    if (!authToken) return
    setLoading(true); setError(null)
    try {
      const r = await fetch(`${base}/api/coaching/stats`, { headers: authHeaders() })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.detail || `HTTP ${r.status}`)
      }
      const j = await r.json()
      setStats(j)
    } catch (e) {
      setError(e.message || 'Could not load stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (authToken && data.length > 0) fetchStats() }, [authToken, data.length])

  const glass = {
    background: t.card,
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: `1px solid ${t.border}`,
    borderRadius: '20px',
    boxShadow: t.cardShadow,
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  }
  const label = { fontSize: '11px', fontWeight: 700, color: t.textMuted, letterSpacing: '1.5px', textTransform: 'uppercase', margin: 0 }

  if (data.length === 0 || stats?.empty) {
    return (
      <div style={{ ...glass, textAlign: 'center', padding: '60px 28px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>{'\u{1F4CA}'}</div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>No data yet</h2>
        <p style={{ fontSize: '14px', color: t.textMuted, margin: 0 }}>Import some transactions first to see your stats.</p>
      </div>
    )
  }

  if (loading && !stats) {
    return (
      <div style={{ ...glass, textAlign: 'center', padding: '60px 28px' }}>
        <p style={{ color: t.textMuted, fontSize: '13px', margin: 0 }}>Crunching the numbers...</p>
      </div>
    )
  }

  if (error && !stats) {
    return (
      <div style={{ ...glass, textAlign: 'center', padding: '48px 28px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: t.text, margin: '0 0 8px' }}>Stats unavailable</h3>
        <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>{error}</p>
      </div>
    )
  }

  if (!stats) return null

  const tm = stats.this_month || {}
  const savingsRate = stats.savings_rate_pct || 0
  const projectedEOM = tm.projected_eom || 0
  const projectingShortfall = projectedEOM < 0
  const heroColor = savingsRate >= 15 ? t.green : (savingsRate >= 0 ? t.teal : t.red)
  const weekChange = stats.week_change_pct || 0

  // Recharts data for top categories
  const catChartData = (stats.top_categories || []).map(c => ({
    name: c.name,
    value: c.total,
    color: CAT_COLORS[c.name] || t.teal,
  }))

  return (<>
    {/* Header */}
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>
        Your money, {userName || 'friend'}
      </h2>
      <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>
        Computed locally on every visit -- nothing leaves your device.
      </p>
    </div>

    {/* HERO: savings rate */}
    <div style={{
      ...glass,
      marginBottom: '20px',
      padding: '32px 28px',
      textAlign: 'center',
      background: t.gradient || `linear-gradient(135deg, ${t.tealDark}, ${t.accentPurple || t.tealDeep})`,
      border: 'none',
    }}>
      <p style={{ ...label, color: 'rgba(255,255,255,0.7)' }}>Savings Rate</p>
      <p style={{ fontSize: '64px', fontWeight: 800, color: '#ffffff', margin: '6px 0 0', letterSpacing: '-3px', lineHeight: 1 }}>
        {savingsRate.toFixed(0)}<span style={{ fontSize: '24px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>%</span>
      </p>
      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)', margin: '12px 0 0', fontWeight: 500 }}>
        {stats.encouragement}
      </p>
      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
        Based on {stats.n_months_data} month{stats.n_months_data === 1 ? '' : 's'} of data
      </p>
    </div>

    {/* Top row: 3 stat cards (in / out / projected EOM) */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
      <div style={{ ...glass, padding: '20px' }}>
        <p style={label}>Monthly Avg In</p>
        <p style={{ fontSize: '24px', fontWeight: 700, color: t.green, margin: '8px 0 0', letterSpacing: '-0.5px' }}>
          {currency}{fmtShort(stats.monthly_avg_in)}
        </p>
      </div>
      <div style={{ ...glass, padding: '20px' }}>
        <p style={label}>Monthly Avg Out</p>
        <p style={{ fontSize: '24px', fontWeight: 700, color: t.red, margin: '8px 0 0', letterSpacing: '-0.5px' }}>
          {currency}{fmtShort(stats.monthly_avg_out)}
        </p>
      </div>
      <div style={{ ...glass, padding: '20px' }}>
        <p style={label}>Projected EOM</p>
        <p style={{ fontSize: '24px', fontWeight: 700, color: projectingShortfall ? t.red : t.green, margin: '8px 0 0', letterSpacing: '-0.5px' }}>
          {projectingShortfall ? '-' : '+'}{currency}{fmtShort(Math.abs(projectedEOM))}
        </p>
        <p style={{ fontSize: '11px', color: t.textMuted, margin: '4px 0 0' }}>
          {tm.days_remaining} day{tm.days_remaining === 1 ? '' : 's'} left
        </p>
      </div>
    </div>

    {/* This month detail */}
    <div style={{ ...glass, marginBottom: '20px', padding: '20px 24px' }}>
      <p style={{ ...label, marginBottom: '12px' }}>This Month</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ fontSize: '13px', color: t.textLight, margin: 0 }}>
            Earned <strong style={{ color: t.green }}>{currency}{fmt(tm.in)}</strong>
            {' \u00B7 '}Spent <strong style={{ color: t.red }}>{currency}{fmt(tm.out)}</strong>
          </p>
          {tm.days_remaining > 0 && tm.daily_allowance > 0 && (
            <p style={{ fontSize: '12px', color: t.textMuted, margin: '4px 0 0' }}>
              {currency}{fmt(tm.daily_allowance)}/day for the next {tm.days_remaining} day{tm.days_remaining === 1 ? '' : 's'} keeps you even
            </p>
          )}
        </div>
        {weekChange !== 0 && (
          <div style={{
            padding: '6px 12px',
            borderRadius: '12px',
            background: weekChange > 0 ? `${t.red}15` : `${t.green}15`,
            border: `1px solid ${weekChange > 0 ? t.red : t.green}40`,
          }}>
            <p style={{ fontSize: '11px', color: t.textMuted, margin: 0 }}>vs last week</p>
            <p style={{ fontSize: '14px', fontWeight: 700, color: weekChange > 0 ? t.red : t.green, margin: 0 }}>
              {weekChange > 0 ? '+' : ''}{weekChange.toFixed(0)}%
            </p>
          </div>
        )}
      </div>
    </div>

    {/* Top categories chart */}
    {catChartData.length > 0 && (
      <div style={{ ...glass, marginBottom: '20px', padding: '20px 24px' }}>
        <p style={{ ...label, marginBottom: '14px' }}>Where Your Money Went</p>
        <ResponsiveContainer width="100%" height={Math.max(180, catChartData.length * 36)}>
          <BarChart data={catChartData} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: t.textMuted, fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: '10px', color: t.text }}
              formatter={(v) => [`${currency}${fmt(v)}`, 'Spent']}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            />
            <Bar dataKey="value" radius={[0, 8, 8, 0]}>
              {catChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    )}

    {/* Top merchants this month */}
    {(stats.top_merchants || []).length > 0 && (
      <div style={{ ...glass, marginBottom: '20px', padding: '20px 24px' }}>
        <p style={{ ...label, marginBottom: '14px' }}>Top Merchants This Month</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {stats.top_merchants.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px', background: `${t.teal}06` }}>
              <p style={{ fontSize: '13px', color: t.text, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{m.name}</p>
              <p style={{ fontSize: '13px', color: t.red, margin: 0, fontWeight: 700, marginLeft: '12px' }}>-{currency}{fmt(m.total)}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Refresh button */}
    <div style={{ textAlign: 'center', marginTop: '12px' }}>
      <button onClick={fetchStats} disabled={loading} style={{
        padding: '8px 18px', borderRadius: '20px',
        border: `1px solid ${t.border}`, background: 'transparent', color: t.teal,
        fontSize: '12px', fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1,
      }}>{loading ? 'Refreshing...' : 'Refresh'}</button>
    </div>
  </>)
}
