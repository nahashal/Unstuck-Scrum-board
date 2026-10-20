import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../utils/permissions';

const ROLE_STYLES = {
  platform_admin: 'bg-ink text-white',
  org_admin: 'bg-bubble-100 text-bubble-700',
  member: 'bg-slate-100 text-slate-600',
  project_admin: 'bg-brand-100 text-brand-700',
  scrum_master: 'bg-sun-100 text-sun-700',
  developer: 'bg-sky2-100 text-sky2-700',
};

export function RoleBadge({ role, className = '' }) {
  if (!role) return null;
  return <span className={`badge ${ROLE_STYLES[role] || ROLE_STYLES.member} ${className}`}>{ROLE_LABELS[role] || role}</span>;
}

// The role dropdown used in invites, member tables and project membership
export function RoleSelect({ value, onChange, roles, disabled, id, className = 'input', showHint = false }) {
  return (
    <div>
      <select id={id} className={className} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
      </select>
      {showHint && ROLE_DESCRIPTIONS[value] && <p className="text-xs text-slate-400 mt-1.5">{ROLE_DESCRIPTIONS[value]}</p>}
    </div>
  );
}

export function ProgressBar({ percent = 0, size = 'md', showLabel = true }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5';
  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${h} bg-slate-100 rounded-full overflow-hidden`}>
        <div className="h-full brand-gradient rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="text-xs font-semibold text-slate-500 w-9 text-right">{pct}%</span>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="card text-center py-12">
      {Icon && <Icon className="w-10 h-10 text-slate-200 mx-auto mb-3" />}
      <p className="font-display font-semibold text-ink">{title}</p>
      {children && <div className="text-sm text-slate-500 mt-1">{children}</div>}
    </div>
  );
}
