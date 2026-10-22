// Shared by Organization Admins (routes/org.js) and Platform Admins (routes/platform.js):
// issuing one-time invite links and emailing them.
const crypto = require('crypto');
const { isEmailConfigured, sendEmail, inviteEmail } = require('./email');

const INVITE_DAYS = 7;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const inviteExpiry = () => new Date(Date.now() + INVITE_DAYS * 86400000);

const isLocal = (url) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url || '');

// Where invite links point
const appUrl = (req) => {
  // 1. An explicitly configured public address (ignored if it's a leftover localhost value)
  const configuredUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (configuredUrl && !isLocal(configuredUrl)) return configuredUrl;
  // 2. On Vercel: the project's production domain, not the per-deployment URL the admin may be on
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  // 3. Otherwise the site the admin is using
  const origin = (req.get('origin') || '').replace(/\/$/, '');
  if (/^https?:\/\/[^/\s]+$/i.test(origin)) return origin;
  const host = req.get('x-forwarded-host') || req.get('host');
  const fromHost = host && !host.startsWith('localhost:5000') ? `${req.protocol}://${host}` : '';
  if (configuredUrl && !(isLocal(configuredUrl) && fromHost && !isLocal(fromHost))) return configuredUrl;
  return fromHost || 'http://localhost:5173';
};

const inviteLink = (req, token) => `${appUrl(req)}/?invite=${token}`;

// Emails the invite link through Brevo when configured; records the outcome on the invite.
// Returns { configured, sent, error } — the link is always returned too, so a failed email never blocks inviting.
async function deliverInvite({ invite, link, orgName, inviterName }) {
  if (!isEmailConfigured()) return { configured: false, sent: false, error: null };
  await invite.populate('projectRoles.project', 'name');
  try {
    const { subject, html, text } = inviteEmail({
      orgName,
      inviterName,
      link,
      orgRole: invite.orgRole,
      projectRoles: invite.projectRoles.filter(pr => pr.project).map(pr => ({ projectName: pr.project.name, role: pr.role })),
      expiresAt: invite.expiresAt,
    });
    await sendEmail({ to: invite.email, subject, html, text });
    invite.emailSentAt = new Date();
    invite.emailError = null;
    await invite.save();
    return { configured: true, sent: true, error: null };
  } catch (err) {
    console.warn(`[Email] Invite to ${invite.email} failed: ${err.message}`);
    invite.emailError = err.message.slice(0, 300);
    await invite.save();
    return { configured: true, sent: false, error: err.message };
  }
}

module.exports = { INVITE_DAYS, hashToken, newToken, inviteExpiry, appUrl, inviteLink, deliverInvite };
