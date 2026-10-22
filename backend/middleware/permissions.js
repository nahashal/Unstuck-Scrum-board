const mongoose = require('mongoose');
const Project = require('../models/Project');

// Higher rank = more power inside a project. Org Admins act as Project Admins everywhere in their org.
const RANK = { developer: 1, scrum_master: 2, project_admin: 3 };

const sameId = (a, b) => a && b && a.toString() === b.toString();

const forbid = (res, message = 'You do not have permission to do that.') =>
  res.status(403).json({ success: false, message });

function requirePlatformAdmin(req, res, next) {
  if (req.user.platformRole !== 'admin') return forbid(res, 'Only Platform Admins can do that.');
  next();
}

function requireOrgAdmin(req, res, next) {
  if (!req.user.organization || req.user.orgRole !== 'org_admin') return forbid(res, 'Only Organization Admins can do that.');
  next();
}

// The member's effective role in a project, or null if they have no access
function projectRoleFor(user, project) {
  if (!user.organization || !sameId(user.organization, project.organization)) return null;
  if (user.orgRole === 'org_admin') return 'project_admin';
  const entry = project.members.find(m => sameId(m.member._id || m.member, user._id));
  return entry ? entry.role : null;
}

// Resolves :projectId, enforces org + membership, sets req.project and req.projectRole
async function loadProject(req, res, next) {
  try {
    const { projectId } = req.params;
    if (!mongoose.isValidObjectId(projectId)) return res.status(400).json({ success: false, message: 'Invalid project ID.' });
    const project = await Project.findById(projectId);
    // Same 404 for "doesn't exist" and "not yours", so other orgs' projects can't be probed
    const role = project ? projectRoleFor(req.user, project) : null;
    if (!project || !role) return res.status(404).json({ success: false, message: 'Project not found.' });
    // Archived projects are read-only — except the project settings themselves, so it can be restored
    const isSettingsUpdate = req.method === 'PATCH' && (req.path === '/' || req.path === '');
    if (project.status === 'archived' && req.method !== 'GET' && !isSettingsUpdate) {
      return forbid(res, 'This project is archived and read-only. A Project Admin can restore it in Project Settings.');
    }
    req.project = project;
    req.projectRole = role;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

const hasRank = (req, minRole) => (RANK[req.projectRole] || 0) >= RANK[minRole];

function requireProjectRole(minRole) {
  return (req, res, next) => {
    if (!hasRank(req, minRole)) {
      const label = minRole === 'project_admin' ? 'Project Admins' : 'Scrum Masters and Project Admins';
      return forbid(res, `Only ${label} can do that.`);
    }
    next();
  };
}

// Scrum Master and above can manage everything inside the project
const isManager = (req) => hasRank(req, 'scrum_master');

const isSameDay = (date) => {
  const d = new Date(date);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

const canEditTask = (req, task) =>
  isManager(req) || sameId(task.assignee?._id || task.assignee, req.user._id) || sameId(task.createdBy, req.user._id);

// Developers may delete only tasks they created that aren't assigned to someone else
const canDeleteTask = (req, task) => {
  if (isManager(req)) return true;
  const assignee = task.assignee?._id || task.assignee;
  return sameId(task.createdBy, req.user._id) && (!assignee || sameId(assignee, req.user._id));
};

// Authors may edit their own update on the day they posted it; managers may edit any
const canEditOwnDaily = (req, authorId, createdAt) =>
  isManager(req) || (sameId(authorId, req.user._id) && isSameDay(createdAt));

const canEditAction = (req, action) =>
  isManager(req) || sameId(action.assignedTo?._id || action.assignedTo, req.user._id) || sameId(action.createdBy, req.user._id);

// A referenced member must belong to this project (or be an Org Admin of its org)
async function isProjectParticipant(project, memberId) {
  if (!mongoose.isValidObjectId(memberId)) return false;
  if (project.members.some(m => sameId(m.member, memberId))) return true;
  const TeamMember = mongoose.model('TeamMember');
  return !!(await TeamMember.exists({ _id: memberId, organization: project.organization, orgRole: 'org_admin', status: 'active' }));
}

module.exports = {
  RANK,
  sameId,
  forbid,
  requirePlatformAdmin,
  requireOrgAdmin,
  projectRoleFor,
  loadProject,
  requireProjectRole,
  isManager,
  canEditTask,
  canDeleteTask,
  canEditOwnDaily,
  canEditAction,
  isProjectParticipant,
};
