const ID_KEY = 'framerate_player_id';
const USERNAME_KEY = 'framerate_username';

// Avoid crypto.randomUUID() here — it's only available in "secure contexts"
// (HTTPS or localhost), and this app is deliberately run over plain HTTP on
// a LAN, where phones would silently fail to generate an id.
function generateId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getStoredPlayerId() {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getStoredUsername() {
  return localStorage.getItem(USERNAME_KEY) || '';
}

export function storeUsername(username) {
  localStorage.setItem(USERNAME_KEY, username);
}
