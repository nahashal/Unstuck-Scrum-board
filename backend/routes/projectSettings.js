const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const TeamMember = require('../models/TeamMember');
const Task = require('../models/Task');
const ActionItem = require('../models/ActionItem');
const { PROJECT_ROLES } = require('../models/Project');
const { requireProjectRole, sameId } = require('../middleware/permissions');

async function projectDetails(project) {
  await project.populate([
    { path: 'team', select: 'name' },
    { path: 'members.member', select: 'name role email status orgRole' },
  ]);
  return project;
}

// GET /api/projects/:projectId — details, members and your role
router.get('/', async (req, res) => {
  try {
    const project = await projectDetails(req.project);
    res.json({ success: true, data: { ...project.toObject(), myRole: req.projectRole } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/projects/:projectId/people — who can be assigned work: project members plus org admins
router.get('/people', async (req, res) => {
  try {
    const roleById = new Map(req.project.members.map(m => [m.member.toString(), m.role]));
    const people = await TeamMember.find({
      status: 'active',
      $or: [{ _id: { $in: [...roleById.keys()] } }, { organization: req.project.organization, orgRole: 'org_admin' }],
    }).select('name role').sort({ name: 1 }).lean();
    res.json({ success: true, data: people.map(p => ({ ...p, projectRole: roleById.get(p._id.toString()) || 'project_admin' })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Everything below changes project configuration: Project Admins (and Org Admins) only
router.use(requireProjectRole('project_admin'));

// PATCH /api/projects/:projectId — name, description, sprint length, archive
router.patch('/', async (req, res) => {
  try {
    const { name, description, status } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Project name is required.' });
      req.project.name = name.trim();
    }
    if (description !== undefined) req.project.description = description;
    if (req.body.sprintLengthDays !== undefined) {
      const days = Number(req.body.sprintLengthDays);
      if (!Number.isInteger(days) || days < 1 || days > 60) return res.status(400).json({ success: false, message: 'Sprint length must be 1–60 days.' });
      req.project.sprintSettings.lengthDays = days;
    }
    if (status !== undefined) {
      if (!['active', 'archived'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid project status.' });
      req.project.status = status;
    }
    await req.project.save();
    res.json({ success: true, data: await projectDetails(req.project) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/members — add any active member of the same organization (cross-team allowed)
router.post('/members', async (req, res) => {
  try {
    const { member, role } = req.body;
    if (!PROJECT_ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Choose a valid project role.' });
    const person = mongoose.isValidObjectId(member)
      ? await TeamMember.findOne({ _id: member, organization: req.project.organization, status: 'active' })
      : null;
    if (!person) return res.status(400).json({ success: false, message: 'That person is not an active member of your organization.' });
    if (req.project.members.some(m => sameId(m.member, person._id))) {
      return res.status(409).json({ success: false, message: `${person.name} is already on this project.` });
    }
    req.project.members.push({ member: person._id, role });
    await req.project.save();
    res.status(201).json({ success: true, data: await projectDetails(req.project) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/members/:memberId — change someone's project role
router.patch('/members/:memberId', async (req, res) => {
  try {
    const { role } = req.body;
    if (!PROJECT_ROLES.includes(role)) return res.status(400).json({ success: false, message: 'Choose a valid project role.' });
    const entry = req.project.members.find(m => sameId(m.member, req.params.memberId));
    if (!entry) return res.status(404).json({ success: false, message: 'That person is not on this project.' });
    // Keep at least one Project Admin on the project
    if (entry.role === 'project_admin' && role !== 'project_admin'
      && req.project.members.filter(m => m.role === 'project_admin').length === 1) {
      return res.status(400).json({ success: false, message: 'A project needs at least one Project Admin. Promote someone else first.' });
    }
    entry.role = role;
    await req.project.save();
    res.json({ success: true, data: await projectDetails(req.project) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:projectId/members/:memberId — their open work becomes unassigned
router.delete('/members/:memberId', async (req, res) => {
  try {
    const entry = req.project.members.find(m => sameId(m.member, req.params.memberId));
    if (!entry) return res.status(404).json({ success: false, message: 'That person is not on this project.' });
    if (entry.role === 'project_admin' && req.project.members.filter(m => m.role === 'project_admin').length === 1) {
      return res.status(400).json({ success: false, message: 'A project needs at least one Project Admin. Promote someone else first.' });
    }
    req.project.members = req.project.members.filter(m => !sameId(m.member, req.params.memberId));
    await req.project.save();
    await Task.updateMany({ project: req.project._id, assignee: req.params.memberId, status: { $ne: 'Done' } }, { assignee: null });
    await ActionItem.updateMany({ project: req.project._id, assignedTo: req.params.memberId, status: { $ne: 'Resolved' } }, { assignedTo: null });
    res.json({ success: true, data: await projectDetails(req.project) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
