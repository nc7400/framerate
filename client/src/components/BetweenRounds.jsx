import { socket } from '../socket';

export default function BetweenRounds({ state, isHost }) {
  const standings = [...state.players].sort((a, b) => b.totalScore - a.totalScore);

  function handleKick(player) {
    if (confirm(`Remove ${player.username} from the game?`)) {
      socket.emit('kickPlayer', player.id);
    }
  }

  function handleStartNextRound() {
    socket.emit('startGame');
  }

  function handleEndGame() {
    if (confirm('End the game now and show final results?')) {
      socket.emit('endGame');
    }
  }

  return (
    <div className="screen between-rounds-screen">
      <h1>Round {state.currentRound} complete!</h1>
      <h2>Standings</h2>

      <ol className="leaderboard">
        {standings.map((p, i) => (
          <li key={p.id}>
            <span className="rank">#{i + 1}</span>
            <span className="name">
              {p.username}
              {p.isHost ? ' (Host)' : ''}
              {!p.connected ? ' — disconnected' : ''}
            </span>
            <span className="score">{p.totalScore} pts</span>
            {isHost && !p.isHost && (
              <button className="kick-button" onClick={() => handleKick(p)}>
                Kick
              </button>
            )}
          </li>
        ))}
      </ol>

      {isHost && (
        <div className="host-controls">
          <button onClick={handleStartNextRound}>Start Next Round</button>
          <button className="end-game-button-inline" onClick={handleEndGame}>
            End Game
          </button>
        </div>
      )}

      {!isHost && <p>Waiting for the host to start the next round...</p>}
    </div>
  );
}
