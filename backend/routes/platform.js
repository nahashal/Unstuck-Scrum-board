const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Organization = require('../models/Organization');
const TeamMember = require('../models/TeamMember');
const Project = require('../models/Project');
const PlatformSettings = require('../models/PlatformSettings');
const Team = require('../models/Team');
const Invite = require('../models/Invite');
const Task = require('../models/Task');
const DailyUpdate = require('../models/DailyUpdate');
const EveningUpdate = require('../models/EveningUpdate');
const Blocker = require('../models/Blocker');
const ActionItem = require('../models/ActionItem');
const Sprint = require('../models/Sprint');
const Comment = require('../models/Comment');
const StandupSummary = require('../models/StandupSummary');
const { hashToken, newToken, inviteExpiry, inviteLink, deliverInvite } = require('../lib/invites');
const { requirePlatformAdmin, sameId } = require('../middleware/permissions');

// Platform Admins manage organizations and access — never the contents of projects
router.use(requirePlatformAdmin);

// GET /api/platform/stats
router.get('/stats', async (req, res) => {
  try {
    const [organizations, activeOrganizations, users, activeUsers, projects] = await Promise.all([
      Organization.countDocuments(),
      Organization.countDocuments({ status: 'active' }),
      TeamMember.countDocuments(),
      TeamMember.countDocuments({ status: 'active' }),
      Project.countDocuments(),
    ]);
    res.json({ success: true, data: { organizations, activeOrganizations, users, activeUsers, projects } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/platform/organizations — with member and project counts
router.get('/organizations', async (req, res) => {
  try {
    const orgs = await Organization.find().populate('createdBy', 'name email').sort({ createdAt: -1 }).lean();
    const [memberCounts, projectCounts] = await Promise.all([
      TeamMember.aggregate([{ $match: { status: 'active', organization: { $ne: null } } }, { $group: { _id: '$organization', n: { $sum: 1 } } }]),
      Project.aggregate([{ $group: { _id: '$organization', n: { $sum: 1 } } }]),
    ]);
    const m = new Map(memberCounts.map(c => [c._id.toString(), c.n]));
    const p = new Map(projectCounts.map(c => [c._id.toString(), c.n]));
    res.json({ success: true, data: orgs.map(o => ({ ...o, memberCount: m.get(o._id.toString()) || 0, projectCount: p.get(o._id.toString()) || 0 })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/platform/organizations — create an organization and set up its first Organization Admin.
// An existing account without an organization becomes its admin at once; anyone else gets an admin invite.
router.post('/organizations', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const adminEmail = String(req.body.adminEmail || '').trim().toLowerCase();
    if (!name) return res.status(400).json({ success: false, message: 'Organization name is required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      return res.status(400).json({ success: false, message: "Enter the email of the organization's first admin." });
    }

    const existing = await TeamMember.findOne({ email: adminEmail });
    if (existing?.organization) {
      return res.status(409).json({ success: false, message: `${existing.name} already belongs to another organization. Each account belongs to one organization.` });
    }

    const org = await Organization.create({ name, createdBy: existing ? existing._id : req.user._id });

    if (existing) {
      existing.organization = org._id;
      existing.orgRole = 'org_admin';
      existing.lastProject = null;
      await existing.save();
      return res.status(201).json({ success: true, data: { organization: org, admin: { name: existing.name, email: existing.email }, mode: 'assigned' } });
    }

    const token = newToken();
    const invite = await Invite.create({
      organization: org._id, email: adminEmail, orgRole: 'org_admin',
      tokenHash: hashToken(token), expiresAt: inviteExpiry(), invitedBy: req.user._id,
    });
    const link = inviteLink(req, token);
    const delivery = await deliverInvite({ invite, link, orgName: org.name, inviterName: req.user.name });
    res.status(201).json({ success: true, data: { organization: org, mode: 'invited', email: adminEmail, link, expiresAt: invite.expiresAt, delivery } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/platform/organizations/:id — suspend or reactivate
router.patch('/organizations/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) return res.status(400).json({ success: false, message: 'Status must be active or suspended.' });
    const org = mongoose.isValidObjectId(req.params.id) ? await Organization.findById(req.params.id) : null;
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found.' });
    org.status = status;
    await org.save();
    res.json({ success: true, data: org });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/platform/organizations/:id — permanently deletes the organization and everything in it.
// Body must repeat the organization's name. Member accounts are kept but detached, so they can start or join another org.
router.delete('/organizations/:id', async (req, res) => {
  try {
    const org = mongoose.isValidObjectId(req.params.id) ? await Organization.findById(req.params.id) : null;
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found.' });
    if (String(req.body?.confirmName || '').trim() !== org.name) {
      return res.status(400).json({ success: false, message: 'Type the organization name exactly to confirm deletion.' });
    }
    const projectIds = (await Project.find({ organization: org._id }).select('_id')).map(p => p._id);
    const byProject = { project: { $in: projectIds } };
    await Promise.all([
      Task.deleteMany(byProject), DailyUpdate.deleteMany(byProject), EveningUpdate.deleteMany(byProject),
      Blocker.deleteMany(byProject), ActionItem.deleteMany(byProject), Sprint.deleteMany(byProject),
      Comment.deleteMany(byProject), StandupSummary.deleteMany(byProject),
    ]);
    await Promise.all([
      Project.deleteMany({ organization: org._id }),
      Team.deleteMany({ organization: org._id }),
      Invite.deleteMany({ organization: org._id }),
      TeamMember.updateMany({ organization: org._id }, { organization: null, orgRole: 'member', lastProject: null }),
    ]);
    await org.deleteOne();
    res.json({ success: true, data: { deletedProjects: projectIds.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET/PATCH /api/platform/settings
router.get('/settings', async (req, res) => {
  try {
    res.json({ success: true, data: await PlatformSettings.get() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    const settings = await PlatformSettings.get();
    for (const key of ['allowOrgSignup', 'aiEnabled']) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] !== 'boolean') return res.status(400).json({ success: false, message: `${key} must be true or false.` });
        settings[key] = req.body[key];
      }
    }
    await settings.save();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/platform/users?q= — search accounts across the platform (for access management)
router.get('/users', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const filter = q
      ? { $or: [{ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { email: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] }
      : {};
    const users = await TeamMember.find(filter).select('name email status platformRole orgRole organization')
      .populate('organization', 'name').sort({ name: 1 }).limit(50).lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/platform/users/:id — grant/revoke Platform Admin, (de)activate an account
router.patch('/users/:id', async (req, res) => {
  try {
    const user = mongoose.isValidObjectId(req.params.id) ? await TeamMember.findById(req.params.id) : null;
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const { platformRole, status } = req.body;
    if (platformRole !== undefined) {
      if (!['admin', null].includes(platformRole)) return res.status(400).json({ success: false, message: 'Invalid platform role.' });
      if (platformRole === null) {
        if (sameId(user._id, req.user._id)) return res.status(400).json({ success: false, message: 'You cannot remove your own Platform Admin access.' });
        const envAdmins = (process.env.PLATFORM_ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim());
        if (envAdmins.includes(user.email)) {
          return res.status(400).json({ success: false, message: 'This person is a Platform Admin through PLATFORM_ADMIN_EMAILS in the server settings.' });
        }
      }
      user.platformRole = platformRole;
    }
    if (status !== undefined) {
      if (!['active', 'deactivated'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
      if (sameId(user._id, req.user._id) && status === 'deactivated') {
        return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
      }
      user.status = status;
    }
    await user.save();
    res.json({ success: true, data: await TeamMember.findById(user._id).select('name email status platformRole orgRole organization').populate('organization', 'name') });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/platform/users/:id — permanently deletes an account. Their past updates stay (shown as a
// former member); open tasks and action items become unassigned; they lose access immediately.
router.delete('/users/:id', async (req, res) => {
  try {
    const user = mongoose.isValidObjectId(req.params.id) ? await TeamMember.findById(req.params.id) : null;
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (sameId(user._id, req.user._id)) return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    const envAdmins = (process.env.PLATFORM_ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim());
    if (envAdmins.includes(user.email)) {
      return res.status(400).json({ success: false, message: 'This person is a Platform Admin through PLATFORM_ADMIN_EMAILS. Remove them there first.' });
    }
    // Don't leave an organization with members but no admin
    if (user.organization && user.orgRole === 'org_admin') {
      const [otherAdmins, otherMembers] = await Promise.all([
        TeamMember.countDocuments({ organization: user.organization, orgRole: 'org_admin', status: 'active', _id: { $ne: user._id } }),
        TeamMember.countDocuments({ organization: user.organization, status: 'active', _id: { $ne: user._id } }),
      ]);
      if (otherAdmins === 0 && otherMembers > 0) {
        return res.status(400).json({ success: false, message: `${user.name} is the only Organization Admin. Make someone else an admin first, or delete the whole organization.` });
      }
    }
    const projectIds = (await Project.find({ 'members.member': user._id }).select('_id')).map(p => p._id);
    await Promise.all([
      Team.updateMany({ members: user._id }, { $pull: { members: user._id } }),
      Project.updateMany({ 'members.member': user._id }, { $pull: { members: { member: user._id } } }),
      Task.updateMany({ assignee: user._id, status: { $ne: 'Done' } }, { assignee: null }),
      ActionItem.updateMany({ assignedTo: user._id, status: { $ne: 'Resolved' } }, { assignedTo: null }),
      Invite.updateMany({ email: user.email, acceptedAt: null, revokedAt: null }, { revokedAt: new Date() }),
    ]);
    await user.deleteOne();
    res.json({ success: true, data: { removedFromProjects: projectIds.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
