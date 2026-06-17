import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const STATUS_PILL = {
  discovered:  { label: 'Discovered',  cls: 'pill-default' },
  saved:       { label: 'Saved',        cls: 'pill-info' },
  drafting:    { label: 'Drafting',     cls: 'pill-warn' },
  submitted:   { label: 'Submitted',    cls: 'pill-accent' },
  awarded:     { label: 'Awarded',      cls: 'pill-ok' },
  rejected:    { label: 'Rejected',     cls: 'pill-danger' },
}

export default function Dashboard({ setPage }) {
  const { profile } = useAuth()
  const [grants, setGrants] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: d }] = await Promise.all([
        sb.from('grants').select('*, opportunities(title, funder_name, amount_max)').order('updated_at', { ascending: false }).limit(6),
        sb.from('deadlines').select('*').gte('due_date', new Date().toISOString()).order('due_date').limit(5),
      ])
      setGrants(g || [])
      setDeadlines(d || [])
      setLoading(false)
    }
    load()
  }, [])

  const stats = {
    pipeline: grants.length,
    drafting: grants.filter(g => g.status === 'drafting').length,
    submitted: grants.filter(g => g.status === 'submitted').length,
    awarded: grants.filter(g => g.status === 'awarded').length,
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.org_name?.split(' ')[0] || 'there'

  if (loading) return <LoadingDashboard />

  return (
    <div className="fade-in">
      {/* Greeting */}
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="page-title">{greeting}, {firstName} 👋</h1>
          <p className="page-subtitle">Here's what's happening with your grant pipeline today.</p>
        </div>
        <button className="btn btn-accent" onClick={() => setPage('discovery')}>
          <PlusIcon /> Find Grants
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 28 }}>
        <KpiCard value={stats.pipeline} label="Total Pipeline" delta="+2 this week" />
        <KpiCard value={stats.drafting} label="In Progress" color="var(--warn)" />
        <KpiCard value={stats.submitted} label="Submitted" color="var(--info)" />
        <KpiCard value={stats.awarded} label="Awarded" color="var(--ok)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Recent grants */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Recent Grants</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setPage('grants')}>View all</button>
          </div>
          <div className="card">
            {grants.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <div className="empty-title">No grants yet</div>
                <div className="empty-subtitle">Discover matching opportunities and save them to your pipeline.</div>
                <button className="btn btn-accent btn-sm" onClick={() => setPage('discovery')}>Discover Grants</button>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Grant</th>
                      <th>Funder</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map(g => {
                      const s = STATUS_PILL[g.status] || STATUS_PILL.discovered
                      return (
                        <tr key={g.id} onClick={() => setPage('generator')} style={{ cursor: 'pointer' }}>
                          <td>
                            <span style={{ fontWeight: 500, maxWidth: 220, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {g.opportunities?.title || 'Untitled Grant'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--ink-secondary)' }}>{g.opportunities?.funder_name || '—'}</td>
                          <td style={{ color: 'var(--ok)', fontWeight: 500 }}>
                            {g.opportunities?.amount_max ? `$${(g.opportunities.amount_max / 1000).toFixed(0)}k` : '—'}
                          </td>
                          <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Upcoming deadlines */}
          <div className="section">
            <div className="section-header">
              <span className="section-title">Upcoming Deadlines</span>
            </div>
            <div className="card" style={{ padding: '4px 0' }}>
              {deadlines.length === 0 ? (
                <p style={{ padding: '20px 20px', color: 'var(--ink-tertiary)', fontSize: 13 }}>No upcoming deadlines.</p>
              ) : (
                deadlines.map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 10,
                      background: 'var(--accent-dim)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>
                        {new Date(d.due_date).toLocaleDateString('en', { month: 'short' }).toUpperCase()}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>
                        {new Date(d.due_date).getDate()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--ink)' }} className="truncate">{d.title || 'Deadline'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-tertiary)' }}>{daysUntil(d.due_date)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="section">
            <div className="section-header">
              <span className="section-title">Quick Actions</span>
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8 }}>
              {[
                { label: 'Find matching grants', icon: '🔍', page: 'discovery' },
                { label: 'Draft a proposal', icon: '✍️', page: 'generator' },
                { label: 'Check submission readiness', icon: '✅', page: 'readiness' },
                { label: 'Chat with AI advisor', icon: '💬', page: 'chat' },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => setPage(a.page)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink)', fontSize: 13.5, fontFamily: 'var(--font)',
                    textAlign: 'left', transition: 'background var(--dur-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--glass-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <span style={{ fontSize: 16 }}>{a.icon}</span>
                  {a.label}
                  <ChevronRight />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ value, label, color, delta }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      <div className="kpi-label">{label}</div>
      {delta && <div className="kpi-delta">{delta}</div>}
    </div>
  )
}

function LoadingDashboard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ height: 60 }} className="skeleton rounded-lg" />
      <div className="kpi-grid">
        {[...Array(4)].map((_, i) => <div key={i} style={{ height: 100 }} className="card skeleton" />)}
      </div>
      <div style={{ height: 300 }} className="card skeleton" />
    </div>
  )
}

function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff < 0) return 'Overdue'
  return `In ${diff} days`
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto', opacity: 0.35 }}>
      <path d="m9 18 6-6-6-6"/>
    </svg>
  )
}
