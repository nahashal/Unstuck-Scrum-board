import { useEffect, useState, useCallback } from 'react';
import { Globe2, Building2, Users, SlidersHorizontal, Search, ShieldCheck, Power, Trash2, Plus } from 'lucide-react';
import { platformApi } from '../api';
import { useSession } from '../context/SessionContext';
import Alert from '../components/Alert';
import Avatar from '../components/Avatar';
import LoadingSpinner, { InlineLoader } from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { RoleBadge, EmptyState } from '../components/RoleBits';
import { formatDate } from '../utils/helpers';

const TABS = [
  { id: 'orgs', label: 'Organizations', icon: Building2 },
  { id: 'access', label: 'People & access', icon: Users },
  { id: 'settings', label: 'Platform settings', icon: SlidersHorizontal },
];

function Stat({ label, value, tone }) {
  return (
    <div className={`${tone} rounded-2xl p-4 shadow-note border border-ink/[0.04]`}>
      <p className="text-xs font-semibold text-ink/60">{label}</p>
      <p className="font-display text-2xl font-bold text-ink mt-1">{value ?? '—'}</p>
    </div>
  );
}

// Platform Admin: create an organization and set up its first Organization Admin
function NewOrgForm({ notify, onCreated }) {
  const [form, setForm] = useState({ name: '', adminEmail: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = (await platformApi.createOrganization(form)).data;
      setForm({ name: '', adminEmail: '' });
      onCreated();
      if (d.mode === 'assigned') {
        setResult(null);
        notify('success', `${d.organization.name} created. ${d.admin.name} is its Organization Admin and will see it the next time they load the app.`);
      } else {
        setResult(d);
        setCopied(false);
        notify('success', `${d.organization.name} created. An Organization Admin invite was issued to ${d.email}.`);
      }
    } catch (err) { notify('error', err.message); } finally { setSaving(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { /* copy manually */ } };

  const resultLine = !result ? '' : result.delivery?.sent
    ? `Admin invite emailed to ${result.email}`
    : result.delivery?.configured
      ? `The email to ${result.email} couldn't be sent${result.delivery.error ? ` (${result.delivery.error})` : ''}. Share this link instead:`
      : `Admin invite link for ${result.email}`;

  return (
    <form onSubmit={submit} className="card space-y-4">
      <h3 className="font-bold text-ink flex items-center gap-2"><Plus className="w-4 h-4 text-brand-500" /> New organization</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="neworg-name-p">Organization name *</label>
          <input id="neworg-name-p" className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Software" required />
        </div>
        <div>
          <label className="label" htmlFor="neworg-admin">First Organization Admin's email *</label>
          <input id="neworg-admin" type="email" className="input" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} required />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={saving}>{saving ? <InlineLoader size="sm" /> : <Building2 className="w-4 h-4" />} Create organization</button>
        <p className="text-xs text-slate-400">New people get an admin invite (emailed when Brevo is set up). An existing account with no organization becomes its admin straight away.</p>
      </div>
      {result && (
        <div className="bg-mint-50 border border-mint-200 rounded-2xl p-3 space-y-2">
          <p className="text-sm font-semibold text-mint-700">{resultLine}</p>
          <div className="flex gap-2">
            <input className="input text-xs font-mono" readOnly value={result.link} onFocus={e => e.target.select()} />
            <button type="button" className="btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
      )}
    </form>
  );
}

function OrgsTab({ notify, reloadKey }) {
  const { user, refreshSession } = useSession();
  const [orgs, setOrgs] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const askDelete = (o) => { setDeleting(o); setConfirmName(''); };
  const remove = async () => {
    setBusy(true);
    try {
      await platformApi.deleteOrganization(deleting._id, confirmName);
      setOrgs(list => list.filter(x => x._id !== deleting._id));
      notify('success', `${deleting.name} and all of its data were deleted.`);
      // Deleting your own organization changes what you can access
      if (user.organization?._id === deleting._id) await refreshSession();
      setDeleting(null);
    } catch (e) { notify('error', e.message); } finally { setBusy(false); }
  };
  useEffect(() => { platformApi.organizations().then(r => setOrgs(r.data)).catch(e => notify('error', e.message)); }, [notify, reloadKey]);
  const toggle = async (o) => {
    const status = o.status === 'active' ? 'suspended' : 'active';
    try {
      await platformApi.setOrgStatus(o._id, status);
      setOrgs(list => list.map(x => x._id === o._id ? { ...x, status } : x));
      notify('success', `${o.name} is now ${status}.`);
    } catch (e) { notify('error', e.message); }
  };
  if (!orgs) return <LoadingSpinner />;
  if (orgs.length === 0) return <EmptyState icon={Building2} title="No organizations yet" />;
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left">
            <tr className="text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-bold">Organization</th>
              <th className="px-4 py-3 font-bold">Created by</th>
              <th className="px-4 py-3 font-bold">Members</th>
              <th className="px-4 py-3 font-bold">Projects</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orgs.map(o => (
              <tr key={o._id} className="border-t border-ink/[0.05]">
                <td className="px-4 py-3"><p className="font-semibold text-ink">{o.name}</p><p className="text-xs text-slate-400">since {formatDate(o.createdAt)}</p></td>
                <td className="px-4 py-3 text-slate-600">{o.createdBy?.name || '—'}<p className="text-xs text-slate-400">{o.createdBy?.email}</p></td>
                <td className="px-4 py-3">{o.memberCount}</td>
                <td className="px-4 py-3">{o.projectCount}</td>
                <td className="px-4 py-3"><span className={`badge ${o.status === 'active' ? 'bg-mint-100 text-mint-700' : 'bg-bubble-100 text-bubble-700'}`}>{o.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button className="btn-ghost text-xs" onClick={() => toggle(o)}><Power className="w-3.5 h-3.5" />{o.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                    <button className="btn-ghost text-xs hover:!bg-bubble-50 hover:!text-bubble-700" onClick={() => askDelete(o)}><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete organization" size="sm">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This permanently deletes <strong>{deleting.name}</strong> with its {deleting.projectCount} project{deleting.projectCount === 1 ? '' : 's'}, teams, tasks, updates, blockers, action items and invites. <strong>This cannot be undone.</strong>
            </p>
            <p className="text-sm text-slate-600">Its {deleting.memberCount} member account{deleting.memberCount === 1 ? '' : 's'} are kept but leave the organization; they can start a new one or be invited elsewhere.</p>
            <div>
              <label className="label" htmlFor="confirm-org-name">Type <span className="normal-case font-mono text-ink">{deleting.name}</span> to confirm</label>
              <input id="confirm-org-name" className="input" value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off" />
            </div>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn-danger" disabled={busy || confirmName.trim() !== deleting.name} onClick={remove}>
                {busy ? <InlineLoader size="sm" /> : <Trash2 className="w-4 h-4" />} Delete forever
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AccessTab({ notify }) {
  const { user } = useSession();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState(null);
  const search = useCallback(async (term) => {
    try { setUsers((await platformApi.users(term)).data); } catch (e) { notify('error', e.message); }
  }, [notify]);
  useEffect(() => { search(''); }, [search]);

  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const update = async (u, data, msg) => {
    try {
      const res = await platformApi.updateUser(u._id, data);
      setUsers(list => list.map(x => x._id === u._id ? res.data : x));
      notify('success', msg);
    } catch (e) { notify('error', e.message); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await platformApi.deleteUser(deleting._id);
      setUsers(list => list.filter(x => x._id !== deleting._id));
      notify('success', `${deleting.name}'s account was deleted.`);
      setDeleting(null);
    } catch (e) { notify('error', e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <form className="card flex gap-3" onSubmit={e => { e.preventDefault(); search(q); }}>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" value={q} onChange={e => setQ(e.target.value)} placeholder="Search people by name or email" />
        </div>
        <button className="btn-primary">Search</button>
      </form>
      <p className="text-xs text-slate-400">{q ? 'Search results' : 'Showing everyone (up to 50). Search to narrow it down.'}</p>
      {!users ? <LoadingSpinner /> : users.length === 0 ? <EmptyState icon={Users} title="Nobody found" /> : (
        <div className="card p-0 overflow-hidden">
          {users.map(u => (
            <div key={u._id} className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-ink/[0.05] last:border-0">
              <Avatar name={u.name} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink text-sm">{u.name}</p>
                <p className="text-xs text-slate-400">{u.email} · {u.organization?.name || 'No organization'}</p>
              </div>
              <div className="flex gap-1.5">
                {u.platformRole === 'admin' && <RoleBadge role="platform_admin" />}
                {u.status !== 'active' && <span className="badge bg-slate-100 text-slate-500">Deactivated</span>}
              </div>
              {u._id !== user._id && (
                <div className="flex gap-1">
                  <button className="btn-ghost text-xs" onClick={() => update(u, { platformRole: u.platformRole === 'admin' ? null : 'admin' }, u.platformRole === 'admin' ? `${u.name} is no longer a Platform Admin.` : `${u.name} is now a Platform Admin.`)}>
                    <ShieldCheck className="w-3.5 h-3.5" />{u.platformRole === 'admin' ? 'Revoke admin' : 'Make admin'}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => update(u, { status: u.status === 'active' ? 'deactivated' : 'active' }, `${u.name} ${u.status === 'active' ? 'deactivated' : 'reactivated'}.`)}>
                    <Power className="w-3.5 h-3.5" />{u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button className="btn-ghost text-xs hover:!bg-bubble-50 hover:!text-bubble-700" onClick={() => setDeleting(u)}>
                    <Trash2 className="w-3.5 h-3.5" />Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete account" size="sm">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Permanently delete <strong>{deleting.name}</strong> ({deleting.email})? They are signed out immediately and removed from all teams and projects.
              Their open tasks and action items become unassigned; their past updates stay as a former member. <strong>This cannot be undone.</strong>
            </p>
            <p className="text-xs text-slate-400">To block someone temporarily instead, use Deactivate.</p>
            <div className="flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="btn-danger" disabled={busy} onClick={remove}>
                {busy ? <InlineLoader size="sm" /> : <Trash2 className="w-4 h-4" />} Delete account
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SettingsTab({ notify }) {
  const [settings, setSettings] = useState(null);
  useEffect(() => { platformApi.settings().then(r => setSettings(r.data)).catch(e => notify('error', e.message)); }, [notify]);
  const toggle = async (key) => {
    try {
      const res = await platformApi.updateSettings({ [key]: !settings[key] });
      setSettings(res.data);
      notify('success', 'Platform settings saved.');
    } catch (e) { notify('error', e.message); }
  };
  if (!settings) return <LoadingSpinner />;
  const rows = [
    { key: 'allowOrgSignup', title: 'Allow new organizations to sign up', desc: 'When off, people can only join through invite links.' },
    { key: 'aiEnabled', title: 'AI features', desc: 'Blocker analysis, progress estimates and stand-up summaries for every organization.' },
  ];
  return (
    <div className="card p-0 overflow-hidden max-w-2xl">
      {rows.map(r => (
        <div key={r.key} className="flex items-center gap-4 px-5 py-4 border-b border-ink/[0.05] last:border-0">
          <div className="flex-1">
            <p className="font-semibold text-ink text-sm">{r.title}</p>
            <p className="text-xs text-slate-500">{r.desc}</p>
          </div>
          <button role="switch" aria-checked={settings[r.key]} onClick={() => toggle(r.key)}
            className={`relative w-11 h-6 rounded-full transition-colors ${settings[r.key] ? 'bg-brand-600' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[r.key] ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function PlatformAdminPage() {
  const [tab, setTab] = useState('orgs');
  // Bumped after creating an organization so the list reloads
  const [orgsKey, setOrgsKey] = useState(0);
  const [stats, setStats] = useState(null);
  const [alert, setAlert] = useState(null);
  const notify = useCallback((type, message) => setAlert({ type, message }), []);
  useEffect(() => { platformApi.stats().then(r => setStats(r.data)).catch(e => notify('error', e.message)); }, [notify, tab]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Globe2 className="w-7 h-7 text-brand-500" />Platform Admin</h1>
        <p className="text-slate-500 text-sm mt-1">Manage organizations, platform-wide access and settings. Project contents stay private to each organization.</p>
      </div>
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} autoClose={alert.type === 'success' ? 4000 : 0} />}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Organizations" value={stats && `${stats.activeOrganizations}/${stats.organizations}`} tone="bg-brand-100" />
        <Stat label="Active users" value={stats?.activeUsers} tone="bg-sun-100" />
        <Stat label="All accounts" value={stats?.users} tone="bg-mint-100" />
        <Stat label="Projects" value={stats?.projects} tone="bg-sky2-100" />
      </div>
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
      {tab === 'orgs' && (
        <div className="space-y-6">
          <NewOrgForm notify={notify} onCreated={() => setOrgsKey(k => k + 1)} />
          <OrgsTab notify={notify} reloadKey={orgsKey} />
        </div>
      )}
      {tab === 'access' && <AccessTab notify={notify} />}
      {tab === 'settings' && <SettingsTab notify={notify} />}
    </div>
  );
}
