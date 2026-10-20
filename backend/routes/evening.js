const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const EveningUpdate = require('../models/EveningUpdate');
const Task = require('../models/Task');
const Comment = require('../models/Comment');
const { dayRange } = require('../lib/dates');
const { forbid, isManager, sameId, canEditTask, canEditOwnDaily, requireProjectRole } = require('../middleware/permissions');

const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
const populateEvening = (q) => q
  .populate('member', 'name role')
  .populate('reviewedBy', 'name')
  .populate('entries.task', 'taskId title status progress assignee')
  .populate('aiProgress.estimates.task', 'taskId title progress assignee')
  .populate('aiProgress.estimates.reviewedBy', 'name');

async function findEvening(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return EveningUpdate.findOne({ _id: req.params.id, project: req.project._id });
}

// Validates entries and returns { entries, tasks } or { error }
async function cleanEntries(req, rawEntries) {
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) return { error: 'Add at least one task you worked on today.' };
  if (rawEntries.length > 20) return { error: 'An evening update can cover at most 20 tasks.' };
  const entries = [];
  const seen = new Set();
  for (const e of rawEntries) {
    if (!e || !mongoose.isValidObjectId(e.task)) return { error: 'Each entry needs a task.' };
    if (seen.has(e.task.toString())) return { error: 'Each task can appear only once.' };
    seen.add(e.task.toString());
    if (!e.done || !String(e.done).trim()) return { error: 'Describe what got done for each task.' };
    if (e.status && !STATUSES.includes(e.status)) return { error: 'Invalid task status.' };
    const hours = e.hoursSpent === '' || e.hoursSpent === null || e.hoursSpent === undefined ? null : Number(e.hoursSpent);
    if (hours !== null && (!Number.isFinite(hours) || hours < 0 || hours > 24)) return { error: 'Hours must be between 0 and 24.' };
    entries.push({ task: e.task, done: String(e.done).trim(), remaining: String(e.remaining || '').trim(), hoursSpent: hours, status: e.status || 'In Progress' });
  }
  const tasks = await Task.find({ _id: { $in: entries.map(e => e.task) }, project: req.project._id });
  if (tasks.length !== entries.length) return { error: 'One or more tasks were not found in this project.' };
  return { entries, tasks };
}

// The evening status moves the task on the board, when the person is allowed to edit that task
async function applyStatuses(req, entries, tasks) {
  const byId = new Map(tasks.map(t => [t._id.toString(), t]));
  for (const e of entries) {
    const t = byId.get(e.task.toString());
    if (t && t.status !== e.status && canEditTask(req, t)) {
      t.status = e.status;
      await t.save();
    }
  }
}

// GET /api/projects/:projectId/evening — ?mine=true, ?day=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const filter = { project: req.project._id };
    if (req.query.mine === 'true') filter.member = req.user._id;
    if (req.query.day) {
      const { start, end } = dayRange(req.query.day);
      filter.createdAt = { $gte: start, $lt: end };
    }
    const list = await populateEvening(EveningUpdate.find(filter)).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/evening — always filed as the signed-in member
router.post('/', async (req, res) => {
  try {
    const { entries, tasks, error } = await cleanEntries(req, req.body.entries);
    if (error) return res.status(400).json({ success: false, message: error });
    const evening = await EveningUpdate.create({
      project: req.project._id, member: req.user._id, notes: String(req.body.notes || '').trim(), entries,
    });
    await applyStatuses(req, entries, tasks);
    res.status(201).json({ success: true, data: await populateEvening(EveningUpdate.findById(evening._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/evening/:id — author on the same day, or Scrum Master+
router.patch('/:id', async (req, res) => {
  try {
    const evening = await findEvening(req);
    if (!evening) return res.status(404).json({ success: false, message: 'Evening update not found.' });
    if (!canEditOwnDaily(req, evening.member, evening.createdAt)) {
      return forbid(res, 'You can only edit your own evening update on the day you posted it.');
    }
    if (req.body.notes !== undefined) evening.notes = String(req.body.notes).trim();
    if (req.body.entries !== undefined) {
      const { entries, tasks, error } = await cleanEntries(req, req.body.entries);
      if (error) return res.status(400).json({ success: false, message: error });
      evening.entries = entries;
      // Changed work invalidates the previous AI estimates
      evening.aiProgress = { analyzedAt: null, model: null, estimates: [] };
      await applyStatuses(req, entries, tasks);
    }
    await evening.save();
    res.json({ success: true, data: await populateEvening(EveningUpdate.findById(evening._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:projectId/evening/:id
router.delete('/:id', async (req, res) => {
  try {
    const evening = await findEvening(req);
    if (!evening) return res.status(404).json({ success: false, message: 'Evening update not found.' });
    if (!canEditOwnDaily(req, evening.member, evening.createdAt)) {
      return forbid(res, 'You can only delete your own evening update on the day you posted it.');
    }
    await Comment.deleteMany({ project: req.project._id, targetType: 'evening', targetId: evening._id });
    await evening.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/evening/:id/review — Scrum Master+ marks as reviewed (toggle)
router.post('/:id/review', requireProjectRole('scrum_master'), async (req, res) => {
  try {
    const evening = await findEvening(req);
    if (!evening) return res.status(404).json({ success: false, message: 'Evening update not found.' });
    const reviewed = req.body.reviewed !== false;
    evening.reviewedBy = reviewed ? req.user._id : null;
    evening.reviewedAt = reviewed ? new Date() : null;
    await evening.save();
    res.json({ success: true, data: await populateEvening(EveningUpdate.findById(evening._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/evening/:id/estimates/:estimateId
// { action: 'accept' | 'adjust' | 'reject' | 'reset', percent? } — the task's assignee or a Scrum Master+
router.patch('/:id/estimates/:estimateId', async (req, res) => {
  try {
    const evening = await findEvening(req);
    if (!evening) return res.status(404).json({ success: false, message: 'Evening update not found.' });
    const estimate = mongoose.isValidObjectId(req.params.estimateId) ? evening.aiProgress.estimates.id(req.params.estimateId) : null;
    if (!estimate) return res.status(404).json({ success: false, message: 'Estimate not found.' });

    const task = await Task.findOne({ _id: estimate.task, project: req.project._id });
    if (!task) return res.status(404).json({ success: false, message: 'The task for this estimate no longer exists.' });
    const isOwnTask = sameId(task.assignee, req.user._id) || (!task.assignee && sameId(evening.member, req.user._id));
    if (!isManager(req) && !isOwnTask) return forbid(res, 'Only the task assignee or a Scrum Master can review this estimate.');

    const { action } = req.body;
    if (action === 'accept' || action === 'adjust') {
      let pct = estimate.percentComplete;
      if (action === 'adjust') {
        pct = Math.round(Number(req.body.percent));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ success: false, message: 'Progress must be between 0 and 100.' });
      }
      estimate.status = action === 'accept' ? 'accepted' : 'adjusted';
      estimate.finalPercent = pct;
      estimate.reviewedBy = req.user._id;
      task.progress = { percent: pct, updatedAt: new Date(), source: action === 'accept' ? 'ai_accepted' : 'ai_adjusted' };
      await task.save();
    } else if (action === 'reject') {
      estimate.status = 'rejected';
      estimate.finalPercent = null;
      estimate.reviewedBy = req.user._id;
    } else if (action === 'reset') {
      // Undo a rejection (accepted values already written to the task stay as they are)
      if (estimate.status !== 'rejected') return res.status(400).json({ success: false, message: 'Only a rejected estimate can be reopened.' });
      estimate.status = 'pending';
      estimate.reviewedBy = null;
    } else {
      return res.status(400).json({ success: false, message: "Action must be 'accept', 'adjust', 'reject' or 'reset'." });
    }
    await evening.save();
    res.json({ success: true, data: await populateEvening(EveningUpdate.findById(evening._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
