import { socket } from '../socket';
import { groupByRank, rankLabel } from '../ranking';

export default function BetweenRounds({ state, isHost }) {
  const groups = groupByRank(state.players);

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
        {groups.map((group) => (
          <li key={group.rank}>
            <span className="rank">{rankLabel(group.rank)}</span>
            <span className="name">
              {group.members.map((p) => (
                <span key={p.id} className="member">
                  {p.username}
                  {p.isHost ? ' (Host)' : ''}
                  {!p.connected ? ' — disconnected' : ''}
                  {isHost && !p.isHost && (
                    <button className="kick-button" onClick={() => handleKick(p)}>
                      Kick
                    </button>
                  )}
                </span>
              ))}
            </span>
            <span className="score">{group.totalScore} pts</span>
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
