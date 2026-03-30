import { fmt } from '../constants'

export const CalendarPage = ({ t, currency, lc, calendarMonth, setCalendarMonth, subPredictions }) => {
            const [calY, calMo] = calendarMonth.split('-').map(Number), daysInMonth = new Date(calY, calMo, 0).getDate(), firstDayOfWeek = (new Date(calY, calMo - 1, 1).getDay() + 6) % 7
            const calLabel = new Date(calY, calMo - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            const prevMo = () => { const d = new Date(calY, calMo - 2); setCalendarMonth(d.toISOString().slice(0, 7)) }, nextMo = () => { const d = new Date(calY, calMo); setCalendarMonth(d.toISOString().slice(0, 7)) }
            const totalPredicted = subPredictions.reduce((s, p) => s + p.amount, 0)
            return (<>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}><button onClick={prevMo} style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', fontSize: '14px' }}>{'\u2190'}</button><h2 style={{ fontSize: '18px', fontWeight: 700, color: t.text, margin: 0 }}>{calLabel}</h2><button onClick={nextMo} style={{ padding: '8px 16px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.card, color: t.text, cursor: 'pointer', fontSize: '14px' }}>{'\u2192'}</button></div>
              <div style={lc}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: t.textMuted }}>{d}</div>)}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => { const day = i + 1, dayP = subPredictions.filter(p => p.predictedDay === day); return <div key={day} style={{ padding: '8px 4px', textAlign: 'center', minHeight: '60px', borderRadius: '8px', background: dayP.length > 0 ? `${t.teal}08` : 'transparent', border: `1px solid ${dayP.length > 0 ? t.teal + '20' : t.border + '40'}` }}><p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: '0 0 4px' }}>{day}</p>{dayP.map((p, j) => <div key={j} title={`${p.merchant}: ${currency}${fmt(p.amount)}`} style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.teal, margin: '2px auto', boxShadow: `0 0 4px ${t.teal}40` }} />)}</div> })}
              </div></div>
              <div style={{ ...lc, marginTop: '16px', padding: '16px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}><h3 style={{ fontSize: '14px', fontWeight: 600, color: t.text, margin: 0 }}>Predicted Charges</h3><span style={{ fontSize: '16px', fontWeight: 700, color: t.teal }}>{currency}{fmt(totalPredicted)}/mo</span></div>
                {subPredictions.length === 0 ? <p style={{ fontSize: '13px', color: t.textMuted }}>No recurring charges detected. Upload more data to improve predictions.</p> : subPredictions.map((p, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < subPredictions.length - 1 ? `1px solid ${t.border}40` : 'none' }}><div><p style={{ fontSize: '13px', fontWeight: 500, color: t.text, margin: 0 }}>{p.merchant}</p><p style={{ fontSize: '11px', color: t.textMuted, margin: '2px 0 0' }}>Day {p.predictedDay} of each month</p></div><span style={{ fontSize: '14px', fontWeight: 600, color: t.red }}>~{currency}{fmt(p.amount)}</span></div>)}
              </div>
            </>)
}
