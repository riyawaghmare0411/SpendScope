import { useState, useEffect, useRef } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts'
import Papa from 'papaparse'
import jsPDF from 'jspdf'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// ========== THEMES ==========
const themes = {
  light: {
    bg: '#E8E2DA', sidebar: '#2C3E4A', sidebarHover: '#34495E',
    card: '#F5F1EC', cardAlt: '#2C3E4A', cardAltText: '#F0EDE8',
    text: '#2C3E4A', textLight: '#6B7C8A', textMuted: '#9AABBA',
    teal: '#4DB6AC', tealDark: '#2A9D8F', tealDeep: '#1A7A6D', mint: '#A8E6CF',
    sand: '#C9A96E', sandLight: '#E2D5B8', beige: '#D4C5A9',
    green: '#2A9D8F', red: '#D4625E', border: 'rgba(0,0,0,0.06)',
    cardShadow: '0 2px 16px rgba(0,0,0,0.05)',
    sphere1: 'rgba(77,182,172,0.12)', sphere2: 'rgba(201,169,110,0.1)',
  },
  dark: {
    bg: '#151A23', sidebar: '#1C2230', sidebarHover: '#232E3F',
    card: '#1E2533', cardAlt: '#243042', cardAltText: '#E8E2DA',
    text: '#E8E2DA', textLight: '#8FA3B0', textMuted: '#5A6C7A',
    teal: '#4DB6AC', tealDark: '#2A9D8F', tealDeep: '#1A7A6D', mint: '#A8E6CF',
    sand: '#C9A96E', sandLight: '#3D3428', beige: '#D4C5A9',
    green: '#2A9D8F', red: '#D4625E', border: 'rgba(255,255,255,0.06)',
    cardShadow: '0 2px 20px rgba(0,0,0,0.2)',
    sphere1: 'rgba(77,182,172,0.06)', sphere2: 'rgba(201,169,110,0.04)',
  }
}

const COLORS = ['#2A9D8F','#C9A96E','#4DB6AC','#D4625E','#7C6BC4','#A8E6CF','#E6B566','#D4829D','#5DADE2','#45B39D','#AF7AC5','#F0B27A']
const CAT_COLORS = {
  'Transport': '#2A9D8F', 'Groceries': '#5DADE2', 'Grocery': '#5DADE2',
  'Eating Out': '#A8E6CF', 'Rent': '#C9A96E', 'Shopping': '#D4829D',
  'Transfers': '#7C6BC4', 'Professional': '#4DB6AC', 'Bills': '#E6B566',
  'Food Delivery': '#F0B27A', 'Food': '#F0B27A', 'Subscriptions': '#AF7AC5',
  'Bank Fees': '#D4625E', 'Cash': '#45B39D', 'Coffee & Cafe': '#C9A96E',
  'Income': '#2A9D8F', 'Other': '#9AABBA', 'Fitness': '#45B39D',
  'Housing': '#C9A96E', 'Travel': '#7C6BC4', 'Education': '#5DADE2',
  'Utilities': '#E6B566', 'Savings': '#2A9D8F', 'Entertainment': '#AF7AC5',
  'Electronics': '#D4829D', 'Healthcare': '#D4625E', 'Clothing': '#A8E6CF',
  'Credit': '#4DB6AC', 'Debit': '#9AABBA',
}

const CURRENCIES = [
  { symbol: '\u00A3', label: 'GBP (\u00A3)' },
  { symbol: '$', label: 'USD ($)' },
  { symbol: '\u20AC', label: 'EUR (\u20AC)' },
  { symbol: '\u20B9', label: 'INR (\u20B9)' },
  { symbol: '\u00A5', label: 'JPY (\u00A5)' },
  { symbol: 'A$', label: 'AUD (A$)' },
  { symbol: 'C$', label: 'CAD (C$)' },
]

const NON_DISCRETIONARY = new Set(['Rent', 'Bills', 'Transfers', 'Income', 'Salary', 'Mortgage', 'Insurance', 'Tax', 'Taxes', 'Utilities'])

const COUNTRIES = [
  'United States', 'United Kingdom', 'India', 'Georgia', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'China', 'Brazil', 'Mexico', 'Spain', 'Italy',
  'Netherlands', 'Sweden', 'Switzerland', 'Singapore', 'South Korea', 'Other'
]

const SAVINGS_TIPS = {
  'Grocery': 'Try store brands and meal planning',
  'Groceries': 'Try store brands and meal planning',
  'Food': 'Cook at home one extra day per week',
  'Eating Out': 'Pack lunch twice a week instead',
  'Food Delivery': 'Cook instead of ordering in',
  'Transport': 'Walk or bike for short trips',
  'Shopping': 'Wait 48 hours before impulse buys',
  'Entertainment': 'Look for free local events',
  'Electronics': 'Buy refurbished or wait for sales',
  'Healthcare': 'Use generic medications when possible',
  'Clothing': 'Try secondhand shops or swap events',
  'Coffee & Cafe': 'Brew at home more often',
  'Bank Fees': 'Switch to a fee-free account',
  'Subscriptions': 'Audit and cancel unused services',
  'Fitness': 'Try free workout videos at home',
  'Housing': 'Review your rent or mortgage options',
  'Travel': 'Book in advance and compare fares',
  'Education': 'Look for free courses and library resources',
  'Utilities': 'Switch off unused lights and appliances',
}

const MERCHANT_CATEGORIES = [
  ['Transport', ['uber', 'lyft', 'taxi', 'bus', 'train', 'rail', 'tfl', 'south coast', 'voi', 'lime', 'bolt', 'trainpal']],
  ['Food Delivery', ['uber eats', 'deliveroo', 'just eat']],
  ['Eating Out', ['greggs', 'wingstop', 'tortilla', 'chopstix', 'nandos', 'mcdonalds', 'kfc', 'subway', 'pret', 'bombay spice', 'sravs kitchen', 'cha sha']],
  ['Groceries', ['waitrose', 'sainsbury', 'tesco', 'asda', 'aldi', 'lidl', 'morrisons', 'co-op', 'marks&spencer', 'm&s', 'barakah', 'international food']],
  ['Shopping', ['shein', 'zara', 'primark', 'amazon', 'asos', 'body shop', 'tk maxx', 'hm', 'next']],
  ['Subscriptions', ['google one', 'canva', 'apple.com/bill', 'netflix', 'spotify', 'disney', 'voxi', 'three', 'ee', 'giffgaff']],
  ['Rent', ['anthem homes', 'rent', 'letting', 'housing']],
  ['Bank Fees', ['non-gbp', 'transaction fee', 'purch fee', 'overdraft']],
  ['Transfers', ['remitly', 'wise', 'transferwise', 'western union', 'moneygram']],
]

const categorizeByMerchant = (merchantName) => {
  const lower = (merchantName || '').toLowerCase()
  for (const [cat, keywords] of MERCHANT_CATEGORIES) {
    if (keywords.some(kw => lower.includes(kw))) return cat
  }
  return 'Other'
}

const categorizeWithRules = (merchant) => {
  const learned = JSON.parse(localStorage.getItem('spendscope_learned_rules') || '[]')
  const m = (merchant || '').toLowerCase()
  for (const rule of learned) {
    if (m.includes(rule.merchant.toLowerCase())) return rule.category
  }
  const bulk = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
  for (const rule of [...bulk].sort((a, b) => (b.priority || 0) - (a.priority || 0))) {
    const val = rule.match_value.toLowerCase()
    if (rule.match_type === 'exact' && m === val) return rule.category
    if (rule.match_type === 'starts_with' && m.startsWith(val)) return rule.category
    if (rule.match_type === 'contains' && m.includes(val)) return rule.category
    if (rule.match_type === 'regex') { try { if (new RegExp(val, 'i').test(m)) return rule.category } catch(e) {} }
  }
  return categorizeByMerchant(merchant)
}

const PEER_BENCHMARKS = {
  'Housing': 30, 'Rent': 30, 'Groceries': 12, 'Grocery': 12, 'Transport': 10,
  'Eating Out': 5, 'Food': 8, 'Entertainment': 5, 'Shopping': 5, 'Subscriptions': 3,
  'Utilities': 5, 'Healthcare': 8, 'Education': 3, 'Clothing': 3, 'Fitness': 3,
  'Travel': 4, 'Electronics': 3, 'Food Delivery': 4, 'Other': 5,
}

// ========== NUMBER FORMATTERS ==========
const fmt = (num, decimals = 2) => Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
const fmtShort = (num) => {
  const abs = Math.abs(num)
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (abs >= 1_000) return (abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.?0+$/, '') + 'K'
  return fmt(abs, 0)
}

// ========== 3D SPHERE ==========
const Sphere = ({ size, color, top, left, right, bottom, opacity = 0.6 }) => (
  <div style={{
    position: 'absolute', top, left, right, bottom, width: size, height: size, borderRadius: '50%', opacity, pointerEvents: 'none', zIndex: 0,
    background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 8%, transparent 40%), radial-gradient(circle at 35% 30%, ${color}ff 0%, ${color}cc 30%, ${color}66 55%, ${color}22 75%, transparent 100%)`,
    boxShadow: `inset -6px -8px 16px rgba(0,0,0,0.2), inset 4px 4px 10px rgba(255,255,255,0.35), 0 8px 32px ${color}35, 0 2px 8px rgba(0,0,0,0.12)`,
  }} />
)

// ========== ANIMATED COUNTER ==========
const Counter = ({ end, prefix = '', duration = 1200, color, decimals = 2, abbreviate = false }) => {
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
const SkeletonBlock = ({ width = '100%', height = '20px', radius = '12px', style = {} }) => (
  <div style={{ width, height, borderRadius: radius, background: 'linear-gradient(90deg, rgba(150,150,150,0.08) 25%, rgba(150,150,150,0.15) 50%, rgba(150,150,150,0.08) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', ...style }} />
)

// ========== HEALTH SCORE RING ==========
const HealthRing = ({ score, size = 140, t }) => {
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
const VelocityGauge = ({ current, previous, t }) => {
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
const Tip = ({ active, payload, currency = '' }) => {
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

const PieTip = ({ active, payload, currency = '', total = 1 }) => {
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

// ========== NAV ITEMS ==========
const NAV = [
  { id: 'overview', icon: '\u25CE', label: 'Overview' },
  { id: 'spending', icon: '\u25C9', label: 'Spending' },
  { id: 'merchants', icon: '\uD83C\uDFEA', label: 'Merchants' },
  { id: 'transactions', icon: '\u2630', label: 'Transactions' },
  { id: 'calendar', icon: '\uD83D\uDCC5', label: 'Calendar' },
  { id: 'insights', icon: '\uD83D\uDCA1', label: 'Insights' },
  { id: 'rules', icon: '\u2699', label: 'Rules' },
  { id: 'upload', icon: '\u2B06', label: 'Upload' },
]

// ========== CSV COLUMN DETECTION ==========
const detectColumns = (headers) => {
  const lower = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const find = (patterns) => { for (const p of patterns) { const idx = lower.findIndex(h => h.includes(p)); if (idx !== -1) return headers[idx] } return null }
  return {
    date: find(['dateiso', 'transactiondate', 'date', 'txndate', 'postdate', 'postingdate', 'valuedate', 'bookingdate']),
    amount: find(['transactionamount', 'amount', 'moneyout', 'debit', 'value']),
    amountIn: find(['moneyin', 'credit', 'deposit']),
    merchant: find(['merchantname', 'merchant', 'payee', 'description', 'name', 'transactiondescription', 'vendor', 'counterparty', 'narrative']),
    category: find(['category', 'spendingcategory']),
    balance: find(['accountbalance', 'balance', 'runningbalance']),
    direction: find(['direction']),
  }
}

const parseFlexDate = (raw) => {
  if (!raw) return ''
  let m = raw.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  m = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return raw.slice(0, 10)
}

// ========== MAIN APP ==========
function App() {
  const [data, setData] = useState([]), [loading, setLoading] = useState(true), [page, setPage] = useState('overview'), [mode, setMode] = useState('light')
  const [searchTerm, setSearchTerm] = useState(''), [filterCat, setFilterCat] = useState('All'), [dragOver, setDragOver] = useState(false), [insightsSeen, setInsightsSeen] = useState(false)
  const [userName, setUserName] = useState(() => localStorage.getItem('spendscope_name') || ''), [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('spendscope_name'))
  const [currency, setCurrency] = useState('$'), [chartRange, setChartRange] = useState('All'), [globalRange, setGlobalRange] = useState('All')
  const [uploadStatus, setUploadStatus] = useState(null), [savingsReduction, setSavingsReduction] = useState(25), [showProfile, setShowProfile] = useState(false)
  const [budgets, setBudgets] = useState(() => JSON.parse(localStorage.getItem('spendscope_budgets') || '{}')), [editingBudget, setEditingBudget] = useState(null), [budgetInputVal, setBudgetInputVal] = useState('')
  const [accounts, setAccounts] = useState(() => JSON.parse(localStorage.getItem('spendscope_accounts') || '[]')), [activeAccount, setActiveAccount] = useState('All'), [uploadAccountName, setUploadAccountName] = useState('')
  const [expandedMerchant, setExpandedMerchant] = useState(null), [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [pendingImport, setPendingImport] = useState(null) // {transactions, bankName, filename}
  const [showColumnMapper, setShowColumnMapper] = useState(null) // {headers, previewRows, file}
  const [importSelectedRows, setImportSelectedRows] = useState(new Set())
  const [editingCell, setEditingCell] = useState(null) // {rowIdx, field}
  const [editingTxnCat, setEditingTxnCat] = useState(null) // {index, currentCat} for inline category edit on Transactions page
  const [flashedTxnIdx, setFlashedTxnIdx] = useState(null) // index of row to flash green after category save
  const [rulesVersion, setRulesVersion] = useState(0) // bump to force Rules page re-render
  const [columnMapping, setColumnMapping] = useState({ date: '', description: '', amount: '', amountIn: '', amountOut: '', balance: '' })
  const [columnDateFormat, setColumnDateFormat] = useState('auto')
  const [mapperBankName, setMapperBankName] = useState('')
  const [mapperSaveTemplate, setMapperSaveTemplate] = useState(false)
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('spendscope_token'))
  const [authUser, setAuthUser] = useState(() => { const saved = localStorage.getItem('spendscope_user'); return saved ? JSON.parse(saved) : null })
  const [authPage, setAuthPage] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const fileInputRef = useRef(null), welcomeInputRef = useRef(null), profileInputRef = useRef(null)
  const t = themes[mode]

  const authHeaders = () => authToken ? { 'Authorization': `Bearer ${authToken}` } : {}

  const handleLogin = async (email, password) => {
    setAuthLoading(true); setAuthError('')
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Login failed')
      localStorage.setItem('spendscope_token', data.access_token)
      localStorage.setItem('spendscope_user', JSON.stringify(data.user))
      setAuthToken(data.access_token)
      setAuthUser(data.user)
      setUserName(data.user.name)
      setCurrency(data.user.currency === 'USD' ? '$' : data.user.currency === 'GBP' ? '\u00A3' : data.user.currency === 'EUR' ? '\u20AC' : data.user.currency === 'INR' ? '\u20B9' : '$')
    } catch (e) { setAuthError(e.message) }
    finally { setAuthLoading(false) }
  }

  const handleSignup = async (email, password, name, country, curr) => {
    setAuthLoading(true); setAuthError('')
    try {
      const r = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, country, currency: curr })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Signup failed')
      localStorage.setItem('spendscope_token', data.access_token)
      localStorage.setItem('spendscope_user', JSON.stringify(data.user))
      localStorage.setItem('spendscope_name', name)
      setAuthToken(data.access_token)
      setAuthUser(data.user)
      setUserName(name)
      setShowWelcome(false)
    } catch (e) { setAuthError(e.message) }
    finally { setAuthLoading(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem('spendscope_token')
    localStorage.removeItem('spendscope_user')
    setAuthToken(null)
    setAuthUser(null)
    setData([])
  }

  useEffect(() => { if (!authToken) { setLoading(false); return }; fetch(`${API_BASE}/api/transactions`, { headers: authHeaders() }).then(r => r.json()).then(j => { if (Array.isArray(j)) { setData(j.map(d => ({ ...d, _account: d._account || 'Primary' }))); setLoading(false) } else { setLoading(false) } }).catch(() => { setLoading(false) }) }, [authToken])
  useEffect(() => { localStorage.setItem('spendscope_budgets', JSON.stringify(budgets)) }, [budgets])
  useEffect(() => { localStorage.setItem('spendscope_accounts', JSON.stringify(accounts)) }, [accounts])

  useEffect(() => {
    if (data.length === 0) return
    const CC = { 'USA': '$', 'US': '$', 'United States': '$', 'UK': '\u00A3', 'United Kingdom': '\u00A3', 'GB': '\u00A3', 'Great Britain': '\u00A3', 'India': '\u20B9', 'IN': '\u20B9', 'Japan': '\u00A5', 'JP': '\u00A5', 'China': '\u00A5', 'CN': '\u00A5', 'Germany': '\u20AC', 'France': '\u20AC', 'Italy': '\u20AC', 'Spain': '\u20AC', 'Netherlands': '\u20AC', 'Belgium': '\u20AC', 'Austria': '\u20AC', 'Ireland': '\u20AC', 'Portugal': '\u20AC', 'Greece': '\u20AC', 'Finland': '\u20AC', 'EU': '\u20AC', 'Australia': 'A$', 'AU': 'A$', 'Canada': 'C$', 'CA': 'C$' }
    const CS = { 'USD': '$', 'GBP': '\u00A3', 'EUR': '\u20AC', 'INR': '\u20B9', 'JPY': '\u00A5', 'CNY': '\u00A5', 'AUD': 'A$', 'CAD': 'C$' }
    const sample = data[0] || {}
    const ck = Object.keys(sample).find(k => /^country$/i.test(k) || /^country[_ ]?(code|name)?$/i.test(k) || /^region$/i.test(k))
    if (ck) { const vals = [...new Set(data.map(d => (d[ck] || '').trim()).filter(Boolean))]; for (const v of vals) { const m = CC[v] || CC[v.toUpperCase()]; if (m) { setCurrency(m); return } } }
    const currK = Object.keys(sample).find(k => /^currency$/i.test(k) || /^currency[_ ]?(code|name)?$/i.test(k))
    if (currK) { const vals = [...new Set(data.map(d => (d[currK] || '').trim()).filter(Boolean))]; for (const v of vals) { const m = CS[v.toUpperCase()] || CS[v]; if (m) { setCurrency(m); return } } }
    const sf = Object.keys(sample).filter(k => typeof sample[k] === 'string'), sc = { '$': 0, '\u00A3': 0, '\u20AC': 0, '\u20B9': 0, '\u00A5': 0 }
    for (const row of data.slice(0, 100)) { for (const k of sf) { const v = row[k] || ''; if (v.includes('$')) sc['$']++; if (v.includes('\u00A3')) sc['\u00A3']++; if (v.includes('\u20AC')) sc['\u20AC']++; if (v.includes('\u20B9')) sc['\u20B9']++; if (v.includes('\u00A5')) sc['\u00A5']++ } }
    const top = Object.entries(sc).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])[0]
    if (top) { setCurrency(top[0]); return }
    setCurrency('$')
  }, [data])

  useEffect(() => { if (uploadStatus?.type === 'success') { const timer = setTimeout(() => setUploadStatus(null), 5000); return () => clearTimeout(timer) } }, [uploadStatus])

  // Extract unique category names for dropdowns
  const ALL_CATEGORIES = [...new Set(MERCHANT_CATEGORIES.map(([cat]) => cat).concat(['Other', 'Income', 'Salary', 'Cash', 'Coffee & Cafe', 'Entertainment', 'Electronics', 'Healthcare', 'Clothing', 'Fitness', 'Housing', 'Travel', 'Education', 'Utilities', 'Savings', 'Professional', 'Bills', 'Credit', 'Debit']))].sort()

  const handleFileUpload = (file) => {
    if (!file) return; const isPDF = file.name.toLowerCase().endsWith('.pdf'); const isCSV = file.name.toLowerCase().endsWith('.csv'); if (!isPDF && !isCSV) { setUploadStatus({ type: 'error', message: 'Please upload a CSV or PDF file.' }); return }
    setUploadStatus({ type: 'loading', message: isPDF ? 'Processing PDF...' : 'Parsing CSV...' })
    if (isPDF) {
      const formData = new FormData(); formData.append('file', file)
      fetch(`${API_BASE}/api/upload-pdf`, { method: 'POST', body: formData })
        .then(r => { if (!r.ok) throw new Error('Server error'); return r.json() })
        .then(result => {
          if (result.status === 'unrecognized') { setUploadStatus({ type: 'error', message: 'Could not recognize this PDF format. Please try uploading a CSV export from your bank instead.' }); return }
          const transactions = Array.isArray(result.transactions) ? result.transactions : []
          if (transactions.length === 0) { setUploadStatus({ type: 'error', message: 'No transactions found in PDF.' }); return }
          const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
          setPendingImport({ transactions: tagged, bankName: result.bank_name || '', filename: file.name })
          setUploadStatus(null)
        })
        .catch(err => { setUploadStatus({ type: 'error', message: `PDF processing failed: ${err.message}. Make sure the backend is running.` }) })
      return
    }

    // CSV: try backend first, fall back to client-side parsing
    const formData = new FormData(); formData.append('file', file)
    fetch(`${API_BASE}/api/upload-csv`, { method: 'POST', body: formData })
      .then(r => { if (!r.ok) throw new Error('Server error'); return r.json() })
      .then(result => {
        if (result.status === 'needs_mapping') {
          setShowColumnMapper({ headers: result.headers, previewRows: result.preview_rows, file })
          setColumnMapping({ date: '', description: '', amount: '', amountIn: '', amountOut: '', balance: '' })
          setMapperBankName(result.bank_name || '')
          setUploadStatus(null)
          return
        }
        // status === 'parsed'
        const transactions = result.transactions || []
        if (transactions.length === 0) { setUploadStatus({ type: 'error', message: 'No transactions found in CSV.' }); return }
        const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
        setPendingImport({ transactions: tagged, bankName: result.bank_name || '', filename: file.name })
        setUploadStatus(null)
      })
      .catch(() => {
        // Backend unavailable -- fall back to client-side Papa Parse
        Papa.parse(file, { header: true, skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0 && results.data.length === 0) { setUploadStatus({ type: 'error', message: `Parse error: ${results.errors[0].message}` }); return }
            const headers = results.meta.fields || [], cols = detectColumns(headers)
            if (!cols.date || (!cols.amount && !cols.amountIn)) {
              // Cannot auto-detect -- show column mapper
              setShowColumnMapper({ headers, previewRows: results.data.slice(0, 5), file })
              setColumnMapping({ date: '', description: '', amount: '', amountIn: '', amountOut: '', balance: '' })
              setUploadStatus(null)
              return
            }
            const GENERIC_CODES = new Set(['DEB', 'FPO', 'CPT', 'FPI', 'TFR', 'DD', 'BGC', 'SO', ''])
            const needsSmartCat = !cols.category || results.data.slice(0, 20).every(row => GENERIC_CODES.has((row[cols.category] || '').trim()))
            const mapped = results.data.map(row => {
              const dateISO = parseFlexDate(row[cols.date]), amountOut = parseFloat(row[cols.amount]) || 0, amountIn = cols.amountIn ? (parseFloat(row[cols.amountIn]) || 0) : 0
              const isIncome = amountIn > 0 && amountOut === 0, merchantName = row[cols.merchant] || 'Unknown'
              const dir = cols.direction ? ((row[cols.direction] || '').toUpperCase() === 'IN' ? 'IN' : 'OUT') : (isIncome ? 'IN' : 'OUT')
              return { date_iso: dateISO, description: merchantName, merchant: merchantName, category: needsSmartCat ? categorizeWithRules(merchantName) : (row[cols.category] || 'Other'), type: 'DEB', money_in: dir === 'IN' ? (amountIn || Math.abs(amountOut)) : 0, money_out: dir === 'OUT' ? (amountOut || Math.abs(amountIn)) : 0, balance: parseFloat(row[cols.balance]) || 0, direction: dir }
            }).filter(r => r.date_iso && (r.money_in > 0 || r.money_out > 0))
            if (mapped.length === 0) { setUploadStatus({ type: 'error', message: 'No valid transactions found in CSV.' }); return }
            setPendingImport({ transactions: mapped, bankName: '', filename: file.name })
            setUploadStatus(null)
          },
          error: (err) => { setUploadStatus({ type: 'error', message: `Failed to read file: ${err.message}` }) }
        })
      })
  }

  const handleColumnMapperSubmit = () => {
    if (!showColumnMapper) return
    const { file } = showColumnMapper
    const mapping = { ...columnMapping, date_format: columnDateFormat }
    // If we have a backend, send mapped data
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mapping', JSON.stringify(mapping))
    if (mapperSaveTemplate && mapperBankName) formData.append('bank_name', mapperBankName)
    setUploadStatus({ type: 'loading', message: 'Parsing with custom mapping...' })
    fetch(`${API_BASE}/api/upload-csv-mapped`, { method: 'POST', body: formData })
      .then(r => { if (!r.ok) throw new Error('Server error'); return r.json() })
      .then(result => {
        const transactions = result.transactions || []
        if (transactions.length === 0) { setUploadStatus({ type: 'error', message: 'No transactions found with this mapping.' }); return }
        const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
        setPendingImport({ transactions: tagged, bankName: result.bank_name || mapperBankName, filename: file.name })
        setShowColumnMapper(null)
        setUploadStatus(null)
      })
      .catch(() => {
        // Fallback: apply mapping client-side
        Papa.parse(file, { header: true, skipEmptyLines: true,
          complete: (results) => {
            const rows = results.data
            const mapped = rows.map(row => {
              const dateISO = parseFlexDate(row[mapping.date] || '')
              const amtOut = parseFloat(row[mapping.amount] || row[mapping.amountOut]) || 0
              const amtIn = parseFloat(row[mapping.amountIn]) || 0
              const merchantName = row[mapping.description] || 'Unknown'
              const isIncome = amtIn > 0 && amtOut === 0
              const dir = isIncome ? 'IN' : 'OUT'
              return { date_iso: dateISO, description: merchantName, merchant: merchantName, category: categorizeWithRules(merchantName), type: 'DEB', money_in: dir === 'IN' ? (amtIn || Math.abs(amtOut)) : 0, money_out: dir === 'OUT' ? (amtOut || Math.abs(amtIn)) : 0, balance: parseFloat(row[mapping.balance]) || 0, direction: dir }
            }).filter(r => r.date_iso && (r.money_in > 0 || r.money_out > 0))
            if (mapped.length === 0) { setUploadStatus({ type: 'error', message: 'No valid transactions found with this mapping.' }); return }
            setPendingImport({ transactions: mapped, bankName: mapperBankName, filename: file.name })
            setShowColumnMapper(null)
            setUploadStatus(null)
          },
          error: () => setUploadStatus({ type: 'error', message: 'Failed to parse file with mapping.' })
        })
      })
  }

  const handleConfirmImport = () => {
    if (!pendingImport) return
    const acctName = uploadAccountName.trim() || 'Primary'
    // Remove selected (deleted) rows
    const kept = pendingImport.transactions.filter((_, i) => !importSelectedRows.has(i))
    const taggedData = kept.map(d => ({ ...d, _account: acctName }))
    setData(prev => [...prev.filter(d => d._account !== acctName), ...taggedData])
    if (!accounts.find(a => a.name === acctName)) setAccounts(prev => [...prev, { id: Date.now().toString(), name: acctName }])
    setUploadStatus({ type: 'success', message: `Imported ${kept.length.toLocaleString()} transactions into "${acctName}".` })
    if (authToken) {
      fetch(`${API_BASE}/api/transactions/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          transactions: kept,
          bank_name: pendingImport.bankName,
          filename: pendingImport.filename,
          account_name: acctName,
          source_type: pendingImport.filename?.endsWith('.pdf') ? 'pdf' : 'csv',
        })
      }).catch(console.error)
    }
    setPendingImport(null)
    setImportSelectedRows(new Set())
    setEditingCell(null)
    setPage('overview')
  }

  const handleCancelImport = () => {
    setPendingImport(null)
    setImportSelectedRows(new Set())
    setEditingCell(null)
    setUploadStatus(null)
  }

  const updatePendingTransaction = (idx, field, value) => {
    setPendingImport(prev => {
      if (!prev) return prev
      const updated = [...prev.transactions]
      updated[idx] = { ...updated[idx], [field]: value }
      return { ...prev, transactions: updated }
    })
  }

  const toggleImportRow = (idx) => {
    setImportSelectedRows(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  const toggleAllImportRows = () => {
    if (!pendingImport) return
    if (importSelectedRows.size === pendingImport.transactions.length) setImportSelectedRows(new Set())
    else setImportSelectedRows(new Set(pendingImport.transactions.map((_, i) => i)))
  }

  const deleteSelectedImportRows = () => {
    if (!pendingImport || importSelectedRows.size === 0) return
    const kept = pendingImport.transactions.filter((_, i) => !importSelectedRows.has(i))
    setPendingImport(prev => ({ ...prev, transactions: kept }))
    setImportSelectedRows(new Set())
  }

  const handleWelcomeSubmit = () => { const name = (welcomeInputRef.current?.value || '').trim() || 'Happy'; setUserName(name); localStorage.setItem('spendscope_name', name); setShowWelcome(false) }

  const handleExportPDF = () => {
    const doc = new jsPDF(); let y = 20
    const ln = (text, size = 12, bold = false) => { doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.text(text, 20, y); y += size * 0.5 + 3 }
    ln('SpendScope Financial Report', 20, true); ln(`${dateRangeStr} | Generated ${new Date().toLocaleDateString()}`, 10); y += 5
    ln('Key Metrics', 14, true); ln(`Total Income: ${currency}${fmt(totalIn)}`); ln(`Total Spending: ${currency}${fmt(totalOut)}`); ln(`Net Balance: ${currency}${fmt(Math.abs(net))} (${net >= 0 ? 'surplus' : 'deficit'})`); ln(`Health Score: ${healthScore}/100`); ln(`Monthly Average Spending: ${currency}${fmt(monthlyAvg)}`); y += 5
    ln('Top Categories', 14, true); catData.slice(0, 8).forEach(c => { const pct = totalOut > 0 ? ((c.value / totalOut) * 100).toFixed(1) : '0'; ln(`  ${c.name}: ${currency}${fmt(c.value)} (${pct}%)`) }); y += 5
    ln('Top Merchants', 14, true); topM.slice(0, 5).forEach(m => ln(`  ${m.name}: ${currency}${fmt(m.value)}`))
    if (subscriptions.length > 0) { y += 5; ln('Recurring Charges', 14, true); subscriptions.forEach(s => ln(`  ${s.merchant}: ~${currency}${fmt(s.monthlyAvg)}/mo`)) }
    doc.save(`SpendScope_Report_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  // ========== AUTH GATE ==========
  if (!authToken) {
    const AuthLoginForm = () => {
      const [email, setEmail] = useState(''), [password, setPassword] = useState('')
      return (
        <form onSubmit={e => { e.preventDefault(); handleLogin(email, password) }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Your password" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: authLoading ? 'not-allowed' : 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: 15, fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40`, opacity: authLoading ? 0.7 : 1, marginTop: 4 }}>{authLoading ? 'Signing in...' : 'Sign In'}</button>
        </form>
      )
    }
    const AuthSignupForm = () => {
      const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [country, setCountry] = useState('United States'), [curr, setCurr] = useState('USD')
      return (
        <form onSubmit={e => { e.preventDefault(); if (password.length < 6) { setAuthError('Password must be at least 6 characters'); return }; handleSignup(email, password, name, country, curr) }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 6 characters" minLength={6} style={{ width: '100%', padding: '11px 14px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Country</label>
              <select value={country} onChange={e => setCountry(e.target.value)} style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', appearance: 'auto' }}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: t.textLight, marginBottom: 6 }}>Currency</label>
              <select value={curr} onChange={e => setCurr(e.target.value)} style={{ width: '100%', padding: '11px 10px', borderRadius: 12, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 13, outline: 'none', boxSizing: 'border-box', appearance: 'auto' }}>
                {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol === '$' ? 'USD' : c.symbol === '\u00A3' ? 'GBP' : c.symbol === '\u20AC' ? 'EUR' : c.symbol === '\u20B9' ? 'INR' : c.symbol === '\u00A5' ? 'JPY' : c.symbol === 'A$' ? 'AUD' : 'CAD'}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: authLoading ? 'not-allowed' : 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: 15, fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40`, opacity: authLoading ? 0.7 : 1, marginTop: 4 }}>{authLoading ? 'Creating account...' : 'Create Account'}</button>
        </form>
      )
    }
    return (
      <div style={{ minHeight: '100vh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <div style={{ width: '100%', maxWidth: '420px', padding: '40px', background: t.card, borderRadius: '24px', boxShadow: t.cardShadow }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 22 }}>S</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: t.text, margin: '12px 0 4px' }}>SpendScope</h1>
            <p style={{ color: t.textLight, fontSize: 13, margin: 0 }}>{authPage === 'login' ? 'Sign in to your account' : 'Create your account'}</p>
          </div>
          {authError && <div style={{ background: 'rgba(212,98,94,0.1)', border: '1px solid rgba(212,98,94,0.2)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, color: t.red, fontSize: 13 }}>{authError}</div>}
          {authPage === 'login' ? <AuthLoginForm /> : <AuthSignupForm />}
          <p style={{ textAlign: 'center', color: t.textLight, fontSize: 13, marginTop: 20 }}>
            {authPage === 'login' ? "Don't have an account? " : "Already have an account? "}
            <span onClick={() => { setAuthPage(authPage === 'login' ? 'signup' : 'login'); setAuthError('') }} style={{ color: t.teal, cursor: 'pointer', fontWeight: 600 }}>
              {authPage === 'login' ? 'Sign up' : 'Log in'}
            </span>
          </p>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 12, cursor: 'pointer' }}>
              {mode === 'light' ? 'Dark' : 'Light'} Mode
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg, fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ width: '220px', background: t.sidebar, padding: '28px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingLeft: '8px' }}><SkeletonBlock width="38px" height="38px" radius="12px" /><div><SkeletonBlock width="90px" height="14px" style={{ marginBottom: '6px' }} /><SkeletonBlock width="60px" height="10px" /></div></div>
        {[1,2,3,4,5].map(i => <SkeletonBlock key={i} height="40px" style={{ marginBottom: '6px' }} />)}
      </div>
      <div style={{ flex: 1, padding: '32px 36px' }}>
        <SkeletonBlock width="200px" height="24px" style={{ marginBottom: '8px' }} /><SkeletonBlock width="140px" height="13px" style={{ marginBottom: '32px' }} />
        <SkeletonBlock height="120px" radius="24px" style={{ marginBottom: '28px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>{[1,2,3,4].map(i => <SkeletonBlock key={i} height="100px" radius="24px" />)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}><SkeletonBlock height="300px" radius="24px" /><SkeletonBlock height="300px" radius="24px" /></div>
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  )

  // ========== DATA PIPELINE ==========
  const allDatesRaw = data.map(d => d.date_iso).filter(Boolean).sort()
  const rawMaxDate = allDatesRaw.length > 0 ? new Date(allDatesRaw[allDatesRaw.length - 1] + 'T00:00:00') : new Date()
  const dateFilteredData = globalRange === 'All' ? data : (() => { const cutoff = new Date(rawMaxDate); if (globalRange === '1D') cutoff.setDate(cutoff.getDate() - 1); else if (globalRange === '1W') cutoff.setDate(cutoff.getDate() - 7); else { const m = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }; cutoff.setMonth(cutoff.getMonth() - (m[globalRange] || 1)) }; return data.filter(d => d.date_iso >= cutoff.toISOString().slice(0, 10)) })()
  const filteredData = activeAccount === 'All' ? dateFilteredData : dateFilteredData.filter(d => d._account === activeAccount)
  const out = filteredData.filter(d => d.direction === 'OUT'), inc = filteredData.filter(d => d.direction === 'IN')
  const totalOut = out.reduce((s, x) => s + x.money_out, 0), totalIn = inc.reduce((s, x) => s + x.money_in, 0), net = totalIn - totalOut
  const allDates = filteredData.map(d => d.date_iso).filter(Boolean).sort()
  const minDate = allDates.length > 0 ? new Date(allDates[0] + 'T00:00:00') : new Date(), maxDate = allDates.length > 0 ? new Date(allDates[allDates.length - 1] + 'T00:00:00') : new Date()
  const dateRangeStr = `${minDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} \u2014 ${maxDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
  const daySpan = Math.max(1, Math.round((maxDate - minDate) / 86400000) + 1)
  const uniqueMonths = [...new Set(filteredData.map(d => d.date_iso.slice(0, 7)))], monthCount = Math.max(uniqueMonths.length, 1)
  const catTotals = {}; out.forEach(x => { catTotals[x.category] = (catTotals[x.category] || 0) + x.money_out })
  const catData = Object.entries(catTotals).map(([n, v]) => ({ name: n, value: Math.round(v * 100) / 100 })).sort((a, b) => b.value - a.value)
  const mOut = {}, mIn = {}; filteredData.forEach(x => { const m = x.date_iso.slice(0, 7); if (x.direction === 'OUT') mOut[m] = (mOut[m] || 0) + x.money_out; if (x.direction === 'IN') mIn[m] = (mIn[m] || 0) + x.money_in })
  const mData = Object.keys({ ...mOut, ...mIn }).sort().map(m => ({ month: m, spending: Math.round((mOut[m] || 0) * 100) / 100, income: Math.round((mIn[m] || 0) * 100) / 100 }))
  const avgMonthlyOut = monthCount > 0 ? totalOut / monthCount : 0, avgMonthlyIn = monthCount > 0 ? totalIn / monthCount : 0
  const dTotals = {}; out.forEach(x => { dTotals[x.date_iso] = (dTotals[x.date_iso] || 0) + x.money_out })
  const dDataAll = Object.entries(dTotals).map(([d, v]) => ({ date: d.slice(5), fullDate: d, total: Math.round(v * 100) / 100 })).sort((a, b) => a.fullDate.localeCompare(b.fullDate))
  const chartRangeMonths = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, 'All': 0 }
  const dData = chartRange === 'All' ? dDataAll : (() => { const cutoff = new Date(maxDate); cutoff.setMonth(cutoff.getMonth() - chartRangeMonths[chartRange]); return dDataAll.filter(d => d.fullDate >= cutoff.toISOString().slice(0, 10)) })()
  const merchT = {}; out.forEach(x => { if (x.merchant !== '[REDACTED]') merchT[x.merchant] = (merchT[x.merchant] || 0) + x.money_out })
  const topM = Object.entries(merchT).map(([n, v]) => ({ name: n, value: Math.round(v * 100) / 100 })).sort((a, b) => b.value - a.value).slice(0, 7)

  // Merchant Intelligence
  const merchantDetails = Object.entries(merchT).map(([name, total]) => {
    const txns = out.filter(x => x.merchant === name), count = txns.length, avg = count > 0 ? total / count : 0
    const cats = [...new Set(txns.map(x => x.category))], dates = txns.map(x => x.date_iso).sort()
    const mm = {}; txns.forEach(x => { const m = x.date_iso.slice(0, 7); mm[m] = (mm[m] || 0) + x.money_out })
    const mKeys = Object.keys(mm).sort(), recent = mKeys.slice(-3), older = mKeys.slice(0, Math.max(mKeys.length - 3, 0))
    const rAvg = recent.length > 0 ? recent.reduce((s, m) => s + mm[m], 0) / recent.length : 0
    const oAvg = older.length > 0 ? older.reduce((s, m) => s + mm[m], 0) / older.length : rAvg
    return { name, total, count, avg, category: cats[0] || 'Other', firstSeen: dates[0] || '', lastSeen: dates[dates.length - 1] || '', trend: oAvg > 0 ? (rAvg - oAvg) / oAvg : 0, monthlyData: mm }
  }).sort((a, b) => b.total - a.total)

  const monthlyAvg = totalOut / monthCount
  const lifeCats = catData.filter(c => !NON_DISCRETIONARY.has(c.name)).map(c => c.name)
  const lifeSpend = catData.filter(c => lifeCats.includes(c.name)).reduce((s, c) => s + c.value, 0)
  const sortedMonths = Object.keys(mOut).sort()
  const currMonthSpend = sortedMonths.length >= 2 ? mOut[sortedMonths[sortedMonths.length - 2]] || 0 : 0
  const prevMonthSpend = sortedMonths.length >= 3 ? mOut[sortedMonths[sortedMonths.length - 3]] || 0 : currMonthSpend

  // Anomaly Detection
  const anomalies = [], catGroups = {}
  out.forEach(x => { if (!catGroups[x.category]) catGroups[x.category] = []; catGroups[x.category].push(x) })
  Object.entries(catGroups).forEach(([cat, txns]) => {
    if (txns.length < 3) { txns.forEach(x => { if (x.money_out > 100) anomalies.push({ ...x, reason: `Large one-off in ${cat}` }) }); return }
    const mean = txns.reduce((s, x) => s + x.money_out, 0) / txns.length, std = Math.sqrt(txns.reduce((s, x) => s + Math.pow(x.money_out - mean, 2), 0) / txns.length)
    txns.forEach(x => { if (x.money_out > mean + 2 * std && x.money_out > 15) anomalies.push({ ...x, reason: `${currency}${fmt(x.money_out)} vs avg ${currency}${fmt(mean)} for ${cat}` }) })
  })
  anomalies.sort((a, b) => b.money_out - a.money_out)

  // ========== SUBSCRIPTION DETECTION (FIX 3: excludes restaurants/groceries/transport/shopping) ==========
  const subscriptions = []
  const SUBSCRIPTION_EXCLUDED_CATS = new Set(['Eating Out', 'Groceries', 'Transport', 'Shopping', 'Food', 'Food Delivery', 'Coffee & Cafe', 'Other'])
  const merchByMonth = {}
  out.forEach(x => { const m = x.date_iso.slice(0, 7); const key = x.merchant; if (key === '[REDACTED]') return; if (!merchByMonth[key]) merchByMonth[key] = { months: {}, category: x.category }; if (!merchByMonth[key].months[m]) merchByMonth[key].months[m] = []; merchByMonth[key].months[m].push(x.money_out) })
  const minMonthsForSub = Math.min(3, monthCount - 1)
  Object.entries(merchByMonth).forEach(([merchant, { months: monthMap, category }]) => {
    if (SUBSCRIPTION_EXCLUDED_CATS.has(category)) return
    const monthsPresent = Object.keys(monthMap).length; if (monthsPresent < Math.max(minMonthsForSub, 2)) return
    const amounts = Object.values(monthMap).map(arr => arr.reduce((s, v) => s + v, 0))
    const avgAmt = amounts.reduce((s, v) => s + v, 0) / amounts.length; if (avgAmt > 100) return
    const allTxnAmounts = Object.values(monthMap).flat(), txnMean = allTxnAmounts.reduce((s, v) => s + v, 0) / allTxnAmounts.length
    const txnStd = Math.sqrt(allTxnAmounts.reduce((s, v) => s + Math.pow(v - txnMean, 2), 0) / allTxnAmounts.length)
    if (txnMean > 0 && txnStd / txnMean > 0.2) return
    const txnsPerMonth = Object.values(monthMap).map(arr => arr.length), avgTxnsPerMonth = txnsPerMonth.reduce((s, v) => s + v, 0) / txnsPerMonth.length
    if (avgTxnsPerMonth > 2) return
    subscriptions.push({ merchant, monthlyAvg: Math.round(avgAmt * 100) / 100, monthsPresent })
  })
  subscriptions.sort((a, b) => b.monthlyAvg - a.monthlyAvg)
  const totalSubCost = subscriptions.reduce((s, x) => s + x.monthlyAvg, 0)

  // Bill Calendar Predictions
  const subPredictions = subscriptions.map(sub => { const txns = out.filter(x => x.merchant === sub.merchant).map(x => x.date_iso).sort(); const lastDate = txns[txns.length - 1]; if (!lastDate) return null; return { merchant: sub.merchant, amount: sub.monthlyAvg, predictedDay: parseInt(lastDate.slice(8, 10)) } }).filter(Boolean)

  // Forecast
  const forecastMonths = []; for (let i = 1; i <= 3; i++) { const d = new Date(maxDate); d.setMonth(d.getMonth() + i); forecastMonths.push({ month: d.toISOString().slice(0, 7), income: Math.round(avgMonthlyIn), spending: Math.round(avgMonthlyOut + totalSubCost), type: 'forecast' }) }
  const cashFlowChart = [...mData.map(m => ({ ...m, type: 'actual' })), ...forecastMonths]

  // Health Score
  const savingsRate = totalIn > 0 ? ((totalIn - totalOut) / totalIn) : 0, savingsScore = Math.min(savingsRate / 0.2, 1) * 35
  const monthlyAmounts = Object.values(mOut), monthlyMean = monthlyAmounts.length > 0 ? monthlyAmounts.reduce((s, v) => s + v, 0) / monthlyAmounts.length : 0
  const monthlyStd = monthlyAmounts.length > 1 ? Math.sqrt(monthlyAmounts.reduce((s, v) => s + Math.pow(v - monthlyMean, 2), 0) / monthlyAmounts.length) : 0
  const cv = monthlyMean > 0 ? monthlyStd / monthlyMean : 0, consistencyScore = Math.max(0, (1 - cv) * 20)
  const monthlyIncome = totalIn / monthCount, subBurden = monthlyIncome > 0 ? totalSubCost / monthlyIncome : 0, subScore = Math.max(0, (1 - subBurden * 5) * 15)
  const anomalyRate = filteredData.length > 0 ? anomalies.length / filteredData.length : 0, anomalyScore = Math.max(0, (1 - anomalyRate * 20) * 15)
  const trendScore = (() => { if (sortedMonths.length < 4) return 7.5; const half = Math.floor(sortedMonths.length / 2); const earlyAvg = sortedMonths.slice(0, half).reduce((s, m) => s + (mOut[m] || 0), 0) / half; const lateAvg = sortedMonths.slice(half).reduce((s, m) => s + (mOut[m] || 0), 0) / (sortedMonths.length - half); const tr = earlyAvg > 0 ? lateAvg / earlyAvg : 1; if (tr <= 0.9) return 15; if (tr <= 1.1) return 10; return Math.max(0, 15 - (tr - 1.1) * 30) })()
  const rawHealthScore = Math.max(0, Math.min(100, Math.round(savingsScore + consistencyScore + subScore + anomalyScore + trendScore)))
  const lowDataHealth = monthCount < 2, healthScore = lowDataHealth ? Math.max(50, rawHealthScore) : rawHealthScore

  // Week vs Week
  const maxDateStr = allDates[allDates.length - 1] || ''
  const thisWeekStart = new Date(maxDate); thisWeekStart.setDate(thisWeekStart.getDate() - 6)
  const lastWeekStart = new Date(maxDate); lastWeekStart.setDate(lastWeekStart.getDate() - 13)
  const lastWeekEnd = new Date(maxDate); lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)
  const thisWeekSpend = out.filter(x => x.date_iso >= thisWeekStart.toISOString().slice(0, 10) && x.date_iso <= maxDateStr).reduce((s, x) => s + x.money_out, 0)
  const lastWeekSpend = out.filter(x => x.date_iso >= lastWeekStart.toISOString().slice(0, 10) && x.date_iso <= lastWeekEnd.toISOString().slice(0, 10)).reduce((s, x) => s + x.money_out, 0)
  const weekDiff = thisWeekSpend - lastWeekSpend, weekPct = lastWeekSpend > 0 ? ((weekDiff / lastWeekSpend) * 100) : 0
  const weekLabel = `${thisWeekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} \u2013 ${maxDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const recentTxns = [...filteredData].sort((a, b) => b.date_iso.localeCompare(a.date_iso)).slice(0, 5)

  const lastMonth = sortedMonths.length >= 2 ? sortedMonths[sortedMonths.length - 2] : null, prevMonth = sortedMonths.length >= 3 ? sortedMonths[sortedMonths.length - 3] : null
  const catByMonth = {}; out.forEach(x => { const m = x.date_iso.slice(0, 7); if (!catByMonth[x.category]) catByMonth[x.category] = {}; catByMonth[x.category][m] = (catByMonth[x.category][m] || 0) + x.money_out })
  const topMerchant = topM.length > 0 ? topM[0] : null, topMerchantTxns = topMerchant ? out.filter(x => x.merchant === topMerchant.name).length : 0

  // Spending Streaks
  const streaks = Object.entries(catByMonth).map(([cat, monthMap]) => {
    const budget = budgets[cat], threshold = budget || (Object.values(monthMap).reduce((s, v) => s + v, 0) / Math.max(Object.keys(monthMap).length, 1))
    let current = 0, longest = 0; sortedMonths.forEach(m => { if ((monthMap[m] || 0) <= threshold) { current++; longest = Math.max(longest, current) } else current = 0 })
    const lastVal = lastMonth ? (monthMap[lastMonth] || 0) : 0, prevVal = prevMonth ? (monthMap[prevMonth] || 0) : 0
    return { cat, current, longest, threshold, improvement: prevVal > 0 ? ((prevVal - lastVal) / prevVal) * 100 : 0, hasBudget: !!budget }
  }).filter(s => s.current >= 2 || s.longest >= 3).sort((a, b) => b.current - a.current)

  // Peer Comparison
  const peerCompData = catData.map(c => ({ name: c.name, you: Math.round((totalOut > 0 ? (c.value / totalOut) * 100 : 0) * 10) / 10, average: PEER_BENCHMARKS[c.name] || 5 })).slice(0, 8)

  // ========== SAVINGS (FIX 4: monthly/weekly instead of yearly) ==========
  const discretionaryCats = catData.filter(c => !NON_DISCRETIONARY.has(c.name)).slice(0, 6)
  const reductionFactor = savingsReduction / 100
  const savingsOpportunities = discretionaryCats.map(c => {
    const dailySpend = c.value / daySpan
    const monthlySave = dailySpend * 30 * reductionFactor
    const weeklySave = dailySpend * 7 * reductionFactor
    const tip = SAVINGS_TIPS[c.name] || 'Set a monthly budget and track it'
    return { area: c.name, monthlySave, weeklySave, tip }
  }).filter(s => s.monthlySave > 1)
  const totalMonthlySavings = Math.round(savingsOpportunities.reduce((s, x) => s + x.monthlySave, 0))

  const topDiscretionary = discretionaryCats.slice(0, 3).map(c => c.name.toLowerCase())
  const dynamicInsights = [
    { title: 'Your Spending at a Glance', text: `You spend about ${currency}${fmtShort(monthlyAvg)} a month across ${catData.length} categories. ${catData.length > 0 ? catData[0].name : 'N/A'} is your biggest area \u2014 that\u2019s where most of your money goes.`, dark: false },
    { title: 'Where You Have Control', text: `Things like ${topDiscretionary.join(', ') || 'everyday spending'} cost you around ${currency}${fmtShort(lifeSpend / monthCount)} every month. That\u2019s the spending you have the most room to adjust.`, dark: true },
    { title: topMerchant ? `About ${topMerchant.name}` : 'Top Merchant', text: topMerchant ? `${topMerchant.name} is your most-visited merchant \u2014 you\u2019ve spent ${currency}${fmtShort(topMerchant.value)} there across ${topMerchantTxns} trip${topMerchantTxns !== 1 ? 's' : ''}. Cutting back even a little could add up over time.` : 'No merchant data available yet.', dark: false },
    { title: 'Recurring Charges', text: subscriptions.length > 0 ? `You have ${subscriptions.length} recurring charge${subscriptions.length > 1 ? 's' : ''} adding up to about ${currency}${fmt(totalSubCost)} a month: ${subscriptions.map(s => `${s.merchant} (~${currency}${fmt(s.monthlyAvg)})`).join(', ')}.` : 'We didn\u2019t spot any recurring subscriptions in your data \u2014 that\u2019s a good sign!', dark: true },
    { title: 'Savings Potential', text: totalMonthlySavings > 0 ? `Small changes in your top spending areas could save you around ${currency}${fmtShort(totalMonthlySavings)} a month. Check the savings cards above for specific ideas.` : 'Keep tracking your spending to unlock savings ideas!', dark: false },
  ]

  const lc = { background: t.card, borderRadius: '24px', border: `1px solid ${t.border}`, boxShadow: t.cardShadow, padding: '24px', position: 'relative', overflow: 'hidden' }
  const dc = { ...lc, background: t.cardAlt, border: `1px solid rgba(255,255,255,0.08)` }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: t.bg, fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'background 0.4s ease' }}>

      {showWelcome && !loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: t.card, borderRadius: '24px', padding: '40px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center', position: 'relative' }}>
            <Sphere size="60px" color={t.teal} top="-15px" right="-15px" opacity={0.3} />
            <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '24px', margin: '0 auto 20px', boxShadow: `0 6px 20px ${t.tealDark}50` }}>S</div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: t.text, margin: '0 0 8px' }}>Welcome to SpendScope</h2>
            <p style={{ fontSize: '14px', color: t.textLight, margin: '0 0 24px' }}>What should we call you?</p>
            <input ref={welcomeInputRef} type="text" placeholder="Your name" defaultValue="" onKeyDown={e => { if (e.key === 'Enter') handleWelcomeSubmit() }} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '15px', outline: 'none', textAlign: 'center', marginBottom: '16px', boxSizing: 'border-box' }} />
            <button onClick={handleWelcomeSubmit} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '15px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>Get Started</button>
          </div>
        </div>
      )}

      {showProfile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) setShowProfile(false) }}>
          <div style={{ background: t.card, borderRadius: '24px', padding: '40px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', textAlign: 'center', position: 'relative' }}>
            <Sphere size="60px" color={t.teal} top="-15px" right="-15px" opacity={0.3} />
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '20px', margin: '0 auto 20px', boxShadow: `0 6px 20px ${t.tealDark}50` }}>{(userName || 'H')[0].toUpperCase()}</div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>Profile Settings</h2>
            <p style={{ fontSize: '13px', color: t.textLight, margin: '0 0 20px' }}>{authUser?.email || 'Update your profile'}</p>
            <input ref={profileInputRef} type="text" placeholder="Your name" defaultValue={userName} onKeyDown={e => { if (e.key === 'Enter') { const n = (profileInputRef.current?.value || '').trim() || 'Happy'; setUserName(n); localStorage.setItem('spendscope_name', n); if (authToken) fetch(`${API_BASE}/api/auth/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ name: n }) }).catch(console.error); setShowProfile(false) } }} style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '15px', outline: 'none', textAlign: 'center', marginBottom: '12px', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowProfile(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '14px', fontWeight: 500 }}>Cancel</button>
              <button onClick={() => { const n = (profileInputRef.current?.value || '').trim() || 'Happy'; setUserName(n); localStorage.setItem('spendscope_name', n); if (authToken) fetch(`${API_BASE}/api/auth/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ name: n }) }).catch(console.error); setShowProfile(false) }} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>Save</button>
            </div>
            <button onClick={() => { handleLogout(); setShowProfile(false) }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: `1px solid ${t.red}30`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '14px', fontWeight: 500, marginTop: '16px', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.red}08`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Log Out</button>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{ width: '220px', background: t.sidebar, padding: '28px 16px', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 10, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingLeft: '8px' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '18px', boxShadow: `0 6px 20px ${t.tealDark}50, inset 0 1px 1px rgba(255,255,255,0.2)` }}>S</div>
          <div><p style={{ color: '#F0EDE8', fontSize: '16px', fontWeight: 700, margin: 0 }}>SpendScope</p><p style={{ color: '#8FA3B0', fontSize: '10px', margin: 0, letterSpacing: '1px', textTransform: 'uppercase' }}>Intelligence</p></div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => { setPage(n.id); if (n.id === 'insights') setInsightsSeen(true) }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', background: page === n.id ? `${t.tealDark}25` : 'transparent', color: page === n.id ? t.teal : '#8FA3B0', fontWeight: page === n.id ? 600 : 400, fontSize: '14px', transition: 'all 0.2s', borderLeft: page === n.id ? `3px solid ${t.teal}` : '3px solid transparent' }}
              onMouseEnter={e => { if (page !== n.id) e.currentTarget.style.background = t.sidebarHover }} onMouseLeave={e => { if (page !== n.id) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: '16px' }}>{n.icon}</span> {n.label}
              {n.id === 'insights' && anomalies.length > 0 && !insightsSeen && <span style={{ marginLeft: 'auto', background: t.red, color: 'white', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', minWidth: '18px', textAlign: 'center' }}>{anomalies.length}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: '8px 8px 0' }}>
          <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '0 0 6px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Date Range</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {['1D', '1W', '1M', '3M', '6M', '1Y', 'All'].map(r => <button key={r} onClick={() => setGlobalRange(r)} style={{ flex: '1 1 auto', padding: '5px 0', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600, background: globalRange === r ? t.tealDark : 'rgba(255,255,255,0.05)', color: globalRange === r ? 'white' : '#8FA3B0', transition: 'all 0.2s' }}>{r}</button>)}
          </div>
        </div>
        <div style={{ padding: '8px 8px 0', marginTop: '8px' }}>
          <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '0 0 6px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Currency</p>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '12px', fontWeight: 500, cursor: 'pointer', outline: 'none', appearance: 'auto' }}>
            {CURRENCIES.map(c => <option key={c.symbol} value={c.symbol} style={{ background: '#1C2230', color: '#8FA3B0' }}>{c.label}</option>)}
          </select>
        </div>
        {accounts.length > 0 && (
          <div style={{ padding: '8px 8px 0', marginTop: '8px' }}>
            <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '0 0 6px 4px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Account</p>
            <select value={activeAccount} onChange={e => setActiveAccount(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '12px', fontWeight: 500, cursor: 'pointer', outline: 'none', appearance: 'auto' }}>
              <option value="All" style={{ background: '#1C2230', color: '#8FA3B0' }}>All Accounts</option>
              {accounts.map(a => <option key={a.id} value={a.name} style={{ background: '#1C2230', color: '#8FA3B0' }}>{a.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '12px' }}>
          <button onClick={() => setShowProfile(true)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s', marginBottom: '8px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: '12px', flexShrink: 0 }}>{(userName || 'H')[0].toUpperCase()}</div>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName || 'Happy'}</span>
          </button>
          <button onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s', marginBottom: '8px' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
            <span style={{ fontSize: '18px' }}>{mode === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F'}</span>{mode === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '12px', border: 'none', cursor: 'pointer', width: '100%', background: 'rgba(255,255,255,0.05)', color: '#8FA3B0', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,98,94,0.12)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
            <span style={{ fontSize: '16px' }}>{'\u2192'}</span>Log Out
          </button>
          <p style={{ color: '#5A6C7A', fontSize: '10px', margin: '12px 0 0 4px', letterSpacing: '0.5px' }}>Built by Riya</p>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ marginLeft: '220px', flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Sphere size="160px" color={t.teal} top="-30px" right="60px" opacity={0.4} />
        <Sphere size="100px" color={t.sand} top="250px" right="-20px" opacity={0.3} />
        <Sphere size="80px" color={t.mint} bottom="200px" left="-10px" opacity={0.3} />
        <div style={{ position: 'relative', zIndex: 1, padding: '32px 36px' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: t.text, margin: 0 }}>
              {page === 'overview' && 'Dashboard Overview'}{page === 'spending' && 'Spending Analysis'}{page === 'transactions' && 'Transaction History'}{page === 'merchants' && 'Merchant Intelligence'}{page === 'calendar' && 'Bill Calendar'}{page === 'insights' && 'SpendScope Insights'}{page === 'rules' && 'Category Rules'}{page === 'upload' && 'Upload Statement'}
            </h1>
            <p style={{ color: t.textMuted, fontSize: '13px', margin: '4px 0 0' }}>{dateRangeStr}{globalRange !== 'All' ? ` (${globalRange})` : ''}</p>
          </div>

          {/* OVERVIEW */}
          {page === 'overview' && (<>
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
          </>)}

          {/* SPENDING */}
          {page === 'spending' && (<>
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
          </>)}

          {/* MERCHANTS */}
          {page === 'merchants' && (<>
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
          </>)}

          {/* TRANSACTIONS */}
          {page === 'transactions' && (<>
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
          </>)}

          {/* CALENDAR */}
          {page === 'calendar' && (() => {
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
          })()}

          {/* INSIGHTS */}
          {page === 'insights' && (<>
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
          </>)}

          {/* RULES */}
          {page === 'rules' && (() => {
            void rulesVersion // referenced to trigger re-render on rule changes
            const learnedRules = JSON.parse(localStorage.getItem('spendscope_learned_rules') || '[]')
            const bulkRules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
            const ruleFileInputRef = { current: null }
            return (<>
              <p style={{ fontSize: '13px', color: t.textLight, margin: '-20px 0 20px' }}>Manage how transactions are categorized. Learned rules come from inline edits on the Transactions page. Bulk rules let you define custom matching patterns.</p>

              {/* Add New Bulk Rule */}
              <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Add New Rule</h3>
                <form onSubmit={e => {
                  e.preventDefault()
                  const fd = new FormData(e.target)
                  const matchType = fd.get('match_type'), matchValue = fd.get('match_value'), category = fd.get('category'), priority = parseInt(fd.get('priority')) || 0
                  if (!matchValue || !category) return
                  const rules = JSON.parse(localStorage.getItem('spendscope_bulk_rules') || '[]')
                  rules.push({ match_type: matchType, match_value: matchValue, category, priority, created_at: new Date().toISOString().slice(0, 10) })
                  localStorage.setItem('spendscope_bulk_rules', JSON.stringify(rules))
                  e.target.reset()
                  setRulesVersion(v => v + 1) // force re-render
                }} style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Match Type</label>
                    <select name="match_type" defaultValue="contains" style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                      <option value="contains">Contains</option>
                      <option value="starts_with">Starts With</option>
                      <option value="exact">Exact Match</option>
                      <option value="regex">Regex</option>
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Match Value</label>
                    <input name="match_value" type="text" placeholder="e.g., starbucks" required style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Category</label>
                    <select name="category" defaultValue="Other" style={{ padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                      {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: t.textMuted, display: 'block', marginBottom: '4px' }}>Priority</label>
                    <input name="priority" type="number" defaultValue={0} style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <button type="submit" style={{ padding: '8px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30` }}>Add Rule</button>
                </form>
              </div>

              {/* Learned Rules */}
              <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: 0 }}>Learned Rules <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({learnedRules.length})</span></h3>
                  {learnedRules.length > 0 && <button onClick={() => { localStorage.setItem('spendscope_learned_rules', '[]'); setRulesVersion(v => v + 1) }} style={{ padding: '5px 14px', borderRadius: '8px', border: `1px solid ${t.red}40`, cursor: 'pointer', background: `${t.red}08`, color: t.red, fontSize: '11px', fontWeight: 600 }}>Clear All Learned</button>}
                </div>
                {learnedRules.length === 0 ? <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>No learned rules yet. Edit a category on the Transactions page to create one.</p> : (
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
                        }} style={{ padding: '3px 10px', borderRadius: '6px', border: `1px solid ${t.red}30`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '11px', fontWeight: 600 }}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bulk Rules */}
              <div style={{ ...lc, marginBottom: '24px', padding: '20px 24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Bulk Rules <span style={{ fontSize: '12px', fontWeight: 400, color: t.textMuted }}>({bulkRules.length})</span></h3>
                {bulkRules.length === 0 ? <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>No bulk rules yet. Use the form above to create custom matching rules.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', padding: '6px 12px', fontSize: '10px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span style={{ flex: 1 }}>Match Type</span><span style={{ flex: 2 }}>Match Value</span><span style={{ flex: 1 }}>Category</span><span style={{ width: '60px', textAlign: 'center' }}>Priority</span><span style={{ width: '60px' }}></span>
                    </div>
                    {bulkRules.map((rule, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderRadius: '10px', borderBottom: `1px solid ${t.border}40`, transition: 'background 0.15s' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}06`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ flex: 1, fontSize: '12px', color: t.textLight, fontStyle: 'italic' }}>{rule.match_type}</span>
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

              {/* Actions */}
              <div style={{ ...lc, padding: '20px 24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: t.text, margin: '0 0 14px' }}>Actions</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button onClick={() => {
                    setData(prev => prev.map(tx => ({ ...tx, category: categorizeWithRules(tx.merchant || tx.description || '') })))
                    setUploadStatus({ type: 'success', message: `Re-categorized ${data.length} transactions using current rules.` })
                    setTimeout(() => setUploadStatus(null), 3000)
                  }} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 12px ${t.tealDark}30` }}>Apply Rules to All Transactions</button>
                  <button onClick={() => {
                    const exportData = { learned_rules: learnedRules, bulk_rules: bulkRules, exported_at: new Date().toISOString() }
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = `spendscope_rules_${new Date().toISOString().slice(0, 10)}.json`; a.click()
                    URL.revokeObjectURL(url)
                  }} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '13px', fontWeight: 600 }}>Export Rules</button>
                  <button onClick={() => ruleFileInputRef.current?.click()} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.teal}40`, cursor: 'pointer', background: 'transparent', color: t.teal, fontSize: '13px', fontWeight: 600 }}>Import Rules</button>
                  <input ref={el => ruleFileInputRef.current = el} type="file" accept=".json" style={{ display: 'none' }} onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return
                    const reader = new FileReader()
                    reader.onload = ev => {
                      try {
                        const imported = JSON.parse(ev.target.result)
                        if (imported.learned_rules) localStorage.setItem('spendscope_learned_rules', JSON.stringify(imported.learned_rules))
                        if (imported.bulk_rules) localStorage.setItem('spendscope_bulk_rules', JSON.stringify(imported.bulk_rules))
                        setUploadStatus({ type: 'success', message: `Imported ${(imported.learned_rules || []).length} learned rules and ${(imported.bulk_rules || []).length} bulk rules.` })
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
          })()}

          {/* UPLOAD */}
          {page === 'upload' && (<>

            {/* ===== COLUMN MAPPER VIEW ===== */}
            {showColumnMapper && !pendingImport && (<>
              <div style={{ ...lc, marginBottom: '16px', padding: '20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: t.text, margin: '0 0 4px' }}>Map Your Columns</h2>
                    <p style={{ fontSize: '13px', color: t.textMuted, margin: 0 }}>We could not auto-detect your CSV columns. Please map them manually.</p>
                  </div>
                  <button onClick={() => { setShowColumnMapper(null); setUploadStatus(null) }} style={{ padding: '6px 16px', borderRadius: '10px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 500 }}>Cancel</button>
                </div>

                {/* Preview table */}
                <div style={{ overflowX: 'auto', marginBottom: '20px', borderRadius: '12px', border: `1px solid ${t.border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: `${t.teal}10` }}>
                        {showColumnMapper.headers.map((h, i) => <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {(showColumnMapper.previewRows || []).slice(0, 5).map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: `1px solid ${t.border}` }}>
                          {showColumnMapper.headers.map((h, ci) => <td key={ci} style={{ padding: '8px 12px', color: t.textLight, whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h] || ''}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mapping dropdowns */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  {[
                    { key: 'date', label: 'Date Column', required: true },
                    { key: 'description', label: 'Description / Merchant Column', required: true },
                    { key: 'amount', label: 'Amount Column (single)', required: false },
                    { key: 'amountIn', label: 'Money In Column', required: false },
                    { key: 'amountOut', label: 'Money Out Column', required: false },
                    { key: 'balance', label: 'Balance Column', required: false },
                  ].map(({ key, label, required }) => (
                    <div key={key}>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: t.text, display: 'block', marginBottom: '4px' }}>{label}{required && <span style={{ color: t.red }}> *</span>}</label>
                      <select value={columnMapping[key]} onChange={e => setColumnMapping(prev => ({ ...prev, [key]: e.target.value }))} style={{ width: '100%', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                        <option value="">-- Select --</option>
                        {showColumnMapper.headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                {/* Date format selector */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: t.text, display: 'block', marginBottom: '4px' }}>Date Format</label>
                  <select value={columnDateFormat} onChange={e => setColumnDateFormat(e.target.value)} style={{ width: '240px', padding: '8px 12px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', cursor: 'pointer' }}>
                    <option value="auto">Auto-detect</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD-MM-YYYY">DD-MM-YYYY</option>
                    <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                    <option value="DD.MM.YYYY">DD.MM.YYYY</option>
                  </select>
                </div>

                {/* Save as template */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '12px 16px', borderRadius: '12px', background: `${t.teal}06`, border: `1px solid ${t.border}` }}>
                  <input type="checkbox" checked={mapperSaveTemplate} onChange={e => setMapperSaveTemplate(e.target.checked)} style={{ accentColor: t.teal, width: '16px', height: '16px', cursor: 'pointer' }} />
                  <label style={{ fontSize: '13px', color: t.text, cursor: 'pointer' }} onClick={() => setMapperSaveTemplate(!mapperSaveTemplate)}>Save as template for this bank</label>
                  {mapperSaveTemplate && <input type="text" placeholder="Bank name" value={mapperBankName} onChange={e => setMapperBankName(e.target.value)} style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none', width: '180px' }} />}
                </div>

                {/* Submit */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={handleColumnMapperSubmit} disabled={!columnMapping.date || !columnMapping.description || (!columnMapping.amount && !columnMapping.amountIn)} style={{ padding: '12px 32px', borderRadius: '14px', border: 'none', cursor: (!columnMapping.date || !columnMapping.description || (!columnMapping.amount && !columnMapping.amountIn)) ? 'not-allowed' : 'pointer', background: (!columnMapping.date || !columnMapping.description || (!columnMapping.amount && !columnMapping.amountIn)) ? t.textMuted : `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, opacity: (!columnMapping.date || !columnMapping.description || (!columnMapping.amount && !columnMapping.amountIn)) ? 0.5 : 1, boxShadow: `0 4px 16px ${t.tealDark}30`, transition: 'all 0.2s' }}>Parse with this Mapping</button>
                </div>
              </div>

              {uploadStatus && uploadStatus.type !== 'loading' && <div style={{ ...lc, marginTop: '16px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', border: `1px solid ${uploadStatus.type === 'success' ? t.green : t.red}20`, background: uploadStatus.type === 'success' ? `${t.green}08` : `${t.red}08` }}><span style={{ fontSize: '20px' }}>{uploadStatus.type === 'success' ? '\u2705' : '\u274C'}</span><p style={{ fontSize: '14px', color: t.text, margin: 0, fontWeight: 500 }}>{uploadStatus.message}</p></div>}
            </>)}

            {/* ===== IMPORT CONFIRMATION VIEW ===== */}
            {pendingImport && (<>
              <div style={{ ...lc, marginBottom: '16px', padding: '20px 24px' }}>
                {/* Header info */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: t.text, margin: '0 0 6px' }}>Review Import</h2>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      {pendingImport.bankName && <span style={{ fontSize: '12px', color: t.textMuted, background: `${t.teal}12`, padding: '3px 10px', borderRadius: '6px', fontWeight: 500 }}>Bank: {pendingImport.bankName}</span>}
                      <span style={{ fontSize: '12px', color: t.textMuted, background: `${t.sand}15`, padding: '3px 10px', borderRadius: '6px', fontWeight: 500 }}>File: {pendingImport.filename}</span>
                      <span style={{ fontSize: '12px', color: t.textMuted, background: `${t.teal}12`, padding: '3px 10px', borderRadius: '6px', fontWeight: 500 }}>{pendingImport.transactions.length} transaction{pendingImport.transactions.length !== 1 ? 's' : ''}</span>
                      {pendingImport.transactions.some(tx => tx.is_redacted) && <span style={{ fontSize: '12px', color: '#B8860B', background: 'rgba(184,134,11,0.12)', padding: '3px 10px', borderRadius: '6px', fontWeight: 600 }}>Contains redacted entries</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={handleCancelImport} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 600, transition: 'all 0.2s' }}>Cancel</button>
                    <button onClick={handleConfirmImport} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40`, transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>Confirm Import ({pendingImport.transactions.length - importSelectedRows.size})</button>
                  </div>
                </div>

                {/* Bulk actions bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '8px 12px', borderRadius: '10px', background: `${t.bg}` }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.textLight, cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={pendingImport.transactions.length > 0 && importSelectedRows.size === pendingImport.transactions.length} onChange={toggleAllImportRows} style={{ accentColor: t.teal, width: '14px', height: '14px', cursor: 'pointer' }} />
                    Select All
                  </label>
                  {importSelectedRows.size > 0 && (<>
                    <span style={{ fontSize: '12px', color: t.textMuted }}>{importSelectedRows.size} selected</span>
                    <button onClick={deleteSelectedImportRows} style={{ padding: '4px 12px', borderRadius: '8px', border: `1px solid ${t.red}40`, cursor: 'pointer', background: `${t.red}10`, color: t.red, fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}>Delete Selected</button>
                  </>)}
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: t.textMuted }}>Click a category or merchant to edit</span>
                </div>

                {/* Transaction table */}
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: `1px solid ${t.border}`, maxHeight: '500px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                      <tr style={{ background: `${t.teal}10` }}>
                        <th style={{ padding: '10px 8px', width: '36px', borderBottom: `1px solid ${t.border}` }}></th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap', minWidth: '180px' }}>Merchant / Description</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap', minWidth: '140px' }}>Category</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>Amount</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>Direction</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: t.text, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingImport.transactions.map((tx, idx) => {
                        const isRedacted = tx.is_redacted
                        const isSelected = importSelectedRows.has(idx)
                        const rowBg = isRedacted ? 'rgba(184,134,11,0.08)' : isSelected ? `${t.red}08` : idx % 2 === 0 ? 'transparent' : `${t.bg}40`
                        const amt = tx.direction === 'IN' ? tx.money_in : tx.money_out
                        return (
                          <tr key={idx} style={{ background: rowBg, borderBottom: `1px solid ${t.border}`, transition: 'background 0.15s' }}>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleImportRow(idx)} style={{ accentColor: t.teal, width: '14px', height: '14px', cursor: 'pointer' }} />
                            </td>
                            <td style={{ padding: '8px 12px', color: t.textLight, whiteSpace: 'nowrap', fontSize: '12px' }}>{tx.date_iso}</td>

                            {/* Editable merchant */}
                            <td style={{ padding: '4px 12px' }}>
                              {editingCell?.rowIdx === idx && editingCell?.field === 'merchant' ? (
                                <input type="text" autoFocus value={tx.merchant || tx.description || ''} onChange={e => { updatePendingTransaction(idx, 'merchant', e.target.value); updatePendingTransaction(idx, 'description', e.target.value) }} onBlur={() => setEditingCell(null)} onKeyDown={e => { if (e.key === 'Enter') setEditingCell(null) }} style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.teal}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none' }} />
                              ) : (
                                <span onClick={() => setEditingCell({ rowIdx: idx, field: 'merchant' })} style={{ cursor: 'pointer', display: 'block', padding: '4px 8px', borderRadius: '6px', transition: 'background 0.15s', color: t.text, fontSize: '12px' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}10`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{tx.merchant || tx.description || 'Unknown'}</span>
                              )}
                            </td>

                            {/* Editable category */}
                            <td style={{ padding: '4px 12px' }}>
                              {editingCell?.rowIdx === idx && editingCell?.field === 'category' ? (
                                <select autoFocus value={tx.category || 'Other'} onChange={e => { updatePendingTransaction(idx, 'category', e.target.value); setEditingCell(null) }} onBlur={() => setEditingCell(null)} style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.teal}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none', cursor: 'pointer' }}>
                                  {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                              ) : (
                                <span onClick={() => setEditingCell({ rowIdx: idx, field: 'category' })} style={{ cursor: 'pointer', display: 'inline-block', padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: (CAT_COLORS[tx.category] || '#9AABBA') + '18', color: CAT_COLORS[tx.category] || t.textLight, transition: 'all 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '0.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>{tx.category || 'Other'}</span>
                              )}
                            </td>

                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: tx.direction === 'IN' ? t.green : t.text, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                              {tx.direction === 'IN' ? '+' : '-'}{currency}{fmt(amt)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: tx.direction === 'IN' ? `${t.green}15` : `${t.red}12`, color: tx.direction === 'IN' ? t.green : t.red }}>{tx.direction}</span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              {isRedacted && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(184,134,11,0.15)', color: '#B8860B' }}>Redacted</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom action bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${t.border}` }}>
                  <div style={{ fontSize: '13px', color: t.textMuted }}>
                    {pendingImport.transactions.length - importSelectedRows.size} of {pendingImport.transactions.length} transactions will be imported
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleCancelImport} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 600 }}>Cancel</button>
                    <button onClick={handleConfirmImport} style={{ padding: '10px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>Confirm Import</button>
                  </div>
                </div>
              </div>
            </>)}

            {/* ===== DEFAULT UPLOAD VIEW (drag-and-drop) ===== */}
            {!pendingImport && !showColumnMapper && (<>
              <div style={{ ...lc, padding: '16px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}><label style={{ fontSize: '13px', fontWeight: 500, color: t.text, whiteSpace: 'nowrap' }}>Account Name:</label><input type="text" placeholder="e.g., Checking, Credit Card" value={uploadAccountName} onChange={e => setUploadAccountName(e.target.value)} style={{ flex: 1, padding: '8px 14px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none' }} onFocus={e => e.target.style.borderColor = t.teal} onBlur={e => e.target.style.borderColor = t.border} /><span style={{ fontSize: '11px', color: t.textMuted }}>Optional</span></div>
              <input ref={fileInputRef} type="file" accept=".csv,.pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = '' }} />
              <div style={{ ...lc, padding: '60px 40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s', border: dragOver ? `2px dashed ${t.teal}` : `2px dashed ${t.textMuted}40`, background: dragOver ? `${t.teal}08` : t.card }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file) }} onClick={() => fileInputRef.current?.click()}>
                <Sphere size="80px" color={t.teal} top="20px" right="40px" opacity={0.2} /><Sphere size="50px" color={t.sand} bottom="20px" left="60px" opacity={0.15} />
                {uploadStatus?.type === 'loading' ? (<div style={{ position: 'relative', zIndex: 1 }}><div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `3px solid ${t.border}`, borderTopColor: t.tealDark, animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} /><p style={{ fontSize: '16px', fontWeight: 600, color: t.text }}>{uploadStatus.message}</p><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>) : (<>
                  <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.6, position: 'relative', zIndex: 1 }}>{'\uD83D\uDCC4'}</div>
                  <h2 style={{ fontSize: '20px', fontWeight: 600, color: t.text, margin: '0 0 8px', position: 'relative', zIndex: 1 }}>Drop your bank statement here</h2>
                  <p style={{ fontSize: '14px', color: t.textLight, margin: '0 0 8px', position: 'relative', zIndex: 1 }}>Supports CSV and PDF files {'\u2014'} columns are auto-detected</p>
                  <p style={{ fontSize: '12px', color: t.textMuted, margin: 0, position: 'relative', zIndex: 1 }}>Your data is processed locally {'\u2014'} nothing leaves your browser</p>
                </>)}
              </div>
              {uploadStatus && uploadStatus.type !== 'loading' && <div style={{ ...lc, marginTop: '16px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', border: `1px solid ${uploadStatus.type === 'success' ? t.green : t.red}20`, background: uploadStatus.type === 'success' ? `${t.green}08` : `${t.red}08` }}><span style={{ fontSize: '20px' }}>{uploadStatus.type === 'success' ? '\u2705' : '\u274C'}</span><p style={{ fontSize: '14px', color: t.text, margin: 0, fontWeight: 500 }}>{uploadStatus.message}</p></div>}
              <div style={{ textAlign: 'center', marginTop: '24px' }}><button onClick={() => setPage('overview')} style={{ padding: '12px 32px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40`, transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>Try Demo Data Instead</button></div>
            </>)}
          </>)}
        </div>
      </div>
    </div>
  )
}

export default App