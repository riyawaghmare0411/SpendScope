import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'
import jsPDF from 'jspdf'

import { API_BASE, themes, COLORS, CAT_COLORS, CURRENCIES, NON_DISCRETIONARY, COUNTRIES, SAVINGS_TIPS, MERCHANT_CATEGORIES, categorizeWithRules, PEER_BENCHMARKS, fmt, fmtShort, NAV, detectColumns, parseFlexDate } from './constants'
import { encryptFields, decryptFields, verifyRoundTrip, ENCRYPTED_FIELDS } from './lib/crypto.js'
import { unlockWithPassword, storeDek, getDek, clearDek } from './lib/keyManager.js'
import { Sphere, Counter, SkeletonBlock, HealthRing, VelocityGauge, Tip, PieTip } from './components/ui'
import { AuthPages } from './components/AuthPages'
import { DashboardPage } from './components/DashboardPage'
import { SpendingPage } from './components/SpendingPage'
import { MerchantsPage } from './components/MerchantsPage'
import { TransactionsPage } from './components/TransactionsPage'
import { CalendarPage } from './components/CalendarPage'
import { InsightsPage } from './components/InsightsPage'
import { CoachPage } from './components/CoachPage'
import RulesPage from './components/RulesPage'
import UploadPage from './components/UploadPage'
import Sidebar from './components/Sidebar'
import ProfileModal from './components/ProfileModal'
import EncryptionSettings from './components/EncryptionSettings'

// ========== MAIN APP ==========
function App() {
  const [data, setData] = useState([]), [loading, setLoading] = useState(true), [page, setPage] = useState('overview'), [mode, setMode] = useState('dark')
  const [searchTerm, setSearchTerm] = useState(''), [filterCat, setFilterCat] = useState('All'), [dragOver, setDragOver] = useState(false), [insightsSeen, setInsightsSeen] = useState(false)
  const [userName, setUserName] = useState(() => localStorage.getItem('spendscope_name') || ''), [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('spendscope_name'))
  const [currency, setCurrency] = useState('$'), [chartRange, setChartRange] = useState('All'), [globalRange, setGlobalRange] = useState('All')
  const [uploadStatus, setUploadStatus] = useState(null), [savingsReduction, setSavingsReduction] = useState(25), [showProfile, setShowProfile] = useState(false), [showEncryption, setShowEncryption] = useState(false)
  const [budgets, setBudgets] = useState(() => JSON.parse(localStorage.getItem('spendscope_budgets') || '{}')), [editingBudget, setEditingBudget] = useState(null), [budgetInputVal, setBudgetInputVal] = useState('')
  const [accounts, setAccounts] = useState(() => JSON.parse(localStorage.getItem('spendscope_accounts') || '[]')), [activeAccount, setActiveAccount] = useState('All'), [uploadAccountName, setUploadAccountName] = useState('')
  const [expandedMerchant, setExpandedMerchant] = useState(null), [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7))
  // Phase 17: multi-file upload. Each pending import is one file's parsed transactions.
  // Single-file upload is just an array of length 1. Each entry tracks its own selectedRows + editingCell.
  // Shape: { id, transactions, bankName, filename, accountName, selectedRows: Set<number>, editingCell: {rowIdx, field}|null, error?: string }
  const [pendingImports, setPendingImports] = useState([])
  // Legacy single-import shim (used by some downstream code that expects a single object). Keep as a
  // computed alias for the first entry until those call sites are migrated.
  const pendingImport = pendingImports.length > 0 ? pendingImports[0] : null
  const setPendingImport = (val) => {
    if (val == null) setPendingImports([])
    else setPendingImports([{ id: val.id || `legacy-${Date.now()}`, accountName: val.bankName || 'Primary', selectedRows: val.selectedRows || new Set(), editingCell: null, ...val }])
  }
  const [showColumnMapper, setShowColumnMapper] = useState(null)
  const [editingTxnCat, setEditingTxnCat] = useState(null)
  const [flashedTxnIdx, setFlashedTxnIdx] = useState(null)
  const [rulesVersion, setRulesVersion] = useState(0)
  const [columnMapping, setColumnMapping] = useState({ date: '', description: '', amount: '', amountIn: '', amountOut: '', balance: '' })
  const [columnDateFormat, setColumnDateFormat] = useState('auto')
  const [mapperBankName, setMapperBankName] = useState('')
  const [mapperSaveTemplate, setMapperSaveTemplate] = useState(false)
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('spendscope_token'))
  const [authUser, setAuthUser] = useState(() => { const saved = localStorage.getItem('spendscope_user'); return saved ? JSON.parse(saved) : null })
  const [authPage, setAuthPage] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [encryptionKey, setEncryptionKey] = useState(null)
  const [decryptError, setDecryptError] = useState(null)
  // E-9: separate from decryptError (which refreshTransactions overwrites on every call --
  // see below) so a login-unlock failure stays visible instead of being wiped the moment
  // the post-login refreshTransactions() effect runs.
  const [unlockError, setUnlockError] = useState(null)
  const fileInputRef = useRef(null), welcomeInputRef = useRef(null), profileInputRef = useRef(null)
  const t = themes[mode]

  const authHeaders = () => authToken ? { 'Authorization': `Bearer ${authToken}` } : {}

  const handleLogin = async (email, password) => {
    setAuthLoading(true); setAuthError(''); setDecryptError(null); setUnlockError(null)
    try {
      const r = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || 'Login failed')
      // E2: unlock the DEK as part of login. A failed unlock must NOT block login --
      // that would lock the user out of their entire account over a key problem. Instead
      // login proceeds and the failure surfaces as a loud, persistent decryptError banner.
      let dek = null
      let unlockErrMsg = null
      if (data.user.encryption_salt && data.user.wrapped_dek) {
        try {
          const envelope = typeof data.user.wrapped_dek === 'string' ? JSON.parse(data.user.wrapped_dek) : data.user.wrapped_dek
          if (!envelope || typeof envelope !== 'object' || !envelope.password || !envelope.password.iv || !envelope.password.ct) {
            throw new Error('stored encryption envelope is malformed (missing password slot)')
          }
          dek = await unlockWithPassword(password, data.user.encryption_salt, envelope.password)
          await storeDek(dek)
        } catch (e) {
          unlockErrMsg = `Could not unlock your encrypted data: ${e.message || 'invalid password or corrupted key data'}. Your data is safe -- log out and back in, or recover with a code from Encryption settings, to unlock it.`
        }
      }
      localStorage.setItem('spendscope_token', data.access_token)
      localStorage.setItem('spendscope_user', JSON.stringify(data.user))
      setAuthToken(data.access_token)
      setAuthUser(data.user)
      setUserName(data.user.name)
      setCurrency(data.user.currency === 'USD' ? '$' : data.user.currency === 'GBP' ? '\u00A3' : data.user.currency === 'EUR' ? '\u20AC' : data.user.currency === 'INR' ? '\u20B9' : '$')
      if (dek) setEncryptionKey(dek)
      if (unlockErrMsg) setUnlockError(unlockErrMsg)
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
    clearDek()
    setEncryptionKey(null)
    setDecryptError(null)
    setUnlockError(null)
    setAuthToken(null)
    setAuthUser(null)
    setData([])
    // Fix round: a batch that partially failed (e.g. token expired mid-loop, HTTP 401)
    // must not survive logout/login -- otherwise "Import all" after re-login re-POSTs
    // the files that had already succeeded before the 401 (see handleConfirmImport).
    setPendingImports([])
  }

  // Phase 10A: clear local state after a server-side wipe.
  // Auth token + user row stay -- only data/accounts/budgets/cache get nuked.
  const handleWipeData = () => {
    setData([])
    setAccounts([])
    setActiveAccount('All')
    setBudgets({})
    localStorage.removeItem('spendscope_accounts')
    localStorage.removeItem('spendscope_budgets')
    setPage('upload')
  }

  const refreshTransactions = async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/api/transactions`, { headers: authHeaders() })
      const j = await r.json()
      if (Array.isArray(j)) {
        const dek = await getDek()
        // E5: decide per row -- a row with encrypted_data gets decrypted, a row without
        // (e.g. a future Plaid row) passes through untouched. Never silently swallow a
        // decrypt failure into a blank placeholder row.
        let failCount = 0
        const processed = []
        for (const row of j) {
          if (!row.encrypted_data) { processed.push(row); continue }
          if (!dek) { failCount++; processed.push({ ...row, merchant: '(locked)', description: '(locked)' }); continue }
          try {
            const blob = typeof row.encrypted_data === 'string' ? JSON.parse(row.encrypted_data) : row.encrypted_data
            const fields = await decryptFields(dek, blob)
            processed.push({ ...row, ...fields })
          } catch {
            failCount++
            processed.push({ ...row, merchant: '(decrypt failed)', description: '(decrypt failed)' })
          }
        }
        setDecryptError(failCount > 0 ? `${failCount} transaction${failCount !== 1 ? 's' : ''} could not be decrypted. Log out and log back in to unlock them.` : null)
        setData(processed.map(d => ({ ...d, _account: d._account || 'Primary', account_id: d.account_id || null })))
      }
    } catch (e) { console.error('Failed to load transactions:', e); setDecryptError(`Failed to load transactions: ${e.message}`) }
  }

  // Phase 10D: hydrate accounts from server (single source of truth -- replaces localStorage)
  const refreshAccounts = async () => {
    if (!authToken) return
    try {
      const r = await fetch(`${API_BASE}/api/accounts`, { headers: authHeaders() })
      if (!r.ok) return
      const j = await r.json()
      if (Array.isArray(j)) setAccounts(j)
    } catch (e) { console.error('Failed to load accounts:', e) }
  }

  useEffect(() => { if (!authToken) { setLoading(false); return }; Promise.all([refreshTransactions(), refreshAccounts()]).finally(() => setLoading(false)) }, [authToken])
  // Blocker 4a: encryptionKey only ever gets set inside handleLogin -- on a page refresh
  // (token still in localStorage) it resets to null even though the DEK may still be
  // cached in sessionStorage (storeDek persists across refresh, only tab-close clears it).
  // Rehydrate it here so a refresh doesn't silently look "unlocked" while actually locked.
  useEffect(() => { if (!authToken || encryptionKey) return; getDek().then(dek => { if (dek) setEncryptionKey(dek) }) }, [authToken, encryptionKey])
  // E-9: unlockError is only ever set inside handleLogin on a failed unlock, but the DEK can
  // become available later without going through handleLogin/handleLogout -- a successful
  // recovery-code unlock via EncryptionSettings, or the rehydrate effect above finding a
  // cached DEK. Clear the stale banner the moment encryptionKey actually becomes non-null.
  useEffect(() => { if (encryptionKey) setUnlockError(null) }, [encryptionKey])
  // Blocker 4b: authUser was persisted to localStorage ONLY in handleLogin/handleSignup, but
  // setAuthUser is also called by EncryptionSettings (on enable) and ProfileModal. Without this,
  // enabling encryption updated React state only -- a second tab (or a browser restart) rebuilt
  // authUser from stale localStorage with no wrapped_dek, the import guard read false, and
  // merchant/description were uploaded in CLEARTEXT with no error. Persist every update here so
  // there is one source of truth rather than one write site per caller.
  useEffect(() => { if (authUser) localStorage.setItem('spendscope_user', JSON.stringify(authUser)) }, [authUser])
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

  // Phase 14A: derive ALL_CATEGORIES from CAT_COLORS (single source of truth) so every
  // category the categorizer can produce (Eating Out, Groceries, Transport, etc.) is
  // selectable in the edit modal + Rules page. Add Salary as an Income synonym + Insurance
  // for Plaid mapping coverage.
  const ALL_CATEGORIES = [...new Set([...Object.keys(CAT_COLORS), 'Salary', 'Insurance'])].sort()

  // AI-categorize any "Other" merchants, then set pending import
  // Phase 17: now returns the categorized transactions instead of mutating state.
  // Caller is responsible for pushing into pendingImports (multi-file) or single-mode.
  // Returns { transactions, error }: error is null on success, or a user-facing message on
  // 401 / non-ok / thrown failure. Callers must thread `error` through instead of blindly
  // clearing uploadStatus, otherwise the message never survives to paint (see buildPendingEntry).
  const localCategorize = async (tagged) => {
    const directionOf = (t) => t.direction || (Number(t.money_in) > 0 ? 'IN' : 'OUT')
    const keyOf = (t) => `${t.merchant || t.description || ''}|${directionOf(t)}`
    const seen = new Map()
    for (const t of tagged) {
      if (t.category !== 'Other') continue
      const k = keyOf(t)
      if (!seen.has(k)) {
        const direction = directionOf(t)
        const amount = direction === 'IN' ? (Number(t.money_in) || 0) : (Number(t.money_out) || Number(t.amount) || 0)
        seen.set(k, { merchant: t.merchant || t.description || '', direction, amount })
      }
    }
    const items = [...seen.values()]
    if (items.length === 0) return { transactions: tagged, error: null }
    try {
      const allCategories = {}
      for (let i = 0; i < items.length; i += 200) {
        const batch = items.slice(i, i + 200)
        const r = await fetch(`${API_BASE}/api/categorize-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ items: batch }),
        })
        if (r.status === 401) {
          setTimeout(() => { handleLogout() }, 1500)
          return { transactions: tagged, error: 'Session expired. Please log in again.' }
        }
        if (!r.ok) {
          return { transactions: tagged, error: `Categorization failed (HTTP ${r.status}). Some transactions may be left as "Other" -- recategorize them from Transactions.` }
        }
        const { categories } = await r.json()
        if (categories) Object.assign(allCategories, categories)
      }
      tagged = tagged.map(t => {
        if (t.category === 'Other') {
          const k = keyOf(t)
          if (allCategories[k] && allCategories[k] !== 'Other') return { ...t, category: allCategories[k] }
        }
        return t
      })
    } catch (e) {
      return { transactions: tagged, error: `Categorization error: ${e.message || 'network error'}. Some transactions may be left as "Other".` }
    }
    return { transactions: tagged, error: null }
  }

  // Builds one pendingImports entry from parse results. Caller appends.
  const buildPendingEntry = async (transactions, bankName, filename) => {
    const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
    const { transactions: categorized, error: categorizeError } = await localCategorize(tagged)
    const id = `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return {
      id,
      transactions: categorized,
      bankName: bankName || '',
      filename: filename || '',
      accountName: bankName && filename ? `${bankName} - ${filename.replace(/\.(csv|pdf)$/i, '')}` : (bankName || filename?.replace(/\.(csv|pdf)$/i, '') || 'Primary'),
      selectedRows: new Set(),
      editingCell: null,
      error: categorizeError || undefined,
    }
  }

  // Legacy single-file path (kept for column mapper + Papa fallback that still call it)
  const localCategorizeAndImport = async (tagged, bankName, filename) => {
    const entry = await buildPendingEntry(tagged, bankName, filename)
    setPendingImports(prev => [...prev, entry])
    setUploadStatus(entry.error ? { type: 'error', message: entry.error } : null)
    return entry
  }

  // Phase 17: accept either a single File (legacy) or File[] (multi-file).
  // Multi-file path processes each in parallel and appends to pendingImports.
  const handleFileUpload = (input) => {
    if (!input) return
    const files = Array.isArray(input) ? input : [input]
    if (files.length > 1) {
      // Multi-file: parse each in parallel, accumulate results
      setUploadStatus({ type: 'loading', message: `Processing ${files.length} files...` })
      Promise.all(files.map(f => handleSingleFile(f))).then(() => {
        // Functional update: preserve any error status set by an individual file's
        // processing (e.g. a categorize-local 401/500) instead of unconditionally
        // wiping it -- only clear to null if the last status wasn't an error.
        setUploadStatus(prev => (prev && prev.type === 'error') ? prev : null)
      }).catch(err => {
        setUploadStatus({ type: 'error', message: `Multi-file upload failed: ${err.message}` })
      })
      return
    }
    handleSingleFile(files[0])
  }

  const handleSingleFile = (file) => {
    if (!file) return Promise.resolve()
    const isPDF = file.name.toLowerCase().endsWith('.pdf'); const isCSV = file.name.toLowerCase().endsWith('.csv')
    if (!isPDF && !isCSV) { setUploadStatus({ type: 'error', message: `${file.name}: not a CSV or PDF.` }); return Promise.resolve() }
    setUploadStatus({ type: 'loading', message: isPDF ? `Processing ${file.name}...` : `Parsing ${file.name}...` })
    if (isPDF) {
      const formData = new FormData(); formData.append('file', file)
      return fetch(`${API_BASE}/api/upload-pdf`, { method: 'POST', headers: { ...authHeaders() }, body: formData })
        .then(r => {
          if (r.status === 401) { setUploadStatus({ type: 'error', message: 'Session expired. Please log in again.' }); setTimeout(() => handleLogout(), 1500); return null }
          if (!r.ok) throw new Error('Server error'); return r.json()
        })
        .then(result => {
          if (!result) return
          if (result.status === 'unrecognized') { setUploadStatus({ type: 'error', message: result.message ? `${file.name}: ${result.message}` : `${file.name}: could not recognize this PDF format.` }); return }
          const transactions = Array.isArray(result.transactions) ? result.transactions : []
          if (transactions.length === 0) { setUploadStatus({ type: 'error', message: `${file.name}: no transactions found.` }); return }
          const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
          return localCategorizeAndImport(tagged, result.bank_name || '', file.name)
        })
        .catch(err => { setUploadStatus({ type: 'error', message: `${file.name}: ${err.message}` }) })
    }

    const formData = new FormData(); formData.append('file', file)
    return fetch(`${API_BASE}/api/upload-csv`, { method: 'POST', headers: { ...authHeaders() }, body: formData })
      .then(r => {
        if (r.status === 401) { setUploadStatus({ type: 'error', message: 'Session expired. Please log in again.' }); setTimeout(() => handleLogout(), 1500); return null }
        if (!r.ok) throw new Error('Server error'); return r.json()
      })
      .then(result => {
        if (!result) return
        if (result.status === 'needs_mapping') {
          setShowColumnMapper({ headers: result.headers, previewRows: result.preview_rows, file })
          setColumnMapping({ date: '', description: '', amount: '', amountIn: '', amountOut: '', balance: '' })
          setMapperBankName(result.bank_name || '')
          setUploadStatus(null)
          return
        }
        const transactions = result.transactions || []
        if (transactions.length === 0) { setUploadStatus({ type: 'error', message: `${file.name}: no transactions found.` }); return }
        const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
        return localCategorizeAndImport(tagged, result.bank_name || '', file.name)
      })
      .catch(() => {
        Papa.parse(file, { header: true, skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0 && results.data.length === 0) { setUploadStatus({ type: 'error', message: `Parse error: ${results.errors[0].message}` }); return }
            const headers = results.meta.fields || [], cols = detectColumns(headers)
            if (!cols.date || (!cols.amount && !cols.amountIn)) {
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
            setUploadStatus({ type: 'loading', message: 'Categorizing transactions...' })
            localCategorizeAndImport(mapped, '', file.name)
          },
          error: (err) => { setUploadStatus({ type: 'error', message: `Failed to read file: ${err.message}` }) }
        })
      })
  }

  const handleColumnMapperSubmit = () => {
    if (!showColumnMapper) return
    const { file } = showColumnMapper
    const mapping = { ...columnMapping, date_format: columnDateFormat }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mapping', JSON.stringify(mapping))
    if (mapperSaveTemplate && mapperBankName) formData.append('bank_name', mapperBankName)
    setUploadStatus({ type: 'loading', message: 'Parsing with custom mapping...' })
    fetch(`${API_BASE}/api/upload-csv-mapped`, { method: 'POST', headers: { ...authHeaders() }, body: formData })
      .then(r => {
        if (r.status === 401) { setUploadStatus({ type: 'error', message: 'Session expired. Please log in again.' }); setTimeout(() => handleLogout(), 1500); return null }
        if (!r.ok) throw new Error('Server error'); return r.json()
      })
      .then(result => {
        if (!result) return
        const transactions = result.transactions || []
        if (transactions.length === 0) { setUploadStatus({ type: 'error', message: 'No transactions found with this mapping.' }); return }
        const tagged = transactions.map(d => ({ ...d, category: d.category || categorizeWithRules(d.merchant || d.description || '') }))
        setShowColumnMapper(null)
        setUploadStatus({ type: 'loading', message: 'Categorizing transactions...' })
        localCategorizeAndImport(tagged, result.bank_name || mapperBankName, file.name)
      })
      .catch(() => {
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
            setShowColumnMapper(null)
            setUploadStatus({ type: 'loading', message: 'Categorizing transactions...' })
            localCategorizeAndImport(mapped, mapperBankName, file.name)
          },
          error: () => setUploadStatus({ type: 'error', message: 'Failed to parse file with mapping.' })
        })
      })
  }

  // Phase 17: walks every pendingImports entry and POSTs each as its own import batch.
  // Each file becomes its own account_id (one Account per accountName) + import_batch.
  const handleConfirmImport = async () => {
    if (!pendingImports.length) return
    let totalImported = 0
    const errors = []
    // Fix round: track which entries actually landed on the server (or, when logged out,
    // were applied locally) so a partial failure only leaves the FAILED files in
    // pendingImports -- otherwise clicking "Import all" again to retry the failed ones
    // would also re-POST the ones that already succeeded, and api.py has no dedupe.
    const succeededIds = new Set()
    // Process each file's import sequentially (so we don't slam the backend with N parallel POSTs)
    for (const imp of pendingImports) {
      const baseLabel = (imp.accountName || '').trim()
      const fileLabel = imp.filename ? imp.filename.replace(/\.(csv|pdf)$/i, '') : null
      const fallback = imp.bankName && fileLabel ? `${imp.bankName} - ${fileLabel}` : (imp.bankName || fileLabel || 'Primary')
      const acctName = baseLabel || fallback
      const kept = imp.transactions.filter((_, i) => !imp.selectedRows.has(i))
      if (kept.length === 0) continue
      // Blocker 4b: if this account has encryption configured but the DEK isn't available
      // in this browser (locked session), refuse to send plaintext -- abort loudly instead
      // of silently downgrading merchant/description to cleartext on the server.
      if (authToken && !encryptionKey && authUser?.encryption_salt && authUser?.wrapped_dek) {
        errors.push(`${imp.filename}: encryption is enabled for your account but the key is locked in this browser -- log out and back in to unlock it, then retry this import.`)
        continue
      }
      const importTag = imp.id
      const taggedData = kept.map(d => ({ ...d, _account: acctName, _importId: importTag }))
      if (authToken) {
        const sourceType = imp.filename?.endsWith('.pdf') ? 'pdf' : 'csv'
        let importPayload = { transactions: kept, bank_name: imp.bankName, filename: imp.filename, account_name: acctName, source_type: sourceType }
        if (encryptionKey) {
          // E4: never downgrade to plaintext on failure -- abort this file's import instead.
          try {
            const verified = await verifyRoundTrip(encryptionKey, kept[0])
            if (!verified) throw new Error('round-trip verification failed')
            const encryptedTxns = []
            for (const txn of kept) {
              // E-15: canonical view fed to encryptFields (not txn directly), so a future
              // ENCRYPTED_FIELDS widening to include 'amount' (Option C) encrypts a real
              // value. Rows from the server parsers (csv_parser.py, pdf_parser.py,
              // plaid_service.py) already carry an unsigned `amount` -- only rows from the
              // client Papa-parse fallback (no server route matched) lack one and need it
              // synthesized here, unsigned and matching direction (money_in for IN,
              // money_out for OUT), same convention as TxnModel.amount and api.py's
              // transaction import/list endpoints. direction falls back the same way
              // localCategorize's directionOf does, for rows that never got a direction key.
              // Inert today: ENCRYPTED_FIELDS is merchant/description only, so this extra
              // key is never read by encryptFields and plainCopy below is still built from
              // the original txn, so the plaintext payload sent to the server is unchanged.
              const dir = txn.direction || (Number(txn.money_in) > 0 ? 'IN' : 'OUT')
              const canonical = { ...txn, amount: txn.amount ?? (dir === 'IN' ? Number(txn.money_in) : Number(txn.money_out)) }
              const blob = await encryptFields(encryptionKey, canonical)
              const plainCopy = { ...txn }
              for (const f of ENCRYPTED_FIELDS) delete plainCopy[f]
              encryptedTxns.push({ ...plainCopy, encrypted_data: blob })
            }
            importPayload = { transactions: encryptedTxns, encrypted: true, bank_name: imp.bankName, filename: imp.filename, account_name: acctName, source_type: sourceType }
          } catch (e) {
            errors.push(`${imp.filename}: encryption failed (${e.message}) -- import aborted, no data was sent.`)
            continue
          }
        }
        try {
          const r = await fetch(`${API_BASE}/api/transactions/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(importPayload),
          })
          if (!r.ok) { errors.push(`${imp.filename}: HTTP ${r.status}`) }
          else {
            totalImported += kept.length
            succeededIds.add(imp.id)
            // E-10: only reflect this import in local state once the server has confirmed
            // it -- otherwise a later network failure on a different file leaves rows on
            // screen the server never received, until the next refresh silently drops them.
            if (!accounts.find(a => a.name === acctName)) {
              setAccounts(prev => [...prev, { id: `${imp.id}-acct`, name: acctName }])
            }
            setData(prev => [...prev.filter(d => d._importId !== importTag), ...taggedData])
          }
        } catch (e) { errors.push(`${imp.filename}: ${e.message}`) }
      } else {
        totalImported += kept.length
        succeededIds.add(imp.id)
        if (!accounts.find(a => a.name === acctName)) {
          setAccounts(prev => [...prev, { id: `${imp.id}-acct`, name: acctName }])
        }
        setData(prev => [...prev.filter(d => d._importId !== importTag), ...taggedData])
      }
    }
    if (authToken) await refreshAccounts()
    if (errors.length > 0) {
      // Drop only the entries that already succeeded -- keeping them would let a retry
      // ("Import all") re-POST files that already landed, and api.py's import endpoint
      // creates a fresh ImportBatch + inserts every row with no dedupe, so a retry would
      // double-insert them. Failed entries stay in pendingImports so the user can retry
      // just those. We don't navigate away here (no setPage): the default upload view
      // renders this same uploadStatus error banner too (see UploadPage.jsx), so staying
      // on the review view doesn't hide the failure -- it just also lets the user retry.
      setPendingImports(prev => prev.filter(p => !succeededIds.has(p.id)))
      setUploadStatus({ type: 'error', message: `${errors.length} file(s) failed: ${errors.join('; ')}` })
    } else {
      setUploadStatus({ type: 'success', message: `Imported ${totalImported.toLocaleString()} transactions across ${pendingImports.length} file${pendingImports.length !== 1 ? 's' : ''}.` })
      setPendingImports([])
      setPage('overview')
    }
  }

  const handleCancelImport = () => {
    setPendingImports([])
    setUploadStatus(null)
  }

  // Phase 17: per-import helpers. Each takes importId so the right entry in pendingImports is updated.
  const removePendingImport = (importId) => {
    setPendingImports(prev => prev.filter(imp => imp.id !== importId))
  }

  const updatePendingImportField = (importId, field, value) => {
    setPendingImports(prev => prev.map(imp => imp.id === importId ? { ...imp, [field]: value } : imp))
  }

  const updatePendingTransaction = (importId, rowIdx, field, value) => {
    setPendingImports(prev => prev.map(imp => {
      if (imp.id !== importId) return imp
      const updated = [...imp.transactions]
      updated[rowIdx] = { ...updated[rowIdx], [field]: value }
      return { ...imp, transactions: updated }
    }))
  }

  const toggleImportRow = (importId, rowIdx) => {
    setPendingImports(prev => prev.map(imp => {
      if (imp.id !== importId) return imp
      const next = new Set(imp.selectedRows)
      if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx)
      return { ...imp, selectedRows: next }
    }))
  }

  const setImportEditingCell = (importId, cell) => {
    setPendingImports(prev => prev.map(imp => imp.id === importId ? { ...imp, editingCell: cell } : imp))
  }

  const toggleAllImportRows = (importId) => {
    setPendingImports(prev => prev.map(imp => {
      if (imp.id !== importId) return imp
      const next = imp.selectedRows.size === imp.transactions.length ? new Set() : new Set(imp.transactions.map((_, i) => i))
      return { ...imp, selectedRows: next }
    }))
  }

  const deleteSelectedImportRows = (importId) => {
    setPendingImports(prev => prev.map(imp => {
      if (imp.id !== importId) return imp
      const kept = imp.transactions.filter((_, i) => !imp.selectedRows.has(i))
      return { ...imp, transactions: kept, selectedRows: new Set() }
    }))
  }

  const handleWelcomeSubmit = () => { const name = (welcomeInputRef.current?.value || '').trim() || 'Happy'; setUserName(name); localStorage.setItem('spendscope_name', name); setShowWelcome(false) }

  // ========== AUTH GATE ==========
  if (!authToken) {
    return <AuthPages t={t} mode={mode} setMode={setMode} authPage={authPage} setAuthPage={setAuthPage} authError={authError} setAuthError={setAuthError} authLoading={authLoading} handleLogin={handleLogin} handleSignup={handleSignup} COUNTRIES={COUNTRIES} CURRENCIES={CURRENCIES} />
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
  const activeAccountId = activeAccount === 'All' ? null : (accounts.find(a => a.name === activeAccount)?.id || null)
  const filteredData = activeAccount === 'All' ? dateFilteredData : dateFilteredData.filter(d => d._account === activeAccount || (activeAccountId && d.account_id === activeAccountId))
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

  // Subscription Detection
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

  // Savings Opportunities
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

  const lc = { background: t.card, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: '20px', border: `1px solid ${t.border}`, boxShadow: t.cardShadow, padding: '24px', position: 'relative', overflow: 'hidden' }
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
        <ProfileModal t={t} authUser={authUser} showProfile={showProfile} setShowProfile={setShowProfile} profileInputRef={profileInputRef} authToken={authToken} authHeaders={authHeaders} setAuthUser={setAuthUser} API_BASE={API_BASE} userName={userName} setUserName={setUserName} handleLogout={handleLogout} Sphere={Sphere} onWipeData={handleWipeData} />
      )}

      {showEncryption && (
        <EncryptionSettings t={t} onClose={() => { setShowEncryption(false); getDek().then(dek => { if (dek) setEncryptionKey(dek) }) }} API_BASE={API_BASE} authToken={authToken} authHeaders={authHeaders} authUser={authUser} setAuthUser={setAuthUser} onSessionExpired={handleLogout} Sphere={Sphere} />
      )}

      <Sidebar t={t} mode={mode} setMode={setMode} page={page} setPage={setPage} globalRange={globalRange} setGlobalRange={setGlobalRange} currency={currency} setCurrency={setCurrency} CURRENCIES={CURRENCIES} NAV={NAV} userName={userName} setShowProfile={setShowProfile} handleLogout={handleLogout} insightsSeen={insightsSeen} setInsightsSeen={setInsightsSeen} anomalies={anomalies} accounts={accounts} activeAccount={activeAccount} setActiveAccount={setActiveAccount} />

      {/* MAIN CONTENT */}
      <div style={{ marginLeft: '220px', flex: 1, position: 'relative', overflow: 'hidden', background: t.bg }}>
        <Sphere size="160px" color={t.teal} top="-30px" right="60px" opacity={0.4} />
        <Sphere size="100px" color={t.sand} top="250px" right="-20px" opacity={0.3} />
        <Sphere size="80px" color={t.mint} bottom="200px" left="-10px" opacity={0.3} />
        <div style={{ position: 'relative', zIndex: 1, padding: '32px 36px' }}>
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: t.text, margin: 0 }}>
                {page === 'overview' && 'Dashboard Overview'}{page === 'spending' && 'Spending Analysis'}{page === 'transactions' && 'Transaction History'}{page === 'merchants' && 'Merchant Intelligence'}{page === 'calendar' && 'Bill Calendar'}{page === 'insights' && 'SpendScope Insights'}{page === 'coach' && 'AI Money Coach'}{page === 'rules' && 'Category Rules'}{page === 'upload' && 'Upload Statement'}
              </h1>
              <p style={{ color: t.textMuted, fontSize: '13px', margin: '4px 0 0' }}>{dateRangeStr}{globalRange !== 'All' ? ` (${globalRange})` : ''}</p>
            </div>
            <button onClick={() => setShowEncryption(true)} style={{ padding: '8px 14px', borderRadius: '10px', border: `1px solid ${t.border}`, background: 'transparent', color: t.textLight, fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {authUser?.wrapped_dek ? 'Encryption: ON' : 'Enable Encryption'}
            </button>
          </div>

          {unlockError && (
            <div style={{ ...lc, marginBottom: '20px', padding: '16px 24px', border: `1px solid ${t.red}40`, background: `${t.red}10` }}>
              <p style={{ fontSize: '14px', color: t.text, margin: 0, fontWeight: 500 }}>{unlockError}</p>
            </div>
          )}

          {decryptError && (
            <div style={{ ...lc, marginBottom: '20px', padding: '16px 24px', border: `1px solid ${t.red}40`, background: `${t.red}10` }}>
              <p style={{ fontSize: '14px', color: t.text, margin: 0, fontWeight: 500 }}>{decryptError}</p>
            </div>
          )}

          {page === 'overview' && (
            <DashboardPage t={t} mode={mode} currency={currency} dc={dc} lc={lc} userName={userName} monthlyAvg={monthlyAvg} catData={catData} lifeSpend={lifeSpend} monthCount={monthCount} net={net} totalIn={totalIn} totalOut={totalOut} filteredData={filteredData} weekDiff={weekDiff} weekLabel={weekLabel} thisWeekSpend={thisWeekSpend} weekPct={weekPct} dData={dData} chartRange={chartRange} setChartRange={setChartRange} mData={mData} topM={topM} recentTxns={recentTxns} handleExportPDF={handleExportPDF} cashFlowChart={cashFlowChart} forecastMonths={forecastMonths} accounts={accounts} activeAccount={activeAccount} setActiveAccount={setActiveAccount} onAddCard={() => setPage('upload')} onEditAccount={(a) => { const due = prompt(`Set payment due day (1-31) for ${a.name}, or blank to clear:`, a.due_day || ''); if (due === null) return; const v = due.trim() === '' ? null : parseInt(due, 10); fetch(`${API_BASE}/api/accounts/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ due_day: v }) }).then(() => refreshAccounts()) }} />
          )}

          {page === 'spending' && (
            <SpendingPage t={t} currency={currency} lc={lc} catData={catData} out={out} monthCount={monthCount} catByMonth={catByMonth} lastMonth={lastMonth} prevMonth={prevMonth} budgets={budgets} setBudgets={setBudgets} editingBudget={editingBudget} setEditingBudget={setEditingBudget} budgetInputVal={budgetInputVal} setBudgetInputVal={setBudgetInputVal} healthScore={healthScore} lowDataHealth={lowDataHealth} currMonthSpend={currMonthSpend} prevMonthSpend={prevMonthSpend} />
          )}

          {page === 'merchants' && (
            <MerchantsPage t={t} currency={currency} dc={dc} lc={lc} merchantDetails={merchantDetails} expandedMerchant={expandedMerchant} setExpandedMerchant={setExpandedMerchant} />
          )}

          {page === 'transactions' && (
            <TransactionsPage t={t} currency={currency} lc={lc} filteredData={filteredData} data={data} searchTerm={searchTerm} setSearchTerm={setSearchTerm} filterCat={filterCat} setFilterCat={setFilterCat} catTotals={catTotals} editingTxnCat={editingTxnCat} setEditingTxnCat={setEditingTxnCat} flashedTxnIdx={flashedTxnIdx} setFlashedTxnIdx={setFlashedTxnIdx} setData={setData} ALL_CATEGORIES={ALL_CATEGORIES} API_BASE={API_BASE} authHeaders={authHeaders} refreshTransactions={refreshTransactions} />
          )}

          {page === 'calendar' && (
            <CalendarPage t={t} currency={currency} lc={lc} calendarMonth={calendarMonth} setCalendarMonth={setCalendarMonth} subPredictions={subPredictions} filteredData={filteredData} />
          )}

          {page === 'insights' && (
            <InsightsPage t={t} mode={mode} currency={currency} lc={lc} dc={dc} anomalies={anomalies} streaks={streaks} savingsOpportunities={savingsOpportunities} savingsReduction={savingsReduction} setSavingsReduction={setSavingsReduction} daySpan={daySpan} peerCompData={peerCompData} dynamicInsights={dynamicInsights} />
          )}

          {page === 'coach' && (
            <CoachPage t={t} currency={currency} data={data} authToken={authToken} authHeaders={authHeaders} API_BASE={API_BASE} userName={userName || (authUser && authUser.name) || ''} onSessionExpired={handleLogout} />
          )}

          {page === 'rules' && (
            <RulesPage t={t} currency={currency} rulesVersion={rulesVersion} setRulesVersion={setRulesVersion} data={data} setData={setData} setUploadStatus={setUploadStatus} uploadStatus={uploadStatus} ALL_CATEGORIES={ALL_CATEGORIES} CAT_COLORS={CAT_COLORS} lc={lc} authHeaders={authHeaders} API_BASE={API_BASE} />
          )}

          {page === 'upload' && (
            <UploadPage t={t} currency={currency} uploadStatus={uploadStatus} setUploadStatus={setUploadStatus} pendingImports={pendingImports} setPendingImports={setPendingImports} pendingImport={pendingImport} setPendingImport={setPendingImport} showColumnMapper={showColumnMapper} setShowColumnMapper={setShowColumnMapper} columnMapping={columnMapping} setColumnMapping={setColumnMapping} columnDateFormat={columnDateFormat} setColumnDateFormat={setColumnDateFormat} mapperBankName={mapperBankName} setMapperBankName={setMapperBankName} mapperSaveTemplate={mapperSaveTemplate} setMapperSaveTemplate={setMapperSaveTemplate} uploadAccountName={uploadAccountName} setUploadAccountName={setUploadAccountName} handleConfirmImport={handleConfirmImport} handleColumnMapperSubmit={handleColumnMapperSubmit} handleCancelImport={handleCancelImport} handleFileUpload={handleFileUpload} dragOver={dragOver} setDragOver={setDragOver} fileInputRef={fileInputRef} data={data} setData={setData} authToken={authToken} authHeaders={authHeaders} API_BASE={API_BASE} ALL_CATEGORIES={ALL_CATEGORIES} CAT_COLORS={CAT_COLORS} fmt={fmt} lc={lc} Sphere={Sphere} setPage={setPage} toggleImportRow={toggleImportRow} toggleAllImportRows={toggleAllImportRows} deleteSelectedImportRows={deleteSelectedImportRows} updatePendingTransaction={updatePendingTransaction} setImportEditingCell={setImportEditingCell} updatePendingImportField={updatePendingImportField} removePendingImport={removePendingImport} refreshTransactions={refreshTransactions} refreshAccounts={refreshAccounts} accounts={accounts} setActiveAccount={setActiveAccount} handleLogout={handleLogout} />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
