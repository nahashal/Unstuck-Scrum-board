const mongoose = require('mongoose');

const BlockerSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  affectedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  relatedUpdate: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyUpdate', default: null },
  impact: { type: String, trim: true, default: '' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  suggestedAction: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved'],
    default: 'Open'
  },
  aiRaw: { type: mongoose.Schema.Types.Mixed, default: null }, // raw AI analysis snapshot
  confirmedBy: { type: String, default: 'user' },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Blocker', BlockerSchema);
