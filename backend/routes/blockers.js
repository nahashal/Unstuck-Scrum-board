const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const Blocker = require('../models/Blocker');
const Task = require('../models/Task');
const DailyUpdate = require('../models/DailyUpdate');
const { syncTaskBlockedFlag } = require('../lib/blockerSync');
const { forbid, isManager, isProjectParticipant, requireProjectRole } = require('../middleware/permissions');

const STATUSES = ['Open', 'In Progress', 'Resolved'];
const populateBlocker = (q) => q
  .populate('affectedTask', 'taskId title status')
  .populate('owner', 'name role')
  .populate('reportedBy', 'name')
  .populate('relatedUpdate', 'createdAt teamMember');

async function validateRefs(req, { affectedTask, owner }) {
  if (affectedTask) {
    if (!mongoose.isValidObjectId(affectedTask) || !(await Task.exists({ _id: affectedTask, project: req.project._id }))) {
      return 'Affected task not found in this project.';
    }
  }
  if (owner && !(await isProjectParticipant(req.project, owner))) return 'Owner is not a member of this project.';
  return null;
}


// GET /api/projects/:projectId/blockers
router.get('/', async (req, res) => {
  try {
    const blockers = await populateBlocker(Blocker.find({ project: req.project._id })).sort({ createdAt: -1 });
    res.json({ success: true, data: blockers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/blockers
// Any member can report a blocker; confirming an AI finding (findingId) is a Scrum Master+ decision.
router.post('/', async (req, res) => {
  try {
    const { title, description, affectedTask, relatedUpdate, impact, owner, suggestedAction, aiRaw, findingId } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ success: false, message: 'Blocker title is required.' });
    if (!description || !description.trim()) return res.status(400).json({ success: false, message: 'Blocker description is required.' });
    if (findingId && !isManager(req)) return forbid(res, 'Only Scrum Masters and Project Admins can confirm AI findings.');

    // Validate every reference before writing anything
    const refError = await validateRefs(req, { affectedTask, owner });
    if (refError) return res.status(400).json({ success: false, message: refError });

    // When confirming an AI finding, it must exist on the related update and still be awaiting review
    let update = null;
    let finding = null;
    if (relatedUpdate) {
      update = mongoose.isValidObjectId(relatedUpdate) ? await DailyUpdate.findOne({ _id: relatedUpdate, project: req.project._id }) : null;
      if (!update) return res.status(400).json({ success: false, message: 'Related update not found in this project.' });
    }
    if (findingId) {
      finding = update?.aiAnalysis?.findings?.id(findingId);
      if (!finding) return res.status(400).json({ success: false, message: 'AI finding not found on the related update.' });
      if (finding.status === 'confirmed' || finding.status === 'tracked') {
        return res.status(400).json({ success: false, message: 'This finding is already linked to a blocker.' });
      }
    }

    const blocker = await Blocker.create({
      project: req.project._id, title, description, affectedTask: affectedTask || null, relatedUpdate: relatedUpdate || null,
      impact, owner: owner || null, suggestedAction, aiRaw, reportedBy: req.user._id,
      confirmedBy: findingId ? req.user.name : 'reported',
      source: findingId ? 'ai' : 'manual',
    });

    await syncTaskBlockedFlag(blocker.affectedTask);

    if (finding) {
      finding.status = 'confirmed';
      finding.blocker = blocker._id;
      await update.save();
    }
    res.status(201).json({ success: true, data: await populateBlocker(Blocker.findById(blocker._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/blockers/:id — Scrum Master+ manages blockers
router.patch('/:id', requireProjectRole('scrum_master'), async (req, res) => {
  try {
    const blocker = mongoose.isValidObjectId(req.params.id) ? await Blocker.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!blocker) return res.status(404).json({ success: false, message: 'Blocker not found.' });

    const allowed = ['title', 'description', 'affectedTask', 'impact', 'owner', 'suggestedAction', 'status'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key] === '' ? null : req.body[key]; });

    if (updates.status && !STATUSES.includes(updates.status)) {
      return res.status(400).json({ success: false, message: 'Invalid blocker status.' });
    }
    const refError = await validateRefs(req, updates);
    if (refError) return res.status(400).json({ success: false, message: refError });

    const previousTask = blocker.affectedTask;
    Object.assign(blocker, updates);
    await blocker.save();

    await syncTaskBlockedFlag(blocker.affectedTask);
    if (previousTask && previousTask.toString() !== blocker.affectedTask?.toString()) await syncTaskBlockedFlag(previousTask);

    res.json({ success: true, data: await populateBlocker(Blocker.findById(blocker._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
