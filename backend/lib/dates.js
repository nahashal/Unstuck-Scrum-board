// Day boundaries in the server's local time zone
const dayKey = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Parses YYYY-MM-DD (or defaults to today) into { key, start, end }
function dayRange(key) {
  const k = /^\d{4}-\d{2}-\d{2}$/.test(key || '') ? key : dayKey();
  const [y, m, d] = k.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { key: k, start, end };
}

module.exports = { dayKey, dayRange };
