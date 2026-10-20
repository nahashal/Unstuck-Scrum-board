// Local development server. On Vercel the same app runs as a serverless function (see /api/index.js).
const app = require('./app');
const { connectDB, MONGO_URI } = app;

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET is missing from backend/.env. Sign-in cannot work without it.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

connectDB()
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
