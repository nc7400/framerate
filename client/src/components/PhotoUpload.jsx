import { useState } from 'react';
import { socket } from '../socket';

export default function PhotoUpload({ state, isHost, myId }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [replacingId, setReplacingId] = useState(null); // which thumbnail is mid-replace

  const myStatus = state.uploadStatus.find((u) => u.id === myId);
  const myCount = myStatus ? myStatus.count : 0;
  const required = myStatus ? myStatus.required : 3;
  const done = myCount >= required;
  const allDone = state.uploadStatus.every((u) => u.count >= u.required);
  const totalUploaded = state.uploadStatus.reduce((sum, u) => sum + u.count, 0);
  const myPhotos = state.myPhotos || [];

  // Sends a photo to the server. With a replaceId it swaps that photo for the new
  // file (same position); without one it's a brand-new upload.
  async function sendPhoto(file, replaceId) {
    setUploading(true);
    setReplacingId(replaceId || null);
    setError('');
    try {
      const formData = new FormData();
      formData.append('photo', file);
      formData.append('playerId', myId);
      if (replaceId) formData.append('replaceId', replaceId);

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
      setReplacingId(null);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file name later
    if (!file) return;
    await sendPhoto(file);
  }

  async function handleReplaceChange(photoId, e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    await sendPhoto(file, photoId);
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
            onChange={handleFileChange}
            disabled={uploading}
            hidden
          />
        </label>
      )}
      {done && <p>You're all set — waiting on other players...</p>}
      {error && <p className="error">{error}</p>}

      {myPhotos.length > 0 && (
        <div className="my-photos">
          <h2>Your photos</h2>
          <ul className="thumb-list">
            {myPhotos.map((photo, i) => (
              <li key={photo.id} className="thumb">
                <img src={photo.url} alt={`Your photo ${i + 1}`} />
                <span className="thumb-label">Photo {i + 1}</span>
                <label className="replace-button">
                  {replacingId === photo.id ? 'Replacing...' : 'Replace'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleReplaceChange(photo.id, e)}
                    disabled={uploading}
                    hidden
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="upload-status-list">
        <h2>Everyone's progress</h2>
        <ul>
          {state.uploadStatus.map((u) => {
            const finished = u.count >= u.required;
            return (
              <li key={u.id} className={finished ? 'upload-done' : 'upload-pending'}>
                {u.username}: {u.count}/{u.required}
              </li>
            );
          })}
        </ul>
      </div>

      {isHost && (
        <div className="start-voting">
          <button
            onClick={() => socket.emit('startVoting')}
            disabled={totalUploaded === 0}
          >
            Start Voting
          </button>
          <p className="hint">
            {allDone
              ? 'Everyone has uploaded their photos.'
              : 'Some players are still uploading. Anyone who isn\'t finished when you start will have fewer photos in the game.'}
          </p>
        </div>
      )}
      {!isHost && allDone && <p>Waiting for the host to start voting...</p>}
    </div>
  );
}
