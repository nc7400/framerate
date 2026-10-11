import { useState } from 'react';
import { socket } from '../socket';

export default function PhotoUpload({ state, isHost, myId }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const myStatus = state.uploadStatus.find((u) => u.id === myId);
  const myCount = myStatus ? myStatus.count : 0;
  const required = myStatus ? myStatus.required : 3;
  const done = myCount >= required;

  async function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file name later
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('playerId', myId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="screen upload-screen">
      <h1>Round {state.currentRound}: Upload Your Photos</h1>
      <p>
        {myCount} / {required} uploaded
      </p>

      {!done && (
        <label className="upload-button">
          {uploading ? 'Uploading...' : 'Choose Photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            disabled={uploading}
            hidden
          />
        </label>
      )}
      {done && <p>You're all set — waiting on other players...</p>}
      {error && <p className="error">{error}</p>}

      <div className="upload-status-list">
        <h2>Everyone's progress</h2>
        <ul>
          {state.uploadStatus.map((u) => (
            <li key={u.id}>
              {u.username}: {u.count}/{u.required}
            </li>
          ))}
        </ul>
      </div>

      {isHost && (
        <button
          className="force-start"
          onClick={() => socket.emit('forceStartVoting')}
        >
          Start voting now (skip stragglers)
        </button>
      )}
    </div>
  );
}
