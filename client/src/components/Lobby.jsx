import { useState, useEffect } from 'react';
import { socket } from '../socket';

const DURATION_OPTIONS = [5, 10, 15, 20];
const PHOTO_OPTIONS = [1, 2, 3, 4, 5];
const ROUND_OPTIONS = [1, 2, 3, 4, 5];

export default function Lobby({ state, isHost, myId }) {
  const me = state.players.find((p) => p.id === myId);
  const [newName, setNewName] = useState(me ? me.username : '');
  const [nameError, setNameError] = useState('');
  const [rounds, setRounds] = useState(state.totalRounds);
  const [duration, setDuration] = useState(state.voteDuration);
  const [photos, setPhotos] = useState(state.photosPerRound);

  // Keep local controls in sync if settings change from elsewhere.
  useEffect(() => setRounds(state.totalRounds), [state.totalRounds]);
  useEffect(() => setDuration(state.voteDuration), [state.voteDuration]);
  useEffect(() => setPhotos(state.photosPerRound), [state.photosPerRound]);

  // Show the server's reason if a rename is rejected (e.g. name already taken).
  useEffect(() => {
    function handleJoinError(message) {
      setNameError(message);
    }
    socket.on('joinError', handleJoinError);
    return () => socket.off('joinError', handleJoinError);
  }, []);

  function handleRename(e) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || (me && trimmed === me.username)) return;
    setNameError('');
    // Re-sending 'join' with our existing playerId renames us on the server.
    // The new name is saved locally once the server confirms it (see App.jsx).
    socket.emit('join', { username: trimmed, playerId: myId });
  }

  function applySettings(nextRounds, nextDuration, nextPhotos) {
    socket.emit('setSettings', {
      totalRounds: nextRounds,
      voteDuration: nextDuration,
      photosPerRound: nextPhotos,
    });
  }

function handleStart() {
  socket.emit('startGame', {
    totalRounds: rounds,
    voteDuration: duration,
    photosPerRound: photos,
  });
}

  function handleLeave() {
    if (confirm('Leave the game? You will be removed from the player list.')) {
      socket.emit('leaveGame');
    }
  }

  function handleKick(player) {
    if (confirm(`Remove ${player.username} from the game?`)) {
      socket.emit('kickPlayer', player.id);
    }
  }

  return (
    <div className="screen lobby-screen">
      <h1>Lobby</h1>

      <form className="rename-form" onSubmit={handleRename}>
        <label>
          Your name:
          <input
            type="text"
            value={newName}
            maxLength={20}
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={!newName.trim() || (me && newName.trim() === me.username)}
        >
          Change Name
        </button>
        {nameError && <p className="error">{nameError}</p>}
      </form>

      <div className="player-list">
        <h2>Players ({state.players.length}/10)</h2>
        <ul>
          {state.players.map((p) => (
            <li key={p.id} className={!p.connected ? 'disconnected' : ''}>
              <span>
                {p.username}
                {p.isHost ? ' (Host)' : ''}
                {!p.connected ? ' — disconnected' : ''}
              </span>
              {isHost && !p.isHost && (
                <button className="kick-button" onClick={() => handleKick(p)}>
                  Kick
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost && (
        <div className="host-controls">
          <h2>Host Settings</h2>
          <label>
            Rounds:{' '}
            <select
              value={rounds}
              onChange={(e) => {
                const val = Number(e.target.value);
                setRounds(val);
                applySettings(val, duration, photos);
            }}
            >
              {ROUND_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>

          <label>
            Vote timer:{' '}
            <select
              value={duration}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDuration(val);
                applySettings(rounds, val, photos);
              }}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} seconds
                </option>
              ))}
            </select>
          </label>

          <label>
            Photos per player each round:{' '}
            <select
              value={photos}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPhotos(val);
                applySettings(rounds, duration, val);
              }}
            >
              {PHOTO_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button onClick={handleStart} disabled={state.players.length < 1}>
            Start Game
          </button>
        </div>
      )}

      {!isHost && <p>Waiting for the host to start the game...</p>}

      <button className="leave-button" onClick={handleLeave}>
        Leave Game
      </button>
    </div>
  );
}
