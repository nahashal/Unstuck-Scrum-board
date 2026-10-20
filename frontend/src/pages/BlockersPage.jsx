import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, Plus, Pencil, CheckCircle2 } from 'lucide-react';
import { blockersApi, teamApi, tasksApi } from '../api';
import Alert from '../components/Alert';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { InlineLoader } from '../components/LoadingSpinner';
import Avatar from '../components/Avatar';
import Comments from '../components/Comments';
import { useSession } from '../context/SessionContext';
import { statusConfig, formatDateTime, formatDate } from '../utils/helpers';

function BlockerCard({ blocker, onEdit }) {
  const { can } = useSession();
  const sc = statusConfig[blocker.status] || statusConfig['Open'];
  return (
    <div className={`card hover:shadow-md transition-all duration-200 ${blocker.status === 'Resolved' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sc.bg}`}>
          <ShieldAlert className={`w-4 h-4 ${sc.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-semibold text-slate-800 text-sm">{blocker.title}</h4>
            <div className="flex items-center gap-2">
              <span className={`badge ${sc.bg} ${sc.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {blocker.status}
              </span>
              {can.canManageBlockers && <button
                id={`edit-blocker-${blocker._id}`}
                onClick={() => onEdit(blocker)}
                className="btn-ghost text-xs"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>}
            </div>
          </div>
          {blocker.affectedTask && (
            <span className="text-xs text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full mt-1 inline-block">
              🔗 {blocker.affectedTask.taskId} — {blocker.affectedTask.title}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-slate-700">{blocker.description}</p>
          </div>
          {blocker.impact && (
            <div className="bg-bubble-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-bubble-500 uppercase tracking-wide mb-1">Impact</p>
              <p className="text-sm text-slate-700">{blocker.impact}</p>
            </div>
          )}
        </div>
        {blocker.suggestedAction && (
          <div className="bg-mint-50 border border-mint-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-mint-500 uppercase tracking-wide mb-1">💡 Suggested Action</p>
            <p className="text-sm text-slate-700">{blocker.suggestedAction}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {blocker.owner ? (
            <div className="flex items-center gap-2">
              <Avatar name={blocker.owner.name} size="sm" />
              <span className="text-xs text-slate-600 font-medium">{blocker.owner.name}</span>
            </div>
          ) : <span className="text-xs text-slate-400">No owner assigned</span>}
          <span className="text-xs text-slate-400">
            {blocker.reportedBy?.name && `${blocker.confirmedBy === 'reported' ? 'Reported' : 'Confirmed'} by ${blocker.reportedBy.name} · `}
            {formatDateTime(blocker.createdAt)}
          </span>
        </div>
      </div>
      <Comments targetType="blocker" targetId={blocker._id} compact />
    </div>
  );
}

function BlockerForm({ blocker, tasks, members, onSubmit, onClose, loading }) {
  const [form, setForm] = useState({
    title: blocker?.title || '',
    description: blocker?.description || '',
    impact: blocker?.impact || '',
    suggestedAction: blocker?.suggestedAction || '',
    affectedTask: blocker?.affectedTask?._id || '',
    owner: blocker?.owner?._id || '',
    status: blocker?.status || 'Open',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, affectedTask: form.affectedTask || null, owner: form.owner || null }); }} className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Concise blocker title" required />
      </div>
      <div>
        <label className="label">Description *</label>
        <textarea className="input resize-none" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Why is this a blocker?" required />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Impact</label>
          <textarea className="input resize-none" rows={2} value={form.impact} onChange={e => set('impact', e.target.value)} placeholder="Impact on sprint..." />
        </div>
        <div>
          <label className="label">Suggested Action</label>
          <textarea className="input resize-none" rows={2} value={form.suggestedAction} onChange={e => set('suggestedAction', e.target.value)} placeholder="Next step to resolve..." />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Affected Task</label>
          <select className="input" value={form.affectedTask} onChange={e => set('affectedTask', e.target.value)}>
            <option value="">None</option>
            {tasks.map(t => <option key={t._id} value={t._id}>{t.taskId} — {t.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Owner</label>
          <select className="input" value={form.owner} onChange={e => set('owner', e.target.value)}>
            <option value="">Unassigned</option>
            {members.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
        </div>
      </div>
      {blocker && (
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            {['Open', 'In Progress', 'Resolved'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading && <InlineLoader size="sm" />}
          {blocker ? 'Update Blocker' : 'Save Blocker'}
        </button>
      </div>
    </form>
  );
}

export default function BlockersPage() {
  const { can } = useSession();
  const [blockers, setBlockers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editBlocker, setEditBlocker] = useState(null);
  const [filter, setFilter] = useState('All');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [bRes, tRes, mRes] = await Promise.all([blockersApi.getAll(), tasksApi.getAll(), teamApi.getAll()]);
      setBlockers(bRes.data);
      setTasks(tRes.data);
      setMembers(mRes.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editBlocker) {
        const res = await blockersApi.update(editBlocker._id, formData);
        setBlockers(b => b.map(bl => bl._id === editBlocker._id ? res.data : bl));
        setSuccess('Blocker updated.');
      } else {
        const res = await blockersApi.create(formData);
        setBlockers(b => [res.data, ...b]);
        setSuccess('Blocker created.');
      }
      setModalOpen(false);
      setEditBlocker(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === 'All' ? blockers : blockers.filter(b => b.status === filter);

  if (loading) return <LoadingSpinner message="Loading blockers..." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Blockers</h1>
          <p className="text-slate-500 text-sm mt-1">{blockers.filter(b => b.status === 'Open').length} open blockers</p>
        </div>
        <button id="create-blocker-btn" onClick={() => { setEditBlocker(null); setModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> {can.canManageBlockers ? 'New Blocker' : 'Report Blocker'}
        </button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} autoClose={3000} />}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['All', 'Open', 'In Progress', 'Resolved'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === s ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {s} {s === 'All' ? `(${blockers.length})` : `(${blockers.filter(b => b.status === s).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="w-10 h-10 text-mint-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{filter === 'All' ? 'No blockers recorded yet.' : `No ${filter.toLowerCase()} blockers.`}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(b => <BlockerCard key={b._id} blocker={b} onEdit={(bl) => { setEditBlocker(bl); setModalOpen(true); }} />)}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditBlocker(null); }} title={editBlocker ? 'Edit Blocker' : can.canManageBlockers ? 'New Blocker' : 'Report a Blocker'} size="lg">
        <BlockerForm
          blocker={editBlocker}
          tasks={tasks}
          members={members}
          onSubmit={handleSubmit}
          onClose={() => { setModalOpen(false); setEditBlocker(null); }}
          loading={saving}
        />
      </Modal>
    </div>
  );
}
