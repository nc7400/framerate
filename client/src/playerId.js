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

// Used when the server rejects a name (e.g. already taken), so a refresh
// doesn't keep retrying the rejected name.
export function clearStoredUsername() {
  localStorage.removeItem(USERNAME_KEY);
}

// Used when a player is kicked by the host — clears the saved identity so a
// future visit starts fresh (a new player) rather than silently trying to
// rejoin as the same, now-removed, player.
export function clearStoredIdentity() {
  localStorage.removeItem(ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
}
