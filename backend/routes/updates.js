const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const DailyUpdate = require('../models/DailyUpdate');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const { syncUpdateBlocker } = require('../lib/blockerSync');
const { forbid, canEditOwnDaily, requireProjectRole } = require('../middleware/permissions');

const populateUpdate = (q) => q
  .populate('teamMember', 'name role')
  .populate('relatedTask', 'taskId title status')
  .populate('reviewedBy', 'name')
  .populate('aiAnalysis.findings.blocker', 'title status');

async function findUpdate(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return DailyUpdate.findOne({ _id: req.params.id, project: req.project._id });
}

async function validateTask(req, relatedTask) {
  if (!relatedTask) return null;
  if (!mongoose.isValidObjectId(relatedTask) || !(await Task.exists({ _id: relatedTask, project: req.project._id }))) {
    return 'Related task not found in this project.';
  }
  return null;
}

// GET /api/projects/:projectId/updates — ?mine=true for the signed-in member's own updates
router.get('/', async (req, res) => {
  try {
    const filter = { project: req.project._id };
    if (req.query.mine === 'true') filter.teamMember = req.user._id;
    const updates = await populateUpdate(DailyUpdate.find(filter)).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: updates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/updates
router.post('/', async (req, res) => {
  try {
    const { yesterday, today, blockers, relatedTask } = req.body;
    if (!yesterday || !yesterday.trim()) return res.status(400).json({ success: false, message: "Yesterday's progress is required." });
    if (!today || !today.trim()) return res.status(400).json({ success: false, message: "Today's plan is required." });
    const taskError = await validateTask(req, relatedTask);
    if (taskError) return res.status(400).json({ success: false, message: taskError });

    // Updates are always filed as the signed-in member — never trusted from the request body
    const update = await DailyUpdate.create({
      project: req.project._id, teamMember: req.user._id, yesterday, today, blockers, relatedTask: relatedTask || null,
    });
    // Reported difficulties show up on the Blockers page straight away
    await syncUpdateBlocker({ project: req.project, update, user: req.user });
    res.status(201).json({ success: true, data: await populateUpdate(DailyUpdate.findById(update._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/updates/:id — author on the same day, or a Scrum Master+
router.patch('/:id', async (req, res) => {
  try {
    const update = await findUpdate(req);
    if (!update) return res.status(404).json({ success: false, message: 'Update not found.' });
    if (!canEditOwnDaily(req, update.teamMember, update.createdAt)) {
      return forbid(res, 'You can only edit your own update on the day you posted it.');
    }
    const { yesterday, today, blockers, relatedTask } = req.body;
    if (yesterday !== undefined) {
      if (!yesterday.trim()) return res.status(400).json({ success: false, message: "Yesterday's progress is required." });
      update.yesterday = yesterday;
    }
    if (today !== undefined) {
      if (!today.trim()) return res.status(400).json({ success: false, message: "Today's plan is required." });
      update.today = today;
    }
    if (blockers !== undefined) update.blockers = blockers;
    if (relatedTask !== undefined) {
      const taskError = await validateTask(req, relatedTask);
      if (taskError) return res.status(400).json({ success: false, message: taskError });
      update.relatedTask = relatedTask || null;
    }
    await update.save();
    if (blockers !== undefined || relatedTask !== undefined) await syncUpdateBlocker({ project: req.project, update, user: req.user });
    res.json({ success: true, data: await populateUpdate(DailyUpdate.findById(update._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:projectId/updates/:id
router.delete('/:id', async (req, res) => {
  try {
    const update = await findUpdate(req);
    if (!update) return res.status(404).json({ success: false, message: 'Update not found.' });
    if (!canEditOwnDaily(req, update.teamMember, update.createdAt)) {
      return forbid(res, 'You can only delete your own update on the day you posted it.');
    }
    await Comment.deleteMany({ project: req.project._id, targetType: 'update', targetId: update._id });
    await update.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/updates/:id/review — Scrum Master+ marks an update as reviewed (toggle)
router.post('/:id/review', requireProjectRole('scrum_master'), async (req, res) => {
  try {
    const update = await findUpdate(req);
    if (!update) return res.status(404).json({ success: false, message: 'Update not found.' });
    const reviewed = req.body.reviewed !== false;
    update.reviewedBy = reviewed ? req.user._id : null;
    update.reviewedAt = reviewed ? new Date() : null;
    await update.save();
    res.json({ success: true, data: await populateUpdate(DailyUpdate.findById(update._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/updates/:id/findings/:findingId — Scrum Master+ rejects (or un-rejects) an AI finding.
// Confirming goes through POST .../blockers (with findingId) so the blocker and the decision are saved together.
router.patch('/:id/findings/:findingId', requireProjectRole('scrum_master'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'pending' or 'rejected'." });
    }
    const update = await findUpdate(req);
    if (!update) return res.status(404).json({ success: false, message: 'Daily update not found.' });
    const finding = update.aiAnalysis?.findings?.id(req.params.findingId);
    if (!finding) return res.status(404).json({ success: false, message: 'Finding not found.' });
    if (finding.status === 'confirmed' || finding.status === 'tracked') {
      return res.status(400).json({ success: false, message: 'This finding is already linked to a blocker.' });
    }
    finding.status = status;
    await update.save();
    await update.populate('aiAnalysis.findings.blocker', 'title status');
    res.json({ success: true, data: update.aiAnalysis.findings.id(req.params.findingId) });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid ID.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
