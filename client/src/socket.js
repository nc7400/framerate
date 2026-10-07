import { io } from 'socket.io-client';

// One shared socket for the whole app. Created once, reused everywhere,
// so React re-renders (or StrictMode's double-invoke in dev) don't spawn
// duplicate connections. Player identity is NOT this socket's id — that
// changes on every reconnect. See playerId.js for the persistent identity.
export const socket = io({ autoConnect: true });
