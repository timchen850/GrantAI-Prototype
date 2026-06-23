import React, { useEffect, useState, useCallback } from 'react'
import { sb, runAiJob } from '../lib/supabase'
import { useToast } from '../lib/toast'

const STATUS_PILL = {
  empty:    { label: 'Empty',    cls: 'pill-default' },
  ai_draft: { label: 'AI Draft', cls: 'pill-warn' },
  edited:   { label: 'Edited',   cls: 'pill-info' },
  final:    { label: 'Final',    cls: 'pill-ok' },
}

export default function ApplicationWriter({ setPage, pageParams }) {
  const { toast } = useToast()
  const grantId      = pageParams?.grantId
  const opportunityId = pageParams?.opportunityId

  const [grant, setGrant] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({}) // questionId → answer row
  const [writing, setWriting] = useState({}) // questionId → bool
  const [polling, setPolling] = useState({}) // questionId → intervalId
  const [loading, setLoading] = useState(true)
  const [activeQ, setActiveQ] = useState(null)

  useEffect(() => {
    if (grantId) load()
  }, [grantId])

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => { Object.values(polling).forEach(id => clearInterval(id)) }
  }, [polling])

  async function load() {
    setLoading(true)
    const [{ data: grantRow }, { data: qs }] = await Promise.all([
      sb.from('grants')
        .select('*, opportunities(id, title, funder_name:funders(name), description, deadline)')
        .eq('id', grantId)
        .maybeSingle(),
      sb.from('grant_questions')
        .select('*')
        .eq('opportunity_id', opportunityId)
        .order('question_order'),
    ])

    setGrant(grantRow)

    if (qs && qs.length > 0) {
      setQuestions(qs)
      setActiveQ(qs[0].id)

      const { data: existingAnswers } = await sb
        .from('grant_answers')
        .select('*')
        .eq('grant_id', grantId)
        .in('question_id', qs.map(q => q.id))

      const aMap = {}
      ;(existingAnswers || []).forEach(a => { aMap[a.question_id] = a })
      setAnswers(aMap)
    }
    setLoading(false)
  }

  async function writeWithAI(questionId) {
    setWriting(prev => ({ ...prev, [questionId]: true }))
    try {
      const job = await runAiJob('answer_question', {
        question_id: questionId,
        grant_id: grantId,
      })
      toast('AI is writing your essay…', 'default')
      pollForAnswer(questionId, job.id)
    } catch {
      toast('Could not start AI writing', 'danger')
      setWriting(prev => ({ ...prev, [questionId]: false }))
    }
  }

  function pollForAnswer(questionId, jobId) {
    const id = setInterval(async () => {
      const { data: job } = await sb
        .from('ai_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle()

      if (job?.status === 'succeeded' || job?.status === 'failed') {
        clearInterval(id)
        setPolling(prev => { const n = { ...prev }; delete n[questionId]; return n })
        setWriting(prev => ({ ...prev, [questionId]: false }))

        if (job.status === 'succeeded') {
          const { data: answer } = await sb
            .from('grant_answers')
            .select('*')
            .eq('grant_id', grantId)
            .eq('question_id', questionId)
            .maybeSingle()
          if (answer) {
            setAnswers(prev => ({ ...prev, [questionId]: answer }))
            toast('Essay drafted — review and refine it', 'ok')
          }
        } else {
          toast('AI writing failed — try again', 'danger')
        }
      }
    }, 2500)
    setPolling(prev => ({ ...prev, [questionId]: id }))
  }

  async function saveAnswer(questionId, text, status = 'edited') {
    const { error } = await sb.from('grant_answers').upsert({
      grant_id: grantId,
      question_id: questionId,
      answer_text: text,
      status,
    }, { onConflict: 'user_id,grant_id,question_id' })

    if (error) { toast('Save failed', 'danger'); return }
    setAnswers(prev => ({ ...prev, [questionId]: { ...prev[questionId], answer_text: text, status } }))
  }

  async function markFinal(questionId) {
    const ans = answers[questionId]
    if (!ans?.answer_text) { toast('Write an answer first', 'danger'); return }
    await saveAnswer(questionId, ans.answer_text, 'final')
    toast('Marked as final', 'ok')
  }

  const opp = grant?.opportunities
  const title = opp?.title || 'Grant Application'
  const funder = opp?.funder_name?.name || opp?.funder_name || ''
  const deadline = opp?.deadline
    ? new Date(opp.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const completedCount = questions.filter(q =>
    ['edited','final'].includes(answers[q.id]?.status)
  ).length

  if (!grantId) {
    return (
      <div className="fade-in">
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">✍️</div>
            <div className="empty-title">No grant selected</div>
            <div className="empty-subtitle">Open a grant from your pipeline to start answering application questions.</div>
            <button className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => setPage('grants')}>
              Go to Pipeline
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setPage('grants')}
          >
            <BackIcon /> Back to Pipeline
          </button>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">
            {funder && `${funder} · `}
            {deadline && `Due ${deadline} · `}
            {questions.length > 0 && `${completedCount}/${questions.length} questions answered`}
          </p>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="card skeleton" style={{ height: 120 }} />)}
        </div>
      ) : questions.length === 0 ? (
        <NoQuestionsPlaceholder opportunityId={opportunityId} onAdded={load} />
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Question nav sidebar */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div className="card" style={{ padding: '12px 8px' }}>
              {questions.map((q, i) => {
                const ans = answers[q.id]
                const meta = STATUS_PILL[ans?.status || 'empty']
                return (
                  <button
                    key={q.id}
                    className={`btn btn-ghost btn-sm ${activeQ === q.id ? 'btn-glass' : ''}`}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      borderRadius: 8, marginBottom: 4,
                      border: activeQ === q.id ? '1px solid var(--accent)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}
                    onClick={() => setActiveQ(q.id)}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Q{i + 1}</span>
                    <span className={`pill ${meta.cls}`} style={{ fontSize: 10 }}>{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Active question editor */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {questions.filter(q => q.id === activeQ).map(q => (
              <QuestionEditor
                key={q.id}
                question={q}
                answer={answers[q.id]}
                writing={!!writing[q.id]}
                onWrite={() => writeWithAI(q.id)}
                onSave={(text) => saveAnswer(q.id, text)}
                onFinal={() => markFinal(q.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function QuestionEditor({ question, answer, writing, onWrite, onSave, onFinal }) {
  const [text, setText] = useState(answer?.answer_text || '')
  const [dirty, setDirty] = useState(false)

  // Sync when AI draft arrives
  useEffect(() => {
    if (answer?.answer_text && answer.answer_text !== text) {
      setText(answer.answer_text)
      setDirty(false)
    }
  }, [answer?.answer_text])

  function handleChange(e) {
    setText(e.target.value)
    setDirty(true)
  }

  async function handleSave() {
    await onSave(text)
    setDirty(false)
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
  const meta = STATUS_PILL[answer?.status || 'empty']

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Question header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span className={`pill ${meta.cls}`}>{meta.label}</span>
            {question.is_essay && <span className="pill pill-info">Essay</span>}
            {question.word_limit && (
              <span className="pill pill-default">{question.word_limit} word limit</span>
            )}
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.5, margin: 0 }}>
            {question.question_text}
          </p>
          {question.hint && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-tertiary)', marginTop: 6, fontStyle: 'italic' }}>
              Funder hint: {question.hint}
            </p>
          )}
        </div>
        <button
          className="btn btn-accent btn-sm"
          onClick={onWrite}
          disabled={writing}
          style={{ flexShrink: 0, minWidth: 120 }}
        >
          {writing ? (
            <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Writing…</>
          ) : (
            <><SparkleIcon /> Write with AI</>
          )}
        </button>
      </div>

      {/* Text editor */}
      <textarea
        className="input"
        style={{
          width: '100%', minHeight: 340, resize: 'vertical',
          fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.7,
          padding: '14px 16px',
          background: writing ? 'var(--glass-light)' : undefined,
        }}
        placeholder={writing
          ? 'AI is writing your essay…'
          : 'Type your answer here, or click "Write with AI" to generate a draft…'
        }
        value={text}
        onChange={handleChange}
        disabled={writing}
      />

      {/* Footer controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', display: 'flex', gap: 12 }}>
          <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
          {question.word_limit && (
            <span style={{ color: wordCount > question.word_limit ? 'var(--danger)' : undefined }}>
              {question.word_limit - wordCount >= 0 ? `${question.word_limit - wordCount} remaining` : `${wordCount - question.word_limit} over limit`}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dirty && (
            <button className="btn btn-glass btn-sm" onClick={handleSave}>
              Save Draft
            </button>
          )}
          <button
            className="btn btn-accent btn-sm"
            onClick={onFinal}
            disabled={!text.trim()}
          >
            <CheckIcon /> Mark Final
          </button>
        </div>
      </div>
    </div>
  )
}

// Shown when an opportunity has no questions yet — lets the user add them
function NoQuestionsPlaceholder({ opportunityId, onAdded }) {
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  const [questionText, setQuestionText] = useState('')
  const [wordLimit, setWordLimit] = useState('')
  const [saving, setSaving] = useState(false)

  async function addQuestion() {
    if (!questionText.trim()) return
    setSaving(true)
    const { error } = await sb.from('grant_questions').insert({
      opportunity_id: opportunityId,
      question_text: questionText.trim(),
      word_limit: wordLimit ? parseInt(wordLimit) : null,
      is_essay: true,
      question_order: 0,
    })
    setSaving(false)
    if (error) { toast('Failed to add question', 'danger'); return }
    setQuestionText('')
    setWordLimit('')
    setAdding(false)
    toast('Question added', 'ok')
    onAdded()
  }

  return (
    <div className="card">
      <div className="empty-state">
        <div className="empty-icon">📝</div>
        <div className="empty-title">No application questions yet</div>
        <div className="empty-subtitle">
          Add the funder's essay questions from their RFP so Grange AI can write each one for you.
        </div>
        {adding ? (
          <div style={{ width: '100%', maxWidth: 480, marginTop: 20, textAlign: 'left' }}>
            <textarea
              className="input"
              style={{ width: '100%', minHeight: 100, marginBottom: 10, resize: 'vertical' }}
              placeholder="Paste the funder's question here…"
              value={questionText}
              onChange={e => setQuestionText(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className="input"
                style={{ width: 120 }}
                type="number"
                placeholder="Word limit"
                value={wordLimit}
                onChange={e => setWordLimit(e.target.value)}
              />
              <button className="btn btn-accent btn-sm" onClick={addQuestion} disabled={saving || !questionText.trim()}>
                {saving ? 'Saving…' : 'Add Question'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
            Add Application Question
          </button>
        )}
      </div>
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
      <path d="M5 12l5 5L20 6"/>
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  )
}
