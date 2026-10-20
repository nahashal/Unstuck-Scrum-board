const mongoose = require('mongoose');

// Single document holding platform-wide switches
const PlatformSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'platform', unique: true },
  allowOrgSignup: { type: Boolean, default: true },
  aiEnabled: { type: Boolean, default: true },
}, { timestamps: true });

PlatformSettingsSchema.statics.get = async function () {
  return this.findOneAndUpdate({ key: 'platform' }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
};

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);
