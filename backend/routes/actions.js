const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const ActionItem = require('../models/ActionItem');
const Blocker = require('../models/Blocker');
const Task = require('../models/Task');
const { forbid, isManager, canEditAction, isProjectParticipant, sameId } = require('../middleware/permissions');

const STATUSES = ['Open', 'In Progress', 'Resolved'];
const populateAction = (q) => q
  .populate('relatedBlocker', 'title status')
  .populate('relatedTask', 'taskId title status')
  .populate('assignedTo', 'name role')
  .populate('createdBy', 'name');

async function validateRefs(req, { relatedBlocker, relatedTask, assignedTo }) {
  if (relatedBlocker) {
    if (!mongoose.isValidObjectId(relatedBlocker) || !(await Blocker.exists({ _id: relatedBlocker, project: req.project._id }))) {
      return 'Related blocker not found in this project.';
    }
  }
  if (relatedTask) {
    if (!mongoose.isValidObjectId(relatedTask) || !(await Task.exists({ _id: relatedTask, project: req.project._id }))) {
      return 'Related task not found in this project.';
    }
  }
  if (assignedTo && !(await isProjectParticipant(req.project, assignedTo))) return 'Assigned member is not part of this project.';
  return null;
}

// GET /api/projects/:projectId/actions
router.get('/', async (req, res) => {
  try {
    const actions = await populateAction(ActionItem.find({ project: req.project._id })).sort({ createdAt: -1 });
    res.json({ success: true, data: actions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/actions — Scrum Master+ assigns to anyone; developers create their own
router.post('/', async (req, res) => {
  try {
    const { description, relatedBlocker, relatedTask, assignedTo, deadline, notes } = req.body;
    if (!description || !description.trim()) return res.status(400).json({ success: false, message: 'Description is required.' });
    if (!isManager(req) && assignedTo && !sameId(assignedTo, req.user._id)) {
      return forbid(res, 'Only Scrum Masters and Project Admins can assign action items to other people.');
    }
    const refError = await validateRefs(req, { relatedBlocker, relatedTask, assignedTo });
    if (refError) return res.status(400).json({ success: false, message: refError });

    const action = await ActionItem.create({
      project: req.project._id, createdBy: req.user._id, description,
      relatedBlocker: relatedBlocker || null, relatedTask: relatedTask || null,
      // Developers' own action items default to themselves
      assignedTo: assignedTo || (isManager(req) ? null : req.user._id),
      deadline: deadline || null, notes,
    });
    res.status(201).json({ success: true, data: await populateAction(ActionItem.findById(action._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/actions/:id — Scrum Master+, or the assignee/creator
router.patch('/:id', async (req, res) => {
  try {
    const action = mongoose.isValidObjectId(req.params.id) ? await ActionItem.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!action) return res.status(404).json({ success: false, message: 'Action item not found.' });
    if (!canEditAction(req, action)) return forbid(res, 'You can only update action items assigned to you.');

    const allowed = ['description', 'relatedBlocker', 'relatedTask', 'assignedTo', 'deadline', 'status', 'notes'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key] === '' ? null : req.body[key]; });

    if (updates.status && !STATUSES.includes(updates.status)) {
      return res.status(400).json({ success: false, message: 'Invalid action item status.' });
    }
    if (updates.assignedTo !== undefined && !isManager(req) && updates.assignedTo && !sameId(updates.assignedTo, req.user._id)) {
      return forbid(res, 'Only Scrum Masters and Project Admins can reassign action items.');
    }
    const refError = await validateRefs(req, updates);
    if (refError) return res.status(400).json({ success: false, message: refError });

    // Resolving an action item never completes its task (SRD 4.5)
    Object.assign(action, updates);
    await action.save();
    res.json({ success: true, data: await populateAction(ActionItem.findById(action._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
