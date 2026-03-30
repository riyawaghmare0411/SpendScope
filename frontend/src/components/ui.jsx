import { useState, useEffect } from 'react'
import { fmt, fmtShort } from '../constants'

// ========== 3D SPHERE ==========
export const Sphere = ({ size, color, top, left, right, bottom, opacity = 0.6 }) => (
  <div style={{
    position: 'absolute', top, left, right, bottom, width: size, height: size, borderRadius: '50%', opacity, pointerEvents: 'none', zIndex: 0,
    background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 8%, transparent 40%), radial-gradient(circle at 35% 30%, ${color}ff 0%, ${color}cc 30%, ${color}66 55%, ${color}22 75%, transparent 100%)`,
    boxShadow: `inset -6px -8px 16px rgba(0,0,0,0.2), inset 4px 4px 10px rgba(255,255,255,0.35), 0 8px 32px ${color}35, 0 2px 8px rgba(0,0,0,0.12)`,
  }} />
)

// ========== ANIMATED COUNTER ==========
export const Counter = ({ end, prefix = '', duration = 1200, color, decimals = 2, abbreviate = false }) => {
  const [val, setVal] = useState(0)
  const [done, setDone] = useState(false)
  useEffect(() => {
    setDone(false); let start = 0; const step = end / (duration / 16)
    const timer = setInterval(() => { start += step; if (start >= end) { setVal(end); setDone(true); clearInterval(timer) } else setVal(start) }, 16)
    return () => clearInterval(timer)
  }, [end, duration])
  const display = done && abbreviate ? fmtShort(val) : fmt(val, decimals)
  return <span title={`${prefix}${fmt(end, decimals)}`} style={{ color, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>{prefix}{display}</span>
}

// ========== SKELETON LOADER ==========
export const SkeletonBlock = ({ width = '100%', height = '20px', radius = '12px', style = {} }) => (
  <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, rgba(150,150,150,0.08) 25%, rgba(150,150,150,0.15) 50%, rgba(150,150,150,0.08) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', ...style }} />
)

// ========== HEALTH SCORE RING ==========
export const HealthRing = ({ score, size = 140, t }) => {
  const [animScore, setAnimScore] = useState(0)
  useEffect(() => { let s = 0; const timer = setInterval(() => { s += 1; if (s >= score) { setAnimScore(score); clearInterval(timer) } else setAnimScore(s) }, 20); return () => clearInterval(timer) }, [score])
  const radius = (size - 16) / 2, circumference = 2 * Math.PI * radius, offset = circumference - (animScore / 100) * circumference
  const color = score >= 70 ? t.green : score >= 40 ? t.sand : t.red
  const label = score >= 70 ? 'Healthy' : score >= 40 ? 'Fair' : 'Needs Attention'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={`${t.border}`} strokeWidth="10" />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1.5s ease' }} />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle" style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: '28px', fontWeight: 700, fill: t.text }}>{animScore}</text>
      </svg>
      <span style={{ fontSize: '13px', fontWeight: 600, color, letterSpacing: '0.5px' }}>{label}</span>
    </div>
  )
}

// ========== VELOCITY GAUGE ==========
export const VelocityGauge = ({ current, previous, t }) => {
  const ratio = previous > 0 ? current / previous : 1, pct = Math.min(ratio * 100, 200)
  const label = ratio > 1.1 ? 'Spending Faster' : ratio < 0.9 ? 'Spending Slower' : 'On Track'
  const color = ratio > 1.1 ? t.red : ratio < 0.9 ? t.green : t.sand
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', height: '12px', borderRadius: '6px', background: `${t.border}`, margin: '0 0 12px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: '6px', width: `${Math.min(pct, 100)}%`, background: `linear-gradient(90deg, ${t.green}, ${pct > 100 ? t.red : t.sand})`, boxShadow: `0 0 10px ${color}40`, transition: 'width 1.2s ease' }} />
        <div style={{ position: 'absolute', left: '50%', top: '-2px', width: '2px', height: '16px', background: t.textMuted, borderRadius: '1px' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: t.textMuted, marginBottom: '8px' }}><span>Slower</span><span>Normal</span><span>Faster</span></div>
      <span style={{ fontSize: '14px', fontWeight: 700, color }}>{label}</span>
      <p style={{ fontSize: '11px', color: t.textMuted, margin: '4px 0 0' }}>{ratio > 1 ? `${((ratio - 1) * 100).toFixed(0)}% faster than last month` : `${((1 - ratio) * 100).toFixed(0)}% slower than last month`}</p>
    </div>
  )
}

// ========== TOOLTIPS (FIX 2: shows all series on multi-bar/area charts) ==========
export const Tip = ({ active, payload, currency = '' }) => {
  if (active && payload && payload.length) {
    const label = payload[0].payload.name || payload[0].payload.date || payload[0].payload.month || ''
    return (
      <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <p style={{ margin: 0, color: '#6B7C8A', fontSize: '11px' }}>{label}</p>
        {payload.map((entry, i) => (
          <p key={i} style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '14px', color: entry.color || '#2A9D8F' }}>
            {entry.name ? `${entry.name}: ` : ''}{currency}{fmt(entry.value)}
            {entry.payload.type === 'forecast' ? ' (forecast)' : ''}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export const PieTip = ({ active, payload, currency = '', total = 1 }) => {
  if (active && payload && payload.length) {
    const pct = total > 0 ? ((payload[0].value / total) * 100).toFixed(1) : '0'
    return (
      <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.06)' }}>
        <p style={{ margin: 0, color: '#6B7C8A', fontSize: '11px' }}>{payload[0].name || payload[0].payload.name}</p>
        <p style={{ margin: '2px 0 0', color: '#2A9D8F', fontWeight: 700, fontSize: '14px' }}>{currency}{fmt(payload[0].value)} ({pct}%)</p>
      </div>
    )
  }
  return null
}
