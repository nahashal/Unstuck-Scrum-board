const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  sprint: { type: mongoose.Schema.Types.ObjectId, ref: 'Sprint', default: null },
  taskId: { type: String },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember', default: null },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  status: {
    type: String,
    enum: ['To Do', 'In Progress', 'In Review', 'Done'],
    default: 'To Do'
  },
  dueDate: { type: Date, default: null },
  dependency: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  hasBlocker: { type: Boolean, default: false },
  tags: [{ type: String }],
  // % complete, set only when a person accepts/adjusts an AI estimate (or edits it directly)
  progress: {
    percent: { type: Number, min: 0, max: 100, default: 0 },
    updatedAt: { type: Date, default: null },
    source: { type: String, enum: ['ai_accepted', 'ai_adjusted', 'manual', null], default: null },
  },
}, { timestamps: true });

// Task IDs are unique within a project (e.g. WEB-0001)
TaskSchema.index({ project: 1, taskId: 1 }, { unique: true });

// Generate a readable ID from the project's atomic counter, so deleted IDs are never reused
TaskSchema.pre('save', async function (next) {
  if (!this.taskId) {
    const project = await mongoose.model('Project').findByIdAndUpdate(
      this.project, { $inc: { taskCounter: 1 } }, { new: true }
    );
    if (!project) return next(new Error('Project not found.'));
    this.taskId = `${project.key}-${String(project.taskCounter).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Task', TaskSchema);
