const mongoose = require('mongoose');
const { PROJECT_ROLES } = require('./Project');

// Single-use invitation link; only a hash of the token is stored.
const InviteSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  orgRole: { type: String, enum: ['org_admin', 'member'], default: 'member' },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  projectRoles: [{
    _id: false,
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    role: { type: String, enum: PROJECT_ROLES, required: true },
  }],
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', required: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  // Outcome of the last invitation email (Brevo); the link can always be shared manually too
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Invite', InviteSchema);
