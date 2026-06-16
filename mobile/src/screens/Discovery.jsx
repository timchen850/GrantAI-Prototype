import React, { useEffect, useState } from 'react'
import { sb, runAiJob } from '../lib/supabase'
import { useToast } from '../lib/toast'

const scoreColor = s => s >= 80 ? 'var(--ok)' : s >= 60 ? 'var(--warn)' : 'var(--ink-tertiary)'

export default function Discovery({ setPage }) {
  const { toast } = useToast()
  const [opps, setOpps] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await sb
      .from('opportunities')
      .select('*, match_scores(score, mission_score, ntee_score, geo_score, budget_score)')
      .order('created_at', { ascending: false })
      .limit(40)
    setOpps(data || [])
    setLoading(false)
  }

  async function save(opp) {
    const { error } = await sb.from('grants').upsert({ opportunity_id: opp.id, status: 'saved' })
    if (error) { toast('Failed to save', 'danger'); return }
    toast('Saved to your pipeline', 'ok')
  }

  const filtered = opps.filter(o => {
    const q = search.toLowerCase()
    return !q || o.title?.toLowerCase().includes(q) || o.funder_name?.toLowerCase().includes(q)
  })

  return (
    <div className="scroll-view fade-in">
      <div className="content">
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">Discover</h1>
          <p className="page-subtitle">AI-matched grants for your organization</p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="input"
            style={{ paddingLeft: 40 }}
            placeholder="Search grants and funders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            inputMode="search"
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 88, borderRadius: 14 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <div className="empty-title">No results</div>
              <div className="empty-subtitle">Try a different search term</div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(opp => {
              const ms = opp.match_scores?.[0]
              const score = ms?.score ?? null
              const isExpanded = expanded === opp.id
              const deadline = opp.deadline
                ? new Date(opp.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
                : null

              return (
                <div key={opp.id}
                  className="card"
                  style={{ padding: '14px 16px', border: isExpanded ? '1px solid var(--accent)' : undefined }}
                  onClick={() => setExpanded(isExpanded ? null : opp.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Score bubble */}
                    {score !== null && (
                      <div style={{
                        width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                        background: 'var(--glass-mid)', border: '1px solid var(--border)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(score), lineHeight: 1 }}>{score}</span>
                        <span style={{ fontSize: 9, color: 'var(--ink-tertiary)', fontWeight: 600 }}>FIT</span>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }} className="truncate">
                        {opp.title || 'Untitled Grant'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>{opp.funder_name}</div>
                    </div>
                    {opp.amount_max && (
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ok)', flexShrink: 0 }}>
                        ${(opp.amount_max / 1000).toFixed(0)}k
                      </span>
                    )}
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ marginTop: 16, animation: 'slideUp 200ms var(--ease)' }} onClick={e => e.stopPropagation()}>
                      {opp.description && (
                        <p style={{ fontSize: 13.5, color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
                          {opp.description.slice(0, 260)}…
                        </p>
                      )}

                      {/* Match breakdown */}
                      {ms && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                          {[
                            { label: 'Mission',   val: ms.mission_score },
                            { label: 'NTEE',      val: ms.ntee_score },
                            { label: 'Geography', val: ms.geo_score },
                            { label: 'Budget',    val: ms.budget_score },
                          ].filter(d => d.val != null).map(d => (
                            <div key={d.label} style={{ padding: '10px 12px', background: 'var(--glass-light)', borderRadius: 12, border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 6 }}>{d.label}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="progress-bar" style={{ flex: 1, height: 3 }}>
                                  <div className="progress-fill" style={{ width: `${d.val}%`, background: scoreColor(d.val) }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(d.val), width: 24, textAlign: 'right' }}>{d.val}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                        {deadline && <span className="pill pill-warn">Due {deadline}</span>}
                        {opp.focus_area && <span className="pill pill-info">{opp.focus_area}</span>}
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-accent" style={{ flex: 1 }} onClick={() => setPage('generator')}>
                          Draft Proposal
                        </button>
                        <button className="btn btn-glass" style={{ flex: 1 }} onClick={() => save(opp)}>
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 16, marginBottom: 8 }}>
          {filtered.length} opportunities
        </p>
      </div>
    </div>
  )
}
