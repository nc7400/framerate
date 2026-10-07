const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PHOTOS_DIR = path.join(__dirname, 'game-photos');
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');

if (!fs.existsSync(PHOTOS_DIR)) fs.mkdirSync(PHOTOS_DIR, { recursive: true });

// Serve compressed photos and, once built, the React app itself.
app.use('/photos', express.static(PHOTOS_DIR));
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB raw upload cap, before compression
});

// ---------------------------------------------------------------------------
// In-memory game state. Everything here is wiped on "New Game" / server restart.
// ---------------------------------------------------------------------------
const MAX_PLAYERS = 10;
const PHOTOS_PER_PLAYER_PER_ROUND = 3;
const ALLOWED_DURATIONS = [5, 10, 15, 20];

let players = [];        // { id, username, isHost, totalScore, connected }
let hostId = null;
let status = 'lobby';    // lobby | uploading | voting | result | gameover
let totalRounds = 3;
let voteDuration = 15;
let currentRound = 0;
let photoQueue = [];     // photos still to be voted on this round
let currentPhoto = null; // { id, ownerId, url }
let votes = {};          // playerId -> score, for currentPhoto
let deadline = null;     // epoch ms when current vote closes
let voteTimer = null;    // Node timeout handle
let uploadCounts = {};   // playerId -> number of photos uploaded this round
let lastResult = null;   // { photoUrl, ownerUsername, pointsAwarded }
let leaderboard = null;  // sorted players array, set at gameover

function getPlayer(id) {
  return players.find((p) => p.id === id);
}

function getPlayerBySocket(socketId) {
  return players.find((p) => p.socketId === socketId);
}

function isHostConnection(socket) {
  const player = getPlayerBySocket(socket.id);
  return Boolean(player && player.id === hostId);
}

function resetPerRoundState() {
  photoQueue = [];
  currentPhoto = null;
  votes = {};
  deadline = null;
  uploadCounts = {};
  lastResult = null;
  if (voteTimer) {
    clearTimeout(voteTimer);
    voteTimer = null;
  }
}

function resetFullGameState({ clearPlayers } = { clearPlayers: false }) {
  // Delete every photo on disk.
  for (const file of fs.readdirSync(PHOTOS_DIR)) {
    fs.unlinkSync(path.join(PHOTOS_DIR, file));
  }
  status = 'lobby';
  totalRounds = 3;
  voteDuration = 15;
  currentRound = 0;
  leaderboard = null;
  resetPerRoundState();
  if (clearPlayers) {
    players = [];
    hostId = null;
  } else {
    players.forEach((p) => {
      p.totalScore = 0;
    });
  }
}

function buildStateSnapshot() {
  return {
    status,
    players: players.map((p) => ({
      id: p.id,
      username: p.username,
      isHost: p.isHost,
      totalScore: p.totalScore,
      connected: p.connected,
    })),
    hostId,
    totalRounds,
    currentRound,
    voteDuration,
    currentPhoto,
    deadline,
    lastResult,
    leaderboard,
    photosRemainingInRound: photoQueue.length + (currentPhoto ? 1 : 0),
    uploadStatus: players.map((p) => ({
      id: p.id,
      username: p.username,
      count: uploadCounts[p.id] || 0,
      required: PHOTOS_PER_PLAYER_PER_ROUND,
    })),
  };
}

function broadcastState() {
  io.emit('state', buildStateSnapshot());
}

// ---------------------------------------------------------------------------
// Round / voting engine
// ---------------------------------------------------------------------------

function startRound() {
  currentRound += 1;
  resetPerRoundState();
  status = 'uploading';
  broadcastState();
}

function allPlayersUploaded() {
  const connectedPlayers = players.filter((p) => p.connected);
  return (
    connectedPlayers.length > 0 &&
    connectedPlayers.every(
      (p) => (uploadCounts[p.id] || 0) >= PHOTOS_PER_PLAYER_PER_ROUND
    )
  );
}

function beginVotingPhaseIfReady() {
  if (status !== 'uploading') return;
  if (!allPlayersUploaded()) return;
  beginVotingPhase();
}

function beginVotingPhase() {
  // Gather this round's photos (already tagged with roundAssigned === currentRound)
  // and shuffle them.
  const roundPhotos = photoQueue.filter((p) => p.roundAssigned === currentRound);
  photoQueue = shuffle(roundPhotos);
  status = 'voting';
  advanceToNextPhoto();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function advanceToNextPhoto() {
  if (voteTimer) {
    clearTimeout(voteTimer);
    voteTimer = null;
  }
  if (photoQueue.length === 0) {
    endRound();
    return;
  }
  currentPhoto = photoQueue.shift();
  votes = {};
  deadline = Date.now() + voteDuration * 1000;
  status = 'voting';
  broadcastState();
  voteTimer = setTimeout(closeCurrentPhotoVoting, voteDuration * 1000);
}

function eligibleVoterCount() {
  return players.filter((p) => p.connected && p.id !== currentPhoto.ownerId).length;
}

function checkForEarlyClose() {
  if (!currentPhoto) return;
  const votedCount = Object.keys(votes).length;
  if (votedCount >= eligibleVoterCount()) {
    closeCurrentPhotoVoting();
  }
}

function closeCurrentPhotoVoting() {
  if (voteTimer) {
    clearTimeout(voteTimer);
    voteTimer = null;
  }
  if (!currentPhoto) return;

  const multiplier = currentRound; // round number IS the multiplier (round 1 = x1, round 2 = x2, ...)
  let pointsAwarded = 0;
  for (const score of Object.values(votes)) {
    pointsAwarded += score * multiplier;
  }

  const owner = getPlayer(currentPhoto.ownerId);
  if (owner) {
    owner.totalScore += pointsAwarded;
  }

  lastResult = {
    photoUrl: currentPhoto.url,
    ownerUsername: owner ? owner.username : 'Unknown',
    pointsAwarded,
    round: currentRound,
    multiplier,
  };
  currentPhoto = null;
  status = 'result';
  broadcastState();

  // Give everyone a few seconds to see the result, then move on.
  setTimeout(() => {
    if (status === 'result') {
      advanceToNextPhoto();
    }
  }, 4000);
}

function endRound() {
  currentPhoto = null;
  status = 'result';
  lastResult = { roundComplete: true, round: currentRound };
  broadcastState();

  setTimeout(() => {
    if (status !== 'result') return;
    if (currentRound >= totalRounds) {
      endGame();
    } else {
      status = 'lobby-between-rounds';
      broadcastState();
    }
  }, 3000);
}

function endGame() {
  leaderboard = [...players]
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((p) => ({ username: p.username, totalScore: p.totalScore }));
  status = 'gameover';
  resetPerRoundState();
  broadcastState();
}

// ---------------------------------------------------------------------------
// HTTP: photo upload
// ---------------------------------------------------------------------------

app.post('/api/upload', upload.single('photo'), async (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId || !getPlayer(playerId)) {
      return res.status(400).json({ error: 'Unknown player' });
    }
    if (status !== 'uploading') {
      return res.status(400).json({ error: 'Not currently accepting uploads' });
    }
    if ((uploadCounts[playerId] || 0) >= PHOTOS_PER_PLAYER_PER_ROUND) {
      return res.status(400).json({ error: 'Already uploaded max photos this round' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const id = uuidv4();
    const filename = `${id}.jpg`;
    const filePath = path.join(PHOTOS_DIR, filename);

    await sharp(req.file.buffer)
      .rotate() // auto-orient using the image's EXIF data, then strip it — without
      // this, phone photos taken in portrait often come out sideways, since
      // phones store "which way is up" as metadata rather than rotating pixels.
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toFile(filePath);

    photoQueue.push({
      id,
      ownerId: playerId,
      url: `/photos/${filename}`,
      roundAssigned: currentRound,
    });

    uploadCounts[playerId] = (uploadCounts[playerId] || 0) + 1;
    broadcastState();
    beginVotingPhaseIfReady();

    res.json({ ok: true, count: uploadCounts[playerId] });
  } catch (err) {
    console.error('Upload failed:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[connection] socket ${socket.id} connected`);

  socket.on('join', (payload) => {
    console.log(`[join] received from socket ${socket.id}:`, payload);

    // Accept either the current shape ({ username, playerId }) or a bare
    // string (the old pre-reconnect-fix client). Never fail silently —
    // the UI is relying on either 'joined' or 'joinError' coming back so
    // it knows the attempt was actually received.
    let username;
    let playerId;
    if (typeof payload === 'string') {
      username = payload;
    } else if (payload && typeof payload === 'object') {
      username = payload.username;
      playerId = payload.playerId;
    }

    if (typeof username !== 'string' || !username.trim()) {
      console.log('[join] rejected: invalid/missing username');
      socket.emit('joinError', 'Please enter a name.');
      return;
    }
    const trimmed = username.trim().slice(0, 20);

    const existing = playerId ? getPlayer(playerId) : null;

    if (existing) {
      // Returning player (refresh, backgrounded tab, brief dropped connection) —
      // reclaim their existing record instead of creating a new one.
      existing.socketId = socket.id;
      existing.connected = true;
      existing.username = trimmed;
      console.log(`[join] reconnected existing player "${trimmed}" (${existing.id})`);
      socket.emit('joined', { playerId: existing.id, username: existing.username });
      broadcastState();
      return;
    }

    if (players.length >= MAX_PLAYERS) {
      console.log('[join] rejected: game is full');
      socket.emit('joinError', 'Game is full.');
      return;
    }

    const isHost = players.length === 0;
    const newId = playerId || uuidv4();
    const player = {
      id: newId,
      socketId: socket.id,
      username: trimmed,
      isHost,
      totalScore: 0,
      connected: true,
    };
    players.push(player);
    if (isHost) hostId = newId;
    console.log(`[join] created new player "${trimmed}" (${newId})${isHost ? ' [HOST]' : ''}`);
    socket.emit('joined', { playerId: newId, username: trimmed });
    broadcastState();
  });

  socket.on('setSettings', ({ totalRounds: rounds, voteDuration: duration }) => {
    if (!isHostConnection(socket) || status !== 'lobby') return;
    if (Number.isInteger(rounds) && rounds >= 1 && rounds <= 20) {
      totalRounds = rounds;
    }
    if (ALLOWED_DURATIONS.includes(duration)) {
      voteDuration = duration;
    }
    broadcastState();
  });

  socket.on('startGame', () => {
    if (!isHostConnection(socket)) return;
    if (status !== 'lobby' && status !== 'lobby-between-rounds') return;
    startRound();
  });

  socket.on('forceStartVoting', () => {
    // Host can force voting to begin even if not everyone uploaded.
    if (!isHostConnection(socket) || status !== 'uploading') return;
    if (photoQueue.filter((p) => p.roundAssigned === currentRound).length === 0) return;
    beginVotingPhase();
  });

  socket.on('submitVote', (score) => {
    if (status !== 'voting' || !currentPhoto) return;
    const player = getPlayerBySocket(socket.id);
    if (!player) return;
    if (player.id === currentPhoto.ownerId) return; // owners can't vote on their own photo
    if (votes[player.id] !== undefined) return; // already voted
    const numericScore = Number(score);
    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) return;
    votes[player.id] = numericScore;
    checkForEarlyClose();
  });

  socket.on('endGame', () => {
    if (!isHostConnection(socket)) return;
    endGame();
  });

  socket.on('newGame', () => {
    if (!isHostConnection(socket)) return;
    resetFullGameState({ clearPlayers: false });
    broadcastState();
  });

  socket.on('disconnect', () => {
    const player = getPlayerBySocket(socket.id);
    console.log(
      `[disconnect] socket ${socket.id}` +
        (player ? ` (was player "${player.username}")` : ' (no joined player)')
    );
    if (player) {
      player.connected = false;
      // If the disconnecting player still had a pending vote slot, re-check early close.
      if (status === 'voting' && currentPhoto) {
        checkForEarlyClose();
      }
      // Deliberately NOT auto-migrating host status here. A disconnect is often
      // just a refresh or a momentary signal drop, and the host should get their
      // controls back automatically on reconnect (same persistent id -> same
      // player record, isHost untouched). If a host is truly gone for good,
      // that's a manual "start a new game" situation for now.
      broadcastState();
    }
  });

  // Send this new connection the current state immediately.
  socket.emit('state', buildStateSnapshot());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FrameRate server listening on http://0.0.0.0:${PORT}`);
});
