import { useState, useEffect } from 'react'

// Phase 10G: dismissible glass-pill banners. Dismissed alerts come back the next day.
const STORAGE_KEY = 'spendscope_dismissed_alerts'

function loadDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const todayKey = new Date().toISOString().slice(0, 10)
    // prune entries from previous days
    const fresh = {}
    for (const [id, day] of Object.entries(parsed)) {
      if (day === todayKey) fresh[id] = day
    }
    return fresh
  } catch { return {} }
}

function saveDismissed(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export default function AlertBanner({ t, alerts }) {
  const [dismissed, setDismissed] = useState(loadDismissed)

  useEffect(() => { saveDismissed(dismissed) }, [dismissed])

  const visible = (alerts || []).filter(a => !dismissed[a.id])
  if (visible.length === 0) return null

  const colorFor = (level) => level === 'danger' ? t.red : (t.sand || '#f59e0b')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
      {visible.map(a => {
        const c = colorFor(a.level)
        return (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px',
            borderRadius: '14px',
            background: t.card,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${c}50`,
            boxShadow: `0 4px 14px ${c}15`,
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{a.icon}</span>
            <p style={{ flex: 1, margin: 0, fontSize: '13px', color: t.text, lineHeight: 1.4 }}>{a.msg}</p>
            <button
              onClick={() => { const todayKey = new Date().toISOString().slice(0, 10); setDismissed(d => ({ ...d, [a.id]: todayKey })) }}
              style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '8px', border: 'none', background: 'transparent', color: t.textMuted, fontSize: '14px', cursor: 'pointer', padding: 0 }}
              title="Dismiss until tomorrow"
            >{'\u00D7'}</button>
          </div>
        )
      })}
    </div>
  )
}
