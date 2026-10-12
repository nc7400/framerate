import { socket } from '../socket';
import { groupByRank, rankLabel } from '../ranking';

export default function FinalLeaderboard({ state, isHost }) {
  const groups = groupByRank(state.leaderboard);
  const winnerPhotos = state.winnerPhotos || [];

  return (
    <div className="screen leaderboard-screen">
      <h1>Final Results</h1>
      <ol className="leaderboard">
        {groups.map((group) => (
          <li key={group.rank}>
            <span className="rank">{rankLabel(group.rank)}</span>
            <span className="name">
              {group.members.map((m) => (
                <span key={m.username} className="member">
                  {m.username}
                </span>
              ))}
            </span>
            <span className="score">{group.totalScore} pts</span>
          </li>
        ))}
      </ol>

      {winnerPhotos.map((photo) => (
        <div className="best-photo" key={photo.username}>
          <h2>{photo.username}'s best-rated photo</h2>
          <img className="result-photo" src={photo.url} alt={`${photo.username}'s best photo`} />
          <p className="hint">
            Average rating {photo.average.toFixed(1)}/5 (round {photo.round})
          </p>
        </div>
      ))}

      {isHost && (
        <button onClick={() => socket.emit('newGame')}>Start New Game</button>
      )}
      {!isHost && <p>Waiting for the host to start a new game...</p>}
    </div>
  );
}
