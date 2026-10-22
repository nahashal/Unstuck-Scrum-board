const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const Organization = require('../models/Organization');
const TeamMember = require('../models/TeamMember');
const Team = require('../models/Team');
const Project = require('../models/Project');
const Invite = require('../models/Invite');
const Task = require('../models/Task');
const ActionItem = require('../models/ActionItem');
const DailyUpdate = require('../models/DailyUpdate');
const EveningUpdate = require('../models/EveningUpdate');
const Blocker = require('../models/Blocker');
const Sprint = require('../models/Sprint');
const Comment = require('../models/Comment');
const StandupSummary = require('../models/StandupSummary');
const { PROJECT_ROLES } = require('../models/Project');
const { requireOrgAdmin, sameId, forbid } = require('../middleware/permissions');
const { hashToken } = require('./auth');
const { isEmailConfigured, sendEmail, inviteEmail } = require('../lib/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 7;
// Invite links point at the site the admin is using (the browser's Origin), so a deployed site never
// hands out localhost links. FRONTEND_URL is only the fallback when the request has no Origin.
const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url || '');
const appUrl = (req) => {
  // 1. An explicitly configured public address (ignored if it's a leftover localhost value)
  const configuredUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (configuredUrl && !isLocal(configuredUrl)) return configuredUrl;
  // 2. On Vercel: the project's production domain, not the per-deployment URL the admin may be on
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  // 3. Otherwise the site the admin is using
  const origin = (req.get('origin') || '').replace(/\/$/, '');
  if (/^https?:\/\/[^/\s]+$/i.test(origin)) return origin;
  const configured = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const host = req.get('x-forwarded-host') || req.get('host');
  const fromHost = host && !host.startsWith('localhost:5000') ? `${req.protocol}://${host}` : '';
  // Never prefer a localhost FRONTEND_URL over a real deployed host
  if (configured && !(isLocal(configured) && fromHost && !isLocal(fromHost))) return configured;
  return fromHost || 'http://localhost:5173';
};

// Every route here needs an organization
router.use((req, res, next) => {
  if (!req.user.organization) return forbid(res, 'You are not part of an organization.');
  next();
});

const orgId = (req) => req.user.organization;
const isOrgAdmin = (req) => req.user.orgRole === 'org_admin';

// ─── Organization ────────────────────────────────────────────────────────────

// GET /api/org
router.get('/', async (req, res) => {
  res.json({ success: true, data: req.org });
});

// PATCH /api/org — name and defaults (Org Admin)
router.patch('/', requireOrgAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Organization name is required.' });
      req.org.name = name.trim();
    }
    if (req.body.defaultSprintDays !== undefined) {
      const days = Number(req.body.defaultSprintDays);
      if (!Number.isInteger(days) || days < 1 || days > 60) return res.status(400).json({ success: false, message: 'Sprint length must be 1–60 days.' });
      req.org.settings.defaultSprintDays = days;
    }
    await req.org.save();
    res.json({ success: true, data: req.org });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Members ─────────────────────────────────────────────────────────────────

// GET /api/org/members — everyone in the org (used for adding people to projects and teams)
router.get('/members', async (req, res) => {
  try {
    const fields = isOrgAdmin(req) ? 'name role email orgRole status createdAt' : 'name role orgRole status';
    const filter = { organization: orgId(req) };
    if (!isOrgAdmin(req)) filter.status = 'active';
    const members = await TeamMember.find(filter).select(fields).sort({ name: 1 }).lean();
    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function activeAdminCount(org) {
  return TeamMember.countDocuments({ organization: org, orgRole: 'org_admin', status: 'active' });
}

// PATCH /api/org/members/:id — change org role or (de)activate (Org Admin)
router.patch('/members/:id', requireOrgAdmin, async (req, res) => {
  try {
    const member = mongoose.isValidObjectId(req.params.id) ? await TeamMember.findOne({ _id: req.params.id, organization: orgId(req) }) : null;
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });
    const { orgRole, status } = req.body;

    if (orgRole !== undefined) {
      if (!['org_admin', 'member'].includes(orgRole)) return res.status(400).json({ success: false, message: 'Invalid organization role.' });
      if (member.orgRole === 'org_admin' && orgRole === 'member' && await activeAdminCount(orgId(req)) <= 1) {
        return res.status(400).json({ success: false, message: 'The organization needs at least one Organization Admin.' });
      }
      member.orgRole = orgRole;
    }
    if (status !== undefined) {
      if (!['active', 'deactivated'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
      if (status === 'deactivated') {
        if (sameId(member._id, req.user._id)) return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
        if (member.orgRole === 'org_admin' && await activeAdminCount(orgId(req)) <= 1) {
          return res.status(400).json({ success: false, message: 'The organization needs at least one Organization Admin.' });
        }
      }
      member.status = status;
    }
    await member.save();
    res.json({ success: true, data: await TeamMember.findById(member._id).select('name role email orgRole status createdAt') });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/org/members/:id — remove someone from the organization (Org Admin).
// Their account is deactivated and detached; their past updates stay for history.
router.delete('/members/:id', requireOrgAdmin, async (req, res) => {
  try {
    const member = mongoose.isValidObjectId(req.params.id) ? await TeamMember.findOne({ _id: req.params.id, organization: orgId(req) }) : null;
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });
    if (sameId(member._id, req.user._id)) return res.status(400).json({ success: false, message: 'You cannot remove yourself.' });
    if (member.orgRole === 'org_admin' && await activeAdminCount(orgId(req)) <= 1) {
      return res.status(400).json({ success: false, message: 'The organization needs at least one Organization Admin.' });
    }
    const projects = await Project.find({ organization: orgId(req) }).select('_id');
    const projectIds = projects.map(p => p._id);
    await Promise.all([
      Team.updateMany({ organization: orgId(req) }, { $pull: { members: member._id } }),
      Project.updateMany({ organization: orgId(req) }, { $pull: { members: { member: member._id } } }),
      Task.updateMany({ project: { $in: projectIds }, assignee: member._id, status: { $ne: 'Done' } }, { assignee: null }),
      ActionItem.updateMany({ project: { $in: projectIds }, assignedTo: member._id, status: { $ne: 'Resolved' } }, { assignedTo: null }),
    ]);
    member.status = 'deactivated';
    member.organization = null;
    member.orgRole = 'member';
    member.lastProject = null;
    await member.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Invites ─────────────────────────────────────────────────────────────────

// GET /api/org/invites — pending invites (Org Admin)
router.get('/invites', requireOrgAdmin, async (req, res) => {
  try {
    const invites = await Invite.find({ organization: orgId(req), acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } })
      .populate('invitedBy', 'name').populate('teams', 'name').populate('projectRoles.project', 'name key')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: invites });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/org/invites — returns a one-time link (Org Admin). Emails are not sent; the admin shares the link.
router.post('/invites', requireOrgAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const orgRole = req.body.orgRole || 'member';
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    if (!['org_admin', 'member'].includes(orgRole)) return res.status(400).json({ success: false, message: 'Invalid organization role.' });
    if (await TeamMember.exists({ email })) {
      return res.status(409).json({ success: false, message: 'Someone with this email already has an Unstuck account.' });
    }

    const teamIds = Array.isArray(req.body.teams) ? req.body.teams.filter(id => mongoose.isValidObjectId(id)) : [];
    if (teamIds.length && await Team.countDocuments({ _id: { $in: teamIds }, organization: orgId(req) }) !== teamIds.length) {
      return res.status(400).json({ success: false, message: 'One or more teams were not found.' });
    }
    const projectRoles = Array.isArray(req.body.projectRoles) ? req.body.projectRoles : [];
    for (const pr of projectRoles) {
      if (!pr || !mongoose.isValidObjectId(pr.project) || !PROJECT_ROLES.includes(pr.role)) {
        return res.status(400).json({ success: false, message: 'Each project needs a valid role.' });
      }
      if (!(await Project.exists({ _id: pr.project, organization: orgId(req) }))) {
        return res.status(400).json({ success: false, message: 'One or more projects were not found.' });
      }
    }

    // Replace any earlier pending invite for the same email
    await Invite.updateMany({ organization: orgId(req), email, acceptedAt: null, revokedAt: null }, { revokedAt: new Date() });

    const token = crypto.randomBytes(32).toString('base64url');
    const invite = await Invite.create({
      organization: orgId(req), email, orgRole, teams: teamIds,
      projectRoles: projectRoles.map(pr => ({ project: pr.project, role: pr.role })),
      tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000), invitedBy: req.user._id,
    });
    const link = `${appUrl(req)}/?invite=${token}`;
    const delivery = await deliverInvite(req, invite, link);
    res.status(201).json({ success: true, data: { _id: invite._id, email, expiresAt: invite.expiresAt, link, delivery } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Emails the invite link through Brevo when configured; records the outcome on the invite.
// Returns { configured, sent, error } — the link is always returned too, so a failed email never blocks inviting.
async function deliverInvite(req, invite, link) {
  if (!isEmailConfigured()) return { configured: false, sent: false, error: null };
  await invite.populate('projectRoles.project', 'name');
  try {
    const { subject, html, text } = inviteEmail({
      orgName: req.org.name,
      inviterName: req.user.name,
      link,
      orgRole: invite.orgRole,
      projectRoles: invite.projectRoles.filter(pr => pr.project).map(pr => ({ projectName: pr.project.name, role: pr.role })),
      expiresAt: invite.expiresAt,
    });
    await sendEmail({ to: invite.email, subject, html, text });
    invite.emailSentAt = new Date();
    invite.emailError = null;
    await invite.save();
    return { configured: true, sent: true, error: null };
  } catch (err) {
    console.warn(`[Email] Invite to ${invite.email} failed: ${err.message}`);
    invite.emailError = err.message.slice(0, 300);
    await invite.save();
    return { configured: true, sent: false, error: err.message };
  }
}

// POST /api/org/invites/:id/resend — issues a fresh link (the old one stops working) and emails it (Org Admin)
router.post('/invites/:id/resend', requireOrgAdmin, async (req, res) => {
  try {
    const invite = mongoose.isValidObjectId(req.params.id)
      ? await Invite.findOne({ _id: req.params.id, organization: orgId(req), acceptedAt: null, revokedAt: null })
      : null;
    if (!invite) return res.status(404).json({ success: false, message: 'Invite not found.' });
    // Only a hash of the code is stored, so resending means issuing a new code
    const token = crypto.randomBytes(32).toString('base64url');
    invite.tokenHash = hashToken(token);
    invite.expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000);
    await invite.save();
    const link = `${appUrl(req)}/?invite=${token}`;
    const delivery = await deliverInvite(req, invite, link);
    res.json({ success: true, data: { _id: invite._id, email: invite.email, expiresAt: invite.expiresAt, link, delivery } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/org/email-status — whether invites are emailed automatically (Org Admin)
router.get('/email-status', requireOrgAdmin, (req, res) => {
  res.json({ success: true, data: { configured: isEmailConfigured() } });
});

// DELETE /api/org/invites/:id — revoke (Org Admin)
router.delete('/invites/:id', requireOrgAdmin, async (req, res) => {
  try {
    const invite = mongoose.isValidObjectId(req.params.id)
      ? await Invite.findOneAndUpdate({ _id: req.params.id, organization: orgId(req), acceptedAt: null }, { revokedAt: new Date() })
      : null;
    if (!invite) return res.status(404).json({ success: false, message: 'Invite not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Teams ───────────────────────────────────────────────────────────────────

const populateTeam = (q) => q.populate('members', 'name role status');

// GET /api/org/teams
router.get('/teams', async (req, res) => {
  try {
    const teams = await populateTeam(Team.find({ organization: orgId(req) })).sort({ name: 1 }).lean();
    const counts = await Project.aggregate([{ $match: { organization: new mongoose.Types.ObjectId(orgId(req)) } }, { $group: { _id: '$team', n: { $sum: 1 } } }]);
    const countBy = new Map(counts.map(c => [c._id?.toString(), c.n]));
    res.json({ success: true, data: teams.map(t => ({ ...t, projectCount: countBy.get(t._id.toString()) || 0 })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function validMembers(req, ids) {
  if (!Array.isArray(ids)) return [];
  const clean = [...new Set(ids.filter(id => mongoose.isValidObjectId(id)).map(String))];
  const found = await TeamMember.countDocuments({ _id: { $in: clean }, organization: orgId(req) });
  return found === clean.length ? clean : null;
}

// POST /api/org/teams (Org Admin)
router.post('/teams', requireOrgAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Team name is required.' });
    const members = await validMembers(req, req.body.members || []);
    if (!members) return res.status(400).json({ success: false, message: 'One or more members were not found in your organization.' });
    const team = await Team.create({ organization: orgId(req), name, members });
    res.status(201).json({ success: true, data: await populateTeam(Team.findById(team._id)) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'A team with that name already exists.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/org/teams/:id — rename / set members (Org Admin)
router.patch('/teams/:id', requireOrgAdmin, async (req, res) => {
  try {
    const team = mongoose.isValidObjectId(req.params.id) ? await Team.findOne({ _id: req.params.id, organization: orgId(req) }) : null;
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ success: false, message: 'Team name is required.' });
      team.name = String(req.body.name).trim();
    }
    if (req.body.members !== undefined) {
      const members = await validMembers(req, req.body.members);
      if (!members) return res.status(400).json({ success: false, message: 'One or more members were not found in your organization.' });
      team.members = members;
    }
    await team.save();
    res.json({ success: true, data: await populateTeam(Team.findById(team._id)) });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'A team with that name already exists.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/org/teams/:id — only when it owns no projects (Org Admin)
router.delete('/teams/:id', requireOrgAdmin, async (req, res) => {
  try {
    const team = mongoose.isValidObjectId(req.params.id) ? await Team.findOne({ _id: req.params.id, organization: orgId(req) }) : null;
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });
    if (await Project.exists({ team: team._id })) {
      return res.status(400).json({ success: false, message: 'Move or archive this team’s projects before deleting it.' });
    }
    await team.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Projects ────────────────────────────────────────────────────────────────

// GET /api/org/projects — all projects in the org (Org Admin)
router.get('/projects', requireOrgAdmin, async (req, res) => {
  try {
    const projects = await Project.find({ organization: orgId(req) })
      .populate('team', 'name').populate('members.member', 'name').sort({ name: 1 }).lean();
    res.json({ success: true, data: projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/org/projects — create a project for a team and choose its Project Admin (Org Admin)
router.post('/projects', requireOrgAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const key = String(req.body.key || '').trim().toUpperCase();
    const { team: teamId, projectAdmin, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Project name is required.' });
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) {
      return res.status(400).json({ success: false, message: 'Project key must be 2–10 letters/numbers and start with a letter (e.g. WEB).' });
    }
    const team = mongoose.isValidObjectId(teamId) ? await Team.findOne({ _id: teamId, organization: orgId(req) }) : null;
    if (!team) return res.status(400).json({ success: false, message: 'Choose a team for this project.' });

    const members = [];
    if (projectAdmin) {
      const admin = mongoose.isValidObjectId(projectAdmin)
        ? await TeamMember.findOne({ _id: projectAdmin, organization: orgId(req), status: 'active' })
        : null;
      if (!admin) return res.status(400).json({ success: false, message: 'The chosen Project Admin is not an active member.' });
      members.push({ member: admin._id, role: 'project_admin' });
    }
    const project = await Project.create({
      organization: orgId(req), team: team._id, name, key, description: description || '', members,
      sprintSettings: { lengthDays: req.org.settings?.defaultSprintDays || 14 },
    });
    res.status(201).json({ success: true, data: await Project.findById(project._id).populate('team', 'name').populate('members.member', 'name') });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'Another project already uses that key.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/org/projects/:id — permanently deletes a project and everything in it (Org Admin).
// Body must repeat the project's key to confirm.
router.delete('/projects/:id', requireOrgAdmin, async (req, res) => {
  try {
    const project = mongoose.isValidObjectId(req.params.id) ? await Project.findOne({ _id: req.params.id, organization: orgId(req) }) : null;
    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
    if (String(req.body?.confirmKey || '').trim().toUpperCase() !== project.key) {
      return res.status(400).json({ success: false, message: `Type the project key (${project.key}) to confirm deletion.` });
    }
    const byProject = { project: project._id };
    await Promise.all([
      Task.deleteMany(byProject), DailyUpdate.deleteMany(byProject), EveningUpdate.deleteMany(byProject),
      Blocker.deleteMany(byProject), ActionItem.deleteMany(byProject), Sprint.deleteMany(byProject),
      Comment.deleteMany(byProject), StandupSummary.deleteMany(byProject),
      // Pending invites keep working, just without this project
      Invite.updateMany({ organization: orgId(req), 'projectRoles.project': project._id }, { $pull: { projectRoles: { project: project._id } } }),
      TeamMember.updateMany({ lastProject: project._id }, { lastProject: null }),
    ]);
    await project.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
