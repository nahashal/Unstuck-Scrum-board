import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 30000,
  withCredentials: true, // send the httpOnly session cookie
  headers: { 'Content-Type': 'application/json' },
});

// LLM calls can take far longer than ordinary CRUD requests
const AI_TIMEOUT = 120000;

// ─── Response interceptor for consistent error handling ───────────────────────
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.code === 'ECONNABORTED') {
      return Promise.reject(new Error('The request took too long and was cancelled. Please try again.'));
    }
    if (!err.response) {
      return Promise.reject(new Error('Cannot reach the Unstuck server at http://localhost:5000. Make sure the backend and MongoDB are running.'));
    }
    // Session missing or expired: tell the app to show the sign-in screen
    if (err.response.status === 401 && !err.config?.url?.startsWith('/auth/')) {
      window.dispatchEvent(new Event('unstuck:signed-out'));
    }
    const message = err.response.data?.message || err.message || 'An unexpected error occurred.';
    return Promise.reject(new Error(message));
  }
);

// ─── Current project ─────────────────────────────────────────────────────────
// Project-scoped calls go to /projects/:id/...; the app sets this when the user switches project.
let currentProjectId = null;
export const setCurrentProject = (id) => { currentProjectId = id; };
const p = (path = '') => {
  if (!currentProjectId) throw new Error('Choose a project first.');
  return `/projects/${currentProjectId}${path}`;
};

// ─── Auth ──────────────────────────────────────────────────────────────────
export const authApi = {
  me: () => api.get('/auth/me'),
  updateMe: (data) => api.patch('/auth/me', data),
  createOrganization: (organizationName) => api.post('/auth/organization', { organizationName }),
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  previewInvite: (token) => api.get(`/auth/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token, data) => api.post(`/auth/invites/${encodeURIComponent(token)}/accept`, data),
};

// ─── Tasks ─────────────────────────────────────────────────────────────────
export const tasksApi = {
  getAll: (params) => api.get(p('/tasks'), { params }),
  create: (data) => api.post(p('/tasks'), data),
  update: (id, data) => api.patch(p(`/tasks/${id}`), data),
  delete: (id) => api.delete(p(`/tasks/${id}`)),
};

// ─── Morning updates ───────────────────────────────────────────────────────
export const updatesApi = {
  getAll: (params) => api.get(p('/updates'), { params }),
  create: (data) => api.post(p('/updates'), data),
  update: (id, data) => api.patch(p(`/updates/${id}`), data),
  delete: (id) => api.delete(p(`/updates/${id}`)),
  review: (id, reviewed = true) => api.post(p(`/updates/${id}/review`), { reviewed }),
  reviewFinding: (updateId, findingId, status) => api.patch(p(`/updates/${updateId}/findings/${findingId}`), { status }),
};

// ─── Evening check-ins ─────────────────────────────────────────────────────
export const eveningApi = {
  getAll: (params) => api.get(p('/evening'), { params }),
  create: (data) => api.post(p('/evening'), data),
  update: (id, data) => api.patch(p(`/evening/${id}`), data),
  delete: (id) => api.delete(p(`/evening/${id}`)),
  review: (id, reviewed = true) => api.post(p(`/evening/${id}/review`), { reviewed }),
  reviewEstimate: (id, estimateId, data) => api.patch(p(`/evening/${id}/estimates/${estimateId}`), data),
};

// ─── AI ───────────────────────────────────────────────────────────────────
export const aiApi = {
  analyze: (data) => api.post(p('/ai/analyze'), data, { timeout: AI_TIMEOUT }),
  progress: (eveningId) => api.post(p('/ai/progress'), { eveningId }, { timeout: AI_TIMEOUT }),
  standupSummary: (day) => api.post(p('/ai/standup-summary'), { day }, { timeout: AI_TIMEOUT }),
};

// ─── Blockers ─────────────────────────────────────────────────────────────
export const blockersApi = {
  getAll: () => api.get(p('/blockers')),
  create: (data) => api.post(p('/blockers'), data),
  update: (id, data) => api.patch(p(`/blockers/${id}`), data),
};

// ─── Actions ──────────────────────────────────────────────────────────────
export const actionsApi = {
  getAll: () => api.get(p('/actions')),
  create: (data) => api.post(p('/actions'), data),
  update: (id, data) => api.patch(p(`/actions/${id}`), data),
};

// ─── People who can be assigned work in the current project ───────────────
export const teamApi = {
  getAll: () => api.get(p('/people')),
};

// ─── Dashboard / stand-up / sprints / comments ─────────────────────────────
export const dashboardApi = {
  get: () => api.get(p('/dashboard')),
};

export const standupApi = {
  get: (day) => api.get(p('/standup'), { params: { day } }),
};

export const sprintsApi = {
  getAll: () => api.get(p('/sprints')),
  create: (data) => api.post(p('/sprints'), data),
  update: (id, data) => api.patch(p(`/sprints/${id}`), data),
  delete: (id) => api.delete(p(`/sprints/${id}`)),
};

export const commentsApi = {
  getAll: (targetType, targetId) => api.get(p('/comments'), { params: { targetType, targetId } }),
  create: (targetType, targetId, body) => api.post(p('/comments'), { targetType, targetId, body }),
  delete: (id) => api.delete(p(`/comments/${id}`)),
};

// ─── Project settings (Project Admin) ─────────────────────────────────────
export const projectApi = {
  get: () => api.get(p()),
  update: (data) => api.patch(p(), data),
  addMember: (member, role) => api.post(p('/members'), { member, role }),
  setMemberRole: (memberId, role) => api.patch(p(`/members/${memberId}`), { role }),
  removeMember: (memberId) => api.delete(p(`/members/${memberId}`)),
};

// ─── Organization (Org Admin; members/teams readable by all) ──────────────
export const orgApi = {
  get: () => api.get('/org'),
  update: (data) => api.patch('/org', data),
  members: () => api.get('/org/members'),
  updateMember: (id, data) => api.patch(`/org/members/${id}`, data),
  removeMember: (id) => api.delete(`/org/members/${id}`),
  invites: () => api.get('/org/invites'),
  createInvite: (data) => api.post('/org/invites', data),
  revokeInvite: (id) => api.delete(`/org/invites/${id}`),
  teams: () => api.get('/org/teams'),
  createTeam: (data) => api.post('/org/teams', data),
  updateTeam: (id, data) => api.patch(`/org/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/org/teams/${id}`),
  projects: () => api.get('/org/projects'),
  createProject: (data) => api.post('/org/projects', data),
};

// ─── Platform (Platform Admin) ────────────────────────────────────────────
export const platformApi = {
  stats: () => api.get('/platform/stats'),
  organizations: () => api.get('/platform/organizations'),
  setOrgStatus: (id, status) => api.patch(`/platform/organizations/${id}`, { status }),
  settings: () => api.get('/platform/settings'),
  updateSettings: (data) => api.patch('/platform/settings', data),
  users: (q) => api.get('/platform/users', { params: { q } }),
  updateUser: (id, data) => api.patch(`/platform/users/${id}`, data),
};
