const express = require('express');
const router = express.Router({ mergeParams: true });
const TeamMember = require('../models/TeamMember');
const DailyUpdate = require('../models/DailyUpdate');
const EveningUpdate = require('../models/EveningUpdate');
const StandupSummary = require('../models/StandupSummary');
const { dayRange } = require('../lib/dates');

// GET /api/projects/:projectId/standup?day=YYYY-MM-DD
// Every project member's morning and evening status for the day, plus the saved AI summary
router.get('/', async (req, res) => {
  try {
    const { key, start, end } = dayRange(req.query.day);
    const range = { project: req.project._id, createdAt: { $gte: start, $lt: end } };
    const memberIds = req.project.members.map(m => m.member);
    const [members, mornings, evenings, summary] = await Promise.all([
      TeamMember.find({ _id: { $in: memberIds }, status: 'active' }).select('name role').sort({ name: 1 }).lean(),
      DailyUpdate.find(range).populate('teamMember', 'name role').populate('relatedTask', 'taskId title').populate('reviewedBy', 'name').sort({ createdAt: 1 }).lean(),
      EveningUpdate.find(range).populate('member', 'name role').populate('entries.task', 'taskId title').populate('reviewedBy', 'name').sort({ createdAt: 1 }).lean(),
      StandupSummary.findOne({ project: req.project._id, day: key }).populate('generatedBy', 'name').lean(),
    ]);

    const roleById = new Map(req.project.members.map(m => [m.member.toString(), m.role]));
    const rows = members.map(m => ({
      member: { ...m, projectRole: roleById.get(m._id.toString()) },
      morning: mornings.filter(u => u.teamMember?._id.toString() === m._id.toString()),
      evening: evenings.filter(e => e.member?._id.toString() === m._id.toString()),
    }));

    res.json({
      success: true,
      data: {
        day: key,
        rows,
        missingMorning: rows.filter(r => r.morning.length === 0).map(r => r.member.name),
        missingEvening: rows.filter(r => r.evening.length === 0).map(r => r.member.name),
        summary,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
