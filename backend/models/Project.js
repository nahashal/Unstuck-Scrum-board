const mongoose = require('mongoose');

const PROJECT_ROLES = ['project_admin', 'scrum_master', 'developer'];

const ProjectMemberSchema = new mongoose.Schema({
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', required: true },
  role: { type: String, enum: PROJECT_ROLES, required: true },
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  name: { type: String, required: true, trim: true },
  // Short prefix for task IDs, e.g. WEB gives WEB-0001
  key: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z][A-Z0-9]{1,9}$/ },
  description: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  // Incremented atomically for every new task, so IDs are never reused
  taskCounter: { type: Number, default: 0 },
  members: [ProjectMemberSchema],
  sprintSettings: {
    lengthDays: { type: Number, min: 1, max: 60, default: 14 },
  },
}, { timestamps: true });

ProjectSchema.index({ organization: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('Project', ProjectSchema);
module.exports.PROJECT_ROLES = PROJECT_ROLES;
