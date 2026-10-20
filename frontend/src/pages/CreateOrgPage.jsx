import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { authApi } from '../api';
import Alert from '../components/Alert';
import { InlineLoader } from '../components/LoadingSpinner';

// Shown to a signed-in account that doesn't belong to any organization yet
export default function CreateOrgPage({ user, onCreated }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onCreated((await authApi.createOrganization(name)).data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-10 animate-slide-up">
      <div className="card p-6 border-t-[6px] border-t-sun-400 space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="w-6 h-6 text-brand-500" />Set up your organization</h1>
          <p className="text-sm text-slate-500 mt-1">
            Hi {user.name} — your account isn't part of an organization yet. Create one to become its Organization Admin,
            or ask an existing admin to invite <strong>{user.email}</strong>.
          </p>
        </div>
        {error && <Alert type="error" message={error} onClose={() => setError('')} />}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="neworg-name">Organization name *</label>
            <input id="neworg-name" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme Software" required />
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? <InlineLoader size="sm" /> : <Building2 className="w-4 h-4" />} Create organization</button>
        </form>
      </div>
    </div>
  );
}
