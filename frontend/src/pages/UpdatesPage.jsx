import { useEffect, useState, useCallback } from 'react';
import { Send, MessageSquare, Clock, Sun, Moon, Pencil, Trash2, CheckCircle2, Brain, Loader2, XCircle, SlidersHorizontal, Undo2, Plus } from 'lucide-react';
import { updatesApi, eveningApi, tasksApi, aiApi } from '../api';
import { useSession } from '../context/SessionContext';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import Comments from '../components/Comments';
import LoadingSpinner, { InlineLoader } from '../components/LoadingSpinner';
import { ProgressBar, EmptyState } from '../components/RoleBits';
import { formatDateTime, statusConfig } from '../utils/helpers';

const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];

function ReviewedBadge({ item }) {
  if (!item.reviewedBy) return null;
  return (
    <span className="badge bg-mint-100 text-mint-700" title={item.reviewedAt ? `Reviewed ${formatDateTime(item.reviewedAt)}` : undefined}>
      <CheckCircle2 className="w-3 h-3" /> Reviewed by {item.reviewedBy.name}
    </span>
  );
}

function ViewToggle({ view, setView, mine, all }) {
  return (
    <div className="flex gap-2">
      {[['mine', 'My updates', mine], ['team', 'Team updates', all]].map(([id, label, count]) => (
        <button key={id} onClick={() => setView(id)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${view === id ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-ink/10 hover:border-brand-300'}`}>
          {label} ({count})
        </button>
      ))}
    </div>
  );
}

// ─── Morning ─────────────────────────────────────────────────────────────────

function UpdateCard({ update, onEdit, onDelete, onReview }) {
  const { can } = useSession();
  const canEdit = can.canEditDaily(update.teamMember, update.createdAt);
  return (
    <div className="card hover:shadow-md transition-shadow duration-200 animate-fade-in">
      <div className="flex items-start gap-3">
        <Avatar name={update.teamMember?.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="font-semibold text-slate-800 text-sm">{update.teamMember?.name || 'Former member'}</span>
              <span className="text-xs text-slate-400 ml-2">{update.teamMember?.role}</span>
            </div>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDateTime(update.createdAt)}
              {update.updatedAt && update.updatedAt !== update.createdAt && new Date(update.updatedAt) - new Date(update.createdAt) > 60000 && ' · edited'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {update.relatedTask && (
              <span className="inline-block text-xs text-brand-700 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-full font-medium">
                📌 {update.relatedTask.taskId} — {update.relatedTask.title}
              </span>
            )}
            <ReviewedBadge item={update} />
          </div>
        </div>
      </div>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Yesterday</p>
          <p className="text-sm text-slate-700 leading-relaxed">{update.yesterday}</p>
        </div>
        <div className="bg-sky2-50 rounded-xl p-3">
          <p className="text-xs font-semibold text-sky2-500 uppercase tracking-wide mb-1.5">Today</p>
          <p className="text-sm text-slate-700 leading-relaxed">{update.today}</p>
        </div>
      </div>

      {update.blockers && (
        <div className="mt-3 bg-bubble-50 border border-bubble-100 rounded-xl p-3">
          <p className="text-xs font-semibold text-bubble-500 uppercase tracking-wide mb-1.5">⚠ Blockers</p>
          <p className="text-sm text-bubble-700 leading-relaxed">{update.blockers}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {update.aiAnalyzed && (
          <span className="flex items-center gap-1.5 text-xs text-mint-500 mr-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-mint-500" />
            AI analysis completed
          </span>
        )}
        <span className="ml-auto" />
        {can.canReview && (
          <button className="btn-ghost text-xs" onClick={() => onReview(update)}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {update.reviewedBy ? 'Unmark reviewed' : 'Mark reviewed'}
          </button>
        )}
        {canEdit && <button className="btn-ghost text-xs" onClick={() => onEdit(update)}><Pencil className="w-3.5 h-3.5" /> Edit</button>}
        {canEdit && <button className="btn-ghost text-xs hover:!bg-bubble-50 hover:!text-bubble-700" onClick={() => onDelete(update)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
      </div>
      <Comments targetType="update" targetId={update._id} compact />
    </div>
  );
}

function MorningForm({ initial, tasks, onSubmit, submitting, submitLabel, onCancel }) {
  const { user } = useSession();
  const [form, setForm] = useState({
    yesterday: initial?.yesterday || '',
    today: initial?.today || '',
    blockers: initial?.blockers || '',
    relatedTask: initial?.relatedTask?._id || '',
  });
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const handle = async (e) => {
    e.preventDefault();
    const ok = await onSubmit({ ...form, relatedTask: form.relatedTask || null });
    if (ok && !initial) setForm({ yesterday: '', today: '', blockers: '', relatedTask: '' });
  };
  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Posting as</label>
          <div className="input flex items-center gap-2 bg-canvas">
            <Avatar name={initial?.teamMember?.name || user.name} size="sm" />
            <span className="font-medium text-ink">{initial?.teamMember?.name || user.name}</span>
          </div>
        </div>
        <div>
          <label className="label">Related Task (optional)</label>
          <select className="input" value={form.relatedTask} onChange={e => set('relatedTask', e.target.value)}>
            <option value="">No specific task</option>
            {tasks.map(t => <option key={t._id} value={t._id}>{t.taskId} — {t.title}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Yesterday's Progress *</label>
        <textarea id="update-yesterday-input" className="input resize-none" rows={3} value={form.yesterday} onChange={e => set('yesterday', e.target.value)} placeholder="What did you accomplish yesterday?" required />
      </div>
      <div>
        <label className="label">Today's Plan *</label>
        <textarea id="update-today-input" className="input resize-none" rows={3} value={form.today} onChange={e => set('today', e.target.value)} placeholder="What will you work on today?" required />
      </div>
      <div>
        <label className="label">Blockers / Difficulties</label>
        <textarea id="update-blockers-input" className="input resize-none" rows={2} value={form.blockers} onChange={e => set('blockers', e.target.value)} placeholder="Any blockers, risks or impediments? (optional)" />
      </div>
      <div className="flex items-center gap-3">
        <button id="submit-update-btn" type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? <InlineLoader size="sm" /> : <Send className="w-4 h-4" />}
          {submitLabel}
        </button>
        {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function MorningTab({ tasks, onNavigateToAI, notify }) {
  const { user, can } = useSession();
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [view, setView] = useState('mine');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    updatesApi.getAll().then(r => setUpdates(r.data)).catch(e => notify('error', e.message)).finally(() => setLoading(false));
  }, [notify]);

  const replace = (u) => setUpdates(list => list.map(x => x._id === u._id ? u : x));

  const create = async (data) => {
    setSubmitting(true);
    try {
      const res = await updatesApi.create(data);
      setLastUpdate(res.data);
      setUpdates(u => [res.data, ...u]);
      notify('success', 'Daily update submitted successfully!');
      return true;
    } catch (e) { notify('error', e.message); return false; } finally { setSubmitting(false); }
  };
  const saveEdit = async (data) => {
    setSubmitting(true);
    try {
      const res = await updatesApi.update(editing._id, data);
      replace(res.data);
      setEditing(null);
      notify('success', 'Update saved.');
      return true;
    } catch (e) { notify('error', e.message); return false; } finally { setSubmitting(false); }
  };
  const remove = async () => {
    try {
      await updatesApi.delete(deleting._id);
      setUpdates(list => list.filter(x => x._id !== deleting._id));
      notify('success', 'Update deleted.');
    } catch (e) { notify('error', e.message); } finally { setDeleting(null); }
  };
  const review = async (u) => {
    try { replace((await updatesApi.review(u._id, !u.reviewedBy)).data); } catch (e) { notify('error', e.message); }
  };

  const myUpdates = updates.filter(u => u.teamMember?._id === user._id);
  const shown = view === 'mine' ? myUpdates : updates;

  if (loading) return <LoadingSpinner message="Loading updates..." />;

  return (
    <div className="space-y-6">
      <div className="card border-l-4 border-l-brand-400">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Sun className="w-4 h-4 text-sun-500" />
          Submit Today's Update
        </h2>
        <MorningForm tasks={tasks} onSubmit={create} submitting={submitting} submitLabel="Submit Update" />
        {lastUpdate && onNavigateToAI && can.canAnalyzeUpdate(lastUpdate) && (
          <button type="button" className="btn-secondary mt-3" onClick={() => onNavigateToAI(lastUpdate)}>
            🧠 Analyze with AI
          </button>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="section-header mb-0 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-brand-500" />
            Update History ({shown.length})
          </h2>
          <ViewToggle view={view} setView={setView} mine={myUpdates.length} all={updates.length} />
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={MessageSquare} title={view === 'mine' ? 'No updates yet' : 'No team updates yet'}>
            {view === 'mine' ? 'Submit your first stand-up!' : 'No one on the team has posted an update yet.'}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {shown.map(u => <UpdateCard key={u._id} update={u} onEdit={setEditing} onDelete={setDeleting} onReview={review} />)}
          </div>
        )}
      </div>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit update" size="lg">
        {editing && <MorningForm initial={editing} tasks={tasks} onSubmit={saveEdit} submitting={submitting} submitLabel="Save changes" onCancel={() => setEditing(null)} />}
      </Modal>
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete update" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete this update and its comments? This cannot be undone.</p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" onClick={remove}><Trash2 className="w-4 h-4" /> Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Evening ─────────────────────────────────────────────────────────────────

const RISK = {
  on_track: { label: 'On track', cls: 'bg-mint-100 text-mint-700' },
  at_risk: { label: 'At risk', cls: 'bg-sun-100 text-sun-700' },
  behind: { label: 'Behind', cls: 'bg-bubble-100 text-bubble-700' },
};

function EstimateCard({ estimate, evening, onReview, busy }) {
  const { can } = useSession();
  const [adjusting, setAdjusting] = useState(false);
  const [pct, setPct] = useState(estimate.percentComplete);
  const task = estimate.task;
  const allowed = task && can.canReviewEstimate(task.assignee, evening.member);
  const risk = RISK[estimate.risk] || RISK.on_track;
  const decided = estimate.status !== 'pending';

  return (
    <div className={`rounded-2xl border p-4 ${decided ? 'bg-white border-ink/[0.06]' : 'bg-sun-50/40 border-sun-200'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-mono text-slate-400">{task?.taskId || 'Deleted task'}</span>
        <span className="font-semibold text-sm text-ink">{task?.title}</span>
        <span className={`badge ${risk.cls} ml-auto`}>{risk.label}</span>
        <span className="badge bg-slate-100 text-slate-500">{estimate.confidence} confidence</span>
      </div>
      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-3">
        <span className="font-display text-2xl font-bold text-brand-700">{estimate.percentComplete}%</span>
        <ProgressBar percent={estimate.percentComplete} showLabel={false} />
      </div>
      <p className="text-sm text-slate-600 mt-2">{estimate.reasoning}</p>
      {estimate.remainingWork && <p className="text-xs text-slate-500 mt-1"><strong>Left:</strong> {estimate.remainingWork}</p>}

      <div className="mt-3 pt-3 border-t border-ink/[0.06] flex flex-wrap items-center gap-2">
        {estimate.status === 'accepted' && <span className="badge bg-mint-100 text-mint-700"><CheckCircle2 className="w-3 h-3" /> Accepted · task set to {estimate.finalPercent}%</span>}
        {estimate.status === 'adjusted' && <span className="badge bg-brand-100 text-brand-700"><SlidersHorizontal className="w-3 h-3" /> Adjusted · task set to {estimate.finalPercent}%</span>}
        {estimate.status === 'rejected' && <span className="badge bg-slate-100 text-slate-500"><XCircle className="w-3 h-3" /> Rejected</span>}
        {decided && estimate.reviewedBy && <span className="text-xs text-slate-400">by {estimate.reviewedBy.name}</span>}
        {estimate.status === 'pending' && !allowed && <span className="text-xs text-slate-400">Waiting for the assignee or Scrum Master to review</span>}

        {allowed && estimate.status === 'pending' && !adjusting && (
          <>
            <button className="btn-primary bg-mint-500 hover:bg-mint-700 text-xs px-3 py-1.5" disabled={busy} onClick={() => onReview(estimate, { action: 'accept' })}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Accept
            </button>
            <button className="btn-secondary text-xs px-3 py-1.5" disabled={busy} onClick={() => setAdjusting(true)}><SlidersHorizontal className="w-3.5 h-3.5" /> Adjust</button>
            <button className="btn-ghost text-xs" disabled={busy} onClick={() => onReview(estimate, { action: 'reject' })}><XCircle className="w-3.5 h-3.5" /> Reject</button>
          </>
        )}
        {allowed && adjusting && (
          <div className="flex items-center gap-2 w-full">
            <input type="range" min={0} max={100} value={pct} onChange={e => setPct(Number(e.target.value))} className="flex-1 accent-brand-600" />
            <input type="number" min={0} max={100} value={pct} onChange={e => setPct(Number(e.target.value))} className="input w-20 py-1.5" />
            <button className="btn-primary text-xs px-3 py-1.5" disabled={busy} onClick={() => { onReview(estimate, { action: 'adjust', percent: pct }); setAdjusting(false); }}>Save</button>
            <button className="btn-ghost text-xs" onClick={() => setAdjusting(false)}>Cancel</button>
          </div>
        )}
        {allowed && estimate.status === 'rejected' && (
          <button className="btn-ghost text-xs" disabled={busy} onClick={() => onReview(estimate, { action: 'reset' })}><Undo2 className="w-3.5 h-3.5" /> Undo</button>
        )}
      </div>
    </div>
  );
}

function EveningCard({ evening, onChange, onDelete, notify }) {
  const { can } = useSession();
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canEdit = can.canEditDaily(evening.member, evening.createdAt);
  // The author or a Scrum Master+ can (re-)run the estimate
  const canAnalyze = can.canAnalyzeUpdate({ teamMember: evening.member });
  const estimates = evening.aiProgress?.estimates || [];

  const analyze = async () => {
    setAnalyzing(true);
    try { onChange((await aiApi.progress(evening._id)).data); }
    catch (e) { notify('error', `AI progress analysis failed: ${e.message}`); }
    finally { setAnalyzing(false); }
  };
  const reviewEstimate = async (estimate, body) => {
    setBusy(true);
    try { onChange((await eveningApi.reviewEstimate(evening._id, estimate._id, body)).data); }
    catch (e) { notify('error', e.message); }
    finally { setBusy(false); }
  };
  const review = async () => {
    try { onChange((await eveningApi.review(evening._id, !evening.reviewedBy)).data); } catch (e) { notify('error', e.message); }
  };

  return (
    <div className="card animate-fade-in">
      <div className="flex items-start gap-3">
        <Avatar name={evening.member?.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-slate-800 text-sm">{evening.member?.name || 'Former member'}</span>
            <span className="text-xs text-slate-400 flex items-center gap-1"><Moon className="w-3 h-3" />{formatDateTime(evening.createdAt)}</span>
          </div>
          <ReviewedBadge item={evening} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {evening.entries.map(en => {
          const sc = statusConfig[en.status] || statusConfig['To Do'];
          return (
            <div key={en._id} className="bg-canvas rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-slate-400">{en.task?.taskId}</span>
                <span className="text-sm font-semibold text-ink">{en.task?.title || 'Deleted task'}</span>
                <span className={`badge ${sc.bg} ${sc.text} ml-auto`}>{en.status}</span>
                {en.hoursSpent != null && <span className="text-xs text-slate-400">{en.hoursSpent}h</span>}
              </div>
              <p className="text-sm text-slate-700 mt-1.5"><strong className="text-mint-700">Done:</strong> {en.done}</p>
              {en.remaining && <p className="text-sm text-slate-600 mt-0.5"><strong className="text-sun-700">Left:</strong> {en.remaining}</p>}
            </div>
          );
        })}
        {evening.notes && <p className="text-sm text-slate-600 italic">{evening.notes}</p>}
      </div>

      {/* AI progress estimates */}
      <div className="mt-4">
        {estimates.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-brand-500" /> AI progress estimates · suggestions until reviewed
            </p>
            {estimates.map(est => <EstimateCard key={est._id} estimate={est} evening={evening} onReview={reviewEstimate} busy={busy} />)}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canAnalyze && (
            <button className="btn-secondary text-xs px-3 py-1.5" onClick={analyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
              {analyzing ? 'Estimating progress…' : estimates.length ? 'Re-run progress estimate' : 'Estimate progress with AI'}
            </button>
          )}
          <span className="ml-auto" />
          {can.canReview && (
            <button className="btn-ghost text-xs" onClick={review}><CheckCircle2 className="w-3.5 h-3.5" /> {evening.reviewedBy ? 'Unmark reviewed' : 'Mark reviewed'}</button>
          )}
          {canEdit && <button className="btn-ghost text-xs hover:!bg-bubble-50 hover:!text-bubble-700" onClick={() => onDelete(evening)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
        </div>
      </div>
      <Comments targetType="evening" targetId={evening._id} compact />
    </div>
  );
}

function EveningForm({ tasks, onCreated, notify }) {
  const { user } = useSession();
  const myTasks = tasks.filter(t => t.assignee?._id === user._id);
  const [selected, setSelected] = useState(() => myTasks.filter(t => t.status !== 'To Do').map(t => t._id));
  const [entries, setEntries] = useState({});
  const [extraTask, setExtraTask] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const entryFor = (t) => entries[t._id] || { done: '', remaining: '', hoursSpent: '', status: t.status === 'To Do' ? 'In Progress' : t.status };
  const setEntry = (t, key, val) => setEntries(e => ({ ...e, [t._id]: { ...entryFor(t), [key]: val } }));
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  // Tasks shown: my assigned tasks plus any others added for today
  const listed = [...myTasks, ...tasks.filter(t => selected.includes(t._id) && !myTasks.some(m => m._id === t._id))];
  const others = tasks.filter(t => !listed.some(l => l._id === t._id));

  const submit = async (e) => {
    e.preventDefault();
    const chosen = listed.filter(t => selected.includes(t._id));
    if (chosen.length === 0) { notify('error', 'Tick at least one task you worked on today.'); return; }
    setSubmitting(true);
    try {
      const res = await eveningApi.create({
        notes,
        entries: chosen.map(t => ({ task: t._id, ...entryFor(t), hoursSpent: entryFor(t).hoursSpent === '' ? null : Number(entryFor(t).hoursSpent) })),
      });
      setEntries({});
      setNotes('');
      onCreated(res.data);
    } catch (err) { notify('error', err.message); } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {listed.length === 0 && <p className="text-sm text-slate-500">You have no assigned tasks. Add a task you worked on below.</p>}
      {listed.map(t => {
        const on = selected.includes(t._id);
        const en = entryFor(t);
        return (
          <div key={t._id} className={`rounded-2xl border p-4 transition-all ${on ? 'border-brand-200 bg-brand-50/40' : 'border-ink/[0.08] bg-white'}`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={on} onChange={() => toggle(t._id)} />
              <span className="text-xs font-mono text-slate-400">{t.taskId}</span>
              <span className="text-sm font-semibold text-ink flex-1">{t.title}</span>
              <span className="w-28"><ProgressBar percent={t.status === 'Done' ? 100 : t.progress?.percent} size="sm" /></span>
            </label>
            {on && (
              <div className="mt-3 grid md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="label">What got done today *</label>
                  <textarea className="input resize-none" rows={2} value={en.done} onChange={e => setEntry(t, 'done', e.target.value)} required placeholder="e.g. Built the form and validation" />
                </div>
                <div className="md:col-span-2">
                  <label className="label">What's left</label>
                  <textarea className="input resize-none" rows={2} value={en.remaining} onChange={e => setEntry(t, 'remaining', e.target.value)} placeholder="e.g. Connect to the API and write tests" />
                </div>
                <div>
                  <label className="label">Status at end of day</label>
                  <select className="input" value={en.status} onChange={e => setEntry(t, 'status', e.target.value)}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Hours spent (optional)</label>
                  <input type="number" min={0} max={24} step={0.5} className="input" value={en.hoursSpent} onChange={e => setEntry(t, 'hoursSpent', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {others.length > 0 && (
        <div className="flex gap-2">
          <select className="input" value={extraTask} onChange={e => setExtraTask(e.target.value)}>
            <option value="">Worked on another task? Add it…</option>
            {others.map(t => <option key={t._id} value={t._id}>{t.taskId} — {t.title}</option>)}
          </select>
          <button type="button" className="btn-secondary" disabled={!extraTask} onClick={() => { setSelected(s => [...s, extraTask]); setExtraTask(''); }}>
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      )}

      <div>
        <label className="label">Notes for the team (optional)</label>
        <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
      <p className="text-xs text-slate-400">The status you choose moves the task on the board (for tasks you're allowed to edit). AI then estimates how complete each task is — you confirm before anything changes.</p>
      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? <InlineLoader size="sm" /> : <Moon className="w-4 h-4" />}
        Submit evening update
      </button>
    </form>
  );
}

function EveningTab({ tasks, reloadTasks, notify }) {
  const { user } = useSession();
  const [evenings, setEvenings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('mine');
  const [deleting, setDeleting] = useState(null);
  const [autoAnalyzing, setAutoAnalyzing] = useState(null);
  // Remounting the form resets it after a submit and pre-ticks in-progress tasks once tasks have loaded
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    eveningApi.getAll().then(r => setEvenings(r.data)).catch(e => notify('error', e.message)).finally(() => setLoading(false));
  }, [notify]);

  const replace = (ev) => { setEvenings(list => list.map(x => x._id === ev._id ? ev : x)); reloadTasks(); };

  // After submitting, run the AI progress estimate straight away
  const created = async (ev) => {
    setEvenings(list => [ev, ...list]);
    setFormKey(k => k + 1);
    setView('mine');
    reloadTasks();
    notify('success', 'Evening update submitted. Estimating progress…');
    setAutoAnalyzing(ev._id);
    try {
      const res = await aiApi.progress(ev._id);
      setEvenings(list => list.map(x => x._id === ev._id ? res.data : x));
      notify('success', 'AI progress estimates are ready — review them below.');
    } catch (e) {
      notify('error', `Evening saved, but AI progress analysis failed: ${e.message} You can retry from the update card.`);
    } finally { setAutoAnalyzing(null); }
  };

  const remove = async () => {
    try {
      await eveningApi.delete(deleting._id);
      setEvenings(list => list.filter(x => x._id !== deleting._id));
      notify('success', 'Evening update deleted.');
    } catch (e) { notify('error', e.message); } finally { setDeleting(null); }
  };

  const mine = evenings.filter(e => e.member?._id === user._id);
  const shown = view === 'mine' ? mine : evenings;

  if (loading) return <LoadingSpinner message="Loading evening updates..." />;

  return (
    <div className="space-y-6">
      <div className="card border-l-4 border-l-brand-400">
        <h2 className="font-bold text-slate-800 mb-1 flex items-center gap-2"><Moon className="w-4 h-4 text-brand-500" /> End-of-day check-in</h2>
        <p className="text-sm text-slate-500 mb-4">Tick the tasks you worked on today and describe what got done and what's left.</p>
        <EveningForm key={`${formKey}-${tasks.length > 0}`} tasks={tasks} onCreated={created} notify={notify} />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="section-header mb-0 flex items-center gap-2"><Moon className="w-4 h-4 text-brand-500" /> Evening History ({shown.length})</h2>
          <ViewToggle view={view} setView={setView} mine={mine.length} all={evenings.length} />
        </div>
        {autoAnalyzing && (
          <div className="card mb-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin text-brand-500" /> AI is estimating progress for your tasks…</div>
        )}
        {shown.length === 0 ? (
          <EmptyState icon={Moon} title="No evening updates yet" />
        ) : (
          <div className="space-y-4">
            {shown.map(ev => <EveningCard key={ev._id} evening={ev} onChange={replace} onDelete={setDeleting} notify={notify} />)}
          </div>
        )}
      </div>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete evening update" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete this evening update, its AI estimates and comments? Progress already accepted on tasks stays as it is.</p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn-danger" onClick={remove}><Trash2 className="w-4 h-4" /> Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function UpdatesPage({ onNavigateToAI }) {
  const [tab, setTab] = useState(() => (new Date().getHours() >= 15 ? 'evening' : 'morning'));
  const [tasks, setTasks] = useState([]);
  const [alert, setAlert] = useState(null);
  const notify = useCallback((type, message) => setAlert({ type, message }), []);

  const reloadTasks = useCallback(() => {
    tasksApi.getAll().then(r => setTasks(r.data)).catch(e => notify('error', e.message));
  }, [notify]);
  useEffect(() => { reloadTasks(); }, [reloadTasks]);

  const openTasks = tasks.filter(t => t.status !== 'Done');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">Daily Scrum Updates</h1>
        <p className="text-slate-500 text-sm mt-1">Morning stand-up and end-of-day check-in</p>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} autoClose={alert.type === 'success' ? 5000 : 0} />}

      <div className="grid grid-cols-2 gap-1 p-1 bg-white border border-ink/[0.06] rounded-full max-w-sm shadow-note">
        {[['morning', 'Morning', Sun], ['evening', 'Evening', Moon]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-all ${tab === id ? 'bg-brand-600 text-white shadow-pop' : 'text-slate-500 hover:text-brand-700'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'morning'
        ? <MorningTab tasks={openTasks} onNavigateToAI={onNavigateToAI} notify={notify} />
        : <EveningTab tasks={openTasks} reloadTasks={reloadTasks} notify={notify} />}
    </div>
  );
}
