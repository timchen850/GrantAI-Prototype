import React, { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'

export default function Profile({ setPage }) {
  const { profile, updateProfile, signOut } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState({ org_name: '', ein: '', mission: '', ntee_code: '', annual_budget: '', focus_areas: '', service_area: '', beneficiaries: '' })
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  useEffect(() => { if (profile) setForm(prev => ({ ...prev, ...profile })) }, [profile])

  const completenessFields = ['org_name','ein','mission','ntee_code','annual_budget','focus_areas','service_area','beneficiaries']
  const pct = Math.round((completenessFields.filter(f => form[f]?.trim()).length / completenessFields.length) * 100)
  const initials = form.org_name?.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase() || '?'

  async function save() {
    setSaving(true)
    try { await updateProfile(form); toast('Profile saved', 'ok'); setEditMode(false) }
    catch { toast('Failed to save', 'danger') }
    setSaving(false)
  }

  return (
    <div className="scroll-view fade-in">
      <div className="content">
        {/* Avatar + org */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 28, paddingTop: 8 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 24, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 800, color: 'white',
            boxShadow: '0 4px 20px var(--accent-glow)',
          }}>{initials}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.02 }}>{form.org_name || 'Your Organization'}</div>
            <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginTop: 2 }}>{profile?.email || ''}</div>
          </div>

          {/* Completeness ring */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', width: 44, height: 44 }}>
              <svg width="44" height="44" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                <circle fill="none" stroke="var(--glass-mid)" strokeWidth="3" cx="18" cy="18" r="15.9" />
                <circle fill="none" stroke={pct >= 80 ? 'var(--ok)' : 'var(--warn)'} strokeWidth="3" strokeLinecap="round"
                  cx="18" cy="18" r="15.9" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25"
                  style={{ transition: 'stroke-dasharray 0.5s' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{pct}%</div>
            </div>
            <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>Profile {pct < 80 ? 'incomplete' : 'complete'}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <button className={`btn ${editMode ? 'btn-accent' : 'btn-glass'} w-full`}
            onClick={() => editMode ? save() : setEditMode(true)} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : editMode ? 'Save Changes' : 'Edit Profile'}
          </button>
          {editMode && (
            <button className="btn btn-ghost" onClick={() => { setEditMode(false); if (profile) setForm(prev => ({ ...prev, ...profile })) }}>
              Cancel
            </button>
          )}
        </div>

        {/* Fields */}
        {editMode ? (
          <div className="section">
            <div className="list-card" style={{ overflow: 'visible' }}>
              {[
                { key: 'org_name',     label: 'Organization Name',   ph: 'Acme Foundation' },
                { key: 'ein',          label: 'EIN',                  ph: '12-3456789' },
                { key: 'ntee_code',    label: 'NTEE Code',            ph: 'e.g. B, P, E…' },
                { key: 'annual_budget',label: 'Annual Budget',         ph: 'e.g. $500K–$1M' },
                { key: 'focus_areas',  label: 'Focus Areas',          ph: 'youth, education, housing…' },
                { key: 'service_area', label: 'Service Geography',     ph: 'Los Angeles County, CA' },
                { key: 'beneficiaries',label: 'Primary Beneficiaries', ph: 'low-income youth ages 5–18' },
              ].map(({ key, label, ph }, i, arr) => (
                <div key={key} style={{ padding: '4px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ padding: '10px 16px 0', fontSize: 11, fontWeight: 700, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                  <input className="input" style={{ border: 'none', background: 'transparent', padding: '8px 16px 12px' }}
                    value={form[key] || ''} placeholder={ph}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
                </div>
              ))}
              <div style={{ padding: '4px 0' }}>
                <div style={{ padding: '10px 16px 0', fontSize: 11, fontWeight: 700, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mission Statement</div>
                <textarea className="input textarea" style={{ border: 'none', background: 'transparent', padding: '8px 16px 12px', minHeight: 90 }}
                  value={form.mission || ''} placeholder="Your organization's core mission…"
                  onChange={e => setForm(prev => ({ ...prev, mission: e.target.value }))} />
              </div>
            </div>
          </div>
        ) : (
          <div className="section">
            <div className="list-card">
              {[
                { label: 'EIN',                emoji: '🔢', val: form.ein },
                { label: 'NTEE Code',          emoji: '🏷️', val: form.ntee_code },
                { label: 'Annual Budget',       emoji: '💰', val: form.annual_budget },
                { label: 'Focus Areas',         emoji: '🎯', val: form.focus_areas },
                { label: 'Service Geography',   emoji: '📍', val: form.service_area },
                { label: 'Primary Beneficiaries',emoji:'👥', val: form.beneficiaries },
              ].map(row => (
                <div key={row.label} className="list-row">
                  <div className="list-row-icon" style={{ background: 'var(--glass-mid)', fontSize: 18 }}>{row.emoji}</div>
                  <div className="list-row-content">
                    <div className="list-row-subtitle">{row.label}</div>
                    <div className="list-row-title">{row.val || <span style={{ color: 'var(--ink-disabled)' }}>Not set</span>}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="section">
          <div className="section-header"><span className="section-title">Settings</span></div>
          <div className="list-card">
            <div className="list-row" onClick={() => setPage('readiness')}>
              <div className="list-row-icon" style={{ background: 'var(--ok-dim)', fontSize: 18 }}>✅</div>
              <div className="list-row-content">
                <div className="list-row-title">Submission Readiness</div>
                <div className="list-row-subtitle">Check compliance requirements</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
                <path d="m9 18 6-6-6-6"/>
              </svg>
            </div>
            <div className="list-row" onClick={signOut}>
              <div className="list-row-icon" style={{ background: 'var(--danger-dim)', fontSize: 18 }}>🚪</div>
              <div className="list-row-content">
                <div className="list-row-title" style={{ color: 'var(--danger)' }}>Sign Out</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
