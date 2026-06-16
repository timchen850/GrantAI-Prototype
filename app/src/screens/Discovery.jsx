import React, { useEffect, useState } from 'react'
import { sb, runAiJob } from '../lib/supabase'
import { useToast } from '../lib/toast'

const SCORE_COLOR = s => s >= 80 ? 'var(--ok)' : s >= 60 ? 'var(--warn)' : 'var(--ink-tertiary)'

export default function Discovery({ setPage }) {
  const { toast } = useToast()
  const [opps, setOpps] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | high | saved
  const [selected, setSelected] = useState(null)

  useEffect(() => { loadOpps() }, [])

  async function loadOpps() {
    setLoading(true)
    const { data } = await sb
      .from('opportunities')
      .select(`*, match_scores(score, mission_score, ntee_score, geo_score, budget_score)`)
      .order('created_at', { ascending: false })
      .limit(60)
    setOpps(data || [])
    setLoading(false)
  }

  async function saveGrant(opp) {
    const { error } = await sb.from('grants').upsert({
      opportunity_id: opp.id,
      status: 'saved',
    })
    if (error) { toast('Failed to save grant', 'danger'); return }
    toast('Grant saved to your pipeline', 'ok')
  }

  async function scoreMatch(opp) {
    try {
      await runAiJob('score_match', { opportunity_id: opp.id })
      toast('Scoring started — check back in a moment', 'default')
    } catch {
      toast('Could not start scoring', 'danger')
    }
  }

  const filtered = opps.filter(o => {
    const q = search.toLowerCase()
    const match = !q || o.title?.toLowerCase().includes(q) || o.funder_name?.toLowerCase().includes(q)
    const score = o.match_scores?.[0]?.score ?? 0
    if (filter === 'high') return match && score >= 70
    if (filter === 'saved') return match && o.saved
    return match
  })

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Grant Discovery</h1>
          <p className="page-subtitle">AI-matched opportunities for your organization</p>
        </div>
        <button className="btn btn-accent" onClick={loadOpps}>
          <RefreshIcon /> Refresh
        </button>
      </div>

      {/* Search & filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <SearchIcon style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Search grants, funders…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'high', 'saved'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-glass' : 'btn-ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'high' ? '70+ Match' : 'Saved'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ height: 90 }} className="card skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <div className="empty-title">No grants found</div>
            <div className="empty-subtitle">Try adjusting your search or filters. New grants are added regularly.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(opp => (
            <OppCard
              key={opp.id}
              opp={opp}
              selected={selected?.id === opp.id}
              onClick={() => setSelected(selected?.id === opp.id ? null : opp)}
              onSave={() => saveGrant(opp)}
              onScore={() => scoreMatch(opp)}
              onDraft={() => { setPage('generator') }}
            />
          ))}
        </div>
      )}

      <p style={{ marginTop: 16, color: 'var(--ink-tertiary)', fontSize: 12, textAlign: 'center' }}>
        {filtered.length} opportunities shown
      </p>
    </div>
  )
}

function OppCard({ opp, selected, onClick, onSave, onScore, onDraft }) {
  const ms = opp.match_scores?.[0]
  const score = ms?.score ?? null
  const deadline = opp.deadline ? new Date(opp.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : null

  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        cursor: 'pointer',
        border: selected ? '1px solid var(--accent)' : undefined,
        transition: 'all var(--dur-fast) var(--ease)',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Score ring */}
        {score !== null && (
          <div className="score-ring" style={{ flexShrink: 0, marginTop: 2 }}>
            <svg viewBox="0 0 36 36">
              <circle className="score-ring-bg" cx="18" cy="18" r="15.9" strokeWidth="2.5" />
              <circle
                className="score-ring-fg"
                cx="18" cy="18" r="15.9"
                strokeWidth="2.5"
                stroke={SCORE_COLOR(score)}
                strokeDasharray={`${score} ${100 - score}`}
                strokeDashoffset="25"
              />
            </svg>
            <div className="score-ring-text" style={{ fontSize: 10, color: SCORE_COLOR(score) }}>{score}</div>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', marginBottom: 2 }} className="truncate">
                {opp.title || 'Untitled Grant'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>{opp.funder_name}</div>
            </div>
            <div style={{ display: 'flex', align: 'center', gap: 8, flexShrink: 0 }}>
              {opp.amount_max && (
                <span className="pill pill-ok" style={{ fontWeight: 700 }}>
                  ${(opp.amount_max / 1000).toFixed(0)}k
                </span>
              )}
            </div>
          </div>

          {selected && (
            <div style={{ marginTop: 14, animation: 'slideUp 200ms var(--ease)' }}>
              {opp.description && (
                <p style={{ fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  {opp.description?.slice(0, 280)}…
                </p>
              )}

              {/* Match breakdown */}
              {ms && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: 'Mission Fit', val: ms.mission_score },
                    { label: 'NTEE Alignment', val: ms.ntee_score },
                    { label: 'Geography', val: ms.geo_score },
                    { label: 'Budget Range', val: ms.budget_score },
                  ].map(dim => dim.val != null && (
                    <div key={dim.label} style={{ padding: '10px 12px', background: 'var(--glass-light)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>{dim.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1 }}>
                          <div className="progress-fill" style={{ width: `${dim.val}%`, background: SCORE_COLOR(dim.val) }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: SCORE_COLOR(dim.val), width: 28, textAlign: 'right' }}>{dim.val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {deadline && <span className="pill pill-warn">Due {deadline}</span>}
                {opp.eligibility_type && <span className="pill pill-default">{opp.eligibility_type}</span>}
                {opp.focus_area && <span className="pill pill-info">{opp.focus_area}</span>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-accent btn-sm" onClick={e => { e.stopPropagation(); onDraft() }}>
                  Draft Proposal
                </button>
                <button className="btn btn-glass btn-sm" onClick={e => { e.stopPropagation(); onSave() }}>
                  Save to Pipeline
                </button>
                {!ms && (
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onScore() }}>
                    Score Match
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}

function SearchIcon({ style }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
