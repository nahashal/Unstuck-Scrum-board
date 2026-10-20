import { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { authApi } from '../api';
import Alert from '../components/Alert';
import { InlineLoader } from '../components/LoadingSpinner';

export default function AuthPage({ onSignedIn }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ name: '', organizationName: '', role: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const isRegister = mode === 'register';

  const switchMode = (next) => {
    setMode(next);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = isRegister
        ? await authApi.register(form)
        : await authApi.login({ email: form.email, password: form.password });
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
          <h1 className="text-3xl font-bold">Unstuck</h1>
          <p className="text-slate-500 text-sm mt-1">From blockers to breakthroughs</p>
        </div>

        <div className="card p-6 border-t-[6px] border-t-sun-400">
          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-canvas rounded-full mb-6">
            {[['login', 'Sign in'], ['register', 'New organization']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => switchMode(id)}
                className={`py-2 rounded-full text-sm font-semibold transition-all ${mode === id ? 'bg-brand-600 text-white shadow-pop' : 'text-slate-500 hover:text-brand-700'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && <div className="mb-4"><Alert type="error" message={error} onClose={() => setError('')} /></div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                <div>
                  <label className="label" htmlFor="auth-name">Full name *</label>
                  <input id="auth-name" className="input" value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" required />
                </div>
                <div>
                  <label className="label" htmlFor="auth-org">Organization name *</label>
                  <input id="auth-org" className="input" value={form.organizationName} onChange={e => set('organizationName', e.target.value)} placeholder="e.g. Acme Software" autoComplete="organization" required />
                  <p className="text-xs text-slate-400 mt-1.5">You'll be its Organization Admin. Joining an existing team? Use the invite link your admin sent you.</p>
                </div>
                <div>
                  <label className="label" htmlFor="auth-role">Job title (optional)</label>
                  <input id="auth-role" className="input" value={form.role} onChange={e => set('role', e.target.value)} placeholder="e.g. Engineering Manager" autoComplete="organization-title" />
                </div>
              </>
            )}
            <div>
              <label className="label" htmlFor="auth-email">Email *</label>
              <input id="auth-email" type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" required />
            </div>
            <div>
              <label className="label" htmlFor="auth-password">Password *</label>
              <input
                id="auth-password"
                type="password"
                className="input"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                minLength={isRegister ? 8 : undefined}
                required
              />
              {isRegister && <p className="text-xs text-slate-400 mt-1.5">At least 8 characters.</p>}
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={submitting}>
              {submitting ? <InlineLoader size="sm" /> : isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
              {isRegister ? 'Create organization' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          {isRegister ? 'Already have an account? ' : 'Starting a new organization? '}
          <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
