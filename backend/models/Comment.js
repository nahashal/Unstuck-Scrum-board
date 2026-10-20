const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  targetType: { type: String, enum: ['task', 'update', 'evening', 'blocker'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: true });

CommentSchema.index({ project: 1, targetType: 1, targetId: 1, createdAt: 1 });

module.exports = mongoose.model('Comment', CommentSchema);
