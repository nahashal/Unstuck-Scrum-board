// Transactional email through Brevo (https://developers.brevo.com/reference/sendtransacemail).
// Configure BREVO_API_KEY and BREVO_SENDER_EMAIL (a sender verified in Brevo); BREVO_SENDER_NAME is optional.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

const isEmailConfigured = () => !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sends one email; resolves to { messageId } or throws an Error with a readable message
async function sendEmail({ to, toName, subject, html, text }) {
  if (!isEmailConfigured()) throw new Error('Email is not set up on the server (BREVO_API_KEY / BREVO_SENDER_EMAIL).');
  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || 'Unstuck' },
      to: [{ email: to, ...(toName ? { name: toName } : {}) }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  let body = {};
  try { body = await res.json(); } catch { /* Brevo returns JSON; tolerate empty bodies */ }
  if (!res.ok) {
    // Brevo explains problems in `message` (e.g. unverified sender, invalid key)
    throw new Error(body.message || `Brevo responded with ${res.status}.`);
  }
  return { messageId: body.messageId };
}

const ROLE_NAMES = { org_admin: 'Organization Admin', member: 'Member', project_admin: 'Project Admin', scrum_master: 'Scrum Master', developer: 'Developer' };

// The invitation email: organization, who invited them, their roles and the one-time link
function inviteEmail({ orgName, inviterName, link, orgRole, projectRoles = [], expiresAt }) {
  const roles = [
    ROLE_NAMES[orgRole] || 'Member',
    ...projectRoles.map(pr => `${ROLE_NAMES[pr.role] || pr.role} on ${pr.projectName}`),
  ];
  const expires = new Date(expiresAt).toDateString();
  const subject = `${inviterName} invited you to ${orgName} on Unstuck`;
  const text = [
    `${inviterName} invited you to join ${orgName} on Unstuck.`,
    `Your role: ${roles.join(', ')}.`,
    '',
    `Accept the invite and set your password: ${link}`,
    '',
    `This link works once and expires on ${expires}. If you weren't expecting it, you can ignore this email.`,
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f1;font-family:Inter,Arial,sans-serif;color:#17172b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;border-top:6px solid #ffd84d;padding:32px">
      <tr><td>
        <p style="margin:0 0 4px;font-size:22px;font-weight:800">Unstuck</p>
        <p style="margin:0 0 24px;font-size:13px;color:#64748b">From blockers to breakthroughs</p>
        <p style="margin:0 0 12px;font-size:16px"><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(orgName)}</strong>.</p>
        <p style="margin:0 0 24px;font-size:14px;color:#475569">Your role: ${roles.map(escapeHtml).join(', ')}</p>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#7b2ff7;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px">Accept invite</a>
        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">Or paste this link into your browser:<br><span style="word-break:break-all;color:#64748b">${escapeHtml(link)}</span></p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">This link works once and expires on ${escapeHtml(expires)}. If you weren't expecting it, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, text, html };
}

module.exports = { isEmailConfigured, sendEmail, inviteEmail };
