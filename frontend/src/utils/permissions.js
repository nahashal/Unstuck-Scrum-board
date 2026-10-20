// Mirrors backend/middleware/permissions.js so the UI only offers actions the server will allow.
// The server remains the source of truth — these only hide or disable controls.

export const PROJECT_ROLES = ['project_admin', 'scrum_master', 'developer'];
export const ORG_ROLES = ['org_admin', 'member'];

export const ROLE_LABELS = {
  platform_admin: 'Platform Admin',
  org_admin: 'Organization Admin',
  member: 'Member',
  project_admin: 'Project Admin',
  scrum_master: 'Scrum Master',
  developer: 'Developer',
};

export const ROLE_DESCRIPTIONS = {
  org_admin: 'Invite/remove users, create teams and projects, manage organization settings',
  member: 'Works on the projects they are added to',
  project_admin: 'Configure the project, manage membership and sprint settings',
  scrum_master: 'Run stand-ups, manage blockers, review updates and assign follow-up actions',
  developer: 'Create/update tasks, submit daily updates, report blockers and comment',
};

const RANK = { developer: 1, scrum_master: 2, project_admin: 3 };
const sameId = (a, b) => !!a && !!b && String(a._id || a) === String(b._id || b);

const isToday = (date) => {
  const d = new Date(date);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

// Builds the permission helpers for the signed-in user in the current project
export function permissionsFor(user, projectRole) {
  const rank = RANK[projectRole] || 0;
  const isManager = rank >= RANK.scrum_master;
  const isProjectAdmin = rank >= RANK.project_admin;
  const me = user?._id;
  return {
    isManager,
    isProjectAdmin,
    isOrgAdmin: user?.orgRole === 'org_admin',
    isPlatformAdmin: user?.platformRole === 'admin',
    canEditTask: (t) => isManager || sameId(t.assignee, me) || sameId(t.createdBy, me),
    canDeleteTask: (t) => isManager || (sameId(t.createdBy, me) && (!t.assignee || sameId(t.assignee, me))),
    canAssignOthers: isManager,
    canEditDaily: (authorId, createdAt) => isManager || (sameId(authorId, me) && isToday(createdAt)),
    canReview: isManager,
    canManageBlockers: isManager,
    canConfirmFindings: isManager,
    canAnalyzeUpdate: (u) => isManager || sameId(u.teamMember, me),
    canEditAction: (a) => isManager || sameId(a.assignedTo, me) || sameId(a.createdBy, me),
    canReviewEstimate: (taskAssignee, eveningAuthor) => isManager || sameId(taskAssignee, me) || (!taskAssignee && sameId(eveningAuthor, me)),
    canDeleteComment: (c) => isManager || sameId(c.author, me),
    canGenerateSummary: isManager,
    canManageProject: isProjectAdmin,
  };
}
