// The Express app, shared by the local server (server.js) and the Vercel function (api/index.js)
// Locally, settings come from backend/.env; on Vercel, from the project's Environment Variables
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('./middleware/auth');
const { loadProject } = require('./middleware/permissions');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/scrumboard';

// One connection reused across requests (and across warm serverless invocations)
let connecting = null;
function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!connecting) {
    connecting = mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .catch(err => { connecting = null; throw err; });
  }
  return connecting;
}

const app = express();
// Behind Vercel's proxy: trust X-Forwarded-* so req.ip and secure cookies work
app.set('trust proxy', 1);

// ─── Middleware ──────────────────────────────────────────────────────────────
// In production the frontend and API share one origin, so CORS only matters for local dev
// or a separately hosted frontend listed in CORS_ORIGINS (comma-separated).
const allowedOrigins = ['http://localhost:5173', ...(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check stays public and reports configuration problems without exposing values
app.get('/api/health', async (req, res) => {
  let db = 'disconnected';
  try { await connectDB(); db = 'connected'; } catch { /* reported below */ }
  res.json({
    status: 'ok',
    db,
    config: {
      mongodbUri: !!process.env.MONGODB_URI,
      jwtSecret: !!process.env.JWT_SECRET,
      geminiKey: !!process.env.GEMINI_API_KEY,
    },
    timestamp: new Date().toISOString()
  });
});

// Every other API request needs the sign-in secret and a database connection
app.use('/api', async (req, res, next) => {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'Server is missing JWT_SECRET. Add it to the environment variables.' });
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    res.status(503).json({ success: false, message: 'The database is unavailable right now. Please try again shortly.' });
  }
});

// ─── Routes ──────────────────────────────────────────────────────────────────
// Public: sign-up, sign-in, sign-out
app.use('/api/auth', require('./routes/auth'));

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

module.exports = app;
module.exports.connectDB = connectDB;
module.exports.MONGO_URI = MONGO_URI;
