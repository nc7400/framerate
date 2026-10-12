import { useState, useEffect } from 'react';
import { socket } from '../socket';

export default function VotingScreen({ state, myId }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [voted, setVoted] = useState(false);
  const [photoKey, setPhotoKey] = useState(null);

  const isOwner = state.currentPhoto && state.currentPhoto.ownerId === myId;

  // Reset "voted" state whenever a new photo comes up.
  useEffect(() => {
    if (state.currentPhoto && state.currentPhoto.id !== photoKey) {
      setPhotoKey(state.currentPhoto.id);
      setVoted(false);
    }
  }, [state.currentPhoto, photoKey]);

  // Locally-rendered countdown driven off the server's deadline timestamp,
  // not a server-side tick, so this doesn't cause a full re-render every second.
  useEffect(() => {
    if (!state.deadline) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [state.deadline]);

  function handleVote(score) {
    if (voted || isOwner) return;
    socket.emit('submitVote', score);
    setVoted(true);
  }

  if (!state.currentPhoto) {
    return (
      <div className="screen voting-screen">
        <h1>Round {state.currentRound}</h1>
        <p>Loading next photo...</p>
      </div>
    );
  }

  return (
    <div className="screen voting-screen">
      <h1>
        Round {state.currentRound} (×{state.currentRound} points)
      </h1>
      <div className="timer">{secondsLeft}s</div>

      <img className="voting-photo" src={state.currentPhoto.url} alt="Vote on this photo" />

      {isOwner && <p>This is your photo — sit tight while others vote.</p>}

      {!isOwner && !voted && (
        <div className="score-buttons">
          {[1, 2, 3, 4, 5].map((score) => (
            <button key={score} onClick={() => handleVote(score)}>
              {score}
            </button>
          ))}
        </div>
      )}

      {!isOwner && voted && <p>Vote submitted — waiting on everyone else...</p>}
    </div>
  );
}
