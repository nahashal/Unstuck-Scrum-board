const mongoose = require('mongoose');

const SprintSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true, trim: true },
  goal: { type: String, trim: true, default: '' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned' },
}, { timestamps: true });

module.exports = mongoose.model('Sprint', SprintSchema);
