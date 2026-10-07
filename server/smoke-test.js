const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');
const sharp = require('sharp');
const FormData = require('form-data');
const fetch = require('node-fetch');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeTestJpegBuffer(color) {
  return sharp({
    create: { width: 50, height: 50, channels: 3, background: color },
  })
    .jpeg()
    .toBuffer();
}

async function main() {
  const server = spawn('node', ['index.js'], { cwd: __dirname });
  let serverReady = false;
  server.stdout.on('data', (d) => {
    process.stdout.write(`[server] ${d}`);
    if (d.toString().includes('listening')) serverReady = true;
  });
  server.stderr.on('data', (d) => process.stderr.write(`[server err] ${d}`));

  while (!serverReady) await wait(100);
  await wait(300);

  const states = {};
  function connectPlayer(name) {
    const sock = io('http://localhost:3000', { transports: ['websocket'] });
    const playerId = `test-${name}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve) => {
      sock.on('connect', () => {
        sock.on('state', (s) => {
          states[name] = s;
        });
        sock.emit('join', { username: name, playerId });
        resolve({ sock, playerId });
      });
    });
  }

  console.log('--- Connecting players ---');
  const aliceConn = await connectPlayer('Alice');
  const bobConn = await connectPlayer('Bob');
  let alice = aliceConn.sock;
  const bob = bobConn.sock;
  await wait(300);

  const assert = (cond, msg) => {
    if (!cond) {
      console.error('FAIL:', msg);
      process.exitCode = 1;
    } else {
      console.log('OK:', msg);
    }
  };

  assert(states.Alice.players.length === 2, 'both players present in state');
  const aliceId = states.Alice.players.find((p) => p.username === 'Alice').id;
  const bobId = states.Alice.players.find((p) => p.username === 'Bob').id;
  assert(
    states.Alice.players.find((p) => p.id === aliceId).isHost === true,
    'first joiner (Alice) is host'
  );

  console.log('--- Testing reconnect with same persistent id (the actual bug fix) ---');
  alice.disconnect();
  await wait(300);
  assert(
    states.Bob.players.find((p) => p.id === aliceId).connected === false,
    'Alice shows as disconnected after disconnecting'
  );
  assert(states.Bob.players.length === 2, 'player count unchanged while Alice is disconnected (no removal)');

  const aliceReconnectSocket = io('http://localhost:3000', { transports: ['websocket'] });
  await new Promise((resolve) => {
    aliceReconnectSocket.on('connect', () => {
      aliceReconnectSocket.on('state', (s) => (states.Alice = s));
      aliceReconnectSocket.emit('join', { username: 'Alice', playerId: aliceConn.playerId });
      resolve();
    });
  });
  await wait(300);
  assert(states.Alice.players.length === 2, 'rejoining with same id does NOT create a duplicate player');
  const reconnectedAlice = states.Alice.players.find((p) => p.id === aliceId);
  assert(reconnectedAlice.connected === true, 'Alice shows as connected again after reconnect');
  assert(reconnectedAlice.isHost === true, 'Alice retained host status across reconnect');
  // Swap to the reconnected socket for the rest of the test.
  const aliceOldSocket = alice;
  alice = aliceReconnectSocket;

  console.log('--- Host sets settings: 1 round, 5s timer ---');
  alice.emit('setSettings', { totalRounds: 1, voteDuration: 5 });
  await wait(200);
  assert(states.Alice.totalRounds === 1, 'totalRounds set to 1');
  assert(states.Alice.voteDuration === 5, 'voteDuration set to 5');

  console.log('--- Starting game ---');
  alice.emit('startGame');
  await wait(300);
  assert(states.Alice.status === 'uploading', 'status moved to uploading');
  assert(states.Alice.currentRound === 1, 'currentRound is 1');

  async function uploadPhotos(playerId, label) {
    for (let i = 0; i < 3; i++) {
      const buf = await makeTestJpegBuffer({ r: i * 50, g: 100, b: 150 });
      const form = new FormData();
      form.append('playerId', playerId);
      form.append('photo', buf, { filename: `${label}-${i}.jpg`, contentType: 'image/jpeg' });
      const res = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      assert(res.ok, `${label} upload ${i + 1}/3 succeeded (${JSON.stringify(data)})`);
    }
  }

  console.log('--- Uploading photos for both players ---');
  await uploadPhotos(aliceId, 'alice');
  await uploadPhotos(bobId, 'bob');
  await wait(500);

  assert(states.Alice.status === 'voting', 'status moved to voting after all uploads');
  assert(states.Alice.currentPhoto !== null, 'a current photo is set');

  console.log('--- Voting through all 6 photos ---');
  let photosVoted = 0;
  let lastVotedPhotoId = null;
  const maxIterations = 200; // generous: 6 photos x ~4s result pause each + round-end pause
  let iterations = 0;
  while (states.Alice.status !== 'gameover' && iterations < maxIterations) {
    iterations++;
    if (
      states.Alice.status === 'voting' &&
      states.Alice.currentPhoto &&
      states.Alice.currentPhoto.id !== lastVotedPhotoId
    ) {
      const photo = states.Alice.currentPhoto;
      lastVotedPhotoId = photo.id;
      const ownerId = photo.ownerId;
      // Whoever doesn't own the photo votes.
      if (ownerId !== aliceId) alice.emit('submitVote', 4);
      if (ownerId !== bobId) bob.emit('submitVote', 2);
      photosVoted++;
    }
    await wait(300);
  }

  assert(photosVoted === 6, `voted on exactly 6 photos (voted on ${photosVoted})`);
  assert(states.Alice.status === 'gameover', 'game reached gameover status');
  assert(Array.isArray(states.Alice.leaderboard), 'leaderboard is present');

  console.log('--- Final leaderboard ---');
  console.log(states.Alice.leaderboard);

  // Each player owns 3 photos, each photo voted by the other player.
  // Alice's photos: Bob votes 2 each => 2*1(mult)=2 per photo * 3 photos = 6
  // Bob's photos: Alice votes 4 each => 4*1(mult)=4 per photo * 3 photos = 12
  const aliceScore = states.Alice.leaderboard.find((p) => p.username === 'Alice').totalScore;
  const bobScore = states.Alice.leaderboard.find((p) => p.username === 'Bob').totalScore;
  assert(aliceScore === 6, `Alice's score is 6 (got ${aliceScore})`);
  assert(bobScore === 12, `Bob's score is 12 (got ${bobScore})`);

  console.log('--- Testing newGame cleanup ---');
  alice.emit('newGame');
  await wait(300);
  assert(states.Alice.status === 'lobby', 'status reset to lobby after newGame');
  assert(
    states.Alice.players.every((p) => p.totalScore === 0),
    'scores reset to 0 after newGame'
  );

  const fs = require('fs');
  const photosDir = path.join(__dirname, 'game-photos');
  const remainingFiles = fs.readdirSync(photosDir);
  assert(remainingFiles.length === 0, `photo directory is empty after newGame (found ${remainingFiles.length})`);

  alice.disconnect();
  bob.disconnect();
  server.kill();
  await wait(200);

  console.log(process.exitCode === 1 ? '\n*** SOME TESTS FAILED ***' : '\n*** ALL TESTS PASSED ***');
  process.exit(process.exitCode || 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
