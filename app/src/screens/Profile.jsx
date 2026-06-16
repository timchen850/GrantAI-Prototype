import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { sb } from '../lib/supabase'

const NTEE_CODES = [
  { value: 'A', label: 'A — Arts, Culture, Humanities' },
  { value: 'B', label: 'B — Education' },
  { value: 'C', label: 'C — Environment' },
  { value: 'D', label: 'D — Animal-Related' },
  { value: 'E', label: 'E — Health Care' },
  { value: 'F', label: 'F — Mental Health' },
  { value: 'G', label: 'G — Diseases, Disorders' },
  { value: 'H', label: 'H — Medical Research' },
  { value: 'I', label: 'I — Crime & Legal' },
  { value: 'J', label: 'J — Employment' },
  { value: 'K', label: 'K — Food, Agriculture' },
  { value: 'L', label: 'L — Housing, Shelter' },
  { value: 'M', label: 'M — Public Safety' },
  { value: 'N', label: 'N — Recreation & Sports' },
  { value: 'O', label: 'O — Youth Development' },
  { value: 'P', label: 'P — Human Services' },
  { value: 'Q', label: 'Q — International' },
  { value: 'R', label: 'R — Civil Rights' },
  { value: 'S', label: 'S — Community Improvement' },
  { value: 'T', label: 'T — Philanthropy' },
  { value: 'U', label: 'U — Science & Technology' },
  { value: 'V', label: 'V — Social Science' },
  { value: 'W', label: 'W — Public Policy' },
  { value: 'X', label: 'X — Religion' },
  { value: 'Y', label: 'Y — Mutual Benefit' },
]

const BUDGET_RANGES = [
  { value: 'under_100k', label: 'Under $100K' },
  { value: '100k_500k', label: '$100K – $500K' },
  { value: '500k_1m', label: '$500K – $1M' },
  { value: '1m_5m', label: '$1M – $5M' },
  { value: 'over_5m', label: 'Over $5M' },
]

export default function Profile() {
  const { profile, updateProfile } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState({
    org_name: '',
    ein: '',
    mission: '',
    vision: '',
    ntee_code: '',
    annual_budget: '',
    founded_year: '',
    website: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    focus_areas: '',
    service_area: '',
    beneficiaries: '',
  })
  const [saving, setSaving] = useState(false)
  const [completeness, setCompleteness] = useState(0)

  useEffect(() => {
    if (profile) {
      setForm(prev => ({ ...prev, ...profile }))
    }
  }, [profile])

  useEffect(() => {
    const fields = ['org_name', 'ein', 'mission', 'ntee_code', 'annual_budget', 'founded_year', 'focus_areas', 'service_area', 'beneficiaries']
    const filled = fields.filter(f => form[f]?.trim()).length
    setCompleteness(Math.round((filled / fields.length) * 100))
  }, [form])

  function set(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function save() {
    setSaving(true)
    try {
      await updateProfile(form)
      toast('Profile saved', 'ok')
    } catch (err) {
      toast(err.message || 'Failed to save', 'danger')
    }
    setSaving(false)
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Organization Profile</h1>
          <p className="page-subtitle">Keep your profile complete for better grant matches</p>
        </div>
        <button className="btn btn-accent" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} /> Saving…</> : 'Save Changes'}
        </button>
      </div>

      {/* Completeness */}
      <div className="card card-elevated" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Profile Completeness</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: completeness >= 80 ? 'var(--ok)' : 'var(--warn)' }}>{completeness}%</span>
            </div>
            <div className="progress-bar" style={{ height: 8 }}>
              <div
                className="progress-fill"
                style={{ width: `${completeness}%`, background: completeness >= 80 ? 'var(--ok)' : completeness >= 50 ? 'var(--warn)' : 'var(--accent)' }}
              />
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', maxWidth: 280 }}>
            {completeness < 50 ? 'Complete your profile to unlock accurate grant matching.' :
             completeness < 80 ? 'Good start! Add more details for better AI recommendations.' :
             'Excellent! Your profile is optimized for grant discovery.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Basic info */}
        <Section title="Organization Identity">
          <div className="grid-2">
            <Field label="Organization Name *" value={form.org_name} onChange={v => set('org_name', v)} placeholder="Acme Nonprofit Foundation" />
            <Field label="EIN (Federal Tax ID)" value={form.ein} onChange={v => set('ein', v)} placeholder="12-3456789" />
          </div>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <Field label="Year Founded" value={form.founded_year} onChange={v => set('founded_year', v)} placeholder="2005" type="number" />
            <Field label="Website" value={form.website} onChange={v => set('website', v)} placeholder="https://example.org" type="url" />
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="form-group">
              <label className="form-label">Mission Statement *</label>
              <textarea
                className="input textarea"
                style={{ minHeight: 90 }}
                placeholder="Describe your organization's core mission in 1-3 sentences…"
                value={form.mission}
                onChange={e => set('mission', e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="form-group">
              <label className="form-label">Vision Statement</label>
              <textarea
                className="input textarea"
                style={{ minHeight: 70 }}
                placeholder="Your long-term vision for impact…"
                value={form.vision}
                onChange={e => set('vision', e.target.value)}
              />
            </div>
          </div>
        </Section>

        {/* Classification */}
        <Section title="Classification & Budget">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">NTEE Code *</label>
              <select className="input select" value={form.ntee_code} onChange={e => set('ntee_code', e.target.value)}>
                <option value="">Select category…</option>
                {NTEE_CODES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Annual Budget *</label>
              <select className="input select" value={form.annual_budget} onChange={e => set('annual_budget', e.target.value)}>
                <option value="">Select range…</option>
                {BUDGET_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        </Section>

        {/* Geographic & programmatic */}
        <Section title="Programs & Impact">
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Focus Areas *</label>
            <input
              className="input"
              placeholder="e.g., youth education, workforce development, food security"
              value={form.focus_areas}
              onChange={e => set('focus_areas', e.target.value)}
            />
          </div>
          <div className="grid-2">
            <Field label="Service Geography *" value={form.service_area} onChange={v => set('service_area', v)} placeholder="e.g., Los Angeles County, CA" />
            <Field label="Primary Beneficiaries *" value={form.beneficiaries} onChange={v => set('beneficiaries', v)} placeholder="e.g., low-income youth ages 5-18" />
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact & Location">
          <div className="grid-2">
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="(555) 000-0000" type="tel" />
            <Field label="Street Address" value={form.address} onChange={v => set('address', v)} placeholder="123 Mission St" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginTop: 14 }}>
            <Field label="City" value={form.city} onChange={v => set('city', v)} placeholder="San Francisco" />
            <Field label="State" value={form.state} onChange={v => set('state', v)} placeholder="CA" />
            <Field label="ZIP" value={form.zip} onChange={v => set('zip', v)} placeholder="94105" />
          </div>
        </Section>

        <div style={{ textAlign: 'right', paddingBottom: 8 }}>
          <button className="btn btn-accent btn-lg" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save All Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="section-title" style={{ marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="input"
        type={type}
        placeholder={placeholder}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
