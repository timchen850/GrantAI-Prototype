import React, { useEffect, useState } from 'react'
import { sb, runAiJob } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useAuth } from '../lib/auth'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xewrvmqyzeiziimcmenj.supabase.co'

const SCORE_COLOR = s => s >= 80 ? 'var(--ok)' : s >= 60 ? 'var(--warn)' : 'var(--ink-tertiary)'

export default function Discovery({ setPage }) {
  const { toast } = useToast()
  const { profile } = useAuth()
  const tier = profile?.tier || 'free'
  const FREE_RESULT_LIMIT = 5
  const [opps, setOpps] = useState([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState(false)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('catalog')
  const [semanticResults, setSemanticResults] = useState([])

  useEffect(() => { loadOpps() }, [])

  async function loadOpps() {
    setLoading(true)
    const { data } = await sb
      .from('opportunities')
      .select('*, match_scores(overall, components), funders(name)')
      .order('created_at', { ascending: false })
      .limit(60)
    setOpps(data || [])
    setLoading(false)
  }

  async function discoverGrants() {
    setDiscovering(true)
    toast('Fetching grants from Grants.gov and embedding them...', 'default')
    try {
      const { data: { session } } = await sb.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ingest-grants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rows: 25 }),
      })
      const d = await res.json()
      if (d.ok) {
        toast(`Ingested ${d.ingested} new grants, embedded ${d.embedded}`, 'ok')
        await loadOpps()
      } else {
        toast(d.error || d.message || 'Ingestion failed', 'danger')
      }
    } catch {
      toast('Could not reach ingestion service', 'danger')
    } finally {
      setDiscovering(false)
    }
  }

  async function semanticSearch() {
    setSearching(true)
    try {
      const { data: { session } } = await sb.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: search.trim() ? JSON.stringify({ query: search }) : '{}',
      })
      const d = await res.json()
      if (d.ok) {
        setSemanticResults(d.results || [])
        setMode('semantic')
        if ((d.results || []).length === 0) {
          toast('No semantic matches found - try running Discover Grants first', 'default')
        }
      } else {
        toast(d.error || 'Semantic search failed', 'danger')
      }
    } catch {
      toast('Could not reach semantic search service', 'danger')
    } finally {
      setSearching(false)
    }
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
      toast('Scoring started - check back in a moment', 'default')
    } catch {
      toast('Could not start scoring', 'danger')
    }
  }

  const catalogFiltered = opps.filter(o => {
    const q = search.toLowerCase()
    const match = !q || o.title?.toLowerCase().includes(q) || o.funders?.name?.toLowerCase().includes(q)
    const score = o.match_scores?.[0]?.overall ?? 0
    if (filter === 'high') return match && score >= 70
    if (filter === 'saved') return match && o.saved
    return match
  })

  const fullList = mode === 'semantic' ? semanticResults : catalogFiltered
  const isLimited = tier === 'free' && fullList.length > FREE_RESULT_LIMIT
  const displayList = isLimited ? fullList.slice(0, FREE_RESULT_LIMIT) : fullList

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Grant Discovery</h1>
          <p className="page-subtitle">
            {mode === 'semantic'
              ? `${semanticResults.length} grants matched to your mission`
              : 'AI-matched opportunities for your organization'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-glass btn-sm" onClick={loadOpps} disabled={loading}>
            <RefreshIcon /> Refresh
          </button>
          <button className="btn btn-accent" onClick={discoverGrants} disabled={discovering}>
            {discovering
              ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} /> Discovering...</>
              : <><SearchPlusIcon /> Discover Grants</>
            }
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <SearchIcon style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }} />
          <input
            className="input"
            style={{ paddingLeft: 36, paddingRight: 110 }}
            placeholder={mode === 'semantic' ? "Describe what you're looking for..." : 'Search grants, funders...'}
            value={search}
            onChange={e => { setSearch(e.target.value); if (mode === 'semantic') setMode('catalog') }}
            onKeyDown={e => { if (e.key === 'Enter') semanticSearch() }}
          />
          <button
            className="btn btn-accent btn-sm"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
            onClick={semanticSearch}
            disabled={searching}
          >
            {searching ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : 'AI Match'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'high', 'saved'].map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f && mode === 'catalog' ? 'btn-glass' : 'btn-ghost'}`}
              onClick={() => { setFilter(f); setMode('catalog') }}
            >
              {f === 'all' ? 'All' : f === 'high' ? '70+ Match' : 'Saved'}
            </button>
          ))}
          {mode === 'semantic' && (
            <button className="btn btn-sm btn-glass" onClick={() => setMode('catalog')}>
              Clear AI Match
            </button>
          )}
        </div>
      </div>

      {mode === 'semantic' && (
        <div className="card" style={{
          marginBottom: 16, padding: '12px 16px',
          background: 'rgba(232,92,58,0.08)',
          border: '1px solid rgba(232,92,58,0.25)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <SparkleIcon />
          <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>
            Showing grants ranked by semantic similarity to your organization mission and focus areas.
          </span>
        </div>
      )}

      {loading || discovering ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ height: 90 }} className="card skeleton" />)}
        </div>
      ) : displayList.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">&#x1F50D;</div>
            <div className="empty-title">No grants found</div>
            <div className="empty-subtitle">
              Click "Discover Grants" to fetch new opportunities from Grants.gov, or use AI Match to find
              grants semantically matched to your mission.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayList.map(opp => (
            <OppCard
              key={opp.id}
              opp={opp}
              semanticMode={mode === 'semantic'}
              selected={selected?.id === opp.id}
              onClick={() => setSelected(selected?.id === opp.id ? null : opp)}
              onSave={() => saveGrant(opp)}
              onScore={() => scoreMatch(opp)}
              onDraft={() => setPage('generator')}
            />
          ))}
          {isLimited && (
            <div style={{
              borderRadius: 'var(--r-xl)',
              border: '1px dashed rgba(232,92,58,0.35)',
              background: 'linear-gradient(135deg, rgba(232,92,58,0.06) 0%, var(--bg-elevated) 100%)',
              padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
              <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>
                Showing {FREE_RESULT_LIMIT} of {fullList.length} results — upgrade to Starter for unlimited grant discovery.
              </span>
              <button
                onClick={() => setPage('pricing')}
                style={{
                  flexShrink: 0, padding: '8px 16px', borderRadius: 'var(--r)',
                  border: '1px solid rgba(232,92,58,0.4)', background: 'transparent',
                  color: 'var(--accent-bright)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                View Plans →
              </button>
            </div>
          )}
        </div>
      )}

      <p style={{ marginTop: 16, color: 'var(--ink-tertiary)', fontSize: 12, textAlign: 'center' }}>
        {displayList.length} opportunities shown
        {mode === 'semantic' && ' - ranked by mission similarity'}
      </p>
    </div>
  )
}

function OppCard({ opp, semanticMode, selected, onClick, onSave, onScore, onDraft }) {
  const ms           = opp.match_scores?.[0]
  const score        = ms?.overall ?? null
  const simPct       = opp.similarity != null ? Math.round(opp.similarity * 100) : null
  const displayScore = semanticMode ? simPct : score
  const funderName   = opp.funders?.name || opp.funder_name || null
  const deadline     = opp.deadline
    ? new Date(opp.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div
      className="card"
      style={{
        padding: '16px 20px', cursor: 'pointer',
        border: selected ? '1px solid var(--accent)' : undefined,
        transition: 'all var(--dur-fast) var(--ease)',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {displayScore !== null && (
          <div className="score-ring" style={{ flexShrink: 0, marginTop: 2 }}>
            <svg viewBox="0 0 36 36">
              <circle className="score-ring-bg" cx="18" cy="18" r="15.9" strokeWidth="2.5" />
              <circle
                className="score-ring-fg" cx="18" cy="18" r="15.9" strokeWidth="2.5"
                stroke={SCORE_COLOR(displayScore)}
                strokeDasharray={`${displayScore} ${100 - displayScore}`}
                strokeDashoffset="25"
              />
            </svg>
            <div className="score-ring-text" style={{ fontSize: 10, color: SCORE_COLOR(displayScore) }}>
              {displayScore}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', marginBottom: 2 }} className="truncate">
                {opp.title || 'Untitled Grant'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                {funderName}
                {semanticMode && opp.similarity != null && (
                  <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 500 }}>
                    {Math.round(opp.similarity * 100)}% match
                  </span>
                )}
              </div>
            </div>
            {(opp.award_ceiling || opp.amount_max) && (
              <span className="pill pill-ok" style={{ fontWeight: 700, flexShrink: 0 }}>
                ${(((opp.award_ceiling || opp.amount_max) / 1000)).toFixed(0)}k
              </span>
            )}
          </div>

          {selected && (
            <div style={{ marginTop: 14, animation: 'slideUp 200ms var(--ease)' }}>
              {opp.description && (
                <p style={{ fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  {opp.description?.slice(0, 280)}...
                </p>
              )}

              {ms?.components && Array.isArray(ms.components) && ms.components.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {ms.components.map(dim => dim.score != null && (
                    <div key={dim.key} style={{ padding: '10px 12px', background: 'var(--glass-light)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 4 }}>
                        {dim.key === 'mission' ? 'Mission Fit' : dim.key === 'ntee' ? 'NTEE Alignment' : dim.key === 'geography' ? 'Geography' : 'Budget Range'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-bar" style={{ flex: 1 }}>
                          <div className="progress-fill" style={{ width: `${dim.score}%`, background: SCORE_COLOR(dim.score) }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: SCORE_COLOR(dim.score), width: 28, textAlign: 'right' }}>{dim.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {deadline && <span className="pill pill-warn">Due {deadline}</span>}
                {opp.focus_areas?.map(f => <span key={f} className="pill pill-info">{f}</span>)}
                {opp.source === 'grants_gov' && <span className="pill pill-default">Grants.gov</span>}
                {opp.source_url && (
                  <a href={opp.source_url} target="_blank" rel="noreferrer"
                    className="pill pill-default" style={{ textDecoration: 'none' }}
                    onClick={e => e.stopPropagation()}>
                    View RFP &#x2197;
                  </a>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn btn-accent btn-sm" onClick={e => { e.stopPropagation(); onDraft() }}>
                  Draft Proposal
                </button>
                <button className="btn btn-glass btn-sm" onClick={e => { e.stopPropagation(); onSave() }}>
                  Save to Pipeline
                </button>
                {!ms && !semanticMode && (
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

function SearchPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
      <line x1="11" y1="8" x2="11" y2="14"/>
      <line x1="8" y1="11" x2="14" y2="11"/>
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  )
}
