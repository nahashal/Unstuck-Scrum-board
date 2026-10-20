import { useState, useCallback, useEffect, useMemo } from 'react';
import { FolderKanban } from 'lucide-react';
import Sidebar, { TopBar } from './components/Sidebar';
import DashboardPage from './pages/DashboardPage';
import BoardPage from './pages/BoardPage';
import UpdatesPage from './pages/UpdatesPage';
import StandupPage from './pages/StandupPage';
import AIPage from './pages/AIPage';
import BlockersPage from './pages/BlockersPage';
import ActionsPage from './pages/ActionsPage';
import ProjectSettingsPage from './pages/ProjectSettingsPage';
import OrganizationPage from './pages/OrganizationPage';
import PlatformAdminPage from './pages/PlatformAdminPage';
import AuthPage from './pages/AuthPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import CreateOrgPage from './pages/CreateOrgPage';
import SplashScreen from './components/SplashScreen';
import LoadingSpinner from './components/LoadingSpinner';
import { EmptyState } from './components/RoleBits';
import { SessionContext } from './context/SessionContext';
import { authApi, setCurrentProject } from './api';
import { permissionsFor } from './utils/permissions';

const INITIAL_AI_STATE = {
  selectedUpdate: '',
  manualMode: false,
  manualForm: { teamMemberName: '', yesterday: '', today: '', blockers: '' },
  manualFindings: [],
};

// Pages that show data from the current project
const PROJECT_PAGES = ['dashboard', 'board', 'updates', 'standup', 'ai', 'blockers', 'actions', 'project'];

const readInviteToken = () => new URLSearchParams(window.location.search).get('invite');

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const hideSplash = useCallback(() => setShowSplash(false), []);
  // undefined = still checking the session, null = signed out
  const [user, setUser] = useState(undefined);
  const [projectId, setProjectId] = useState(null);
  const [inviteToken, setInviteToken] = useState(readInviteToken);
  // Kept here (not in AIPage) so the AI page's selection and unsaved manual analysis survive switching pages
  const [aiState, setAiState] = useState(INITIAL_AI_STATE);

  const resetWorkspace = useCallback(() => {
    setActivePage('dashboard');
    setAiState(INITIAL_AI_STATE);
  }, []);

  // Picks the project to open: the last one used if still accessible, otherwise the first
  const applySession = useCallback((session) => {
    setUser(session);
    if (!session) { setProjectId(null); return; }
    const ids = session.projects.map(p => p._id);
    setProjectId(prev => (prev && ids.includes(prev)) ? prev
      : (session.lastProject && ids.includes(session.lastProject)) ? session.lastProject
        : (session.projects.find(p => p.status === 'active')?._id || ids[0] || null));
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await authApi.me();
      applySession(res.data);
      return res.data;
    } catch {
      applySession(null);
      return null;
    }
  }, [applySession]);

  // Restore the session on load; any 401 from the API signs the user out
  useEffect(() => {
    refreshSession();
    const onSignedOut = () => { applySession(null); resetWorkspace(); };
    window.addEventListener('unstuck:signed-out', onSignedOut);
    return () => window.removeEventListener('unstuck:signed-out', onSignedOut);
  }, [refreshSession, applySession, resetWorkspace]);

  const clearInvite = useCallback(() => {
    setInviteToken(null);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const handleSignedIn = useCallback((session) => {
    resetWorkspace();
    applySession(session);
    clearInvite();
    // New org admins with no projects land on the organization page to set things up
    if (session.orgRole === 'org_admin' && session.projects.length === 0) setActivePage('org');
    else if (session.platformRole === 'admin' && session.projects.length === 0) setActivePage('platform');
  }, [resetWorkspace, applySession, clearInvite]);

  const handleSignOut = useCallback(async () => {
    try { await authApi.logout(); } catch { /* signing out locally regardless */ }
    applySession(null);
    resetWorkspace();
  }, [applySession, resetWorkspace]);

  const switchProject = useCallback((id) => {
    setProjectId(id);
    setAiState(INITIAL_AI_STATE);
    authApi.updateMe({ lastProject: id }).catch(() => { /* remembering the choice is best-effort */ });
  }, []);

  const navigate = useCallback((page) => {
    setActivePage(page);
    setSidebarOpen(false);
  }, []);

  const navigateToAI = useCallback((update) => {
    setAiState(s => ({ ...s, selectedUpdate: update._id, manualMode: false }));
    setActivePage('ai');
    setSidebarOpen(false);
  }, []);

  // Project-scoped API calls use this project
  setCurrentProject(projectId);

  const project = user?.projects?.find(p => p._id === projectId) || null;
  const projectRole = project?.role || null;
  const session = useMemo(() => ({
    user,
    project,
    projectRole,
    can: permissionsFor(user, projectRole),
    refreshSession,
    switchProject,
    navigate,
  }), [user, project, projectRole, refreshSession, switchProject, navigate]);

  const splash = showSplash && <SplashScreen onDone={hideSplash} />;

  if (inviteToken) {
    return (
      <div className="min-h-screen">
        {splash}
        <AcceptInvitePage token={inviteToken} signedInAs={user || null} onSignedIn={handleSignedIn} onSignOut={handleSignOut} onCancel={clearInvite} />
      </div>
    );
  }

  if (user === undefined) {
    return <div className="min-h-screen">{splash}<LoadingSpinner message="Loading..." /></div>;
  }

  if (user === null) {
    return <div className="min-h-screen">{splash}<AuthPage onSignedIn={handleSignedIn} /></div>;
  }

  const renderPage = () => {
    if (activePage === 'org' && session.can.isOrgAdmin) return <OrganizationPage />;
    if (activePage === 'platform' && session.can.isPlatformAdmin) return <PlatformAdminPage />;
    if (!user.organization) {
      return <CreateOrgPage user={user} onCreated={(s) => { applySession(s); setActivePage('org'); }} />;
    }
    if (PROJECT_PAGES.includes(activePage) && !project) {
      return (
        <EmptyState icon={FolderKanban} title="You're not on a project yet">
          {session.can.isOrgAdmin
            ? <>Create a team and a project from the <button className="font-semibold text-brand-700 hover:underline" onClick={() => navigate('org')}>Organization</button> page.</>
            : 'Ask your Organization Admin or a Project Admin to add you to a project.'}
        </EmptyState>
      );
    }
    switch (activePage) {
      case 'dashboard': return <DashboardPage />;
      case 'board': return <BoardPage />;
      case 'updates': return <UpdatesPage onNavigateToAI={navigateToAI} />;
      case 'standup': return <StandupPage />;
      case 'ai': return <AIPage aiState={aiState} setAiState={setAiState} />;
      case 'blockers': return <BlockersPage />;
      case 'actions': return <ActionsPage />;
      case 'project': return session.can.isProjectAdmin ? <ProjectSettingsPage /> : <DashboardPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <SessionContext.Provider value={session}>
      <div className="min-h-screen">
        {splash}
        <Sidebar
          activePage={activePage}
          onNavigate={navigate}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(o => !o)}
          onSignOut={handleSignOut}
        />

        {/* Main content area */}
        <div className="lg:pl-64 min-h-screen flex flex-col">
          <TopBar onMenuToggle={() => setSidebarOpen(o => !o)} activePage={activePage} />
          <main className="flex-1 p-4 md:p-6 max-w-7xl w-full">
            {/* Remount pages when the project changes so they reload its data */}
            <div key={PROJECT_PAGES.includes(activePage) ? `${projectId}-${activePage}` : activePage}>{renderPage()}</div>
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
