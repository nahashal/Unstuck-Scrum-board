const mongoose = require('mongoose');

// AI meeting summary for one project's stand-up on one day
const StandupSummarySchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  day: { type: String, required: true }, // YYYY-MM-DD (server local time)
  summary: { type: String, default: '' },
  highlights: [{ type: String }],
  risks: [{ type: String }],
  followUps: [{ type: String }],
  model: { type: String, default: null },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
}, { timestamps: true });

StandupSummarySchema.index({ project: 1, day: 1 }, { unique: true });

module.exports = mongoose.model('StandupSummary', StandupSummarySchema);
