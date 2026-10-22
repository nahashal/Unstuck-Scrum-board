import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Plus, Pencil, Calendar, User, CheckCircle2 } from 'lucide-react';
import { actionsApi, blockersApi, tasksApi, teamApi } from '../api';
import Alert from '../components/Alert';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { InlineLoader } from '../components/LoadingSpinner';
import Avatar from '../components/Avatar';
import { useSession } from '../context/SessionContext';
import useLiveRefresh from '../utils/useLiveRefresh';
import { statusConfig, formatDate, formatDateTime } from '../utils/helpers';

function ActionCard({ action, onEdit }) {
  const { can } = useSession();
  const sc = statusConfig[action.status] || statusConfig['Open'];
  const isOverdue = action.deadline && new Date(action.deadline) < new Date() && action.status !== 'Resolved';

  return (
    <div className={`card hover:shadow-md transition-all duration-200 ${action.status === 'Resolved' ? 'opacity-60' : ''} ${isOverdue ? 'border-l-4 border-l-bubble-400' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${sc.bg}`}>
          <CheckSquare className={`w-4 h-4 ${sc.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-semibold text-sm text-slate-800 leading-tight ${action.status === 'Resolved' ? 'line-through text-slate-500' : ''}`}>
              {action.description}
            </h4>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`badge ${sc.bg} ${sc.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {action.status}
              </span>
              {can.canEditAction(action) && <button
                id={`edit-action-${action._id}`}
                onClick={() => onEdit(action)}
                className="btn-ghost text-xs"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {action.relatedBlocker && (
              <span className="text-xs text-bubble-700 bg-bubble-50 border border-bubble-100 px-2 py-0.5 rounded-full">
                🛡 {action.relatedBlocker.title}
              </span>
            )}
            {action.relatedTask && (
              <span className="text-xs text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full">
                🔗 {action.relatedTask.taskId}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        {action.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={action.assignedTo.name} size="sm" />
            <span className="text-xs text-slate-600">{action.assignedTo.name}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />Unassigned</span>
        )}
        <div className="flex items-center gap-3">
          {action.deadline && (
            <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-bubble-500 font-semibold' : 'text-slate-400'}`}>
              <Calendar className="w-3 h-3" />
              {isOverdue && '⚠ '}Due {formatDate(action.deadline)}
            </span>
          )}
          <span className="text-xs text-slate-400">{formatDateTime(action.createdAt)}</span>
        </div>
      </div>
      {action.notes && (
        <div className="mt-3 bg-slate-50 rounded-xl p-3">
          <p className="text-xs text-slate-500">{action.notes}</p>
        </div>
      )}
    </div>
  );
}

// Exported so the Blockers page can open it pre-filled from a blocker (`initial`)
export function ActionForm({ action, initial, blockers, tasks, members, onSubmit, onClose, loading }) {
  const { user, can } = useSession();
  // Developers can only assign action items to themselves
  const assignable = can.canAssignOthers ? members : members.filter(m => m._id === user._id || m._id === action?.assignedTo?._id);
  const [form, setForm] = useState({
    description: action?.description || initial?.description || '',
    relatedBlocker: action?.relatedBlocker?._id || initial?.relatedBlocker || '',
    relatedTask: action?.relatedTask?._id || initial?.relatedTask || '',
    assignedTo: action?.assignedTo?._id || (assignable.some(m => m._id === initial?.assignedTo) ? initial.assignedTo : ''),
    deadline: action?.deadline ? action.deadline.split('T')[0] : '',
    status: action?.status || 'Open',
    notes: action?.notes || '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, relatedBlocker: form.relatedBlocker || null, relatedTask: form.relatedTask || null, assignedTo: form.assignedTo || null, deadline: form.deadline || null }); }} className="space-y-4">
      <div>
        <label className="label">Description *</label>
        <textarea className="input resize-none" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="What needs to be done?" required />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Related Blocker</label>
          <select id="action-blocker-select" className="input" value={form.relatedBlocker} onChange={e => set('relatedBlocker', e.target.value)}>
            <option value="">None</option>
            {blockers.filter(b => b.status !== 'Resolved').map(b => <option key={b._id} value={b._id}>{b.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Related Task</label>
          <select className="input" value={form.relatedTask} onChange={e => set('relatedTask', e.target.value)}>
            <option value="">None</option>
            {tasks.map(t => <option key={t._id} value={t._id}>{t.taskId} — {t.title}</option>)}
          </select>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Assigned To</label>
          <select id="action-assignee-select" className="input" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)}>
            <option value="">Unassigned</option>
            {assignable.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Deadline</label>
          <input type="date" className="input" value={form.deadline} onChange={e => set('deadline', e.target.value)} />
        </div>
      </div>
      {action && (
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            {['Open', 'In Progress', 'Resolved'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="label">Notes</label>
        <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional notes..." />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button id="action-submit-btn" type="submit" className="btn-primary" disabled={loading}>
          {loading && <InlineLoader size="sm" />}
          {action ? 'Update' : 'Create Action Item'}
        </button>
      </div>
    </form>
  );
}

export default function ActionsPage() {
  const [actions, setActions] = useState([]);
  const [blockers, setBlockers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editAction, setEditAction] = useState(null);
  const [filter, setFilter] = useState('All');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [aRes, bRes, tRes, mRes] = await Promise.all([
        actionsApi.getAll(), blockersApi.getAll(), tasksApi.getAll(), teamApi.getAll()
      ]);
      setActions(aRes.data);
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
  // Live: status changes by other people appear without a reload
  useLiveRefresh(async () => {
    const [aRes, bRes] = await Promise.all([actionsApi.getAll(), blockersApi.getAll()]);
    setActions(aRes.data);
    setBlockers(bRes.data);
  }, { paused: saving });

  const handleSubmit = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editAction) {
        const res = await actionsApi.update(editAction._id, formData);
        setActions(a => a.map(ac => ac._id === editAction._id ? res.data : ac));
        setSuccess('Action item updated.');
      } else {
        const res = await actionsApi.create(formData);
        setActions(a => [res.data, ...a]);
        setSuccess('Action item created.');
      }
      setModalOpen(false);
      setEditAction(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === 'All' ? actions : actions.filter(a => a.status === filter);

  if (loading) return <LoadingSpinner message="Loading action items..." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Action Items</h1>
          <p className="text-slate-500 text-sm mt-1">{actions.filter(a => a.status !== 'Resolved').length} outstanding items</p>
        </div>
        <button id="create-action-btn" onClick={() => { setEditAction(null); setModalOpen(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> New Action
        </button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} autoClose={3000} />}

      <div className="flex gap-2 flex-wrap">
        {['All', 'Open', 'In Progress', 'Resolved'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${filter === s ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {s} {s === 'All' ? `(${actions.length})` : `(${actions.filter(a => a.status === s).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12">
          <CheckCircle2 className="w-10 h-10 text-mint-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{filter === 'All' ? 'No action items yet.' : `No ${filter.toLowerCase()} items.`}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(a => (
            <ActionCard key={a._id} action={a} onEdit={(ac) => { setEditAction(ac); setModalOpen(true); }} />
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditAction(null); }} title={editAction ? 'Edit Action Item' : 'New Action Item'} size="lg">
        <ActionForm
          action={editAction}
          blockers={blockers}
          tasks={tasks}
          members={members}
          onSubmit={handleSubmit}
          onClose={() => { setModalOpen(false); setEditAction(null); }}
          loading={saving}
        />
      </Modal>
    </div>
  );
}
