const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  settings: {
    defaultSprintDays: { type: Number, min: 1, max: 60, default: 14 },
  },
}, { timestamps: true });

module.exports = mongoose.model('Organization', OrganizationSchema);
