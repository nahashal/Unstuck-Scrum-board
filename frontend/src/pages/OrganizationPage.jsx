import { useEffect, useState, useCallback } from 'react';
import { Building2, Users, Mail, MailCheck, Send, RotateCw, Layers, FolderKanban, Settings, Copy, Check, Trash2, Plus, UserMinus, Power } from 'lucide-react';
import { orgApi } from '../api';
import { useSession } from '../context/SessionContext';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import LoadingSpinner, { InlineLoader } from '../components/LoadingSpinner';
import { RoleBadge, RoleSelect, EmptyState } from '../components/RoleBits';
import DeleteProjectModal from '../components/DeleteProjectModal';
import { ORG_ROLES, PROJECT_ROLES } from '../utils/permissions';
import { formatDate } from '../utils/helpers';

const TABS = [
  { id: 'members', label: 'Members', icon: Users },
  { id: 'invites', label: 'Invites', icon: Mail },
  { id: 'teams', label: 'Teams', icon: Layers },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function TabBar({ tab, setTab }) {
  return (
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
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────
function MembersTab({ members, setMembers, notify }) {
  const { user } = useSession();
  const [confirmRemove, setConfirmRemove] = useState(null);

  const update = async (m, data) => {
    try {
      const res = await orgApi.updateMember(m._id, data);
      setMembers(list => list.map(x => x._id === m._id ? res.data : x));
      notify('success', `${m.name} updated.`);
    } catch (e) { notify('error', e.message); }
  };
  const remove = async (m) => {
    try {
      await orgApi.removeMember(m._id);
      setMembers(list => list.filter(x => x._id !== m._id));
      notify('success', `${m.name} was removed from the organization. Their open tasks are now unassigned.`);
    } catch (e) { notify('error', e.message); } finally { setConfirmRemove(null); }
  };

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left">
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-bold">Person</th>
              <th className="px-4 py-3 font-bold">Organization role</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const isMe = m._id === user._id;
              return (
                <tr key={m._id} className="border-t border-ink/[0.05]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{m.name}{isMe && <span className="text-slate-400 font-normal"> (you)</span>}</p>
                        <p className="text-xs text-slate-400 truncate">{m.email}{m.role ? ` · ${m.role}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-56">
                    <RoleSelect value={m.orgRole} roles={ORG_ROLES} onChange={r => update(m, { orgRole: r })} className="input py-1.5" />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${m.status === 'active' ? 'bg-mint-100 text-mint-700' : 'bg-slate-100 text-slate-500'}`}>{m.status === 'active' ? 'Active' : 'Deactivated'}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(m.createdAt)}</td>
                  <td className="px-4 py-3">
                    {!isMe && (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost text-xs" title={m.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          onClick={() => update(m, { status: m.status === 'active' ? 'deactivated' : 'active' })}>
                          <Power className="w-3.5 h-3.5" /> {m.status === 'active' ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button className="btn-ghost text-xs hover:!bg-bubble-50 hover:!text-bubble-700" onClick={() => setConfirmRemove(m)}>
                          <UserMinus className="w-3.5 h-3.5" /> Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Modal isOpen={!!confirmRemove} onClose={() => setConfirmRemove(null)} title="Remove member" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Remove <strong>{confirmRemove?.name}</strong> from the organization? They lose access immediately, leave all teams and projects, and their open tasks and action items become unassigned. Their past updates are kept.
          </p>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setConfirmRemove(null)}>Cancel</button>
            <button className="btn-danger" onClick={() => remove(confirmRemove)}><UserMinus className="w-4 h-4" /> Remove</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Invites ─────────────────────────────────────────────────────────────────
function InvitesTab({ teams, projects, notify }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', orgRole: 'member', team: '', project: '', projectRole: 'developer' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  // Whether the server emails invites automatically (Brevo configured)
  const [emailOn, setEmailOn] = useState(false);
  const [resending, setResending] = useState(null);

  const load = useCallback(async () => {
    try { setInvites((await orgApi.invites()).data); } catch (e) { notify('error', e.message); } finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { orgApi.emailStatus().then(r => setEmailOn(r.data.configured)).catch(() => {}); }, []);

  const resend = async (inv) => {
    setResending(inv._id);
    try {
      const res = await orgApi.resendInvite(inv._id);
      setCreated(res.data);
      setCopied(false);
      load();
      if (res.data.delivery?.sent) notify('success', `Invite emailed again to ${inv.email}. The previous link no longer works.`);
      else notify('error', `New link created, but the email wasn't sent${res.data.delivery?.error ? `: ${res.data.delivery.error}` : '.'} Share the link below instead.`);
    } catch (e) { notify('error', e.message); } finally { setResending(null); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await orgApi.createInvite({
        email: form.email,
        orgRole: form.orgRole,
        teams: form.team ? [form.team] : [],
        projectRoles: form.project ? [{ project: form.project, role: form.projectRole }] : [],
      });
      setCreated(res.data);
      setCopied(false);
      setForm(f => ({ ...f, email: '' }));
      load();
    } catch (err) { notify('error', err.message); } finally { setSaving(false); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(created.link); setCopied(true); } catch { /* user can copy manually */ }
  };

  const revoke = async (id) => {
    try { await orgApi.revokeInvite(id); setInvites(list => list.filter(i => i._id !== id)); notify('success', 'Invite revoked.'); }
    catch (e) { notify('error', e.message); }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card space-y-4">
        <h3 className="font-bold text-ink flex items-center gap-2"><Mail className="w-4 h-4 text-brand-500" /> Invite someone</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="inv-email">Email *</label>
            <input id="inv-email" type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="inv-orgrole">Organization role</label>
            <RoleSelect id="inv-orgrole" value={form.orgRole} roles={ORG_ROLES} onChange={v => set('orgRole', v)} showHint />
          </div>
          <div>
            <label className="label" htmlFor="inv-team">Team (optional)</label>
            <select id="inv-team" className="input" value={form.team} onChange={e => set('team', e.target.value)}>
              <option value="">No team</option>
              {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="inv-project">Project (optional)</label>
            <select id="inv-project" className="input" value={form.project} onChange={e => set('project', e.target.value)}>
              <option value="">No project yet</option>
              {projects.filter(p => p.status === 'active').map(p => <option key={p._id} value={p._id}>{p.key} · {p.name}</option>)}
            </select>
          </div>
          {form.project && (
            <div className="md:col-span-2">
              <label className="label" htmlFor="inv-prole">Role on that project</label>
              <RoleSelect id="inv-prole" value={form.projectRole} roles={PROJECT_ROLES} onChange={v => set('projectRole', v)} showHint />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={saving}>
            {saving ? <InlineLoader size="sm" /> : emailOn ? <Send className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {emailOn ? 'Send invite' : 'Create invite link'}
          </button>
          <p className="text-xs text-slate-400">
            {emailOn
              ? 'The invite is emailed to them automatically. Links work once and expire after 7 days.'
              : "Links work once and expire after 7 days. Email isn't set up, so share the link yourself."}
          </p>
        </div>
        {created && (
          <div className="bg-mint-50 border border-mint-200 rounded-2xl p-3 space-y-2">
            {created.delivery?.sent && (
              <p className="text-sm font-semibold text-mint-700 flex items-center gap-1.5"><MailCheck className="w-4 h-4" /> Invite emailed to {created.email}</p>
            )}
            {created.delivery?.configured && !created.delivery.sent && (
              <p className="text-sm font-semibold text-bubble-700">The email to {created.email} couldn't be sent{created.delivery.error ? ` (${created.delivery.error})` : ''}. Share this link with them instead:</p>
            )}
            {!created.delivery?.configured && <p className="text-sm font-semibold text-mint-700">Invite link for {created.email}</p>}
            {created.delivery?.sent && <p className="text-xs text-slate-500">You can also share the link directly if it doesn't arrive (check spam):</p>}
            <div className="flex gap-2">
              <input className="input text-xs font-mono" readOnly value={created.link} onFocus={e => e.target.select()} />
              <button type="button" className="btn-secondary" onClick={copy}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        )}
      </form>

      <div>
        <h3 className="section-header">Pending invites ({invites.length})</h3>
        {loading ? <LoadingSpinner /> : invites.length === 0 ? <EmptyState icon={Mail} title="No pending invites" /> : (
          <div className="space-y-2">
            {invites.map(i => (
              <div key={i._id} className="card py-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink text-sm">{i.email}</p>
                  <p className="text-xs text-slate-400">Invited by {i.invitedBy?.name || '—'} · expires {formatDate(i.expiresAt)}</p>
                  {i.emailSentAt && !i.emailError && <p className="text-xs text-mint-700 flex items-center gap-1 mt-0.5"><MailCheck className="w-3 h-3" /> Emailed {formatDate(i.emailSentAt)}</p>}
                  {i.emailError && <p className="text-xs text-bubble-700 mt-0.5">Email failed: {i.emailError}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <RoleBadge role={i.orgRole} />
                  {i.teams.map(t => <span key={t._id} className="badge bg-slate-100 text-slate-600">{t.name}</span>)}
                  {i.projectRoles.filter(pr => pr.project).map(pr => (
                    <span key={pr.project._id} className="badge bg-white border border-ink/10 text-slate-600">{pr.project.key} · {pr.role.replace('_', ' ')}</span>
                  ))}
                </div>
                {emailOn && (
                  <button className="btn-ghost text-xs" disabled={resending === i._id} onClick={() => resend(i)} title="Sends a new link; the old one stops working">
                    {resending === i._id ? <InlineLoader size="sm" /> : <RotateCw className="w-3.5 h-3.5" />} Resend email
                  </button>
                )}
                <button className="btn-ghost text-xs" onClick={() => revoke(i._id)}><Trash2 className="w-3.5 h-3.5" /> Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Teams ───────────────────────────────────────────────────────────────────
function TeamsTab({ teams, setTeams, members, notify }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState([]);
  const active = members.filter(m => m.status === 'active');

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await orgApi.createTeam({ name });
      setTeams(t => [...t, { ...res.data, projectCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setName('');
      notify('success', 'Team created.');
    } catch (err) { notify('error', err.message); }
  };
  const openMembers = (team) => { setEditing(team); setSelected(team.members.map(m => m._id)); };
  const saveMembers = async () => {
    try {
      const res = await orgApi.updateTeam(editing._id, { members: selected });
      setTeams(t => t.map(x => x._id === editing._id ? { ...res.data, projectCount: x.projectCount } : x));
      setEditing(null);
      notify('success', 'Team members updated.');
    } catch (err) { notify('error', err.message); }
  };
  const remove = async (team) => {
    try { await orgApi.deleteTeam(team._id); setTeams(t => t.filter(x => x._id !== team._id)); notify('success', 'Team deleted.'); }
    catch (err) { notify('error', err.message); }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label" htmlFor="team-name">New team</label>
          <input id="team-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Web Platform" required />
        </div>
        <button className="btn-primary"><Plus className="w-4 h-4" /> Create team</button>
      </form>
      {teams.length === 0 ? <EmptyState icon={Layers} title="No teams yet">Teams own projects. Create one to get started.</EmptyState> : (
        <div className="grid md:grid-cols-2 gap-4">
          {teams.map(t => (
            <div key={t._id} className="card">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display font-semibold text-ink">{t.name}</h4>
                <span className="text-xs text-slate-400">{t.projectCount} project{t.projectCount === 1 ? '' : 's'}</span>
              </div>
              <div className="flex -space-x-2 mt-3">
                {t.members.slice(0, 8).map(m => <Avatar key={m._id} name={m.name} />)}
                {t.members.length === 0 && <p className="text-xs text-slate-400">No members yet</p>}
              </div>
              <div className="flex gap-2 mt-4">
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => openMembers(t)}><Users className="w-3.5 h-3.5" /> Members</button>
                {t.projectCount === 0 && <button className="btn-ghost text-xs" onClick={() => remove(t)}><Trash2 className="w-3.5 h-3.5" /> Delete</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={`${editing?.name || ''} — members`}>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {active.map(m => (
            <label key={m._id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-canvas cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={selected.includes(m._id)}
                onChange={e => setSelected(s => e.target.checked ? [...s, m._id] : s.filter(id => id !== m._id))} />
              <Avatar name={m.name} size="sm" />
              <span className="text-sm text-ink">{m.name}</span>
              <span className="text-xs text-slate-400">{m.role}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" onClick={saveMembers}>Save</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Projects ────────────────────────────────────────────────────────────────
function ProjectsTab({ projects, setProjects, teams, members, notify }) {
  const { refreshSession, switchProject, navigate } = useSession();
  const [form, setForm] = useState({ name: '', key: '', team: '', projectAdmin: '', description: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await orgApi.createProject({ ...form, projectAdmin: form.projectAdmin || null });
      setProjects(p => [...p, res.data].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', key: '', team: '', projectAdmin: '', description: '' });
      await refreshSession();
      notify('success', `Project ${res.data.key} created.`);
    } catch (err) { notify('error', err.message); } finally { setSaving(false); }
  };

  const open = (id) => { switchProject(id); navigate('dashboard'); };

  const [deleting, setDeleting] = useState(null);
  const onDeleted = async (p) => {
    setProjects(list => list.filter(x => x._id !== p._id));
    setDeleting(null);
    await refreshSession();
    notify('success', `Project ${p.key} and all of its data were deleted.`);
  };

  return (
    <div className="space-y-6">
      <DeleteProjectModal project={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
      {teams.length === 0 ? (
        <Alert type="info" message="Create a team first — every project belongs to a team." />
      ) : (
        <form onSubmit={create} className="card space-y-4">
          <h3 className="font-bold text-ink flex items-center gap-2"><FolderKanban className="w-4 h-4 text-brand-500" /> New project</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="label" htmlFor="proj-name">Name *</label>
              <input id="proj-name" className="input" value={form.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="proj-key">Key *</label>
              <input id="proj-key" className="input uppercase" value={form.key} onChange={e => set('key', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="WEB" required />
            </div>
            <div>
              <label className="label" htmlFor="proj-team">Team *</label>
              <select id="proj-team" className="input" value={form.team} onChange={e => set('team', e.target.value)} required>
                <option value="">Choose team</option>
                {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label" htmlFor="proj-admin">Project Admin</label>
              <select id="proj-admin" className="input" value={form.projectAdmin} onChange={e => set('projectAdmin', e.target.value)}>
                <option value="">Decide later (Org Admins manage it meanwhile)</option>
                {members.filter(m => m.status === 'active').map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="proj-desc">Description</label>
            <textarea id="proj-desc" className="input resize-none" rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <p className="text-xs text-slate-400">Task IDs use the key, e.g. <span className="font-mono">{form.key || 'WEB'}-0001</span>. People from any team can be added later in Project Settings.</p>
          <button className="btn-primary" disabled={saving}>{saving ? <InlineLoader size="sm" /> : <Plus className="w-4 h-4" />} Create project</button>
        </form>
      )}

      {projects.length === 0 ? <EmptyState icon={FolderKanban} title="No projects yet" /> : (
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map(p => (
            <div key={p._id} className="card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-slate-400">{p.key}</p>
                  <h4 className="font-display font-semibold text-ink truncate">{p.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Team: {p.team?.name || '—'} · {p.members.length} member{p.members.length === 1 ? '' : 's'}</p>
                </div>
                {p.status === 'archived' && <span className="badge bg-slate-100 text-slate-500">Archived</span>}
              </div>
              <div className="flex gap-2 mt-4">
                <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => open(p._id)}>Open project</button>
                <button className="btn-ghost text-xs hover:!bg-bubble-50 hover:!text-bubble-700" onClick={() => setDeleting(p)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
function SettingsTab({ org, setOrg, notify }) {
  const { refreshSession } = useSession();
  const [form, setForm] = useState({ name: org.name, defaultSprintDays: org.settings?.defaultSprintDays || 14 });
  const save = async (e) => {
    e.preventDefault();
    try {
      const res = await orgApi.update({ name: form.name, defaultSprintDays: Number(form.defaultSprintDays) });
      setOrg(res.data);
      await refreshSession();
      notify('success', 'Organization settings saved.');
    } catch (err) { notify('error', err.message); }
  };
  return (
    <form onSubmit={save} className="card space-y-4 max-w-xl">
      <div>
        <label className="label" htmlFor="org-name">Organization name</label>
        <input id="org-name" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      </div>
      <div>
        <label className="label" htmlFor="org-sprint">Default sprint length (days)</label>
        <input id="org-sprint" type="number" min={1} max={60} className="input w-32" value={form.defaultSprintDays} onChange={e => setForm(f => ({ ...f, defaultSprintDays: e.target.value }))} />
        <p className="text-xs text-slate-400 mt-1.5">Used for new projects. Project Admins can change it per project.</p>
      </div>
      <button className="btn-primary">Save settings</button>
    </form>
  );
}

export default function OrganizationPage() {
  const [tab, setTab] = useState('members');
  const [org, setOrg] = useState(null);
  const [members, setMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);

  const notify = useCallback((type, message) => setAlert({ type, message }), []);

  useEffect(() => {
    Promise.all([orgApi.get(), orgApi.members(), orgApi.teams(), orgApi.projects()])
      .then(([o, m, t, p]) => { setOrg(o.data); setMembers(m.data); setTeams(t.data); setProjects(p.data); })
      .catch(e => notify('error', e.message))
      .finally(() => setLoading(false));
  }, [notify]);

  if (loading) return <LoadingSpinner message="Loading organization..." />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7 text-brand-500" />{org?.name || 'Organization'}</h1>
        <p className="text-slate-500 text-sm mt-1">Invite and remove people, organize teams, create projects and manage settings</p>
      </div>
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} autoClose={alert.type === 'success' ? 4000 : 0} />}
      <TabBar tab={tab} setTab={setTab} />
      {tab === 'members' && <MembersTab members={members} setMembers={setMembers} notify={notify} />}
      {tab === 'invites' && <InvitesTab teams={teams} projects={projects} notify={notify} />}
      {tab === 'teams' && <TeamsTab teams={teams} setTeams={setTeams} members={members} notify={notify} />}
      {tab === 'projects' && <ProjectsTab projects={projects} setProjects={setProjects} teams={teams} members={members} notify={notify} />}
      {tab === 'settings' && org && <SettingsTab org={org} setOrg={setOrg} notify={notify} />}
    </div>
  );
}
