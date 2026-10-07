import { useState, useEffect } from 'react';
import { socket } from '../socket';

const DURATION_OPTIONS = [5, 10, 15, 20];

export default function Lobby({ state, isHost, isBetweenRounds }) {
  const [rounds, setRounds] = useState(state.totalRounds);
  const [duration, setDuration] = useState(state.voteDuration);

  // Keep local controls in sync if settings change from elsewhere.
  useEffect(() => setRounds(state.totalRounds), [state.totalRounds]);
  useEffect(() => setDuration(state.voteDuration), [state.voteDuration]);

  function applySettings(nextRounds, nextDuration) {
    socket.emit('setSettings', { totalRounds: nextRounds, voteDuration: nextDuration });
  }

  function handleStart() {
    socket.emit('startGame');
  }

  return (
    <div className="screen lobby-screen">
      <h1>{isBetweenRounds ? `Round ${state.currentRound} complete!` : 'Lobby'}</h1>

      <div className="player-list">
        <h2>Players ({state.players.length}/10)</h2>
        <ul>
          {state.players.map((p) => (
            <li key={p.id} className={!p.connected ? 'disconnected' : ''}>
              {p.username}
              {p.isHost ? ' (Host)' : ''}
              {!p.connected ? ' — disconnected' : ''}
            </li>
          ))}
        </ul>
      </div>

      {isHost && (
        <div className="host-controls">
          <h2>Host Settings</h2>
          <label>
            Rounds:{' '}
            <input
              type="number"
              min={1}
              max={5}
              value={rounds}
              disabled={!isHost}
              onChange={(e) => {
                const val = Number(e.target.value);
                setRounds(val);
                applySettings(val, duration);
              }}
            />
          </label>

          <label>
            Vote timer:{' '}
            <select
              value={duration}
              onChange={(e) => {
                const val = Number(e.target.value);
                setDuration(val);
                applySettings(rounds, val);
              }}
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} seconds
                </option>
              ))}
            </select>
          </label>

          <button onClick={handleStart} disabled={state.players.length < 1}>
            {isBetweenRounds ? 'Start Next Round' : 'Start Game'}
          </button>
        </div>
      )}

      {!isHost && <p>Waiting for the host to start the game...</p>}
    </div>
  );
}
