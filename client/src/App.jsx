import { useState, useEffect } from 'react';
import { socket } from './socket';
import { getStoredPlayerId, getStoredUsername, storeUsername } from './playerId';
import JoinScreen from './components/JoinScreen';
import Lobby from './components/Lobby';
import PhotoUpload from './components/PhotoUpload';
import VotingScreen from './components/VotingScreen';
import PhotoResult from './components/PhotoResult';
import FinalLeaderboard from './components/FinalLeaderboard';
import './App.css';

export default function App() {
  const [state, setState] = useState(null);
  const [myId] = useState(getStoredPlayerId); // stable for the life of this browser, not tied to socket.id

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

    socket.on('connect', attemptAutoRejoin);
    socket.on('joined', handleJoined);
    socket.on('state', handleState);
    // Note: 'joinError' is handled directly inside JoinScreen, since that's
    // the component with the "submitted" state that needs to un-stick.

    // If the socket already connected before this effect ran (e.g. fast refresh),
    // fire the rejoin attempt immediately instead of waiting for another 'connect'.
    if (socket.connected) attemptAutoRejoin();

    return () => {
      socket.off('connect', attemptAutoRejoin);
      socket.off('joined', handleJoined);
      socket.off('state', handleState);
    };
  }, [myId]);

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
    body = <Lobby state={state} isHost={isHost} isBetweenRounds={false} />;
  } else if (state.status === 'lobby-between-rounds') {
    body = <Lobby state={state} isHost={isHost} isBetweenRounds={true} />;
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

  const showEndGameControl =
    isHost && !['lobby', 'gameover'].includes(state.status);

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
