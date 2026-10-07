import { socket } from '../socket';

export default function FinalLeaderboard({ state, isHost }) {
  return (
    <div className="screen leaderboard-screen">
      <h1>Final Results</h1>
      <ol className="leaderboard">
        {state.leaderboard.map((p, i) => (
          <li key={p.username + i}>
            <span className="rank">#{i + 1}</span>
            <span className="name">{p.username}</span>
            <span className="score">{p.totalScore} pts</span>
          </li>
        ))}
      </ol>

      {isHost && (
        <button onClick={() => socket.emit('newGame')}>Start New Game</button>
      )}
      {!isHost && <p>Waiting for the host to start a new game...</p>}
    </div>
  );
}
