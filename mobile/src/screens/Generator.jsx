import React, { useEffect, useState, useRef } from 'react'
import { sb, streamProposal } from '../lib/supabase'
import { useToast } from '../lib/toast'

const SECTIONS = [
  { key: 'executive_summary',    label: 'Executive Summary',     words: 300 },
  { key: 'needs_statement',      label: 'Statement of Need',     words: 600 },
  { key: 'goals_objectives',     label: 'Goals & Objectives',    words: 400 },
  { key: 'project_design',       label: 'Project Design',        words: 800 },
  { key: 'evaluation_plan',      label: 'Evaluation Plan',       words: 500 },
  { key: 'organization_capacity',label: 'Org Capacity',          words: 400 },
  { key: 'budget_narrative',     label: 'Budget Narrative',      words: 500 },
  { key: 'sustainability',       label: 'Sustainability',         words: 400 },
]

const S_STATUS = {
  empty:      { cls: 'pill-default', label: 'Empty' },
  ai_drafting:{ cls: 'pill-warn',    label: 'Writing…' },
  ai_draft:   { cls: 'pill-info',    label: 'Draft' },
  edited:     { cls: 'pill-accent',  label: 'Edited' },
  final:      { cls: 'pill-ok',      label: 'Final' },
}

export default function Generator() {
  const { toast } = useToast()
  const [grants, setGrants] = useState([])
  const [selectedGrant, setSelectedGrant] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [sections, setSections] = useState({})
  const [activeSec, setActiveSec] = useState(null)
  const [streaming, setStreaming] = useState(false)
  const [view, setView] = useState('list') // list | editor
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    sb.from('grants')
      .select('*, opportunities(title, funder_name, description, amount_max)')
      .in('status', ['saved', 'drafting'])
      .order('updated_at', { ascending: false })
      .then(({ data }) => setGrants(data || []))
  }, [])

  async function loadProposal(grant) {
    setSelectedGrant(grant)
    const { data: p } = await sb.from('proposals').select('*').eq('grant_id', grant.id).single()
    let propId
    if (p) {
      setProposal(p); propId = p.id
      const { data: s } = await sb.from('proposal_sections').select('*').eq('proposal_id', p.id)
      const map = {}; s?.forEach(sec => { map[sec.section_key] = sec }); setSections(map)
    } else {
      const { data: newP } = await sb.from('proposals').insert({ grant_id: grant.id }).select().single()
      setProposal(newP); propId = newP.id; setSections({})
    }
    setView('list')
  }

  async function draftSection(secKey) {
    if (!proposal || !selectedGrant) return
    setStreaming(true)
    setSections(prev => ({ ...prev, [secKey]: { ...(prev[secKey] || {}), status: 'ai_drafting', content: '' } }))
    let accumulated = ''
    try {
      await streamProposal({
        proposal_id: proposal.id,
        section_key: secKey,
        grant_title: selectedGrant.opportunities?.title,
        grant_description: selectedGrant.opportunities?.description,
        funder_name: selectedGrant.opportunities?.funder_name,
      }, chunk => {
        accumulated += chunk
        setSections(prev => ({ ...prev, [secKey]: { ...(prev[secKey] || {}), content: accumulated, status: 'ai_drafting' } }))
      })
      const { data: saved } = await sb.from('proposal_sections').upsert({
        proposal_id: proposal.id, section_key: secKey, content: accumulated, status: 'ai_draft',
      }).select().single()
      setSections(prev => ({ ...prev, [secKey]: saved }))
      toast('Section drafted!', 'ok')
    } catch (err) {
      toast('Drafting failed', 'danger')
      setSections(prev => ({ ...prev, [secKey]: { ...(prev[secKey] || {}), status: 'empty' } }))
    }
    setStreaming(false)
  }

  async function saveEdit() {
    if (!proposal || !activeSec) return
    const { data } = await sb.from('proposal_sections').upsert({
      proposal_id: proposal.id, section_key: activeSec, content: editContent, status: 'edited',
    }).select().single()
    setSections(prev => ({ ...prev, [activeSec]: data }))
    setEditing(false)
    toast('Saved', 'ok')
  }

  // Section editor view
  if (view === 'editor' && activeSec) {
    const sec = sections[activeSec]
    const secMeta = SECTIONS.find(s => s.key === activeSec)
    const wordCount = sec?.content ? sec.content.split(/\s+/).filter(Boolean).length : 0

    return (
      <div className="fade-in" style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-base)', paddingTop: 'var(--safe-top)',
      }}>
        {/* Editor header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          background: 'rgba(10,10,16,0.9)', flexShrink: 0,
        }}>
          <button className="btn-icon" onClick={() => { setView('list'); setEditing(false) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }} className="truncate">{secMeta?.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-tertiary)' }}>{wordCount}/{secMeta?.words} words</div>
          </div>
          {editing ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn btn-accent btn-sm" onClick={saveEdit}>Save</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              {sec?.content && <button className="btn btn-glass btn-sm" onClick={() => { setEditContent(sec.content); setEditing(true) }}>Edit</button>}
              <button className="btn btn-accent btn-sm" disabled={streaming} onClick={() => draftSection(activeSec)}>
                {streaming ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }} /> : '✨'}
                {streaming ? ' Writing…' : sec?.content ? ' Re-draft' : ' Draft'}
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="progress-bar" style={{ borderRadius: 0, height: 2 }}>
          <div className="progress-fill" style={{
            width: `${Math.min(100, (wordCount / (secMeta?.words || 500)) * 100)}%`,
            background: wordCount >= (secMeta?.words || 500) ? 'var(--ok)' : 'var(--accent)',
          }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 16px', WebkitOverflowScrolling: 'touch' }}>
          {editing ? (
            <textarea
              className="input textarea"
              style={{ height: '100%', minHeight: 400, fontSize: 15, lineHeight: 1.7, resize: 'none', border: '1px solid var(--accent)', userSelect: 'text', WebkitUserSelect: 'text' }}
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              autoFocus
            />
          ) : sec?.content ? (
            <div style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--ink)', whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
              {sec.content}
              {streaming && <span style={{ display: 'inline-block', width: 2, height: 18, background: 'var(--accent)', marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">{streaming ? <span className="spinner spinner-lg" /> : '✨'}</div>
              <div className="empty-title">{streaming ? 'Drafting…' : 'No content yet'}</div>
              <div className="empty-subtitle">{streaming ? 'AI is writing your section' : 'Tap Draft to generate with AI'}</div>
            </div>
          )}
        </div>
        <style>{`@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      </div>
    )
  }

  return (
    <div className="scroll-view fade-in">
      <div className="content">
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">Draft</h1>
          <p className="page-subtitle">AI-powered proposal writing</p>
        </div>

        {/* Grant selector */}
        <div className="section">
          <div className="section-header">
            <span className="section-title">Grant</span>
          </div>
          {grants.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: '24px 16px' }}>
                <div className="empty-icon">💾</div>
                <div className="empty-title">No saved grants</div>
                <div className="empty-subtitle">Save grants in Discover first, then come back to draft.</div>
              </div>
            </div>
          ) : (
            <div className="list-card">
              {grants.map(g => (
                <div key={g.id} className="list-row"
                  style={{ background: selectedGrant?.id === g.id ? 'var(--glass-mid)' : undefined }}
                  onClick={() => loadProposal(g)}
                >
                  <div className="list-row-icon" style={{ background: selectedGrant?.id === g.id ? 'var(--accent-dim)' : 'var(--glass-mid)' }}>
                    <span style={{ fontSize: 18 }}>📄</span>
                  </div>
                  <div className="list-row-content">
                    <div className="list-row-title">{g.opportunities?.title?.slice(0, 40) || 'Untitled Grant'}</div>
                    <div className="list-row-subtitle">{g.opportunities?.funder_name || '—'}</div>
                  </div>
                  {selectedGrant?.id === g.id && <span className="pill pill-accent">Selected</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sections */}
        {selectedGrant && (
          <div className="section">
            <div className="section-header">
              <span className="section-title">Sections</span>
              <span style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
                {SECTIONS.filter(s => sections[s.key]?.status && sections[s.key].status !== 'empty').length}/{SECTIONS.length} drafted
              </span>
            </div>
            <div className="list-card">
              {SECTIONS.map(sec => {
                const s = sections[sec.key]
                const status = s?.status || 'empty'
                const sm = S_STATUS[status] || S_STATUS.empty
                return (
                  <div key={sec.key} className="list-row"
                    onClick={() => { setActiveSec(sec.key); setView('editor'); setEditing(false) }}
                  >
                    <div className="list-row-icon" style={{
                      background: status === 'final' ? 'var(--ok-dim)' : status === 'ai_draft' || status === 'edited' ? 'var(--info-dim)' : 'var(--glass-mid)',
                    }}>
                      <span style={{ fontSize: 18 }}>
                        {status === 'final' ? '✅' : status === 'ai_draft' ? '📝' : status === 'edited' ? '✏️' : status === 'ai_drafting' ? '⏳' : '◻️'}
                      </span>
                    </div>
                    <div className="list-row-content">
                      <div className="list-row-title">{sec.label}</div>
                      <div className="list-row-subtitle">{sec.words} words target</div>
                    </div>
                    <div className="list-row-right">
                      <span className={`pill ${sm.cls}`}>{sm.label}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.3 }}>
                        <path d="m9 18 6-6-6-6"/>
                      </svg>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
