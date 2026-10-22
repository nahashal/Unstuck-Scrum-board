// Keeps tasks, daily updates and blockers consistent with each other
const Blocker = require('../models/Blocker');
const Task = require('../models/Task');

const OPEN = { $ne: 'Resolved' };

// A task shows "Blocked" exactly while it has unresolved blockers
async function syncTaskBlockedFlag(taskId) {
  if (!taskId) return;
  const open = await Blocker.countDocuments({ affectedTask: taskId, status: OPEN });
  await Task.updateOne({ _id: taskId }, { hasBlocker: open > 0 });
}

const shortTitle = (text, max = 80) => {
  const firstLine = String(text).trim().split(/\r?\n/)[0];
  return firstLine.length > max ? `${firstLine.slice(0, max - 1).trimEnd()}…` : firstLine;
};

// "Mark as blocked" on the board: records a blocker for the task (unless one is already open)
async function reportTaskBlocker({ project, task, reason, user }) {
  const existing = await Blocker.findOne({ project: project._id, affectedTask: task._id, status: OPEN });
  if (existing) return existing;
  const text = String(reason || '').trim();
  const blocker = await Blocker.create({
    project: project._id,
    affectedTask: task._id,
    title: text ? shortTitle(text) : `${task.taskId} is blocked`,
    description: text || `${task.taskId} "${task.title}" was marked as blocked on the Scrum Board.`,
    owner: task.assignee || null,
    reportedBy: user._id,
    confirmedBy: 'reported',
    source: 'task',
  });
  await syncTaskBlockedFlag(task._id);
  return blocker;
}

// Clearing "Mark as blocked": resolves the task's open blockers
async function resolveTaskBlockers({ project, taskId }) {
  const res = await Blocker.updateMany({ project: project._id, affectedTask: taskId, status: OPEN }, { status: 'Resolved' });
  await syncTaskBlockedFlag(taskId);
  return res.modifiedCount || 0;
}

// The "Blockers / Difficulties" field of a daily update becomes a reported blocker,
// kept in step when the update is edited (resolved blockers are left alone)
async function syncUpdateBlocker({ project, update, user }) {
  const text = String(update.blockers || '').trim();
  const linked = await Blocker.findOne({ project: project._id, relatedUpdate: update._id, source: 'daily_update' });
  if (!text) return linked;
  if (linked) {
    if (linked.status === 'Resolved') return linked;
    const previousTask = linked.affectedTask;
    linked.title = shortTitle(text);
    linked.description = text;
    linked.affectedTask = update.relatedTask || null;
    await linked.save();
    await syncTaskBlockedFlag(linked.affectedTask);
    if (previousTask && String(previousTask) !== String(linked.affectedTask)) await syncTaskBlockedFlag(previousTask);
    return linked;
  }
  const blocker = await Blocker.create({
    project: project._id,
    title: shortTitle(text),
    description: text,
    affectedTask: update.relatedTask || null,
    relatedUpdate: update._id,
    owner: update.teamMember,
    reportedBy: user._id,
    confirmedBy: 'reported',
    source: 'daily_update',
  });
  await syncTaskBlockedFlag(blocker.affectedTask);
  return blocker;
}

module.exports = { syncTaskBlockedFlag, reportTaskBlocker, resolveTaskBlockers, syncUpdateBlocker };
