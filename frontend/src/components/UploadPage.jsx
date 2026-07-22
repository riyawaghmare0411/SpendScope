import { PlaidConnect } from './PlaidConnect'
import { AccountsListPanel } from './AccountsListPanel'

export default function UploadPage({ t, currency, uploadStatus, setUploadStatus, pendingImports, pendingImport, showColumnMapper, setShowColumnMapper, columnMapping, setColumnMapping, columnDateFormat, setColumnDateFormat, mapperBankName, setMapperBankName, mapperSaveTemplate, setMapperSaveTemplate, uploadAccountName, setUploadAccountName, handleConfirmImport, handleColumnMapperSubmit, handleCancelImport, handleFileUpload, dragOver, setDragOver, fileInputRef, authToken, authHeaders, API_BASE, ALL_CATEGORIES, CAT_COLORS, fmt, lc, setPage, toggleImportRow, toggleAllImportRows, deleteSelectedImportRows, updatePendingTransaction, setImportEditingCell, updatePendingImportField, removePendingImport, refreshTransactions, refreshAccounts, accounts, setActiveAccount, handleLogout }) {
  const onPlaidSync = () => { refreshTransactions && refreshTransactions(); refreshAccounts && refreshAccounts() }
  return (<>

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

    {/* ===== IMPORT CONFIRMATION VIEW (Phase 17 multi-file) ===== */}
    {(pendingImports?.length > 0) && (<>
      <div style={{ ...lc, marginBottom: '16px', padding: '20px 24px' }}>
        {/* Top header summary */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: t.text, margin: '0 0 6px' }}>
              Review {pendingImports.length} file{pendingImports.length !== 1 ? 's' : ''}
            </h2>
            <p style={{ fontSize: '12px', color: t.textMuted, margin: 0 }}>
              Each file becomes its own account. Edit the account name to organize them.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button onClick={handleCancelImport} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 600 }}>Cancel</button>
            <button onClick={handleConfirmImport} style={{ padding: '10px 24px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>
              Import all ({pendingImports.reduce((s, imp) => s + imp.transactions.length - imp.selectedRows.size, 0)})
            </button>
          </div>
        </div>
      </div>

      {/* One section per file */}
      {pendingImports.map((imp, impIdx) => {
        const total = imp.transactions.length
        const selected = imp.selectedRows.size
        const willImport = total - selected
        return (
          <div key={imp.id} style={{ ...lc, marginBottom: '16px', padding: '20px 24px' }}>
            {/* Per-file header: filename + bank + account name input + remove */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: t.text, margin: '0 0 6px' }}>
                  {pendingImports.length > 1 && <span style={{ color: t.textMuted, fontSize: '12px', fontWeight: 500, marginRight: '8px' }}>{impIdx + 1} of {pendingImports.length}</span>}
                  {imp.filename || 'Untitled'}
                </h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {imp.bankName && <span style={{ fontSize: '11px', color: t.textMuted, background: `${t.teal}12`, padding: '2px 8px', borderRadius: '5px', fontWeight: 500 }}>{imp.bankName}</span>}
                  <span style={{ fontSize: '11px', color: t.textMuted, background: `${t.teal}12`, padding: '2px 8px', borderRadius: '5px', fontWeight: 500 }}>{willImport} of {total} txns</span>
                  {imp.transactions.some(tx => tx.is_redacted) && <span style={{ fontSize: '11px', color: '#B8860B', background: 'rgba(184,134,11,0.12)', padding: '2px 8px', borderRadius: '5px', fontWeight: 600 }}>has redacted</span>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '12px', color: t.textMuted, fontWeight: 500 }}>Account:</label>
                <input
                  type="text"
                  value={imp.accountName || ''}
                  onChange={e => updatePendingImportField(imp.id, 'accountName', e.target.value)}
                  placeholder="e.g. Lloyds Checking"
                  style={{ width: '200px', padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none' }}
                />
                {pendingImports.length > 1 && (
                  <button
                    onClick={() => removePendingImport(imp.id)}
                    title="Remove this file from the batch"
                    style={{ padding: '6px 12px', borderRadius: '8px', border: `1px solid ${t.red}40`, cursor: 'pointer', background: 'transparent', color: t.red, fontSize: '11px', fontWeight: 600 }}>
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Per-file bulk action row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', padding: '6px 10px', borderRadius: '8px', background: t.bg }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: t.textLight, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={total > 0 && selected === total}
                  onChange={() => toggleAllImportRows(imp.id)}
                  style={{ accentColor: t.teal, width: '14px', height: '14px', cursor: 'pointer' }}
                />
                Select All
              </label>
              {selected > 0 && (<>
                <span style={{ fontSize: '12px', color: t.textMuted }}>{selected} selected</span>
                <button onClick={() => deleteSelectedImportRows(imp.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: `1px solid ${t.red}40`, cursor: 'pointer', background: `${t.red}10`, color: t.red, fontSize: '11px', fontWeight: 600 }}>Delete Selected</button>
              </>)}
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: t.textMuted }}>Click a category or merchant to edit</span>
            </div>

            {/* Transactions table */}
            <div style={{ overflowX: 'auto', borderRadius: '10px', border: `1px solid ${t.border}`, maxHeight: '450px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: t.bg }}>
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
                  {imp.transactions.map((tx, idx) => {
                    const isRedacted = tx.is_redacted
                    const isSelected = imp.selectedRows.has(idx)
                    const rowBg = isRedacted ? 'rgba(184,134,11,0.08)' : isSelected ? `${t.red}08` : idx % 2 === 0 ? 'transparent' : `${t.bg}40`
                    const amt = tx.direction === 'IN' ? tx.money_in : tx.money_out
                    const editing = imp.editingCell
                    return (
                      <tr key={idx} style={{ background: rowBg, borderBottom: `1px solid ${t.border}` }}>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleImportRow(imp.id, idx)} style={{ accentColor: t.teal, width: '14px', height: '14px', cursor: 'pointer' }} />
                        </td>
                        <td style={{ padding: '8px 12px', color: t.textLight, whiteSpace: 'nowrap', fontSize: '12px' }}>{tx.date_iso}</td>
                        <td style={{ padding: '4px 12px' }}>
                          {editing?.rowIdx === idx && editing?.field === 'merchant' ? (
                            <input
                              type="text" autoFocus
                              value={tx.merchant || tx.description || ''}
                              onChange={e => { updatePendingTransaction(imp.id, idx, 'merchant', e.target.value); updatePendingTransaction(imp.id, idx, 'description', e.target.value) }}
                              onBlur={() => setImportEditingCell(imp.id, null)}
                              onKeyDown={e => { if (e.key === 'Enter') setImportEditingCell(imp.id, null) }}
                              style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.teal}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none' }}
                            />
                          ) : (
                            <span onClick={() => setImportEditingCell(imp.id, { rowIdx: idx, field: 'merchant' })} style={{ cursor: 'pointer', display: 'block', padding: '4px 8px', borderRadius: '6px', color: t.text, fontSize: '12px' }} onMouseEnter={e => e.currentTarget.style.background = `${t.teal}10`} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{tx.merchant || tx.description || 'Unknown'}</span>
                          )}
                        </td>
                        <td style={{ padding: '4px 12px' }}>
                          {editing?.rowIdx === idx && editing?.field === 'category' ? (
                            <select
                              autoFocus
                              value={tx.category || 'Other'}
                              onChange={e => { updatePendingTransaction(imp.id, idx, 'category', e.target.value); setImportEditingCell(imp.id, null) }}
                              onBlur={() => setImportEditingCell(imp.id, null)}
                              style={{ width: '100%', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${t.teal}`, background: t.bg, color: t.text, fontSize: '12px', outline: 'none', cursor: 'pointer' }}>
                              {ALL_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          ) : (
                            <span onClick={() => setImportEditingCell(imp.id, { rowIdx: idx, field: 'category' })} style={{ cursor: 'pointer', display: 'inline-block', padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, background: (CAT_COLORS[tx.category] || '#9AABBA') + '18', color: CAT_COLORS[tx.category] || t.textLight }}>{tx.category || 'Other'}</span>
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
          </div>
        )
      })}

      {/* Bottom action bar (sticky-ish) */}
      <div style={{ ...lc, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', color: t.textMuted }}>
          {pendingImports.reduce((s, imp) => s + imp.transactions.length - imp.selectedRows.size, 0)} transactions across {pendingImports.length} file{pendingImports.length !== 1 ? 's' : ''} will be imported
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleCancelImport} style={{ padding: '10px 24px', borderRadius: '12px', border: `1px solid ${t.border}`, cursor: 'pointer', background: 'transparent', color: t.textLight, fontSize: '13px', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleConfirmImport} style={{ padding: '10px 28px', borderRadius: '12px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '13px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40` }}>Import all</button>
        </div>
      </div>
    </>)}

    {/* ===== DEFAULT UPLOAD VIEW (drag-and-drop) ===== */}
    {!pendingImport && !showColumnMapper && (<>
      {/* Plaid auto-sync (Phase 9) -- shows above manual upload */}
      {authToken && (
        <PlaidConnect t={t} authToken={authToken} authHeaders={authHeaders} onSyncComplete={onPlaidSync} />
      )}
      {/* Phase 17: Accounts list (Open / Rename / Delete) -- only renders when there's at least 1 account */}
      {authToken && (
        <AccountsListPanel
          t={t} lc={lc} currency={currency} fmt={fmt}
          accounts={accounts || []}
          setActiveAccount={setActiveAccount}
          setPage={setPage}
          API_BASE={API_BASE}
          authHeaders={authHeaders}
          refreshAccounts={refreshAccounts}
          refreshTransactions={refreshTransactions}
          handleLogout={handleLogout}
        />
      )}
      {/* Divider */}
      {authToken && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0 16px' }}>
          <div style={{ flex: 1, height: '1px', background: t.border }} />
          <span style={{ fontSize: '11px', color: t.textMuted, letterSpacing: '1px', textTransform: 'uppercase' }}>or upload manually</span>
          <div style={{ flex: 1, height: '1px', background: t.border }} />
        </div>
      )}
      <div style={{ ...lc, padding: '16px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}><label style={{ fontSize: '13px', fontWeight: 500, color: t.text, whiteSpace: 'nowrap' }}>Account Name:</label><input type="text" placeholder="e.g., Checking, Credit Card" value={uploadAccountName} onChange={e => setUploadAccountName(e.target.value)} style={{ flex: 1, padding: '8px 14px', borderRadius: '10px', border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: '13px', outline: 'none' }} onFocus={e => e.target.style.borderColor = t.teal} onBlur={e => e.target.style.borderColor = t.border} /><span style={{ fontSize: '11px', color: t.textMuted }}>Optional</span></div>
      <input ref={fileInputRef} type="file" accept=".csv,.pdf" multiple style={{ display: 'none' }} onChange={e => { const files = Array.from(e.target.files || []); if (files.length) handleFileUpload(files); e.target.value = '' }} />
      <div style={{ ...lc, padding: '60px 40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s', border: dragOver ? `2px dashed ${t.teal}` : `2px dashed ${t.textMuted}40`, background: dragOver ? `${t.teal}08` : t.card }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const files = Array.from(e.dataTransfer.files || []); if (files.length) handleFileUpload(files) }} onClick={() => fileInputRef.current?.click()}>
        <Sphere size="80px" color={t.teal} top="20px" right="40px" opacity={0.2} /><Sphere size="50px" color={t.sand} bottom="20px" left="60px" opacity={0.15} />
        {uploadStatus?.type === 'loading' ? (<div style={{ position: 'relative', zIndex: 1 }}><div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `3px solid ${t.border}`, borderTopColor: t.tealDark, animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} /><p style={{ fontSize: '16px', fontWeight: 600, color: t.text }}>{uploadStatus.message}</p><style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style></div>) : (<>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.6, position: 'relative', zIndex: 1 }}>{'\uD83D\uDCC4'}</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: t.text, margin: '0 0 8px', position: 'relative', zIndex: 1 }}>Drop your bank statement(s) here</h2>
          <p style={{ fontSize: '14px', color: t.textLight, margin: '0 0 8px', position: 'relative', zIndex: 1 }}>Supports CSV and PDF files {'\u2014'} drop multiple from different banks at once</p>
          <p style={{ fontSize: '12px', color: t.textMuted, margin: 0, position: 'relative', zIndex: 1 }}>Your data is processed locally {'\u2014'} nothing leaves your browser</p>
        </>)}
      </div>
      {uploadStatus && uploadStatus.type !== 'loading' && <div style={{ ...lc, marginTop: '16px', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px', border: `1px solid ${uploadStatus.type === 'success' ? t.green : t.red}20`, background: uploadStatus.type === 'success' ? `${t.green}08` : `${t.red}08` }}><span style={{ fontSize: '20px' }}>{uploadStatus.type === 'success' ? '\u2705' : '\u274C'}</span><p style={{ fontSize: '14px', color: t.text, margin: 0, fontWeight: 500 }}>{uploadStatus.message}</p></div>}
      <div style={{ textAlign: 'center', marginTop: '24px' }}><button onClick={() => setPage('overview')} style={{ padding: '12px 32px', borderRadius: '14px', border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${t.tealDark}, ${t.teal})`, color: 'white', fontSize: '14px', fontWeight: 600, boxShadow: `0 4px 16px ${t.tealDark}40`, transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>Try Demo Data Instead</button></div>
    </>)}
  </>)
}
