const mongoose = require('mongoose');

// A group of people inside an organization; teams own projects.
const TeamSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember' }],
}, { timestamps: true });

TeamSchema.index({ organization: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Team', TeamSchema);
