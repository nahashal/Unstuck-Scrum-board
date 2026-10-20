// Priority colors
export const priorityConfig = {
  High: { bg: 'bg-bubble-100', text: 'text-bubble-700', border: 'border-bubble-200', dot: 'bg-bubble-500' },
  Medium: { bg: 'bg-sun-100', text: 'text-sun-700', border: 'border-sun-200', dot: 'bg-sun-500' },
  Low: { bg: 'bg-mint-100', text: 'text-mint-700', border: 'border-mint-200', dot: 'bg-mint-500' },
};

// Status colors
export const statusConfig = {
  'To Do': { bg: 'bg-sky2-100', text: 'text-sky2-700', dot: 'bg-sky2-500' },
  'In Progress': { bg: 'bg-sun-100', text: 'text-sun-700', dot: 'bg-sun-500' },
  'In Review': { bg: 'bg-brand-100', text: 'text-brand-700', dot: 'bg-brand-500' },
  'Done': { bg: 'bg-mint-100', text: 'text-mint-700', dot: 'bg-mint-500' },
  'Open': { bg: 'bg-bubble-100', text: 'text-bubble-700', dot: 'bg-bubble-500' },
  'Resolved': { bg: 'bg-mint-100', text: 'text-mint-700', dot: 'bg-mint-500' },
};

export const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDateTime = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
};

export const avatarColors = [
  'bg-brand-600', 'bg-bubble-500', 'bg-sky2-500', 'bg-sun-500',
  'bg-mint-500', 'bg-brand-400', 'bg-bubble-400', 'bg-sky2-400',
];

export const getAvatarColor = (name) => {
  if (!name) return avatarColors[0];
  const idx = name.charCodeAt(0) % avatarColors.length;
  return avatarColors[idx];
};
