export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// ========== THEMES ==========
export const themes = {
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

export const COLORS = ['#2A9D8F','#C9A96E','#4DB6AC','#D4625E','#7C6BC4','#A8E6CF','#E6B566','#D4829D','#5DADE2','#45B39D','#AF7AC5','#F0B27A']
export const CAT_COLORS = {
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

export const CURRENCIES = [
  { symbol: '\u00A3', label: 'GBP (\u00A3)' },
  { symbol: '$', label: 'USD ($)' },
  { symbol: '\u20AC', label: 'EUR (\u20AC)' },
  { symbol: '\u20B9', label: 'INR (\u20B9)' },
  { symbol: '\u00A5', label: 'JPY (\u00A5)' },
  { symbol: 'A$', label: 'AUD (A$)' },
  { symbol: 'C$', label: 'CAD (C$)' },
]

export const NON_DISCRETIONARY = new Set(['Rent', 'Bills', 'Transfers', 'Income', 'Salary', 'Mortgage', 'Insurance', 'Tax', 'Taxes', 'Utilities'])

export const COUNTRIES = [
  'United States', 'United Kingdom', 'India', 'Georgia', 'Canada', 'Australia',
  'Germany', 'France', 'Japan', 'China', 'Brazil', 'Mexico', 'Spain', 'Italy',
  'Netherlands', 'Sweden', 'Switzerland', 'Singapore', 'South Korea', 'Other'
]

export const SAVINGS_TIPS = {
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

export const MERCHANT_CATEGORIES = [
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

export const categorizeByMerchant = (merchantName) => {
  const lower = (merchantName || '').toLowerCase()
  for (const [cat, keywords] of MERCHANT_CATEGORIES) {
    if (keywords.some(kw => lower.includes(kw))) return cat
  }
  return 'Other'
}

export const categorizeWithRules = (merchant) => {
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

export const PEER_BENCHMARKS = {
  'Housing': 30, 'Rent': 30, 'Groceries': 12, 'Grocery': 12, 'Transport': 10,
  'Eating Out': 5, 'Food': 8, 'Entertainment': 5, 'Shopping': 5, 'Subscriptions': 3,
  'Utilities': 5, 'Healthcare': 8, 'Education': 3, 'Clothing': 3, 'Fitness': 3,
  'Travel': 4, 'Electronics': 3, 'Food Delivery': 4, 'Other': 5,
}

// ========== NUMBER FORMATTERS ==========
export const fmt = (num, decimals = 2) => Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
export const fmtShort = (num) => {
  const abs = Math.abs(num)
  if (abs >= 1_000_000) return (abs / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M'
  if (abs >= 1_000) return (abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.?0+$/, '') + 'K'
  return fmt(abs, 0)
}
// ========== NAV ITEMS ==========
export const NAV = [
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
export const detectColumns = (headers) => {
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

export const parseFlexDate = (raw) => {
  if (!raw) return ''
  let m = raw.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
  m = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  return raw.slice(0, 10)
}
