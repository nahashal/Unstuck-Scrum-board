import { useEffect, useState, useCallback } from 'react';
import { Settings2, Users, Flag, Plus, Play, CheckCircle2, Trash2, UserMinus, Archive } from 'lucide-react';
import { projectApi, sprintsApi, orgApi } from '../api';
import { useSession } from '../context/SessionContext';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import LoadingSpinner from '../components/LoadingSpinner';
import { RoleSelect, EmptyState } from '../components/RoleBits';
import { PROJECT_ROLES } from '../utils/permissions';
import { formatDate } from '../utils/helpers';

const TABS = [
  { id: 'details', label: 'Details', icon: Settings2 },
  { id: 'members', label: 'Members & roles', icon: Users },
  { id: 'sprints', label: 'Sprints', icon: Flag },
];

const SPRINT_STYLES = {
  planned: 'bg-sky2-100 text-sky2-700',
  active: 'bg-sun-100 text-sun-700',
  completed: 'bg-mint-100 text-mint-700',
};

const toInputDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

function DetailsTab({ project, setProject, notify }) {
  const { refreshSession } = useSession();
  const [form, setForm] = useState({ name: project.name, description: project.description || '', sprintLengthDays: project.sprintSettings?.lengthDays || 14 });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    try {
      const res = await projectApi.update({ ...form, sprintLengthDays: Number(form.sprintLengthDays) });
      setProject(p => ({ ...p, ...res.data }));
      await refreshSession();
      notify('success', 'Project settings saved.');
    } catch (err) { notify('error', err.message); }
  };
  const toggleArchive = async () => {
    try {
      const res = await projectApi.update({ status: project.status === 'archived' ? 'active' : 'archived' });
      setProject(p => ({ ...p, ...res.data }));
      await refreshSession();
      notify('success', res.data.status === 'archived' ? 'Project archived — it is now read-only.' : 'Project restored.');
    } catch (err) { notify('error', err.message); }
  };
  return (
    <div className="space-y-6 max-w-2xl">
      <form onSubmit={save} className="card space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="label" htmlFor="ps-name">Project name</label>
            <input id="ps-name" className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label className="label">Key</label>
            <input className="input bg-canvas font-mono" value={project.key} readOnly title="The key can't change because task IDs use it" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="ps-desc">Description</label>
          <textarea id="ps-desc" className="input resize-none" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ps-sprint">Sprint length (days)</label>
          <input id="ps-sprint" type="number" min={1} max={60} className="input w-32" value={form.sprintLengthDays} onChange={e => set('sprintLengthDays', e.target.value)} />
          <p className="text-xs text-slate-400 mt-1.5">Used as the default end date for new sprints.</p>
        </div>
        <p className="text-xs text-slate-400">Team: <strong className="text-slate-600">{project.team?.name}</strong></p>
        <button className="btn-primary">Save</button>
      </form>
      <div className="card flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="font-semibold text-ink">{project.status === 'archived' ? 'Restore project' : 'Archive project'}</p>
          <p className="text-xs text-slate-500">{project.status === 'archived' ? 'Make the project editable again.' : 'Archived projects stay visible but become read-only.'}</p>
        </div>
        <button className="btn-secondary" onClick={toggleArchive}><Archive className="w-4 h-4" />{project.status === 'archived' ? 'Restore' : 'Archive'}</button>
      </div>
    </div>
  );
}

function MembersTab({ project, setProject, notify }) {
  const { user, refreshSession } = useSession();
  const [orgMembers, setOrgMembers] = useState([]);
  const [add, setAdd] = useState({ member: '', role: 'developer' });

  useEffect(() => { orgApi.members().then(r => setOrgMembers(r.data)).catch(e => notify('error', e.message)); }, [notify]);

  const onProject = new Set(project.members.map(m => m.member?._id));
  const candidates = orgMembers.filter(m => m.status === 'active' && !onProject.has(m._id));

  const apply = async (fn, msg) => {
    try {
      const res = await fn();
      setProject(p => ({ ...p, ...res.data }));
      await refreshSession();
      notify('success', msg);
    } catch (err) { notify('error', err.message); }
  };

  return (
    <div className="space-y-6">
      <form className="card flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (add.member) apply(() => projectApi.addMember(add.member, add.role), 'Member added.').then(() => setAdd({ member: '', role: 'developer' })); }}>
        <div className="flex-1 min-w-[220px]">
          <label className="label" htmlFor="pm-member">Add a person</label>
          <select id="pm-member" className="input" value={add.member} onChange={e => setAdd(a => ({ ...a, member: e.target.value }))}>
            <option value="">Choose someone from your organization</option>
            {candidates.map(m => <option key={m._id} value={m._id}>{m.name}{m.role ? ` — ${m.role}` : ''}</option>)}
          </select>
        </div>
        <div className="w-56">
          <label className="label" htmlFor="pm-role">Project role</label>
          <RoleSelect id="pm-role" value={add.role} roles={PROJECT_ROLES} onChange={r => setAdd(a => ({ ...a, role: r }))} />
        </div>
        <button className="btn-primary" disabled={!add.member}><Plus className="w-4 h-4" /> Add</button>
        <p className="w-full text-xs text-slate-400">Anyone in the organization can be added, including people from other teams.</p>
      </form>

      {project.members.length === 0 ? <EmptyState icon={Users} title="No members yet" /> : (
        <div className="card p-0 overflow-hidden">
          {project.members.map(({ member, role }) => member && (
            <div key={member._id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ink/[0.05] last:border-0">
              <Avatar name={member.name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink text-sm">{member.name}{member._id === user._id && <span className="text-slate-400 font-normal"> (you)</span>}</p>
                <p className="text-xs text-slate-400">{member.email}{member.role ? ` · ${member.role}` : ''}</p>
              </div>
              <div className="w-52">
                <RoleSelect value={role} roles={PROJECT_ROLES} className="input py-1.5"
                  onChange={r => apply(() => projectApi.setMemberRole(member._id, r), `${member.name} is now ${r.replace('_', ' ')}.`)} />
              </div>
              <button className="btn-ghost text-xs" onClick={() => apply(() => projectApi.removeMember(member._id), `${member.name} removed from the project.`)}>
                <UserMinus className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SprintsTab({ project, notify }) {
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const lengthDays = project.sprintSettings?.lengthDays || 14;
  const blank = () => {
    const start = new Date();
    return { name: '', goal: '', startDate: toInputDate(start), endDate: toInputDate(new Date(start.getTime() + lengthDays * 86400000)) };
  };
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    try { setSprints((await sprintsApi.getAll()).data); } catch (e) { notify('error', e.message); } finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try { await sprintsApi.create(form); setForm(blank()); load(); notify('success', 'Sprint created.'); }
    catch (err) { notify('error', err.message); }
  };
  const setStatus = async (s, status) => {
    try { await sprintsApi.update(s._id, { status }); load(); notify('success', `${s.name} is now ${status}.`); }
    catch (err) { notify('error', err.message); }
  };
  const remove = async (s) => {
    try { await sprintsApi.delete(s._id); load(); notify('success', 'Sprint deleted. Its tasks moved back to the backlog.'); }
    catch (err) { notify('error', err.message); }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card space-y-4">
        <h3 className="font-bold text-ink flex items-center gap-2"><Flag className="w-4 h-4 text-brand-500" /> Plan a sprint</h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="label" htmlFor="sp-name">Name *</label>
            <input id="sp-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={`Sprint ${sprints.length + 1}`} required />
          </div>
          <div>
            <label className="label" htmlFor="sp-start">Start</label>
            <input id="sp-start" type="date" className="input" value={form.startDate}
              onChange={e => setForm(f => ({ ...f, startDate: e.target.value, endDate: toInputDate(new Date(new Date(e.target.value).getTime() + lengthDays * 86400000)) }))} />
          </div>
          <div>
            <label className="label" htmlFor="sp-end">End</label>
            <input id="sp-end" type="date" className="input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="sp-goal">Sprint goal</label>
          <input id="sp-goal" className="input" value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} />
        </div>
        <button className="btn-primary"><Plus className="w-4 h-4" /> Create sprint</button>
      </form>

      {loading ? <LoadingSpinner /> : sprints.length === 0 ? <EmptyState icon={Flag} title="No sprints yet">Without an active sprint, the dashboard tracks all project tasks.</EmptyState> : (
        <div className="space-y-3">
          {sprints.map(s => (
            <div key={s._id} className="card py-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-display font-semibold text-ink">{s.name}</h4>
                  <span className={`badge ${SPRINT_STYLES[s.status]}`}>{s.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{formatDate(s.startDate)} – {formatDate(s.endDate)}{s.goal ? ` · ${s.goal}` : ''}</p>
              </div>
              {s.status === 'planned' && <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setStatus(s, 'active')}><Play className="w-3.5 h-3.5" /> Start</button>}
              {s.status === 'active' && <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => setStatus(s, 'completed')}><CheckCircle2 className="w-3.5 h-3.5" /> Complete</button>}
              {s.status !== 'active' && <button className="btn-ghost text-xs" onClick={() => remove(s)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProjectSettingsPage() {
  const [tab, setTab] = useState('details');
  const [project, setProject] = useState(null);
  const [alert, setAlert] = useState(null);
  const notify = useCallback((type, message) => setAlert({ type, message }), []);

  useEffect(() => {
    projectApi.get().then(r => setProject(r.data)).catch(e => notify('error', e.message));
  }, [notify]);

  if (!project) return alert ? <Alert type={alert.type} message={alert.message} /> : <LoadingSpinner message="Loading project..." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Settings2 className="w-7 h-7 text-brand-500" />Project Settings</h1>
        <p className="text-slate-500 text-sm mt-1"><span className="font-mono">{project.key}</span> · Configure the project, its members and sprints</p>
      </div>
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} autoClose={alert.type === 'success' ? 4000 : 0} />}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-ink/10 hover:border-brand-300'}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'details' && <DetailsTab project={project} setProject={setProject} notify={notify} />}
      {tab === 'members' && <MembersTab project={project} setProject={setProject} notify={notify} />}
      {tab === 'sprints' && <SprintsTab project={project} notify={notify} />}
    </div>
  );
}
