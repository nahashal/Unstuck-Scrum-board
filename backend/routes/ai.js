const express = require('express');
const mongoose = require('mongoose');
const router = express.Router({ mergeParams: true });
const Task = require('../models/Task');
const TeamMember = require('../models/TeamMember');
const DailyUpdate = require('../models/DailyUpdate');
const EveningUpdate = require('../models/EveningUpdate');
const Blocker = require('../models/Blocker');
const StandupSummary = require('../models/StandupSummary');
const { generate, parseJson, LLMError } = require('../lib/llm');
const { dayRange, dayKey } = require('../lib/dates');
const { forbid, isManager, sameId, requireProjectRole } = require('../middleware/permissions');

const sendAIError = (res, err) => {
  if (err instanceof LLMError) return res.status(err.status).json({ success: false, message: err.message });
  if (err.message && err.message.includes('API_KEY')) {
    return res.status(503).json({ success: false, message: 'Invalid Gemini API key. Please check your configuration.' });
  }
  res.status(500).json({ success: false, message: `AI analysis failed: ${err.message}` });
};

// Members who can be named as owners: project members plus the org's admins
async function projectPeople(project) {
  const ids = project.members.map(m => m.member);
  return TeamMember.find({
    status: 'active',
    $or: [{ _id: { $in: ids } }, { organization: project.organization, orgRole: 'org_admin' }],
  }).select('name role').lean();
}

// ─── POST .../ai/analyze — blocker analysis of a morning update ────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { updateId, teamMemberName, yesterday, today, blockers } = req.body;

    if (!yesterday && !today && !blockers) {
      return res.status(400).json({ success: false, message: 'No update content provided for analysis.' });
    }

    let update = null;
    if (updateId) {
      update = mongoose.isValidObjectId(updateId) ? await DailyUpdate.findOne({ _id: updateId, project: req.project._id }) : null;
      if (!update) return res.status(404).json({ success: false, message: 'Daily update not found.' });
      // Developers analyze their own updates; Scrum Masters+ can analyze anyone's
      if (!isManager(req) && !sameId(update.teamMember, req.user._id)) {
        return forbid(res, 'You can only run AI analysis on your own updates.');
      }
    }

    const tasks = await Task.find({ project: req.project._id, status: { $ne: 'Done' } })
      .populate('assignee', 'name')
      .select('taskId title status priority hasBlocker assignee')
      .lean();
    const teamMembers = await projectPeople(req.project);
    // Blockers the team already tracks, so the AI doesn't re-report them as new
    const existingBlockers = await Blocker.find({ project: req.project._id })
      .populate('affectedTask', 'taskId')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const taskContext = tasks.map(t =>
      `[${t.taskId}] "${t.title}" - Status: ${t.status}, Priority: ${t.priority}, Assignee: ${t.assignee ? t.assignee.name : 'Unassigned'}${t.hasBlocker ? ' ⚠️ BLOCKED' : ''}`
    ).join('\n');
    const memberNames = teamMembers.map(m => `${m.name}${m.role ? ` (${m.role})` : ''}`).join(', ');
    const blockerContext = existingBlockers.map(b =>
      `[${b._id}] "${b.title}" - Status: ${b.status}${b.affectedTask ? `, Task: ${b.affectedTask.taskId}` : ''} - ${b.description}`
    ).join('\n');

    const authorName = update ? (await TeamMember.findById(update.teamMember).select('name').lean())?.name : teamMemberName;

    const prompt = `You are an expert Scrum Master AI assistant. Analyze the following daily stand-up update and identify potential blockers, risks, or impediments.

## Team Member
${authorName || 'Unknown'}

## Daily Update
**Yesterday's Progress:**
${yesterday || 'Not provided'}

**Today's Plan:**
${today || 'Not provided'}

**Reported Blockers / Difficulties:**
${blockers || 'None reported'}

## Active Tasks Context (non-Done tasks)
${taskContext || 'No active tasks found.'}

## Team Members
${memberNames || 'No team members found.'}

## Blockers Already Tracked by the Team
${blockerContext || 'None.'}

## Instructions
Based on the update above, identify up to 3 potential blockers or risks. Only report issues that are genuinely supported by the update text; do not speculate. For each finding, provide a JSON object.

If a finding describes the same underlying problem as one of the "Blockers Already Tracked by the Team" (whatever its status, including Resolved), set "existingBlockerId" to that blocker's id in square brackets. Otherwise set it to null.

Respond ONLY with a valid JSON array. Do not include any markdown formatting, code fences, or explanatory text outside the JSON array.

Each object in the array must have exactly these fields:
- "potentialBlocker": string — concise title of the blocker (required)
- "affectedTaskId": string or null — the taskId from the context if identifiable, otherwise null
- "reason": string — why this is a blocker (required)
- "impact": string — impact on the sprint or progress (required)
- "possibleOwner": string or null — name of team member who could resolve it, or null if unclear
- "suggestedAction": string — specific actionable next step (required)
- "missingInfo": string or null — what information would help clarify this blocker, or null
- "existingBlockerId": string or null — id of the matching already-tracked blocker, or null

If no blockers or risks are identified, return an empty array: []`;

    const { text, model: usedModel } = await generate(prompt);
    const findings = parseJson(text);
    if (!Array.isArray(findings)) throw new LLMError('AI returned an unstructured response. Please try again.', 502);

    // Validate and sanitize each finding — never trust AI-supplied IDs or names
    const requiredFields = ['potentialBlocker', 'reason', 'impact', 'suggestedAction'];
    const validatedFindings = [];
    for (const finding of findings.slice(0, 3)) {
      if (typeof finding !== 'object' || finding === null) continue;
      if (requiredFields.some(f => !finding[f] || typeof finding[f] !== 'string')) continue;

      const matchedTask = finding.affectedTaskId ? tasks.find(t => t.taskId === finding.affectedTaskId) : null;
      const owner = typeof finding.possibleOwner === 'string' ? finding.possibleOwner.toLowerCase() : '';
      const matchedMember = owner
        ? teamMembers.find(m => m.name.toLowerCase().includes(owner) || owner.includes(m.name.toLowerCase()))
        : null;
      const existingId = typeof finding.existingBlockerId === 'string' ? finding.existingBlockerId.replace(/[[\]\s]/g, '') : '';
      const matchedBlocker = existingId ? existingBlockers.find(b => b._id.toString() === existingId) : null;

      validatedFindings.push({
        potentialBlocker: finding.potentialBlocker,
        affectedTaskId: matchedTask ? matchedTask.taskId : null,
        affectedTaskObjectId: matchedTask ? matchedTask._id : null,
        reason: finding.reason,
        impact: finding.impact,
        possibleOwner: finding.possibleOwner || null,
        possibleOwnerValidated: matchedMember ? matchedMember.name : null,
        possibleOwnerMemberId: matchedMember ? matchedMember._id : null,
        suggestedAction: finding.suggestedAction,
        missingInfo: finding.missingInfo || null,
        // Always starts unconfirmed; already-tracked problems are linked to their blocker instead
        status: matchedBlocker ? 'tracked' : 'pending',
        blocker: matchedBlocker ? matchedBlocker._id : null,
      });
    }

    const analyzedAt = new Date();

    // Saved updates keep their latest analysis so it survives navigation and refreshes.
    // These are unconfirmed findings only — nothing becomes a blocker until a person confirms it.
    if (update) {
      update.aiAnalyzed = true;
      update.aiAnalysis = { analyzedAt, model: usedModel, findings: validatedFindings };
      await update.save();
      await update.populate('aiAnalysis.findings.blocker', 'title status');
      return res.json({
        success: true,
        data: { findings: update.aiAnalysis.findings, totalFound: update.aiAnalysis.findings.length, analyzedAt, model: usedModel, saved: true },
      });
    }

    // Manual (unsaved) analyses are returned but not stored
    const blockerById = new Map(existingBlockers.map(b => [b._id.toString(), { _id: b._id, title: b.title, status: b.status }]));
    res.json({
      success: true,
      data: {
        findings: validatedFindings.map(f => ({ ...f, blocker: f.blocker ? blockerById.get(f.blocker.toString()) : null })),
        totalFound: validatedFindings.length,
        analyzedAt,
        model: usedModel,
        saved: false,
      }
    });
  } catch (err) {
    sendAIError(res, err);
  }
});

// ─── POST .../ai/progress — estimate % complete for each task in an evening update ─────
router.post('/progress', async (req, res) => {
  try {
    const { eveningId } = req.body;
    const evening = mongoose.isValidObjectId(eveningId)
      ? await EveningUpdate.findOne({ _id: eveningId, project: req.project._id }).populate('member', 'name')
      : null;
    if (!evening) return res.status(404).json({ success: false, message: 'Evening update not found.' });
    if (!isManager(req) && !sameId(evening.member._id, req.user._id)) {
      return forbid(res, 'You can only analyze your own evening updates.');
    }

    const taskIds = evening.entries.map(e => e.task);
    const tasks = await Task.find({ _id: { $in: taskIds }, project: req.project._id }).lean();
    const taskById = new Map(tasks.map(t => [t._id.toString(), t]));

    // Morning plan from the same day, and earlier evening notes on the same tasks, give the AI history
    const { start, end } = dayRange(dayKey(evening.createdAt));
    const morning = await DailyUpdate.findOne({ project: req.project._id, teamMember: evening.member._id, createdAt: { $gte: start, $lt: end } }).lean();
    const history = await EveningUpdate.find({
      project: req.project._id, _id: { $ne: evening._id }, 'entries.task': { $in: taskIds }, createdAt: { $lt: evening.createdAt },
    }).sort({ createdAt: -1 }).limit(10).lean();

    const taskBlocks = evening.entries.map(entry => {
      const t = taskById.get(entry.task.toString());
      if (!t) return null;
      const past = history.flatMap(h => h.entries.filter(e => e.task.toString() === t._id.toString())
        .map(e => `  - ${new Date(h.createdAt).toDateString()}: done "${e.done}"; left "${e.remaining || 'n/a'}"`)).slice(0, 5);
      return `### ${t.taskId}: ${t.title}
Description: ${t.description || 'None'}
Current status: ${t.status}; currently recorded progress: ${t.progress?.percent ?? 0}%
Due date: ${t.dueDate ? new Date(t.dueDate).toDateString() : 'none'}
Earlier evening notes:
${past.length ? past.join('\n') : '  - none'}
TODAY — done: "${entry.done}"
TODAY — still left: "${entry.remaining || 'not stated'}"
TODAY — hours spent: ${entry.hoursSpent ?? 'not stated'}; status reported: ${entry.status}`;
    }).filter(Boolean);

    if (taskBlocks.length === 0) return res.status(400).json({ success: false, message: 'None of the tasks in this update exist any more.' });

    const prompt = `You are an experienced agile delivery lead. Estimate how complete each task is after today's work, based only on the evidence below.

## Person
${evening.member.name}

## This morning's plan
${morning ? `Yesterday: ${morning.yesterday}\nToday: ${morning.today}\nBlockers: ${morning.blockers || 'none'}` : 'No morning update was posted today.'}

## Today's date
${new Date(evening.createdAt).toDateString()}

## Tasks worked on today
${taskBlocks.join('\n\n')}

## Instructions
For EACH task above, estimate percent complete (0-100) for the whole task, not just today's part.
- Base it on what is done versus what is still left, the task description, earlier notes and the reported status.
- A task reported as "Done" with nothing left can be 100; otherwise do not exceed 95.
- If the evidence is thin or vague, keep the estimate conservative and set confidence to "low".
- risk: "behind" if the due date is likely to be missed, "at_risk" if it is tight or the work seems stuck, otherwise "on_track".

Respond ONLY with a JSON array, one object per task, each with exactly these fields:
- "taskId": string — the task's ID exactly as shown above (e.g. "WEB-0003")
- "percentComplete": integer 0-100
- "confidence": "low" | "medium" | "high"
- "reasoning": string — one or two sentences explaining the estimate
- "remainingWork": string — short summary of what is left
- "risk": "on_track" | "at_risk" | "behind"`;

    const { text, model: usedModel } = await generate(prompt);
    const raw = parseJson(text);
    if (!Array.isArray(raw)) throw new LLMError('AI returned an unstructured response. Please try again.', 502);

    // Validate: only tasks in this evening update, one estimate each, numbers clamped
    const byKey = new Map(tasks.map(t => [t.taskId, t]));
    const seen = new Set();
    const estimates = [];
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue;
      const t = byKey.get(typeof r.taskId === 'string' ? r.taskId.trim() : '');
      if (!t || seen.has(t.taskId)) continue;
      const pct = Math.round(Number(r.percentComplete));
      if (!Number.isFinite(pct)) continue;
      seen.add(t.taskId);
      estimates.push({
        task: t._id,
        percentComplete: Math.min(100, Math.max(0, pct)),
        confidence: ['low', 'medium', 'high'].includes(r.confidence) ? r.confidence : 'medium',
        reasoning: typeof r.reasoning === 'string' ? r.reasoning : '',
        remainingWork: typeof r.remainingWork === 'string' ? r.remainingWork : '',
        risk: ['on_track', 'at_risk', 'behind'].includes(r.risk) ? r.risk : 'on_track',
        status: 'pending',
      });
    }
    if (estimates.length === 0) throw new LLMError('AI could not produce progress estimates for these tasks. Please try again.', 502);

    // Suggestions only — Task.progress changes when a person accepts or adjusts
    evening.aiProgress = { analyzedAt: new Date(), model: usedModel, estimates };
    await evening.save();
    const saved = await EveningUpdate.findById(evening._id)
      .populate('member', 'name role')
      .populate('entries.task', 'taskId title status progress assignee')
      .populate('aiProgress.estimates.task', 'taskId title progress assignee')
      .populate('aiProgress.estimates.reviewedBy', 'name');
    res.json({ success: true, data: saved });
  } catch (err) {
    sendAIError(res, err);
  }
});

// ─── POST .../ai/standup-summary — Scrum Master+ generates the day's meeting summary ───
router.post('/standup-summary', requireProjectRole('scrum_master'), async (req, res) => {
  try {
    const { key, start, end } = dayRange(req.body.day);
    const range = { project: req.project._id, createdAt: { $gte: start, $lt: end } };
    const [mornings, evenings, openBlockers] = await Promise.all([
      DailyUpdate.find(range).populate('teamMember', 'name').lean(),
      EveningUpdate.find(range).populate('member', 'name').populate('entries.task', 'taskId title').lean(),
      Blocker.find({ project: req.project._id, status: { $ne: 'Resolved' } }).lean(),
    ]);
    if (mornings.length === 0 && evenings.length === 0) {
      return res.status(400).json({ success: false, message: 'Nobody has posted an update for this day yet.' });
    }

    const morningText = mornings.map(u => `- ${u.teamMember?.name}: yesterday "${u.yesterday}"; today "${u.today}"; blockers "${u.blockers || 'none'}"`).join('\n');
    const eveningText = evenings.map(e => `- ${e.member?.name}: ` + e.entries.map(en => `${en.task?.taskId || 'task'} done "${en.done}", left "${en.remaining || 'n/a'}"`).join('; ')).join('\n');
    const blockerText = openBlockers.map(b => `- ${b.title} (${b.status})`).join('\n');

    const prompt = `You are the Scrum Master's assistant. Write a concise summary of today's stand-up for the team.

## Morning updates
${morningText || 'None'}

## Evening check-ins
${eveningText || 'None'}

## Open blockers
${blockerText || 'None'}

Respond ONLY with a JSON object with exactly these fields:
- "summary": string — 2-4 sentences on overall progress
- "highlights": array of short strings — notable completed work
- "risks": array of short strings — risks or blockers needing attention
- "followUps": array of short strings — concrete follow-ups, naming the person where possible
Only use facts from the updates above.`;

    const { text, model: usedModel } = await generate(prompt);
    const raw = parseJson(text);
    const strList = (v) => (Array.isArray(v) ? v.filter(s => typeof s === 'string').slice(0, 8) : []);
    if (!raw || typeof raw.summary !== 'string') throw new LLMError('AI returned an unstructured response. Please try again.', 502);

    const doc = await StandupSummary.findOneAndUpdate(
      { project: req.project._id, day: key },
      { summary: raw.summary, highlights: strList(raw.highlights), risks: strList(raw.risks), followUps: strList(raw.followUps), model: usedModel, generatedBy: req.user._id },
      { upsert: true, new: true }
    ).populate('generatedBy', 'name');
    res.json({ success: true, data: doc });
  } catch (err) {
    sendAIError(res, err);
  }
});

module.exports = router;
