import { LayoutDashboard, Kanban, MessageSquare, Brain, ShieldAlert, CheckSquare, Menu, X, LogOut, Users, Settings2, Building2, Globe2, ChevronsUpDown } from 'lucide-react';
import Avatar from './Avatar';
import { RoleBadge } from './RoleBits';
import { useSession } from '../context/SessionContext';

// Sections appear only for the roles that can use them
const NAV_SECTIONS = [
  {
    title: 'Workspace',
    show: () => true,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'board', label: 'Scrum Board', icon: Kanban },
      { id: 'updates', label: 'Daily Updates', icon: MessageSquare },
      { id: 'standup', label: 'Stand-up', icon: Users },
      { id: 'ai', label: 'AI Intelligence', icon: Brain },
      { id: 'blockers', label: 'Blockers', icon: ShieldAlert },
      { id: 'actions', label: 'Action Items', icon: CheckSquare },
    ],
  },
  {
    title: 'Project',
    show: (s) => !!s.project && s.can.isProjectAdmin,
    items: [{ id: 'project', label: 'Project Settings', icon: Settings2 }],
  },
  {
    title: 'Organization',
    show: (s) => s.can.isOrgAdmin,
    items: [{ id: 'org', label: 'Organization', icon: Building2 }],
  },
  {
    title: 'Platform',
    show: (s) => s.can.isPlatformAdmin,
    items: [{ id: 'platform', label: 'Platform Admin', icon: Globe2 }],
  },
];

const ALL_ITEMS = NAV_SECTIONS.flatMap(s => s.items);

function ProjectSwitcher() {
  const { user, project, switchProject } = useSession();
  if (!user.projects.length) {
    return <p className="text-xs text-slate-400 px-1">No projects yet</p>;
  }
  return (
    <label className="block relative">
      <span className="sr-only">Current project</span>
      <select
        id="project-switcher"
        value={project?._id || ''}
        onChange={e => switchProject(e.target.value)}
        className="w-full appearance-none bg-canvas border border-ink/10 rounded-2xl pl-3 pr-8 py-2.5 text-sm font-semibold text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {user.projects.map(p => (
          <option key={p._id} value={p._id}>{p.key} · {p.name}{p.status === 'archived' ? ' (archived)' : ''}</option>
        ))}
      </select>
      <ChevronsUpDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
    </label>
  );
}

export default function Sidebar({ activePage, onNavigate, isOpen, onToggle, onSignOut }) {
  const session = useSession();
  const { user, projectRole } = session;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-ink/40 z-20 lg:hidden" onClick={onToggle} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full z-30 w-64 bg-white border-r border-ink/[0.06] shadow-xl lg:shadow-none
        transition-transform duration-300 flex flex-col
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-[68px] border-b border-ink/[0.06]">
          <img src="/unstuck-icon.png" alt="" className="w-10 h-10 rounded-xl shadow-note" />
          <div className="min-w-0">
            <h1 className="font-display font-extrabold text-ink text-lg leading-none">Unstuck</h1>
            <p className="text-xs text-slate-400 mt-1 truncate">{user.organization?.name || 'Daily Scrum Board'}</p>
          </div>
          <button className="ml-auto lg:hidden text-slate-400 hover:text-slate-600" onClick={onToggle}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project switcher */}
        {user.organization && (
          <div className="px-3 pt-4">
            <ProjectSwitcher />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {NAV_SECTIONS.filter(s => s.show(session)).map(section => (
            <div key={section.title} className="space-y-1.5">
              <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{section.title}</p>
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => { onNavigate(item.id); }}
                    className={`
                      w-full flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-semibold transition-all duration-150
                      ${isActive
                        ? 'bg-brand-600 text-white shadow-pop'
                        : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700'
                      }
                    `}
                  >
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-white/20' : 'bg-slate-100'}`}>
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    </span>
                    {item.label}
                    {isActive && <span className="ml-auto w-2 h-2 rounded-full bg-sun-400" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Signed-in member */}
        <div className="px-3 py-4 border-t border-ink/[0.06]">
          <div className="flex items-center gap-3 p-2 rounded-2xl bg-canvas">
            <Avatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">{user.name}</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {user.platformRole === 'admin' && <RoleBadge role="platform_admin" className="text-[10px] px-1.5" />}
                {user.orgRole === 'org_admin'
                  ? <RoleBadge role="org_admin" className="text-[10px] px-1.5" />
                  : projectRole && <RoleBadge role={projectRole} className="text-[10px] px-1.5" />}
              </div>
            </div>
            <button
              id="sign-out-btn"
              onClick={onSignOut}
              title="Sign out"
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-bubble-500 hover:bg-bubble-50 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function TopBar({ onMenuToggle, activePage }) {
  const { project } = useSession();
  const pageLabel = ALL_ITEMS.find(n => n.id === activePage)?.label || 'Unstuck';
  const projectScoped = !['org', 'platform'].includes(activePage);
  return (
    <header className="h-[68px] bg-white/90 backdrop-blur border-b border-ink/[0.06] border-t-4 border-t-sun-400 flex items-center px-4 md:px-6 gap-4 sticky top-0 z-10">
      <button
        id="menu-toggle-btn"
        onClick={onMenuToggle}
        className="lg:hidden text-slate-500 hover:text-slate-700 p-1"
      >
        <Menu className="w-5 h-5" />
      </button>
      <h2 className="font-display font-semibold text-ink text-sm">
        {projectScoped && project && <span className="text-slate-400 font-medium">{project.name} / </span>}
        {pageLabel}
      </h2>
    </header>
  );
}
