import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, ShieldAlert, Calendar, User, AlertTriangle } from 'lucide-react';
import { tasksApi, teamApi, sprintsApi } from '../api';
import { useSession } from '../context/SessionContext';
import Comments from '../components/Comments';
import { ProgressBar } from '../components/RoleBits';
import Modal from '../components/Modal';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';
import { InlineLoader } from '../components/LoadingSpinner';
import { priorityConfig, statusConfig, formatDate } from '../utils/helpers';

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done'];

// Each column is a sticky-note colour lane
const COLUMN_CONFIG = {
  'To Do': { bg: 'bg-sky2-50', pill: 'bg-sky2-500 text-white', count: 'bg-white text-sky2-700' },
  'In Progress': { bg: 'bg-sun-50', pill: 'bg-sun-400 text-ink', count: 'bg-white text-sun-700' },
  'In Review': { bg: 'bg-brand-50', pill: 'bg-brand-600 text-white', count: 'bg-white text-brand-700' },
  'Done': { bg: 'bg-mint-50', pill: 'bg-mint-500 text-white', count: 'bg-white text-mint-700' },
};

function PriorityBadge({ priority }) {
  const c = priorityConfig[priority] || priorityConfig.Medium;
  return (
    <span className={`badge ${c.bg} ${c.text} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {priority}
    </span>
  );
}

function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const { can } = useSession();
  const [changing, setChanging] = useState(false);
  const editable = can.canEditTask(task);

  const handleStatusChange = async (newStatus) => {
    setChanging(true);
    await onStatusChange(task._id, newStatus);
    setChanging(false);
  };

  return (
    <div className={`
      bg-white rounded-2xl border border-ink/[0.06] shadow-note hover:-translate-y-0.5 transition-all duration-200 p-4 group
      ${task.hasBlocker ? 'ring-2 ring-bubble-400' : ''}
    `}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono text-slate-400">{task.taskId}</span>
          <PriorityBadge priority={task.priority} />
          {task.hasBlocker && (
            <span className="badge bg-bubble-500 text-white">
              <ShieldAlert className="w-3 h-3" /> Blocked
            </span>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {editable && <button
            id={`edit-task-${task._id}`}
            onClick={() => onEdit(task)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>}
          {can.canDeleteTask(task) && <button
            id={`delete-task-${task._id}`}
            onClick={() => onDelete(task._id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-bubble-500 hover:bg-bubble-50 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>}
        </div>
      </div>

      {/* Title & Description */}
      <h4 className="text-sm font-semibold text-slate-800 leading-tight mb-1">{task.title}</h4>
      {task.description && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">{task.description}</p>
      )}

      {/* Progress (set when an AI estimate is accepted/adjusted) */}
      {(task.status === 'Done' || task.progress?.percent > 0) && (
        <div className="mt-2" title={task.progress?.source ? `Progress source: ${task.progress.source.replace('_', ' ')}` : undefined}>
          <ProgressBar percent={task.status === 'Done' ? 100 : task.progress.percent} size="sm" />
        </div>
      )}
      {task.sprint && <span className="inline-block mt-2 text-[11px] font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">{task.sprint.name}</span>}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="flex items-center gap-2">
          {task.assignee ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={task.assignee.name} size="sm" />
              <span className="text-xs text-slate-500">{task.assignee.name.split(' ')[0]}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400 flex items-center gap-1"><User className="w-3 h-3" />Unassigned</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDate(task.dueDate)}
            </span>
          )}
          {changing && <InlineLoader size="sm" />}
        </div>
      </div>

      {/* Quick status change */}
      <select
        id={`status-select-${task._id}`}
        value={task.status}
        onChange={e => handleStatusChange(e.target.value)}
        disabled={changing || !editable}
        title={editable ? undefined : 'Only the assignee, creator or a Scrum Master can move this task'}
        className="mt-3 w-full text-xs font-medium border border-ink/10 rounded-full py-1.5 px-3 bg-canvas text-slate-600 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {COLUMNS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

function TaskForm({ task, members, tasks, sprints, onSubmit, onClose, loading }) {
  const { user, can } = useSession();
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignee: task?.assignee?._id || '',
    priority: task?.priority || 'Medium',
    status: task?.status || 'To Do',
    dueDate: task?.dueDate ? task.dueDate.split('T')[0] : '',
    dependency: task?.dependency?._id || '',
    hasBlocker: task?.hasBlocker || false,
    sprint: task?.sprint?._id || sprints.find(s => s.status === 'active')?._id || '',
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // Developers can only assign work to themselves (or keep the current assignee)
  const assignable = can.canAssignOthers
    ? members
    : members.filter(m => m._id === user._id || m._id === task?.assignee?._id);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...form,
      assignee: form.assignee || null,
      dependency: form.dependency || null,
      dueDate: form.dueDate || null,
      sprint: form.sprint || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Title *</label>
        <input id="task-title-input" className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Implement login API" required />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea className="input resize-none" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Priority</label>
          <select id="task-priority-select" className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
            {['Low', 'Medium', 'High'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            {COLUMNS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Assignee</label>
          <select id="task-assignee-select" className="input" value={form.assignee} onChange={e => set('assignee', e.target.value)}>
            <option value="">Unassigned</option>
            {assignable.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
          {!can.canAssignOthers && <p className="text-[11px] text-slate-400 mt-1">Scrum Masters assign work to others.</p>}
        </div>
        <div>
          <label className="label">Due Date</label>
          <input type="date" className="input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Sprint</label>
          <select className="input" value={form.sprint} onChange={e => set('sprint', e.target.value)}>
            <option value="">Backlog (no sprint)</option>
            {sprints.filter(s => s.status !== 'completed' || s._id === form.sprint).map(s => (
              <option key={s._id} value={s._id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Dependency (optional)</label>
          <select className="input" value={form.dependency} onChange={e => set('dependency', e.target.value)}>
            <option value="">None</option>
            {tasks.filter(t => t._id !== task?._id).map(t => (
              <option key={t._id} value={t._id}>{t.taskId} — {t.title}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input id="task-blocker-checkbox" type="checkbox" className="w-4 h-4 text-brand-600 rounded" checked={form.hasBlocker} onChange={e => set('hasBlocker', e.target.checked)} />
        <label htmlFor="task-blocker-checkbox" className="text-sm text-slate-700 font-medium">Mark as blocked</label>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        <button id="task-submit-btn" type="submit" className="btn-primary" disabled={loading}>
          {loading && <InlineLoader size="sm" />}
          {task ? 'Update Task' : 'Create Task'}
        </button>
      </div>
    </form>
  );
}

export default function BoardPage() {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sprints, setSprints] = useState([]);
  // '' = all tasks, 'none' = backlog, otherwise a sprint id
  const [sprintFilter, setSprintFilter] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [tasksRes, membersRes, sprintsRes] = await Promise.all([tasksApi.getAll(), teamApi.getAll(), sprintsApi.getAll()]);
      setTasks(tasksRes.data);
      setMembers(membersRes.data);
      setSprints(sprintsRes.data);
      const active = sprintsRes.data.find(s => s.status === 'active');
      if (active) setSprintFilter(active._id);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditTask(null); setModalOpen(true); };
  const openEdit = (task) => { setEditTask(task); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditTask(null); };

  const handleSubmit = async (formData) => {
    setSaving(true);
    setError('');
    try {
      if (editTask) {
        const res = await tasksApi.update(editTask._id, formData);
        setTasks(t => t.map(tk => tk._id === editTask._id ? res.data : tk));
        setSuccess('Task updated successfully.');
      } else {
        const res = await tasksApi.create(formData);
        setTasks(t => [res.data, ...t]);
        setSuccess('Task created successfully.');
      }
      closeModal();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await tasksApi.delete(id);
      setTasks(t => t.filter(tk => tk._id !== id));
      setSuccess('Task deleted.');
      setDeleteConfirm(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await tasksApi.update(id, { status: newStatus });
      setTasks(t => t.map(tk => tk._id === id ? res.data : tk));
    } catch (e) {
      setError(e.message);
    }
  };

  const visible = tasks.filter(t => !sprintFilter
    || (sprintFilter === 'none' ? !t.sprint : t.sprint?._id === sprintFilter));
  const byStatus = (status) => visible.filter(t => t.status === status);

  if (loading) return <LoadingSpinner message="Loading board..." />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Scrum Board</h1>
          <p className="text-slate-500 text-sm mt-1">{visible.length} task{visible.length !== 1 ? 's' : ''} across all columns</p>
        </div>
        <select aria-label="Filter by sprint" className="input w-auto ml-auto py-2" value={sprintFilter} onChange={e => setSprintFilter(e.target.value)}>
          <option value="">All tasks</option>
          {sprints.map(s => <option key={s._id} value={s._id}>{s.name}{s.status === 'active' ? ' (active)' : s.status === 'completed' ? ' (completed)' : ''}</option>)}
          <option value="none">Backlog</option>
        </select>
        <button id="create-task-btn" onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> New Task
        </button>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} autoClose={3000} />}

      {/* Board Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto">
        {COLUMNS.map(col => {
          const cfg = COLUMN_CONFIG[col];
          const colTasks = byStatus(col);
          return (
            <div key={col} className={`rounded-3xl ${cfg.bg} border border-ink/[0.05] min-h-[200px] flex flex-col`}>
              {/* Column Header */}
              <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                <h3 className={`font-display font-semibold text-sm px-3.5 py-1.5 rounded-full ${cfg.pill}`}>{col}</h3>
                <span className={`text-xs font-bold min-w-[1.75rem] text-center px-2 py-1 rounded-full shadow-sm ${cfg.count}`}>{colTasks.length}</span>
              </div>
              {/* Tasks */}
              <div className="p-3 flex-1 space-y-3">
                {colTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-ink/25 border-2 border-dashed border-ink/10 rounded-2xl">
                    <AlertTriangle className="w-6 h-6 mb-2" />
                    <p className="text-xs">No tasks</p>
                  </div>
                ) : (
                  colTasks.map(task => (
                    <TaskCard
                      key={task._id}
                      task={task}
                      onEdit={openEdit}
                      onDelete={(id) => setDeleteConfirm(id)}
                      onStatusChange={handleStatusChange}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={editTask ? 'Edit Task' : 'Create New Task'} size="md">
        <TaskForm
          task={editTask}
          members={members}
          tasks={tasks}
          sprints={sprints}
          onSubmit={handleSubmit}
          onClose={closeModal}
          loading={saving}
        />
        {editTask && <Comments targetType="task" targetId={editTask._id} />}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Task" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Are you sure you want to delete this task? This cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button id="confirm-delete-btn" className="btn-danger" onClick={() => handleDelete(deleteConfirm)}>
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
