import React, { useEffect, useState, useRef } from 'react'
import { sb, streamProposal } from '../lib/supabase'
import { useToast } from '../lib/toast'

const SECTIONS = [
  { key: 'executive_summary', label: 'Executive Summary', words: 300 },
  { key: 'needs_statement', label: 'Statement of Need', words: 600 },
  { key: 'goals_objectives', label: 'Goals & Objectives', words: 400 },
  { key: 'project_design', label: 'Project Design', words: 800 },
  { key: 'evaluation_plan', label: 'Evaluation Plan', words: 500 },
  { key: 'organization_capacity', label: 'Organizational Capacity', words: 400 },
  { key: 'budget_narrative', label: 'Budget Narrative', words: 500 },
  { key: 'sustainability', label: 'Sustainability Plan', words: 400 },
]

const STATUS_LABELS = {
  empty: 'Empty',
  ai_drafting: 'Drafting…',
  ai_draft: 'AI Draft',
  edited: 'Edited',
  final: 'Final',
}

const STATUS_PILLS = {
  empty:      'pill-default',
  ai_drafting:'pill-warn',
  ai_draft:   'pill-info',
  edited:     'pill-accent',
  final:      'pill-ok',
}

export default function Generator() {
  const { toast } = useToast()
  const [grants, setGrants] = useState([])
  const [selectedGrant, setSelectedGrant] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [sections, setSections] = useState({})
  const [activeSection, setActiveSection] = useState(SECTIONS[0].key)
  const [streaming, setStreaming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const textareaRef = useRef(null)

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
    if (p) {
      setProposal(p)
      const { data: s } = await sb.from('proposal_sections').select('*').eq('proposal_id', p.id)
      const map = {}
      s?.forEach(sec => { map[sec.section_key] = sec })
      setSections(map)
    } else {
      const { data: newP } = await sb.from('proposals').insert({ grant_id: grant.id }).select().single()
      setProposal(newP)
      setSections({})
    }
  }

  async function draftSection(sectionKey) {
    if (!proposal || !selectedGrant) return
    setStreaming(true)
    const sec = sections[sectionKey]
    const tmpId = Date.now()

    setSections(prev => ({
      ...prev,
      [sectionKey]: { ...(prev[sectionKey] || {}), status: 'ai_drafting', content: '' },
    }))

    let accumulated = ''
    try {
      await streamProposal({
        proposal_id: proposal.id,
        section_key: sectionKey,
        grant_title: selectedGrant.opportunities?.title,
        grant_description: selectedGrant.opportunities?.description,
        funder_name: selectedGrant.opportunities?.funder_name,
      }, chunk => {
        accumulated += chunk
        setSections(prev => ({
          ...prev,
          [sectionKey]: { ...(prev[sectionKey] || {}), content: accumulated, status: 'ai_drafting' },
        }))
      })

      // Persist
      const { data: saved } = await sb.from('proposal_sections').upsert({
        proposal_id: proposal.id,
        section_key: sectionKey,
        content: accumulated,
        status: 'ai_draft',
      }).select().single()

      setSections(prev => ({ ...prev, [sectionKey]: saved }))
      toast('Section drafted!', 'ok')
    } catch (err) {
      toast('Drafting failed: ' + err.message, 'danger')
      setSections(prev => ({
        ...prev,
        [sectionKey]: { ...(prev[sectionKey] || {}), status: 'empty' },
      }))
    }
    setStreaming(false)
  }

  async function saveEdit() {
    if (!proposal) return
    const { data: saved } = await sb.from('proposal_sections').upsert({
      proposal_id: proposal.id,
      section_key: activeSection,
      content: editContent,
      status: 'edited',
    }).select().single()
    setSections(prev => ({ ...prev, [activeSection]: saved }))
    setEditing(false)
    toast('Section saved', 'ok')
  }

  async function markFinal(sectionKey) {
    if (!sections[sectionKey]) return
    await sb.from('proposal_sections').update({ status: 'final' }).eq('id', sections[sectionKey].id)
    setSections(prev => ({ ...prev, [sectionKey]: { ...prev[sectionKey], status: 'final' } }))
    toast('Marked as final', 'ok')
  }

  const activeSec = sections[activeSection]
  const wordCount = activeSec?.content ? activeSec.content.split(/\s+/).filter(Boolean).length : 0
  const targetWords = SECTIONS.find(s => s.key === activeSection)?.words || 500
  const allDrafted = SECTIONS.filter(s => sections[s.key]?.status !== 'empty' && sections[s.key]?.status != null).length

  return (
    <div className="fade-in" style={{ display: 'flex', gap: 20, height: '100%' }}>
      {/* Left: grant selector + section nav */}
      <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Grant picker */}
        <div className="card" style={{ padding: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>Grant</div>
          {grants.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>Save grants in Discovery first.</p>
          ) : (
            <select
              className="input select"
              style={{ fontSize: 12.5, padding: '7px 10px' }}
              value={selectedGrant?.id || ''}
              onChange={e => {
                const g = grants.find(g => g.id === e.target.value)
                if (g) loadProposal(g)
              }}
            >
              <option value="">Select a grant…</option>
              {grants.map(g => (
                <option key={g.id} value={g.id}>{g.opportunities?.title?.slice(0, 36) || 'Untitled'}</option>
              ))}
            </select>
          )}
        </div>

        {/* Section nav */}
        {selectedGrant && (
          <div className="card" style={{ padding: 8, flex: 1, overflow: 'auto' }}>
            <div className="label" style={{ padding: '6px 8px' }}>Sections</div>
            {SECTIONS.map(sec => {
              const s = sections[sec.key]
              const status = s?.status || 'empty'
              return (
                <button
                  key={sec.key}
                  onClick={() => { setActiveSection(sec.key); setEditing(false) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '8px 10px', borderRadius: 8,
                    background: activeSection === sec.key ? 'var(--glass-mid)' : 'none',
                    border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
                    color: 'var(--ink)', fontFamily: 'var(--font)', fontSize: 12.5,
                    fontWeight: activeSection === sec.key ? 600 : 400,
                    transition: 'background var(--dur-fast)',
                  }}
                >
                  <span className="truncate">{sec.label}</span>
                  <span className={`pill ${STATUS_PILLS[status]}`} style={{ fontSize: 9.5, padding: '2px 5px', flexShrink: 0 }}>
                    {STATUS_LABELS[status]}
                  </span>
                </button>
              )
            })}
            <div className="divider" style={{ margin: '8px 0' }} />
            <div style={{ padding: '4px 8px 8px', fontSize: 11.5, color: 'var(--ink-tertiary)' }}>
              {allDrafted}/{SECTIONS.length} sections drafted
            </div>
          </div>
        )}
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
        {!selectedGrant ? (
          <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="empty-state">
              <div className="empty-icon">✍️</div>
              <div className="empty-title">Select a grant to start drafting</div>
              <div className="empty-subtitle">Choose a saved grant from the panel on the left to begin generating your proposal.</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Section toolbar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {SECTIONS.find(s => s.key === activeSection)?.label}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-tertiary)', marginTop: 2 }}>
                  {wordCount} / {targetWords} words
                  {activeSec?.status && <span className={`pill ${STATUS_PILLS[activeSec.status]}`} style={{ marginLeft: 8, fontSize: 9.5, padding: '2px 5px' }}>{STATUS_LABELS[activeSec.status]}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {activeSec?.content && !editing && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditContent(activeSec.content); setEditing(true) }}>
                      Edit
                    </button>
                    {activeSec.status !== 'final' && (
                      <button className="btn btn-glass btn-sm" onClick={() => markFinal(activeSection)}>
                        Mark Final
                      </button>
                    )}
                  </>
                )}
                {editing && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="btn btn-accent btn-sm" onClick={saveEdit}>Save</button>
                  </>
                )}
                <button
                  className="btn btn-accent btn-sm"
                  onClick={() => draftSection(activeSection)}
                  disabled={streaming}
                >
                  {streaming && activeSection === activeSection ? (
                    <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Drafting…</>
                  ) : (
                    <><SparkleIcon /> {activeSec?.content ? 'Re-draft' : 'Draft with AI'}</>
                  )}
                </button>
              </div>
            </div>

            {/* Word progress */}
            <div className="progress-bar" style={{ height: 2, borderRadius: 0 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${Math.min(100, (wordCount / targetWords) * 100)}%`,
                  background: wordCount >= targetWords ? 'var(--ok)' : 'var(--accent)',
                }}
              />
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
              {editing ? (
                <textarea
                  ref={textareaRef}
                  className="input textarea"
                  style={{
                    height: '100%', minHeight: 400, fontSize: 14, lineHeight: 1.7,
                    resize: 'none', background: 'transparent', border: '1px solid var(--accent)',
                  }}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  autoFocus
                />
              ) : activeSec?.content ? (
                <div style={{
                  fontSize: 14, lineHeight: 1.75, color: 'var(--ink)',
                  whiteSpace: 'pre-wrap', userSelect: 'text',
                }}>
                  {activeSec.content}
                  {streaming && activeSec.status === 'ai_drafting' && (
                    <span style={{
                      display: 'inline-block', width: 2, height: 16,
                      background: 'var(--accent)', marginLeft: 2,
                      animation: 'blink 1s step-end infinite',
                      verticalAlign: 'text-bottom',
                    }} />
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <div className="empty-state">
                    <div className="empty-icon">
                      {streaming ? <span className="spinner spinner-lg" /> : '✨'}
                    </div>
                    <div className="empty-title">{streaming ? 'Drafting your section…' : 'No content yet'}</div>
                    <div className="empty-subtitle">
                      {streaming ? 'AI is writing your ' + SECTIONS.find(s => s.key === activeSection)?.label : 'Click "Draft with AI" to generate this section using your org profile and grant details.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
    </svg>
  )
}
