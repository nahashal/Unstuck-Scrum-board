const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const { requireProjectRole } = require('../middleware/permissions');

const STATUSES = ['planned', 'active', 'completed'];

function validDates(startDate, endDate) {
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 'Start and end dates are required.';
  if (e <= s) return 'The end date must be after the start date.';
  return null;
}

// GET /api/projects/:projectId/sprints — any member
router.get('/', async (req, res) => {
  try {
    const sprints = await Sprint.find({ project: req.project._id }).sort({ startDate: -1 }).lean();
    res.json({ success: true, data: sprints });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Everything below is sprint configuration: Project Admins only
router.use(requireProjectRole('project_admin'));

// POST /api/projects/:projectId/sprints
router.post('/', async (req, res) => {
  try {
    const { name, goal } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Sprint name is required.' });
    const startDate = req.body.startDate || new Date();
    const endDate = req.body.endDate || new Date(new Date(startDate).getTime() + req.project.sprintSettings.lengthDays * 86400000);
    const dateError = validDates(startDate, endDate);
    if (dateError) return res.status(400).json({ success: false, message: dateError });
    const sprint = await Sprint.create({ project: req.project._id, name: name.trim(), goal, startDate, endDate });
    res.status(201).json({ success: true, data: sprint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/sprints/:id — edit, start (status: active) or complete
router.patch('/:id', async (req, res) => {
  try {
    const sprint = mongoose.isValidObjectId(req.params.id) ? await Sprint.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!sprint) return res.status(404).json({ success: false, message: 'Sprint not found.' });
    const { name, goal, startDate, endDate, status } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Sprint name is required.' });
      sprint.name = name.trim();
    }
    if (goal !== undefined) sprint.goal = goal;
    if (startDate !== undefined) sprint.startDate = startDate;
    if (endDate !== undefined) sprint.endDate = endDate;
    const dateError = validDates(sprint.startDate, sprint.endDate);
    if (dateError) return res.status(400).json({ success: false, message: dateError });
    if (status !== undefined) {
      if (!STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Invalid sprint status.' });
      // Only one active sprint per project at a time
      if (status === 'active') {
        const other = await Sprint.exists({ project: req.project._id, status: 'active', _id: { $ne: sprint._id } });
        if (other) return res.status(400).json({ success: false, message: 'Complete the current active sprint before starting another.' });
      }
      sprint.status = status;
    }
    await sprint.save();
    res.json({ success: true, data: sprint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:projectId/sprints/:id — tasks in it move back to the backlog
router.delete('/:id', async (req, res) => {
  try {
    const sprint = mongoose.isValidObjectId(req.params.id) ? await Sprint.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!sprint) return res.status(404).json({ success: false, message: 'Sprint not found.' });
    await Task.updateMany({ project: req.project._id, sprint: sprint._id }, { sprint: null });
    await sprint.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
