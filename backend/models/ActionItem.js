const mongoose = require('mongoose');

const ActionItemSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  description: { type: String, required: true, trim: true },
  relatedBlocker: { type: mongoose.Schema.Types.ObjectId, ref: 'Blocker', default: null },
  relatedTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  deadline: { type: Date, default: null },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved'],
    default: 'Open'
  },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
}, { timestamps: true });

module.exports = mongoose.model('ActionItem', ActionItemSchema);
