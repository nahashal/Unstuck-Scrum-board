const jwt = require('jsonwebtoken');
const TeamMember = require('../models/TeamMember');
const Organization = require('../models/Organization');

const COOKIE_NAME = 'unstuck_session';
const SESSION_DAYS = 7;

// Emails listed in PLATFORM_ADMIN_EMAILS (comma-separated) are Platform Admins
const platformAdminEmails = () =>
  (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

async function applyPlatformBootstrap(member) {
  if (member.platformRole !== 'admin' && platformAdminEmails().includes(member.email)) {
    member.platformRole = 'admin';
    await member.save();
  }
  return member;
}

function signSession(res, memberId) {
  const token = jwt.sign({ sub: memberId.toString() }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  // httpOnly keeps the token away from page scripts
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

// Rejects the request unless it carries a valid session for an active member; sets req.user and req.org.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ success: false, message: 'Please sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const member = await TeamMember.findById(payload.sub);
    if (!member || member.status !== 'active') {
      clearSession(res);
      return res.status(401).json({ success: false, message: 'Your account is not active. Please contact your organization admin.' });
    }
    await applyPlatformBootstrap(member);
    req.user = member;
    req.org = member.organization ? await Organization.findById(member.organization) : null;
    // A suspended organization blocks its members (Platform Admins keep platform access)
    if (req.org?.status === 'suspended' && member.platformRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Your organization has been suspended. Please contact the platform administrator.' });
    }
    next();
  } catch {
    clearSession(res);
    res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
  }
}

module.exports = { requireAuth, signSession, clearSession, applyPlatformBootstrap };
