import React, { useState } from 'react'
import { useToast } from '../lib/toast'

const CHECKS = [
  { id: 'sam',           label: 'SAM.gov Registration',       desc: 'Active SAM.gov registration (required for federal grants)', cat: 'Federal' },
  { id: 'grants_gov',    label: 'Grants.gov Account',         desc: 'Organization and AOR registered on Grants.gov', cat: 'Federal' },
  { id: 'uei',           label: 'UEI / DUNS Number',          desc: 'Unique Entity Identifier from SAM.gov', cat: 'Federal' },
  { id: 'irs_501c3',     label: 'IRS 501(c)(3) Status',       desc: 'Current IRS determination letter on file', cat: 'Legal' },
  { id: 'state_charity', label: 'State Charity Registration',  desc: 'Registered with state attorney general', cat: 'Legal' },
  { id: 'board_res',     label: 'Board Authorization',        desc: 'Board resolution authorizing this submission', cat: 'Governance' },
  { id: 'audit_990',     label: 'Current Audit / 990',        desc: 'Most recent IRS Form 990 available', cat: 'Financial' },
  { id: 'bank_acct',     label: 'Org Bank Account',           desc: 'Verified institutional bank account', cat: 'Financial' },
  { id: 'font_size',     label: 'Font Size ≥ 12pt',           desc: 'Body text meets minimum font size', cat: 'Format' },
  { id: 'margins',       label: 'Margins ≥ 1 inch',           desc: 'All margins at least 1 inch', cat: 'Format' },
  { id: 'page_limit',    label: 'Within Page Limit',          desc: 'Narrative does not exceed funder limit', cat: 'Format' },
  { id: 'budget',        label: 'Budget Attached',            desc: 'Complete budget spreadsheet included', cat: 'Format' },
  { id: 'attachments',   label: 'Required Attachments',       desc: '501(c)(3) letter, audits, all required docs', cat: 'Format' },
  { id: 'signed',        label: 'Authorized Signature',       desc: 'Application signed by authorized rep', cat: 'Format' },
]

const CATEGORIES = [...new Set(CHECKS.map(c => c.cat))]

export default function Readiness() {
  const { toast } = useToast()
  const [checked, setChecked] = useState({})
  const [activeTab, setActiveTab] = useState(CATEGORIES[0])

  function toggle(id) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const total = CHECKS.length
  const done = Object.values(checked).filter(Boolean).length
  const pct = Math.round((done / total) * 100)
  const tabItems = CHECKS.filter(c => c.cat === activeTab)
  const tabDone = tabItems.filter(c => checked[c.id]).length

  return (
    <div className="scroll-view fade-in">
      <div className="content">
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">Readiness</h1>
          <p className="page-subtitle">Complete before submitting any grant</p>
        </div>

        {/* Circular progress */}
        <div className="card card-elevated" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <svg width="72" height="72" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                <circle fill="none" stroke="var(--glass-mid)" strokeWidth="3" cx="18" cy="18" r="15.9" />
                <circle
                  fill="none"
                  stroke={pct >= 100 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)'}
                  strokeWidth="3" strokeLinecap="round"
                  cx="18" cy="18" r="15.9"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset="25"
                  style={{ transition: 'stroke-dasharray 0.5s var(--ease)' }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{pct}%</span>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                {pct === 100 ? '✅ Ready to submit!' : `${done} of ${total} complete`}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                {pct < 50  ? 'Complete your registrations before submitting.' :
                 pct < 100 ? 'Almost there — finish remaining items.' :
                 'All checks passed. Good to go!'}
              </p>
              <div className="progress-bar" style={{ marginTop: 10, height: 5 }}>
                <div className="progress-fill" style={{
                  width: `${pct}%`,
                  background: pct >= 100 ? 'var(--ok)' : pct >= 70 ? 'var(--warn)' : 'var(--accent)',
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 0 16px', scrollbarWidth: 'none' }}>
          {CATEGORIES.map(cat => {
            const items = CHECKS.filter(c => c.cat === cat)
            const catDone = items.filter(c => checked[c.id]).length
            return (
              <button key={cat}
                className={`btn btn-sm ${activeTab === cat ? 'btn-glass' : 'btn-ghost'}`}
                style={{ flexShrink: 0 }}
                onClick={() => setActiveTab(cat)}
              >
                {cat} {catDone}/{items.length}
              </button>
            )
          })}
        </div>

        {/* Checklist */}
        <div className="list-card">
          {tabItems.map(item => (
            <div key={item.id} className="list-row" onClick={() => toggle(item.id)}>
              <div style={{
                width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                background: checked[item.id] ? 'var(--ok)' : 'var(--glass-mid)',
                border: `1.5px solid ${checked[item.id] ? 'var(--ok)' : 'var(--border-mid)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, color: 'white',
                transition: 'all var(--dur-fast)',
              }}>
                {checked[item.id] && '✓'}
              </div>
              <div className="list-row-content">
                <div className="list-row-title" style={{ textDecoration: checked[item.id] ? 'line-through' : 'none', opacity: checked[item.id] ? 0.5 : 1 }}>
                  {item.label}
                </div>
                <div className="list-row-subtitle">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
