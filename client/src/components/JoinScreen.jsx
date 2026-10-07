import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { storeUsername } from '../playerId';

export default function JoinScreen({ myId }) {
  const [username, setUsername] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // If the server rejects the join attempt (or something goes wrong), un-stick
  // the button instead of leaving it on "Joining..." forever.
  useEffect(() => {
    function handleJoinError(message) {
      setSubmitted(false);
      setError(message || 'Could not join — please try again.');
    }
    socket.on('joinError', handleJoinError);
    return () => socket.off('joinError', handleJoinError);
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) return;
    setError('');
    storeUsername(trimmed);
    socket.emit('join', { username: trimmed, playerId: myId });
    setSubmitted(true);
  }

  return (
    <div className="screen join-screen">
      <h1>FrameRate</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter your name"
          value={username}
          maxLength={20}
          onChange={(e) => setUsername(e.target.value)}
          disabled={submitted}
        />
        <button type="submit" disabled={submitted || !username.trim()}>
          {submitted ? 'Joining...' : 'Join Game'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
