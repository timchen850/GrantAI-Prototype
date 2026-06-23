import React, { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useToast } from '../lib/toast'

const STATUSES = ['discovered','saved','drafting','submitted','awarded','rejected']
const STATUS_META = {
  discovered: { label: 'Discovered', cls: 'pill-default', color: 'var(--ink-secondary)' },
  saved:      { label: 'Saved',      cls: 'pill-info',    color: 'var(--info)' },
  drafting:   { label: 'Drafting',   cls: 'pill-warn',    color: 'var(--warn)' },
  submitted:  { label: 'Submitted',  cls: 'pill-accent',  color: 'var(--accent)' },
  awarded:    { label: 'Awarded',    cls: 'pill-ok',      color: 'var(--ok)' },
  rejected:   { label: 'Rejected',   cls: 'pill-danger',  color: 'var(--danger)' },
}

export default function Grants({ setPage }) {
  const { toast } = useToast()
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => { loadGrants() }, [])

  async function loadGrants() {
    setLoading(true)
    const { data } = await sb
      .from('grants')
      .select('*, opportunities(title, funder_name, amount_max, deadline)')
      .order('updated_at', { ascending: false })
    setGrants(data || [])
    setLoading(false)
  }

  async function updateStatus(grantId, status) {
    const { error } = await sb.from('grants').update({ status }).eq('id', grantId)
    if (error) { toast('Update failed', 'danger'); return }
    setGrants(prev => prev.map(g => g.id === grantId ? { ...g, status } : g))
    toast(`Status updated to ${STATUS_META[status].label}`, 'ok')
  }

  async function deleteGrant(grantId) {
    const { error } = await sb.from('grants').delete().eq('id', grantId)
    if (error) { toast('Delete failed', 'danger'); return }
    setGrants(prev => prev.filter(g => g.id !== grantId))
    toast('Grant removed from pipeline', 'default')
  }

  const filtered = filterStatus === 'all' ? grants : grants.filter(g => g.status === filterStatus)

  // Pipeline summary
  const summary = STATUSES.reduce((acc, s) => {
    acc[s] = grants.filter(g => g.status === s).length
    return acc
  }, {})

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Grant Management</h1>
          <p className="page-subtitle">Track every grant from discovery to award</p>
        </div>
        <button className="btn btn-accent" onClick={() => setPage('discovery')}>
          Add Grant
        </button>
      </div>

      {/* Pipeline overview */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <div
            key={s}
            className="card"
            style={{
              padding: '12px 16px', cursor: 'pointer', flex: '1 1 120px',
              border: filterStatus === s ? `1px solid ${STATUS_META[s].color}` : undefined,
            }}
            onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: STATUS_META[s].color, lineHeight: 1 }}>
              {summary[s]}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-tertiary)', marginTop: 3 }}>
              {STATUS_META[s].label}
            </div>
          </div>
        ))}
      </div>

      {/* Grants table */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="spinner spinner-lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">No grants in this stage</div>
            <div className="empty-subtitle">Discover and save grants to populate your pipeline.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Grant</th>
                  <th>Funder</th>
                  <th>Amount</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => {
                  const meta = STATUS_META[g.status] || STATUS_META.discovered
                  const deadline = g.opportunities?.deadline
                    ? new Date(g.opportunities.deadline).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                    : '—'
                  return (
                    <tr key={g.id}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{g.opportunities?.title || 'Untitled'}</span>
                      </td>
                      <td style={{ color: 'var(--ink-secondary)' }}>{g.opportunities?.funder_name || '—'}</td>
                      <td style={{ color: 'var(--ok)', fontWeight: 500 }}>
                        {g.opportunities?.amount_max ? `$${(g.opportunities.amount_max / 1000).toFixed(0)}k` : '—'}
                      </td>
                      <td style={{ color: 'var(--ink-secondary)' }}>{deadline}</td>
                      <td>
                        <select
                          value={g.status}
                          onChange={e => updateStatus(g.id, e.target.value)}
                          className="input select"
                          style={{ fontSize: 12, padding: '4px 28px 4px 10px', width: 'auto', borderRadius: 20 }}
                          onClick={e => e.stopPropagation()}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-accent btn-sm"
                            onClick={() => setPage({
                              name: 'application-writer',
                              grantId: g.id,
                              opportunityId: g.opportunity_id,
                            })}
                          >
                            Answer App
                          </button>
                          <button
                            className="btn btn-glass btn-sm"
                            onClick={() => setPage('generator')}
                          >
                            Draft
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteGrant(g.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
