// FROZEN DISCLOSURE COMPONENT -- tells the user, per data source, exactly what the server
// can and cannot read about these rows. Wording must stay accurate to the actual
// encryption phase (Option A: merchant + description only) -- see project_encryption_upgrade_path.
const COPY = {
  plaid: 'These transactions are synced from your bank via Plaid. Merchant and description text is redacted, but it is NOT end-to-end encrypted -- these rows are readable on the server.',
  upload: 'These transactions come from an uploaded statement and are end-to-end encrypted (merchant and description only) -- the server cannot read them.',
}

const DataVisibilityNote = ({ t, source }) => {
  const text = COPY[source]
  if (!text) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: `${t.teal}0c`, border: `1px solid ${t.teal}20`, marginBottom: '16px' }}>
      <span style={{ fontSize: '13px', lineHeight: '1.5' }}>{'ⓘ'}</span>
      <p style={{ fontSize: '12px', color: t.textLight, margin: 0, lineHeight: '1.5' }}>{text}</p>
    </div>
  )
}

export default DataVisibilityNote
