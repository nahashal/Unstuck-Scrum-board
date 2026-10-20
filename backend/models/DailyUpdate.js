const mongoose = require('mongoose');

// One AI finding, plus the user's review decision on it.
// AI output stays 'pending' until a person confirms or rejects it.
const FindingSchema = new mongoose.Schema({
  potentialBlocker: { type: String, required: true },
  affectedTaskId: { type: String, default: null },
  affectedTaskObjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  reason: { type: String, default: '' },
  impact: { type: String, default: '' },
  possibleOwner: { type: String, default: null },
  possibleOwnerValidated: { type: String, default: null },
  possibleOwnerMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  suggestedAction: { type: String, default: '' },
  missingInfo: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'tracked'],
    default: 'pending',
  },
  // Set when confirmed, or when the AI matched it to an already-tracked blocker
  blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'Blocker', default: null },
});

const DailyUpdateSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  teamMember: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', required: true },
  yesterday: { type: String, required: true, trim: true },
  today: { type: String, required: true, trim: true },
  blockers: { type: String, trim: true, default: '' },
  relatedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  aiAnalyzed: { type: Boolean, default: false },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  reviewedAt: { type: Date, default: null },
  aiAnalysis: {
    analyzedAt: { type: Date, default: null },
    model: { type: String, default: null },
    findings: { type: [FindingSchema], default: [] },
  },
}, { timestamps: true });

module.exports = mongoose.model('DailyUpdate', DailyUpdateSchema);
