const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Organization = require('../models/Organization');
const TeamMember = require('../models/TeamMember');
const Project = require('../models/Project');
const PlatformSettings = require('../models/PlatformSettings');
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
      : { platformRole: 'admin' };
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

module.exports = router;
