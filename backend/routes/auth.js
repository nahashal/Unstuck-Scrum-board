const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const router = express.Router();
const TeamMember = require('../models/TeamMember');
const Organization = require('../models/Organization');
const Project = require('../models/Project');
const Team = require('../models/Team');
const Invite = require('../models/Invite');
const PlatformSettings = require('../models/PlatformSettings');
const { requireAuth, signSession, clearSession, applyPlatformBootstrap } = require('../middleware/auth');
const { projectRoleFor } = require('../middleware/permissions');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Simple in-memory limiter for sign-in attempts (per IP + email)
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
function tooManyAttempts(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.start > WINDOW_MS) {
    attempts.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

const { hashToken } = require('../lib/invites');

// Everything the frontend needs to know about the signed-in member and what they can access
async function sessionPayload(member) {
  const org = member.organization ? await Organization.findById(member.organization).lean() : null;
  let projects = [];
  if (org) {
    const query = member.orgRole === 'org_admin'
      ? { organization: org._id }
      : { organization: org._id, 'members.member': member._id };
    const docs = await Project.find(query).populate('team', 'name').sort({ name: 1 });
    projects = docs.map(p => ({
      _id: p._id, name: p.name, key: p.key, status: p.status, team: p.team,
      role: projectRoleFor(member, p),
    }));
  }
  return {
    _id: member._id,
    name: member.name,
    role: member.role,
    email: member.email,
    avatar: member.avatar,
    platformRole: member.platformRole,
    orgRole: member.orgRole,
    organization: org ? { _id: org._id, name: org.name, status: org.status, settings: org.settings } : null,
    projects,
    lastProject: member.lastProject,
  };
}

function validatePassword(password) {
  if ((password || '').length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  return null;
}

// POST /api/auth/register — creates a new organization; the creator becomes its Org Admin
router.post('/register', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const jobTitle = (req.body.role || '').trim();
    const orgName = (req.body.organizationName || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });
    if (!orgName) return res.status(400).json({ success: false, message: 'Organization name is required.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ success: false, message: pwError });

    const settings = await PlatformSettings.get();
    const isBootstrapAdmin = (process.env.PLATFORM_ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim()).includes(email);
    if (!settings.allowOrgSignup && !isBootstrapAdmin) {
      return res.status(403).json({ success: false, message: 'New organizations are not being accepted right now. Ask your organization admin for an invite link.' });
    }

    if (await TeamMember.exists({ email })) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const member = await TeamMember.create({ name, role: jobTitle, email, passwordHash, orgRole: 'org_admin' });
    const org = await Organization.create({ name: orgName, createdBy: member._id });
    member.organization = org._id;
    await member.save();
    await applyPlatformBootstrap(member);

    signSession(res, member._id);
    res.status(201).json({ success: true, data: await sessionPayload(member) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required.' });

    if (tooManyAttempts(`${req.ip}|${email}`)) {
      return res.status(429).json({ success: false, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
    }

    const member = await TeamMember.findOne({ email }).select('+passwordHash');
    // Same message for unknown email and wrong password, so accounts can't be probed
    const ok = member && await bcrypt.compare(password, member.passwordHash);
    if (!ok) return res.status(401).json({ success: false, message: 'Incorrect email or password.' });
    if (member.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact your organization admin.' });
    }
    await applyPlatformBootstrap(member);
    const org = member.organization ? await Organization.findById(member.organization) : null;
    if (org?.status === 'suspended' && member.platformRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Your organization has been suspended. Please contact the platform administrator.' });
    }

    attempts.delete(`${req.ip}|${email}`);
    signSession(res, member._id);
    res.json({ success: true, data: await sessionPayload(member) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ success: true });
});

// GET /api/auth/me — the signed-in member, their organization, roles and projects
router.get('/me', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, data: await sessionPayload(req.user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/auth/me — own name, job title and last-opened project
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const { name, role, lastProject } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
      req.user.name = name.trim();
    }
    if (role !== undefined) req.user.role = role.trim();
    if (lastProject !== undefined) {
      if (lastProject) {
        const project = mongoose.isValidObjectId(lastProject) ? await Project.findById(lastProject) : null;
        if (!project || !projectRoleFor(req.user, project)) {
          return res.status(400).json({ success: false, message: 'Project not found.' });
        }
      }
      req.user.lastProject = lastProject || null;
    }
    await req.user.save();
    res.json({ success: true, data: await sessionPayload(req.user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/organization — an account without an organization (e.g. created before organizations existed,
// or removed from its old one) starts a new organization and becomes its Org Admin
router.post('/organization', requireAuth, async (req, res) => {
  try {
    if (req.user.organization) return res.status(400).json({ success: false, message: 'You already belong to an organization.' });
    const orgName = String(req.body.organizationName || '').trim();
    if (!orgName) return res.status(400).json({ success: false, message: 'Organization name is required.' });
    const settings = await PlatformSettings.get();
    if (!settings.allowOrgSignup && req.user.platformRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'New organizations are not being accepted right now. Ask an organization admin for an invite.' });
    }
    const org = await Organization.create({ name: orgName, createdBy: req.user._id });
    req.user.organization = org._id;
    req.user.orgRole = 'org_admin';
    req.user.status = 'active';
    await req.user.save();
    res.status(201).json({ success: true, data: await sessionPayload(req.user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Finds a usable invite by its raw token, or explains why it can't be used
async function findUsableInvite(token) {
  if (!token || typeof token !== 'string') return { error: 'This invite link is invalid.' };
  const invite = await Invite.findOne({ tokenHash: hashToken(token) })
    .populate('organization', 'name status')
    .populate('invitedBy', 'name')
    .populate('projectRoles.project', 'name key');
  if (!invite || invite.revokedAt) return { error: 'This invite link is invalid or has been revoked.' };
  if (invite.acceptedAt) return { error: 'This invite has already been used. Please sign in instead.' };
  if (invite.expiresAt < new Date()) return { error: 'This invite link has expired. Ask your admin for a new one.' };
  if (invite.organization?.status !== 'active') return { error: 'This organization is not accepting new members right now.' };
  return { invite };
}

// GET /api/auth/invites/:token — preview an invite before accepting it
router.get('/invites/:token', async (req, res) => {
  try {
    const { invite, error } = await findUsableInvite(req.params.token);
    if (error) return res.status(400).json({ success: false, message: error });
    res.json({
      success: true,
      data: {
        email: invite.email,
        organization: invite.organization.name,
        invitedBy: invite.invitedBy?.name,
        orgRole: invite.orgRole,
        projectRoles: invite.projectRoles.filter(p => p.project).map(p => ({ project: p.project.name, key: p.project.key, role: p.role })),
        expiresAt: invite.expiresAt,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/invites/:token/accept — create the account with the roles the invite grants
router.post('/invites/:token/accept', async (req, res) => {
  try {
    const { invite, error } = await findUsableInvite(req.params.token);
    if (error) return res.status(400).json({ success: false, message: error });

    const name = (req.body.name || '').trim();
    const jobTitle = (req.body.role || '').trim();
    const password = req.body.password || '';
    if (!name) return res.status(400).json({ success: false, message: 'Name is required.' });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ success: false, message: pwError });
    if (await TeamMember.exists({ email: invite.email })) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
    }

    // Claim the invite first so the same link can't create two accounts
    const claimed = await Invite.findOneAndUpdate(
      { _id: invite._id, acceptedAt: null, revokedAt: null },
      { acceptedAt: new Date() },
      { new: true }
    );
    if (!claimed) return res.status(400).json({ success: false, message: 'This invite has already been used.' });

    let member;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      member = await TeamMember.create({
        name, role: jobTitle, email: invite.email, passwordHash,
        organization: invite.organization._id, orgRole: invite.orgRole,
      });
    } catch (createErr) {
      // Release the invite so the person can try again
      await Invite.updateOne({ _id: invite._id }, { acceptedAt: null });
      throw createErr;
    }
    await applyPlatformBootstrap(member);

    if (invite.teams.length) {
      await Team.updateMany({ _id: { $in: invite.teams }, organization: invite.organization._id }, { $addToSet: { members: member._id } });
    }
    for (const pr of invite.projectRoles) {
      if (!pr.project) continue;
      await Project.updateOne(
        { _id: pr.project._id, organization: invite.organization._id, 'members.member': { $ne: member._id } },
        { $push: { members: { member: member._id, role: pr.role } } }
      );
    }

    signSession(res, member._id);
    res.status(201).json({ success: true, data: await sessionPayload(member) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please sign in.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.hashToken = hashToken;
module.exports.sessionPayload = sessionPayload;
