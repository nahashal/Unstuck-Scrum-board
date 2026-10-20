const express = require('express');
const router = express.Router({ mergeParams: true });
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const DailyUpdate = require('../models/DailyUpdate');
const Blocker = require('../models/Blocker');
const ActionItem = require('../models/ActionItem');

// GET /api/projects/:projectId/dashboard — metrics are always computed from stored records
router.get('/', async (req, res) => {
  try {
    const project = req.project._id;
    const activeSprint = await Sprint.findOne({ project, status: 'active' }).lean();
    // Sprint progress covers the active sprint's tasks; without one, all project tasks
    const sprintFilter = activeSprint ? { project, sprint: activeSprint._id } : { project };

    const [totalTasks, inProgressTasks, completedTasks, openBlockers, recentUpdates, outstandingActions, sprintTasks] = await Promise.all([
      Task.countDocuments({ project }),
      Task.countDocuments({ project, status: 'In Progress' }),
      Task.countDocuments({ project, status: 'Done' }),
      Blocker.countDocuments({ project, status: 'Open' }),
      DailyUpdate.find({ project }).populate('teamMember', 'name role').sort({ createdAt: -1 }).limit(5),
      ActionItem.countDocuments({ project, status: { $in: ['Open', 'In Progress'] } }),
      Task.find(sprintFilter).select('status progress').lean(),
    ]);

    const sprintDone = sprintTasks.filter(t => t.status === 'Done').length;
    const sprintProgress = sprintTasks.length > 0 ? Math.round((sprintDone / sprintTasks.length) * 100) : 0;
    // Average % complete, counting Done tasks as 100
    const avgTaskProgress = sprintTasks.length > 0
      ? Math.round(sprintTasks.reduce((sum, t) => sum + (t.status === 'Done' ? 100 : (t.progress?.percent || 0)), 0) / sprintTasks.length)
      : 0;

    res.json({
      success: true,
      data: {
        totalTasks,
        inProgressTasks,
        completedTasks,
        openBlockers,
        sprintProgress,
        sprintDone,
        sprintTotal: sprintTasks.length,
        avgTaskProgress,
        activeSprint: activeSprint ? { _id: activeSprint._id, name: activeSprint.name, goal: activeSprint.goal, endDate: activeSprint.endDate } : null,
        recentUpdates,
        outstandingActions,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
