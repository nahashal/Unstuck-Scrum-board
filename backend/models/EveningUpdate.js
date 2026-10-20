const mongoose = require('mongoose');

// What one person got done on one task by the end of the day
const EntrySchema = new mongoose.Schema({
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  done: { type: String, required: true, trim: true },
  remaining: { type: String, trim: true, default: '' },
  hoursSpent: { type: Number, min: 0, max: 24, default: null },
  status: { type: String, enum: ['To Do', 'In Progress', 'In Review', 'Done'], default: 'In Progress' },
});

// The AI's suggested % complete for one task; only a suggestion until a person accepts or adjusts it
const EstimateSchema = new mongoose.Schema({
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  percentComplete: { type: Number, min: 0, max: 100, required: true },
  confidence: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  reasoning: { type: String, default: '' },
  remainingWork: { type: String, default: '' },
  risk: { type: String, enum: ['on_track', 'at_risk', 'behind'], default: 'on_track' },
  status: { type: String, enum: ['pending', 'accepted', 'adjusted', 'rejected'], default: 'pending' },
  finalPercent: { type: Number, min: 0, max: 100, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
});

const EveningUpdateSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', required: true },
  notes: { type: String, trim: true, default: '' },
  entries: { type: [EntrySchema], validate: [v => v.length > 0, 'Add at least one task.'] },
  aiProgress: {
    analyzedAt: { type: Date, default: null },
    model: { type: String, default: null },
    estimates: { type: [EstimateSchema], default: [] },
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('EveningUpdate', EveningUpdateSchema);
