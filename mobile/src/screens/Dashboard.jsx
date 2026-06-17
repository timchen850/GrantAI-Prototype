import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const STATUS_COLOR = {
  discovered: 'var(--ink-secondary)',
  saved:      'var(--info)',
  drafting:   'var(--warn)',
  submitted:  'var(--accent)',
  awarded:    'var(--ok)',
  rejected:   'var(--danger)',
}

export default function Dashboard({ setPage }) {
  const { profile } = useAuth()
  const [grants, setGrants] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      sb.from('grants').select('*, opportunities(title, funder_name, amount_max)').order('updated_at', { ascending: false }).limit(5),
      sb.from('deadlines').select('*').gte('due_date', new Date().toISOString()).order('due_date').limit(4),
    ]).then(([{ data: g }, { data: d }]) => {
      setGrants(g || [])
      setDeadlines(d || [])
      setLoading(false)
    })
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const name = profile?.org_name?.split(' ')[0] || 'there'

  const stats = [
    { label: 'Pipeline',  value: grants.length,                                      color: 'var(--ink)' },
    { label: 'Drafting',  value: grants.filter(g => g.status === 'drafting').length,  color: 'var(--warn)' },
    { label: 'Submitted', value: grants.filter(g => g.status === 'submitted').length, color: 'var(--info)' },
    { label: 'Awarded',   value: grants.filter(g => g.status === 'awarded').length,   color: 'var(--ok)' },
  ]

  return (
    <div className="scroll-view fade-in">
      <div className="content">
        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">{greeting},<br />{name} 👋</h1>
          <p className="page-subtitle" style={{ marginTop: 6 }}>
            Your grant pipeline at a glance.
          </p>
        </div>

        {/* KPI scroll row */}
        <div className="section">
          {loading ? (
            <div className="kpi-scroll">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="kpi-card skeleton" style={{ height: 80 }} />
              ))}
            </div>
          ) : (
            <div className="kpi-scroll">
              {stats.map(s => (
                <div key={s.label} className="kpi-card">
                  <div className="kpi-value" style={{ color: s.color }}>{s.value}</div>
                  <div className="kpi-label">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Quick Actions</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Find Grants',    emoji: '🔍', page: 'discovery', color: 'var(--info-dim)',   border: 'rgba(10,132,255,0.25)' },
              { label: 'Draft Proposal', emoji: '✍️', page: 'generator', color: 'var(--accent-dim)', border: 'rgba(232,92,58,0.25)' },
              { label: 'Check Readiness',emoji: '✅', page: 'readiness', color: 'var(--ok-dim)',     border: 'rgba(48,209,88,0.25)' },
              { label: 'AI Assistant',   emoji: '💬', page: 'chat',      color: 'var(--glass-mid)',  border: 'var(--border-mid)' },
            ].map(a => (
              <button
                key={a.label}
                onClick={() => setPage(a.page)}
                style={{
                  background: a.color, border: `1px solid ${a.border}`,
                  borderRadius: 16, padding: '16px 14px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
                  transition: 'opacity var(--dur-fast)',
                }}
              >
                <span style={{ fontSize: 26 }}>{a.emoji}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Upcoming deadlines */}
        {deadlines.length > 0 && (
          <div className="section">
            <div className="section-header">
              <span className="section-title">Upcoming Deadlines</span>
            </div>
            <div className="list-card">
              {deadlines.map((d, i) => {
                const date = new Date(d.due_date)
                const diff = Math.ceil((date - new Date()) / 86400000)
                return (
                  <div key={d.id} className="list-row">
                    <div className="list-row-icon" style={{ background: 'var(--accent-dim)' }}>
                      <div style={{ textAlign: 'center', lineHeight: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>
                          {date.toLocaleDateString('en', { month: 'short' })}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                          {date.getDate()}
                        </div>
                      </div>
                    </div>
                    <div className="list-row-content">
                      <div className="list-row-title">{d.title || 'Deadline'}</div>
                      <div className="list-row-subtitle">
                        {diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff < 0 ? 'Overdue' : `In ${diff} days`}
                      </div>
                    </div>
                    <span className={`pill ${diff <= 3 ? 'pill-danger' : diff <= 7 ? 'pill-warn' : 'pill-default'}`}>
                      {diff <= 0 ? '!' : `${diff}d`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Recent grants */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Recent Grants</span>
            <button className="section-action" onClick={() => setPage('grants')}>See all</button>
          </div>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
            </div>
          ) : grants.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '32px 24px' }}>
                <div className="empty-icon">📋</div>
                <div className="empty-title">No grants yet</div>
                <div className="empty-subtitle">Discover and save matching grants to build your pipeline.</div>
                <button className="btn btn-accent btn-sm" style={{ marginTop: 4 }} onClick={() => setPage('discovery')}>
                  Discover Grants
                </button>
              </div>
            </div>
          ) : (
            <div className="list-card">
              {grants.map(g => (
                <div key={g.id} className="list-row" onClick={() => setPage('generator')}>
                  <div className="list-row-icon" style={{ background: 'var(--glass-mid)' }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                  </div>
                  <div className="list-row-content">
                    <div className="list-row-title">{g.opportunities?.title || 'Untitled Grant'}</div>
                    <div className="list-row-subtitle">{g.opportunities?.funder_name || '—'}</div>
                  </div>
                  <div className="list-row-right">
                    {g.opportunities?.amount_max && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)' }}>
                        ${(g.opportunities.amount_max / 1000).toFixed(0)}k
                      </span>
                    )}
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[g.status] || 'var(--ink-tertiary)', flexShrink: 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
