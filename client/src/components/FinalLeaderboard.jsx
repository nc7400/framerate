import { socket } from '../socket';
import { groupByRank, rankLabel } from '../ranking';

export default function FinalLeaderboard({ state, isHost }) {
  const groups = groupByRank(state.leaderboard);
  const winnerPhotos = state.winnerPhotos || [];
  const roundBreakdown = state.roundBreakdown || [];

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
            {photo.points} points (round {photo.round})
          </p>
        </div>
      ))}

      {roundBreakdown.length > 0 && (
        <div className="round-breakdown">
          <h2>Round by round</h2>
          {roundBreakdown.map((entry) => (
            <div className="breakdown-round" key={entry.round}>
              <h3>Round {entry.round}</h3>
              {entry.photos.length === 0 ? (
                <p className="hint">No rated photos this round.</p>
              ) : (
                <div className={entry.photos.length > 1 ? 'best-photo-grid tie' : 'best-photo-grid'}>
                  {entry.photos.map((photo) => (
                    <div className="best-photo-item" key={photo.url}>
                      <p className="points">{photo.ownerUsername}</p>
                      <p className="hint">{photo.points} points</p>
                      <img
                        className="result-photo"
                        src={photo.url}
                        alt={`${photo.ownerUsername}'s best photo of round ${entry.round}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isHost && (
        <button onClick={() => socket.emit('newGame')}>Start New Game</button>
      )}
      {!isHost && <p>Waiting for the host to start a new game...</p>}
    </div>
  );
}
