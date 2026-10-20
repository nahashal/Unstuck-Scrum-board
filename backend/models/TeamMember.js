const mongoose = require('mongoose');

// Each team member is a real user account; they sign in with email + password.
const TeamMemberSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // Free-text job title shown under the name (e.g. "Backend Developer") — not a permission
  role: { type: String, trim: true, default: '' },
  avatar: { type: String, default: '' },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  // bcrypt hash — never returned by queries unless explicitly selected
  passwordHash: { type: String, required: true, select: false },

  // Permissions. Platform Admin is granted only via PLATFORM_ADMIN_EMAILS, never chosen in the UI.
  platformRole: { type: String, enum: ['admin', null], default: null },
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  orgRole: { type: String, enum: ['org_admin', 'member'], default: 'member' },
  status: { type: String, enum: ['active', 'deactivated'], default: 'active' },
  lastProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
}, { timestamps: true });

module.exports = mongoose.model('TeamMember', TeamMemberSchema);
