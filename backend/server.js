require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('./middleware/auth');
const { loadProject } = require('./middleware/permissions');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is missing from backend/.env. Sign-in cannot work without it.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Routes ──────────────────────────────────────────────────────────────────
// Public: sign-up, sign-in, sign-out
app.use('/api/auth', require('./routes/auth'));

// Health check stays public
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Everything else requires a signed-in team member
app.use('/api', requireAuth);

// Platform and organization administration
app.use('/api/platform', require('./routes/platform'));
app.use('/api/org', require('./routes/org'));

// Everything inside a project: membership and role are checked by loadProject
const projectRouter = express.Router({ mergeParams: true });
projectRouter.use('/tasks', require('./routes/tasks'));
projectRouter.use('/updates', require('./routes/updates'));
projectRouter.use('/evening', require('./routes/evening'));
projectRouter.use('/blockers', require('./routes/blockers'));
projectRouter.use('/actions', require('./routes/actions'));
projectRouter.use('/sprints', require('./routes/sprints'));
projectRouter.use('/comments', require('./routes/comments'));
projectRouter.use('/standup', require('./routes/standup'));
projectRouter.use('/dashboard', require('./routes/dashboard'));
projectRouter.use('/ai', require('./routes/ai'));
// Project details/settings last: its admin-only section applies to the remaining paths
projectRouter.use('/', require('./routes/projectSettings'));
app.use('/api/projects/:projectId', loadProject, projectRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scrumboard';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log(`✅ MongoDB connected: ${MONGO_URI.replace(/\/\/([^:@/]+):[^@]*@/, '//$1:****@')}`);
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
