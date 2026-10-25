const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { webURL } = require('./policy.cjs');
function validateSession(value) {
  if (
    !value ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.id) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 64 ||
    !Array.isArray(value.urls) ||
    !value.urls.length ||
    value.urls.length > 32 ||
    !Number.isInteger(value.active) ||
    value.active < 0 ||
    value.active >= value.urls.length ||
    typeof value.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.updatedAt))
  )
    throw Error('Invalid saved session');
  return {
    id: value.id,
    name: value.name.trim(),
    urls: value.urls.map(url => {
      if (typeof url !== 'string' || !/^https?:/.test(url)) throw Error('Sessions may contain only web addresses');
      return webURL(url);
    }),
    active: value.active,
    updatedAt: value.updatedAt
  };
}
function loadSessions(base) {
  const file = path.join(base, 'sessions.json');
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) throw Error('Invalid session store');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.schema !== 1 || !Array.isArray(data.sessions) || data.sessions.length > 20)
      throw Error('Invalid session store');
    const sessions = data.sessions.map(validateSession);
    if (new Set(sessions.map(s => s.id)).size !== sessions.length) throw Error('Duplicate saved sessions');
    return sessions;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
function writeSessions(base, sessions) {
  fs.mkdirSync(base, { recursive: true });
  const target = path.join(base, 'sessions.json'),
    temporary = target + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify({ schema: 1, sessions }), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
function saveSession(base, name, urls, active) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 64)
    throw Error('Give the session a name (up to 64 characters)');
  if (!Array.isArray(urls) || !urls.length) throw Error('Open at least one webpage before saving a session');
  const sessions = loadSessions(base),
    existing = sessions.find(s => s.name === name.trim());
  const session = validateSession({
    id: existing?.id || randomUUID(),
    name: name.trim(),
    urls,
    active,
    updatedAt: new Date().toISOString()
  });
  if (existing) sessions[sessions.indexOf(existing)] = session;
  else {
    if (sessions.length >= 20) throw Error('Delete a saved session first (20-session limit)');
    sessions.push(session);
  }
  writeSessions(base, sessions);
  return session;
}
function removeSession(base, id) {
  const sessions = loadSessions(base);
  if (!sessions.some(s => s.id === id)) throw Error('Unknown saved session');
  writeSessions(
    base,
    sessions.filter(s => s.id !== id)
  );
}
module.exports = { validateSession, loadSessions, saveSession, removeSession };
