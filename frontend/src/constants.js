export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

// ========== THEMES ==========
export const themes = {
  light: {
    bg: '#f0f2f5', sidebar: '#ffffff', sidebarHover: '#f8fafc',
    card: 'rgba(255,255,255,0.85)', cardAlt: '#1e293b', cardAltText: '#ffffff',
    text: '#0f172a', textLight: '#475569', textMuted: '#94a3b8',
    teal: '#06b6d4', tealDark: '#3b82f6', tealDeep: '#1e40af', mint: '#a7f3d0',
    sand: '#f59e0b', sandLight: '#fef3c7', beige: '#fde68a',
    green: '#10b981', red: '#f43f5e', border: 'rgba(0,0,0,0.08)',
    cardShadow: '0 4px 20px rgba(0,0,0,0.06)',
    sphere1: 'rgba(59,130,246,0.1)', sphere2: 'rgba(139,92,246,0.08)',
    accentPurple: '#8b5cf6', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  },
  dark: {
    bg: '#0a0e1a', sidebar: '#0d1117', sidebarHover: 'rgba(255,255,255,0.05)',
    card: 'rgba(255,255,255,0.05)', cardAlt: 'rgba(255,255,255,0.08)', cardAltText: '#ffffff',
    text: '#ffffff', textLight: '#94a3b8', textMuted: '#475569',
    teal: '#06b6d4', tealDark: '#3b82f6', tealDeep: '#1e40af', mint: '#a7f3d0',
    sand: '#f59e0b', sandLight: '#92400e', beige: '#fde68a',
    green: '#10b981', red: '#f43f5e', border: 'rgba(255,255,255,0.08)',
    cardShadow: '0 8px 32px rgba(0,0,0,0.3)',
    sphere1: 'rgba(59,130,246,0.08)', sphere2: 'rgba(139,92,246,0.05)',
    accentPurple: '#8b5cf6', gradient: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
  }
}

export const COLORS = ['#3b82f6','#06b6d4','#8b5cf6','#f43f5e','#10b981','#f59e0b','#ec4899','#14b8a6','#a78bfa','#fb923c','#22d3ee','#4ade80']
export const CAT_COLORS = {
  'Transport': '#3b82f6', 'Groceries': '#06b6d4', 'Grocery': '#06b6d4',
  'Eating Out': '#10b981', 'Rent': '#f59e0b', 'Shopping': '#ec4899',
  'Transfers': '#8b5cf6', 'Professional': '#14b8a6', 'Bills': '#fb923c',
  'Food Delivery': '#f43f5e', 'Food': '#f43f5e', 'Subscriptions': '#a78bfa',
  'Bank Fees': '#f43f5e', 'Cash': '#22d3ee', 'Coffee & Cafe': '#f59e0b',
  'Income': '#10b981', 'Other': '#94a3b8', 'Fitness': '#22d3ee',
  'Housing': '#f59e0b', 'Travel': '#8b5cf6', 'Education': '#06b6d4',
  'Utilities': '#fb923c', 'Savings': '#10b981', 'Entertainment': '#a78bfa',
  'Electronics': '#ec4899', 'Healthcare': '#f43f5e', 'Clothing': '#4ade80',
  'Credit': '#14b8a6', 'Debit': '#94a3b8',
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

// No hardcoded merchant rules. All categorization is done by AI via /api/categorize-ai.
export const MERCHANT_CATEGORIES = []

export const categorizeByMerchant = () => 'Other'

// All categorization is AI-powered. This is a no-op placeholder for backward compatibility.
export const categorizeWithRules = () => 'Other'

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
  { id: 'coach', icon: '\uD83E\uDDE0', label: 'Coach' },
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
