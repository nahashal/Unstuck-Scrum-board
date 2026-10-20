const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const Comment = require('../models/Comment');
const Task = require('../models/Task');
const DailyUpdate = require('../models/DailyUpdate');
const EveningUpdate = require('../models/EveningUpdate');
const Blocker = require('../models/Blocker');
const { forbid, isManager, sameId } = require('../middleware/permissions');

const TARGETS = { task: Task, update: DailyUpdate, evening: EveningUpdate, blocker: Blocker };

// The commented item must exist in this project
async function targetExists(req, targetType, targetId) {
  const Model = TARGETS[targetType];
  if (!Model || !mongoose.isValidObjectId(targetId)) return false;
  return !!(await Model.exists({ _id: targetId, project: req.project._id }));
}

// GET /api/projects/:projectId/comments?targetType=task&targetId=...
router.get('/', async (req, res) => {
  try {
    const { targetType, targetId } = req.query;
    if (!(await targetExists(req, targetType, targetId))) return res.status(404).json({ success: false, message: 'Item not found.' });
    const comments = await Comment.find({ project: req.project._id, targetType, targetId })
      .populate('author', 'name role').sort({ createdAt: 1 });
    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/comments — any project member
router.post('/', async (req, res) => {
  try {
    const { targetType, targetId } = req.body;
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'Comment cannot be empty.' });
    if (body.length > 2000) return res.status(400).json({ success: false, message: 'Comments are limited to 2000 characters.' });
    if (!(await targetExists(req, targetType, targetId))) return res.status(404).json({ success: false, message: 'Item not found.' });
    const comment = await Comment.create({ project: req.project._id, targetType, targetId, author: req.user._id, body });
    res.status(201).json({ success: true, data: await comment.populate('author', 'name role') });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:projectId/comments/:id — the author or a Scrum Master+
router.delete('/:id', async (req, res) => {
  try {
    const comment = mongoose.isValidObjectId(req.params.id) ? await Comment.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found.' });
    if (!isManager(req) && !sameId(comment.author, req.user._id)) return forbid(res, 'You can only delete your own comments.');
    await comment.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
