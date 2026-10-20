import { useEffect, useState } from 'react';
import { UserPlus, MailCheck } from 'lucide-react';
import { authApi } from '../api';
import Alert from '../components/Alert';
import LoadingSpinner, { InlineLoader } from '../components/LoadingSpinner';
import { RoleBadge } from '../components/RoleBits';

// Opened from an invite link (?invite=TOKEN): shows what the invite grants and creates the account
export default function AcceptInvitePage({ token, signedInAs, onSignedIn, onSignOut, onCancel }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', role: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    authApi.previewInvite(token)
      .then(res => setInvite(res.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await authApi.acceptInvite(token, form);
      onSignedIn(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex flex-col items-center text-center mb-6">
          <img src="/unstuck-icon.png" alt="" className="w-16 h-16 rounded-2xl shadow-note mb-4" />
          <h1 className="text-3xl font-bold">You're invited</h1>
          <p className="text-slate-500 text-sm mt-1">Join your team on Unstuck</p>
        </div>

        <div className="card p-6 border-t-[6px] border-t-sun-400">
          {loading ? <LoadingSpinner message="Checking your invite..." /> : (
            <>
              {error && <div className="mb-4"><Alert type="error" message={error} onClose={invite ? () => setError('') : undefined} /></div>}

              {invite && signedInAs && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    You're signed in as <strong>{signedInAs.email}</strong>. This invite is for <strong>{invite.email}</strong> — sign out first to accept it.
                  </p>
                  <div className="flex gap-3">
                    <button className="btn-primary" onClick={onSignOut}>Sign out</button>
                    <button className="btn-secondary" onClick={onCancel}>Back to Unstuck</button>
                  </div>
                </div>
              )}

              {invite && !signedInAs && (
                <>
                  <div className="bg-canvas rounded-2xl p-4 mb-5 space-y-2 text-sm">
                    <p className="flex items-center gap-2 text-ink font-semibold"><MailCheck className="w-4 h-4 text-brand-600" />{invite.email}</p>
                    <p className="text-slate-600">
                      {invite.invitedBy ? <><strong>{invite.invitedBy}</strong> invited you to </> : 'Invitation to '}
                      <strong>{invite.organization}</strong>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <RoleBadge role={invite.orgRole} />
                      {invite.projectRoles.map(pr => (
                        <span key={pr.key} className="badge bg-white border border-ink/10 text-slate-600">{pr.key} · <RoleBadge role={pr.role} className="px-1.5" /></span>
                      ))}
                    </div>
                  </div>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="label" htmlFor="invite-name">Full name *</label>
                      <input id="invite-name" className="input" value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="invite-title">Job title (optional)</label>
                      <input id="invite-title" className="input" value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Backend Developer" autoComplete="organization-title" />
                    </div>
                    <div>
                      <label className="label" htmlFor="invite-password">Choose a password *</label>
                      <input id="invite-password" type="password" className="input" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" minLength={8} required />
                      <p className="text-xs text-slate-400 mt-1.5">At least 8 characters.</p>
                    </div>
                    <button type="submit" className="btn-primary w-full justify-center" disabled={submitting}>
                      {submitting ? <InlineLoader size="sm" /> : <UserPlus className="w-4 h-4" />}
                      Join {invite.organization}
                    </button>
                  </form>
                </>
              )}

              {!invite && (
                <button className="btn-secondary w-full justify-center" onClick={onCancel}>Go to sign in</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
