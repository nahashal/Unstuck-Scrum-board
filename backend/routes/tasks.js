const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const { reportTaskBlocker, resolveTaskBlockers } = require('../lib/blockerSync');
const { forbid, canEditTask, canDeleteTask, isProjectParticipant, isManager } = require('../middleware/permissions');

const STATUSES = ['To Do', 'In Progress', 'In Review', 'Done'];
const populateTask = (q) => q
  .populate('assignee', 'name role')
  .populate('createdBy', 'name')
  .populate('dependency', 'taskId title')
  .populate('sprint', 'name status');

// Checks every reference in a task body against this project; returns an error message or null
async function validateRefs(req, { assignee, dependency, sprint }) {
  if (assignee && !(await isProjectParticipant(req.project, assignee))) return 'Assignee is not a member of this project.';
  if (dependency) {
    if (!mongoose.isValidObjectId(dependency) || !(await Task.exists({ _id: dependency, project: req.project._id }))) {
      return 'Dependency task not found in this project.';
    }
  }
  if (sprint) {
    if (!mongoose.isValidObjectId(sprint) || !(await Sprint.exists({ _id: sprint, project: req.project._id }))) {
      return 'Sprint not found in this project.';
    }
  }
  return null;
}

// GET /api/projects/:projectId/tasks
router.get('/', async (req, res) => {
  try {
    const filter = { project: req.project._id };
    if (req.query.sprint === 'none') filter.sprint = null;
    else if (req.query.sprint && mongoose.isValidObjectId(req.query.sprint)) filter.sprint = req.query.sprint;
    const tasks = await populateTask(Task.find(filter)).sort({ createdAt: -1 });
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/projects/:projectId/tasks — any project member can create tasks
router.post('/', async (req, res) => {
  try {
    const { title, description, assignee, priority, status, dueDate, dependency, tags, sprint } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, message: 'Task title is required.' });
    if (status && !STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status value.' });
    if (assignee && !isManager(req) && assignee.toString() !== req.user._id.toString()) {
      return forbid(res, 'Only Scrum Masters and Project Admins can assign tasks to other people.');
    }

    const refError = await validateRefs(req, { assignee, dependency, sprint });
    if (refError) return res.status(400).json({ success: false, message: refError });

    const task = new Task({
      project: req.project._id, createdBy: req.user._id,
      title, description, assignee: assignee || null, priority, status, dueDate, dependency: dependency || null, tags, sprint: sprint || null,
    });
    await task.save();
    // "Mark as blocked" records a real blocker so it appears on the Blockers page
    if (req.body.hasBlocker === true) {
      await reportTaskBlocker({ project: req.project, task, reason: req.body.blockerReason, user: req.user });
    }
    res.status(201).json({ success: true, data: await populateTask(Task.findById(task._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/projects/:projectId/tasks/:id
router.patch('/:id', async (req, res) => {
  try {
    const task = mongoose.isValidObjectId(req.params.id) ? await Task.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
    if (!canEditTask(req, task)) return forbid(res, 'You can only edit tasks assigned to you or created by you.');

    // hasBlocker isn't set directly: it follows the task's open blockers (handled below)
    const allowed = ['title', 'description', 'assignee', 'priority', 'status', 'dueDate', 'dependency', 'tags', 'sprint'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key] === '' ? null : req.body[key]; });

    if (updates.status && !STATUSES.includes(updates.status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }
    // Reassigning someone else's work is a management action
    if (updates.assignee !== undefined && !isManager(req)) {
      const current = task.assignee?.toString() || null;
      const next = updates.assignee ? updates.assignee.toString() : null;
      if (current !== next && next !== req.user._id.toString() && next !== null) {
        return forbid(res, 'Only Scrum Masters and Project Admins can assign tasks to other people.');
      }
    }
    if (updates.dependency && updates.dependency.toString() === task._id.toString()) {
      return res.status(400).json({ success: false, message: 'A task cannot depend on itself.' });
    }
    const refError = await validateRefs(req, updates);
    if (refError) return res.status(400).json({ success: false, message: refError });

    // Direct edits to progress are recorded as manual
    if (req.body.progressPercent !== undefined) {
      const pct = Number(req.body.progressPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ success: false, message: 'Progress must be between 0 and 100.' });
      updates.progress = { percent: Math.round(pct), updatedAt: new Date(), source: 'manual' };
    }

    // Clearing "Blocked" resolves the task's blockers — a blocker decision, so Scrum Master+ only
    const wantsBlocked = req.body.hasBlocker;
    if (wantsBlocked === false && task.hasBlocker && !isManager(req)) {
      return forbid(res, 'Only Scrum Masters and Project Admins can clear a blocker. Ask them to resolve it on the Blockers page.');
    }

    Object.assign(task, updates);
    await task.save();
    if (wantsBlocked === true && !task.hasBlocker) {
      await reportTaskBlocker({ project: req.project, task, reason: req.body.blockerReason, user: req.user });
    } else if (wantsBlocked === false && task.hasBlocker) {
      await resolveTaskBlockers({ project: req.project, taskId: task._id });
    }
    res.json({ success: true, data: await populateTask(Task.findById(task._id)) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/projects/:projectId/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const task = mongoose.isValidObjectId(req.params.id) ? await Task.findOne({ _id: req.params.id, project: req.project._id }) : null;
    if (!task) return res.status(404).json({ success: false, message: 'Task not found.' });
    if (!canDeleteTask(req, task)) return forbid(res, 'You can only delete tasks you created that are not assigned to someone else.');
    await task.deleteOne();
    res.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
