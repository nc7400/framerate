import { useState, useEffect } from 'react';
import { socket } from './socket';
import { getStoredPlayerId, getStoredUsername, storeUsername, clearStoredIdentity } from './playerId';
import JoinScreen from './components/JoinScreen';
import Lobby from './components/Lobby';
import BetweenRounds from './components/BetweenRounds';
import PhotoUpload from './components/PhotoUpload';
import VotingScreen from './components/VotingScreen';
import PhotoResult from './components/PhotoResult';
import FinalLeaderboard from './components/FinalLeaderboard';
import './App.css';

export default function App() {
  const [state, setState] = useState(null);
  const [myId] = useState(getStoredPlayerId); // stable for the life of this browser, not tied to socket.id
  const [kicked, setKicked] = useState(false);
  const [left, setLeft] = useState(false);

  useEffect(() => {
    function attemptAutoRejoin() {
      const storedUsername = getStoredUsername();
      if (storedUsername) {
        socket.emit('join', { username: storedUsername, playerId: myId });
      }
    }
    function handleJoined({ username }) {
      storeUsername(username);
    }
    function handleState(nextState) {
      setState(nextState);
    }
    function handleKicked() {
      clearStoredIdentity();
      setKicked(true);
    }
    function handleLeft() {
      clearStoredIdentity();
      setLeft(true);
    }

    socket.on('connect', attemptAutoRejoin);
    socket.on('joined', handleJoined);
    socket.on('state', handleState);
    socket.on('kicked', handleKicked);
    socket.on('left', handleLeft);
    // Note: 'joinError' is handled directly inside JoinScreen, since that's
    // the component with the "submitted" state that needs to un-stick.

    // If the socket already connected before this effect ran (e.g. fast refresh),
    // fire the rejoin attempt immediately instead of waiting for another 'connect'.
    if (socket.connected) attemptAutoRejoin();

    return () => {
      socket.off('connect', attemptAutoRejoin);
      socket.off('joined', handleJoined);
      socket.off('state', handleState);
      socket.off('kicked', handleKicked);
      socket.off('left', handleLeft);
    };
  }, [myId]);

  if (kicked) {
    return (
      <div className="screen">
        <h1>Removed from game</h1>
        <p>The host removed you from this game.</p>
        <button onClick={() => window.location.reload()}>Rejoin as a new player</button>
      </div>
    );
  }

  if (left) {
    return (
      <div className="screen">
        <h1>You left the game</h1>
        <p>You've been removed from the player list.</p>
        <button onClick={() => window.location.reload()}>Join again</button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="screen">
        <p>Connecting...</p>
      </div>
    );
  }

  const me = state.players.find((p) => p.id === myId);
  const isHost = me ? me.isHost : false;
  const hasJoined = Boolean(me);

  let body;
  if (!hasJoined) {
    body = <JoinScreen myId={myId} />;
  } else if (state.status === 'lobby') {
    body = <Lobby state={state} isHost={isHost} myId={myId} />;
  } else if (state.status === 'lobby-between-rounds') {
    body = <BetweenRounds state={state} isHost={isHost} />;
  } else if (state.status === 'uploading') {
    body = <PhotoUpload state={state} isHost={isHost} myId={myId} />;
  } else if (state.status === 'voting') {
    body = <VotingScreen state={state} myId={myId} />;
  } else if (state.status === 'result') {
    body = <PhotoResult state={state} />;
  } else if (state.status === 'gameover') {
    body = <FinalLeaderboard state={state} isHost={isHost} />;
  } else {
    body = <p>Unknown game state.</p>;
  }

  // The between-rounds screen has its own End Game button, so the floating
  // host bar is only needed for the phases that don't already offer one.
  const showEndGameControl =
    isHost && !['lobby', 'lobby-between-rounds', 'gameover'].includes(state.status);

  return (
    <div className="app">
      {showEndGameControl && (
        <div className="host-bar">
          <button
            className="end-game-button"
            onClick={() => {
              if (confirm('End the game now for everyone?')) {
                socket.emit('endGame');
              }
            }}
          >
            End Game
          </button>
        </div>
      )}
      {body}
    </div>
  );
}
