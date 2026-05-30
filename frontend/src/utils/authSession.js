const SESSION_KEY = 'user';

let accessToken = '';

function safeParseUser() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getStoredUser() {
  const user = safeParseUser();
  if (!user) return null;
  const { access_token, token, ...safeUser } = user;
  if (access_token || token) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
  }
  localStorage.removeItem('user');
  localStorage.removeItem('admin_token');
  localStorage.removeItem('adminToken');
  return safeUser;
}

export function getAccessToken() {
  return accessToken;
}

export function setAuthSession(userData = {}, token = '') {
  const nextToken = token || userData.access_token || userData.token || '';
  const { access_token, token: legacyToken, ...safeUser } = userData;
  accessToken = nextToken;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
  localStorage.removeItem('user');
  localStorage.removeItem('admin_token');
  localStorage.removeItem('adminToken');
  return safeUser;
}

export function clearAuthSession() {
  accessToken = '';
  localStorage.removeItem('user');
  localStorage.removeItem('admin_token');
  localStorage.removeItem('adminToken');
  sessionStorage.removeItem(SESSION_KEY);
}
