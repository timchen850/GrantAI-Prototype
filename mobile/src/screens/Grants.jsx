import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useToast } from '../lib/toast'

const STATUSES = ['discovered','saved','drafting','submitted','awarded','rejected']
const S = {
  discovered: { label: 'Discovered', cls: 'pill-default', emoji: '🔍' },
  saved:      { label: 'Saved',      cls: 'pill-info',    emoji: '💾' },
  drafting:   { label: 'Drafting',   cls: 'pill-warn',    emoji: '✍️' },
  submitted:  { label: 'Submitted',  cls: 'pill-accent',  emoji: '📬' },
  awarded:    { label: 'Awarded',    cls: 'pill-ok',      emoji: '🏆' },
  rejected:   { label: 'Rejected',   cls: 'pill-danger',  emoji: '❌' },
}

export default function Grants({ setPage }) {
  const { toast } = useToast()
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('grants')
      .select('*, opportunities(title, funder_name, amount_max, deadline)')
      .order('updated_at', { ascending: false })
    setGrants(data || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await sb.from('grants').update({ status }).eq('id', id)
    setGrants(prev => prev.map(g => g.id === id ? { ...g, status } : g))
    toast(`Moved to ${S[status].label}`, 'ok')
  }

  async function remove(id) {
    await sb.from('grants').delete().eq('id', id)
    setGrants(prev => prev.filter(g => g.id !== id))
    setSelected(null)
    toast('Removed from pipeline', 'default')
  }

  const summary = STATUSES.reduce((a, s) => ({ ...a, [s]: grants.filter(g => g.status === s).length }), {})
  const filtered = filter === 'all' ? grants : grants.filter(g => g.status === filter)

  return (
    <div className="scroll-view fade-in">
      <div className="content">
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle">Track grants from discovery to award</p>
        </div>

        {/* Status filter scroll */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 0 8px', margin: '0 0 20px', scrollbarWidth: 'none' }}>
          <button
            className={`btn btn-sm ${filter === 'all' ? 'btn-glass' : 'btn-ghost'}`}
            style={{ flexShrink: 0 }}
            onClick={() => setFilter('all')}
          >
            All ({grants.length})
          </button>
          {STATUSES.map(s => summary[s] > 0 && (
            <button
              key={s}
              className={`btn btn-sm ${filter === s ? 'btn-glass' : 'btn-ghost'}`}
              style={{ flexShrink: 0 }}
              onClick={() => setFilter(filter === s ? 'all' : s)}
            >
              {S[s].emoji} {S[s].label} ({summary[s]})
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 14 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-title">No grants here</div>
              <div className="empty-subtitle">Discover grants and save them to start your pipeline.</div>
              <button className="btn btn-accent btn-sm" onClick={() => setPage('discovery')}>Find Grants</button>
            </div>
          </div>
        ) : (
          <div className="list-card">
            {filtered.map(g => {
              const sm = S[g.status] || S.discovered
              const isOpen = selected === g.id
              const deadline = g.opportunities?.deadline
                ? new Date(g.opportunities.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                : null

              return (
                <div key={g.id}>
                  <div className="list-row" onClick={() => setSelected(isOpen ? null : g.id)}>
                    <div className="list-row-icon" style={{ background: 'var(--glass-mid)', fontSize: 20 }}>
                      {sm.emoji}
                    </div>
                    <div className="list-row-content">
                      <div className="list-row-title">{g.opportunities?.title || 'Untitled'}</div>
                      <div className="list-row-subtitle">
                        {g.opportunities?.funder_name || '—'}
                        {deadline && ` · Due ${deadline}`}
                      </div>
                    </div>
                    <div className="list-row-right">
                      {g.opportunities?.amount_max && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)' }}>
                          ${(g.opportunities.amount_max / 1000).toFixed(0)}k
                        </span>
                      )}
                      <span className={`pill ${sm.cls}`}>{sm.label}</span>
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{
                      padding: '12px 16px 16px',
                      background: 'var(--glass-light)',
                      borderTop: '1px solid var(--border)',
                      display: 'flex', flexDirection: 'column', gap: 12,
                    }}>
                      {/* Status picker */}
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Move to</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {STATUSES.filter(s => s !== g.status).map(s => (
                            <button key={s} className={`btn btn-sm pill ${S[s].cls}`}
                              style={{ border: '1px solid var(--border)' }}
                              onClick={() => updateStatus(g.id, s)}>
                              {S[s].emoji} {S[s].label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-glass" style={{ flex: 1 }} onClick={() => setPage('generator')}>
                          Draft Proposal
                        </button>
                        <button className="btn btn-ghost" style={{ flex: 1, color: 'var(--danger)', borderColor: 'rgba(255,69,58,0.3)' }}
                          onClick={() => remove(g.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
