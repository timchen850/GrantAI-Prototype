import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useToast } from '../lib/toast'

const REGISTRATION_CHECKS = [
  { id: 'sam', label: 'SAM.gov Registration', description: 'Active System for Award Management registration (required for federal grants)', category: 'Federal' },
  { id: 'grants_gov', label: 'Grants.gov Account', description: 'Organization and AOR registered on Grants.gov portal', category: 'Federal' },
  { id: 'duns', label: 'UEI / DUNS Number', description: 'Unique Entity Identifier obtained from SAM.gov', category: 'Federal' },
  { id: 'irs_501c3', label: 'IRS 501(c)(3) Status', description: 'Current IRS determination letter confirming tax-exempt status', category: 'Legal' },
  { id: 'state_charity', label: 'State Charity Registration', description: 'Registered with your state attorney general\'s office', category: 'Legal' },
  { id: 'board_resolution', label: 'Board Authorization', description: 'Board resolution authorizing grant submission', category: 'Governance' },
  { id: 'fiscal_year', label: 'Current Audit/990', description: 'Most recent IRS Form 990 and/or audit on file', category: 'Financial' },
  { id: 'bank_account', label: 'Org Bank Account', description: 'Verified institutional bank account for award deposits', category: 'Financial' },
]

const FORMAT_CHECKS = [
  { id: 'font_size', label: 'Font Size ≥ 12pt', description: 'Body text must be at least 12-point font per most funders' },
  { id: 'margins', label: 'Margins ≥ 1 inch', description: 'All margins (top, bottom, left, right) must be at least 1 inch' },
  { id: 'page_limit', label: 'Within Page Limit', description: 'Narrative does not exceed the funder\'s stated page limit' },
  { id: 'single_pdf', label: 'Single PDF', description: 'All documents combined into one PDF (unless otherwise specified)' },
  { id: 'headers', label: 'Section Headers Match RFP', description: 'Section titles exactly match the Request for Proposals headings' },
  { id: 'budget_attached', label: 'Budget Attached', description: 'Complete budget spreadsheet (SF-424A or funder template) included' },
  { id: 'org_docs', label: 'Required Attachments', description: '501(c)(3) letter, audits, and required attachments included' },
  { id: 'signed', label: 'Authorized Signatures', description: 'Application signed by authorized organization representative' },
]

export default function Readiness() {
  const { toast } = useToast()
  const [regChecks, setRegChecks] = useState({})
  const [fmtChecks, setFmtChecks] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await sb.from('registrations').select('*').limit(1).single()
      if (data?.checklist) setRegChecks(data.checklist)
      setLoading(false)
    }
    load()
  }, [])

  function toggle(key, type) {
    if (type === 'reg') {
      setRegChecks(prev => ({ ...prev, [key]: !prev[key] }))
    } else {
      setFmtChecks(prev => ({ ...prev, [key]: !prev[key] }))
    }
  }

  async function saveChecks() {
    const { error } = await sb.from('registrations').upsert({ checklist: regChecks })
    if (error) toast('Failed to save', 'danger')
    else toast('Checklist saved', 'ok')
  }

  const regComplete = REGISTRATION_CHECKS.filter(c => regChecks[c.id]).length
  const fmtComplete = FORMAT_CHECKS.filter(c => fmtChecks[c.id]).length
  const totalItems = REGISTRATION_CHECKS.length + FORMAT_CHECKS.length
  const totalComplete = regComplete + fmtComplete
  const pct = Math.round((totalComplete / totalItems) * 100)

  const regByCategory = REGISTRATION_CHECKS.reduce((acc, c) => {
    (acc[c.category] = acc[c.category] || []).push(c)
    return acc
  }, {})

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Submission Readiness</h1>
          <p className="page-subtitle">Complete all requirements before submitting</p>
        </div>
        <button className="btn btn-accent" onClick={saveChecks}>Save Progress</button>
      </div>

      {/* Overall progress */}
      <div className="card card-elevated" style={{ padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
            <svg width="80" height="80" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
              <circle fill="none" stroke="var(--glass-mid)" strokeWidth="3" cx="18" cy="18" r="15.9" />
              <circle
                fill="none"
                stroke={pct >= 100 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)'}
                strokeWidth="3"
                strokeLinecap="round"
                cx="18" cy="18" r="15.9"
                strokeDasharray={`${pct} ${100 - pct}`}
                strokeDashoffset="25"
                style={{ transition: 'stroke-dasharray 0.5s var(--ease)' }}
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{pct}%</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 4 }}>
              {pct === 100 ? 'Ready to submit! ✅' : `${totalComplete} of ${totalItems} items complete`}
            </div>
            <p style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
              {pct < 50 ? 'Complete your registrations and compliance checks before submitting any grants.'
               : pct < 100 ? 'Almost there. Complete the remaining items to ensure a successful submission.'
               : 'All compliance checks passed. Your organization is ready to submit.'}
            </p>
            <div className="progress-bar" style={{ marginTop: 12, height: 6 }}>
              <div className="progress-fill" style={{
                width: `${pct}%`,
                background: pct >= 100 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)',
              }} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Registration */}
        <div>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <span className="section-title">Registration & Compliance</span>
            <span className="pill pill-default">{regComplete}/{REGISTRATION_CHECKS.length}</span>
          </div>
          {Object.entries(regByCategory).map(([cat, items]) => (
            <div key={cat} className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
              <div className="label" style={{ marginBottom: 8 }}>{cat}</div>
              {items.map(item => (
                <CheckItem
                  key={item.id}
                  item={item}
                  checked={!!regChecks[item.id]}
                  onToggle={() => toggle(item.id, 'reg')}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Format */}
        <div>
          <div className="section-header" style={{ marginBottom: 14 }}>
            <span className="section-title">Format & Submission</span>
            <span className="pill pill-default">{fmtComplete}/{FORMAT_CHECKS.length}</span>
          </div>
          <div className="card" style={{ padding: '12px 16px' }}>
            {FORMAT_CHECKS.map(item => (
              <CheckItem
                key={item.id}
                item={item}
                checked={!!fmtChecks[item.id]}
                onToggle={() => toggle(item.id, 'fmt')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CheckItem({ item, checked, onToggle }) {
  return (
    <div className="check-item" onClick={onToggle} style={{ cursor: 'pointer' }}>
      <div className={`check-box ${checked ? 'checked' : ''}`}>
        {checked && '✓'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5, color: checked ? 'var(--ink-secondary)' : 'var(--ink)', textDecoration: checked ? 'line-through' : 'none' }}>
          {item.label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 2 }}>{item.description}</div>
      </div>
    </div>
  )
}
