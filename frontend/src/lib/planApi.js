// FROZEN JSON CONTRACT client -- talks to the /api/plan/*, /api/budgets and /api/plaid/sync
// endpoints (built in a separate lane; see the contract doc for shapes). Every exported
// function takes its endpoint-specific args followed by `authHeaders` (the zero-arg
// function from App.jsx -- call authHeaders() to get the header object) as its last
// param, and returns the parsed JSON body, throwing on a non-ok response.
import { API_BASE } from '../constants'

const request = async (path, { method = 'GET', body, authHeaders } = {}) => {
  const headers = body !== undefined ? { 'Content-Type': 'application/json', ...authHeaders() } : { ...authHeaders() }
  const r = await fetch(`${API_BASE}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j.detail || `HTTP ${r.status}`)
  }
  return r.json()
}

// ---- Today / Forecast / Simulate / Overspend ----
export const getToday = (authHeaders) => request('/api/plan/today', { authHeaders })

export const getForecast = (days = 30, authHeaders) => request(`/api/plan/forecast?days=${days}`, { authHeaders })

export const postSimulate = (payload, authHeaders) => request('/api/plan/simulate', { method: 'POST', body: payload, authHeaders })

export const postOverspend = (amount, currency, authHeaders) => request('/api/plan/overspend', { method: 'POST', body: { amount, currency }, authHeaders })

// ---- Settings ----
export const getSettings = (authHeaders) => request('/api/plan/settings', { authHeaders })

export const putSettings = (payload, authHeaders) => request('/api/plan/settings', { method: 'PUT', body: payload, authHeaders })

// ---- Recurring items ----
export const getRecurring = (authHeaders) => request('/api/plan/recurring', { authHeaders })

export const createRecurring = (payload, authHeaders) => request('/api/plan/recurring', { method: 'POST', body: payload, authHeaders })

export const updateRecurring = (id, payload, authHeaders) => request(`/api/plan/recurring/${id}`, { method: 'PATCH', body: payload, authHeaders })

export const confirmRecurring = (id, authHeaders) => request(`/api/plan/recurring/${id}`, { method: 'PATCH', body: { status: 'confirmed' }, authHeaders })

export const dismissRecurring = (id, authHeaders) => request(`/api/plan/recurring/${id}`, { method: 'PATCH', body: { status: 'dismissed' }, authHeaders })

export const deleteRecurring = (id, authHeaders) => request(`/api/plan/recurring/${id}`, { method: 'DELETE', authHeaders })

// ---- Plan events ----
export const getEvents = (authHeaders) => request('/api/plan/events', { authHeaders })

export const createEvent = (payload, authHeaders) => request('/api/plan/events', { method: 'POST', body: payload, authHeaders })

export const updateEvent = (id, payload, authHeaders) => request(`/api/plan/events/${id}`, { method: 'PATCH', body: payload, authHeaders })

export const deleteEvent = (id, authHeaders) => request(`/api/plan/events/${id}`, { method: 'DELETE', authHeaders })

// ---- Budgets ----
export const getBudgets = (authHeaders) => request('/api/budgets', { authHeaders })

export const putBudgets = (items, authHeaders) => request('/api/budgets', { method: 'PUT', body: { items }, authHeaders })

// ---- Plaid (existing endpoint, unchanged) ----
export const refreshPlaidItem = (itemId, authHeaders) => request('/api/plaid/sync', { method: 'POST', body: { item_id: itemId }, authHeaders })

export const syncAllPlaid = (authHeaders) => request('/api/plaid/sync', { method: 'POST', body: {}, authHeaders })
