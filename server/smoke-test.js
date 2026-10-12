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
  // Remembers each round's end-of-round result (it only shows briefly before the
  // game moves on), keyed by round number.
  const roundCompleteByRound = {};
  function captureRoundComplete(s) {
    if (s.lastResult && s.lastResult.roundComplete) {
      roundCompleteByRound[s.lastResult.round] = s.lastResult;
    }
  }
  function connectPlayer(name) {
    const sock = io('http://localhost:3000', { transports: ['websocket'] });
    const playerId = `test-${name}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolve) => {
      sock.on('connect', () => {
        sock.on('state', (s) => {
          states[name] = s;
          captureRoundComplete(s);
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
      aliceReconnectSocket.on('state', (s) => {
        states.Alice = s;
        captureRoundComplete(s);
      });
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

  console.log('--- Testing kick during the pre-game lobby (status is still "lobby" here) ---');
  assert(states.Alice.status === 'lobby', 'still in the pre-game lobby before settings/start');
  const carolConn = await connectPlayer('Carol');
  const carol = carolConn.sock;
  await wait(300);
  assert(states.Alice.players.length === 3, 'Carol joined, bringing the lobby to 3 players');

  console.log('--- Testing duplicate-name rejection and renaming ---');
  // A brand-new player trying a name that's taken (different capitalization).
  const dupSock = io('http://localhost:3000', { transports: ['websocket'] });
  let dupError = null;
  dupSock.on('joinError', (msg) => (dupError = msg));
  await new Promise((resolve) => dupSock.on('connect', resolve));
  dupSock.emit('join', { username: 'aLiCe', playerId: 'test-dup-player' });
  await wait(300);
  assert(dupError !== null && dupError.includes('already taken'), `new join with a taken name is rejected (${dupError})`);
  assert(states.Alice.players.length === 3, 'rejected duplicate did not add a player');
  dupSock.disconnect();

  // An existing player trying to rename to someone else's name.
  let bobRenameError = null;
  bob.on('joinError', (msg) => (bobRenameError = msg));
  bob.emit('join', { username: 'Alice', playerId: bobConn.playerId });
  await wait(300);
  assert(bobRenameError !== null && bobRenameError.includes('already taken'), 'renaming to a taken name is rejected');
  assert(states.Alice.players.find((p) => p.id === bobId).username === 'Bob', 'Bob keeps his name after a rejected rename');

  // A valid rename (also confirms a player can "rename" to their own name's new casing).
  bob.emit('join', { username: 'Bobby', playerId: bobConn.playerId });
  await wait(300);
  assert(states.Alice.players.find((p) => p.id === bobId).username === 'Bobby', 'valid rename to Bobby succeeds');
  assert(states.Alice.players.length === 3, 'rename did not create a duplicate player');

  let carolWasKicked = false;
  carol.on('kicked', () => {
    carolWasKicked = true;
  });
  alice.emit('kickPlayer', carolConn.playerId);
  await wait(400);
  assert(carolWasKicked === true, 'Carol received the "kicked" event while still in the lobby');
  assert(carol.connected === false, "Carol's socket was forcibly disconnected");
  assert(states.Alice.players.length === 2, 'Carol removed from the lobby, back down to Alice and Bob');

  console.log('--- Host sets settings: 2 rounds, 5s timer ---');
  alice.emit('setSettings', { totalRounds: 2, voteDuration: 5 });
  await wait(200);
  assert(states.Alice.totalRounds === 2, 'totalRounds set to 2');
  assert(states.Alice.voteDuration === 5, 'voteDuration set to 5');
  assert(states.Alice.photosPerRound === 3, 'photosPerRound defaults to 3');

  console.log('--- Host chooses photos per round (1-5) ---');
  alice.emit('setSettings', { totalRounds: 2, voteDuration: 5, photosPerRound: 6 });
  await wait(200);
  assert(states.Alice.photosPerRound === 3, 'photosPerRound above 5 is rejected');
  alice.emit('setSettings', { totalRounds: 2, voteDuration: 5, photosPerRound: 0 });
  await wait(200);
  assert(states.Alice.photosPerRound === 3, 'photosPerRound below 1 is rejected');
  bob.emit('setSettings', { totalRounds: 2, voteDuration: 5, photosPerRound: 4 });
  await wait(200);
  assert(states.Alice.photosPerRound === 3, 'non-host cannot change photosPerRound');
  alice.emit('setSettings', { totalRounds: 2, voteDuration: 5, photosPerRound: 2 });
  await wait(200);
  assert(states.Alice.photosPerRound === 2, 'host sets photosPerRound to 2');
  const PHOTOS = 2;

  console.log('--- Starting round 1 ---');
  alice.emit('startGame');
  await wait(300);
  assert(states.Alice.status === 'uploading', 'status moved to uploading for round 1');
  assert(states.Alice.currentRound === 1, 'currentRound is 1');

  async function uploadPhotos(playerId, label) {
    for (let i = 0; i < PHOTOS; i++) {
      const buf = await makeTestJpegBuffer({ r: i * 50, g: 100, b: 150 });
      const form = new FormData();
      form.append('playerId', playerId);
      form.append('photo', buf, { filename: `${label}-${i}.jpg`, contentType: 'image/jpeg' });
      const res = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      assert(res.ok, `${label} upload ${i + 1}/${PHOTOS} succeeded (${JSON.stringify(data)})`);
    }
  }

  assert(
    states.Alice.uploadStatus.every((u) => u.required === PHOTOS),
    `each player is required to upload ${PHOTOS} photos`
  );
  alice.emit('startVoting');
  await wait(300);
  assert(states.Alice.status === 'uploading', 'host cannot start voting with zero photos uploaded');

  console.log('--- Uploading round 1 photos for both players ---');
  await uploadPhotos(aliceId, 'alice-r1');
  await wait(300);
  assert(
    states.Alice.uploadStatus.find((u) => u.id === aliceId).count === PHOTOS &&
      states.Alice.uploadStatus.find((u) => u.id === bobId).count === 0,
    'upload progress shows Alice finished and Bob not yet'
  );
  await uploadPhotos(bobId, 'bob-r1');
  await wait(500);

  // Extra uploads beyond the host's chosen number are refused.
  {
    const buf = await makeTestJpegBuffer({ r: 9, g: 9, b: 9 });
    const form = new FormData();
    form.append('playerId', aliceId);
    form.append('photo', buf, { filename: 'extra.jpg', contentType: 'image/jpeg' });
    const res = await fetch('http://localhost:3000/api/upload', { method: 'POST', body: form });
    assert(res.ok === false, `upload beyond ${PHOTOS} photos is rejected`);
  }

  assert(states.Alice.status === 'uploading', 'voting does NOT start automatically when everyone has uploaded');
  bob.emit('startVoting');
  await wait(300);
  assert(states.Alice.status === 'uploading', 'non-host cannot start voting');
  alice.emit('startVoting');
  await wait(500);
  assert(states.Alice.status === 'voting', 'host starting voting moves the game to voting');
  assert(states.Alice.currentPhoto !== null, 'a current photo is set');

  // Votes on every currently-shown photo until `predicate()` is true (used for
  // both rounds). Alice votes 4 on anything she doesn't own, Bob votes 2 (while
  // still connected) on anything he doesn't own.
  async function voteUntil(predicate, maxIterations = 300) {
    let votedCount = 0;
    let lastVotedPhotoId = null;
    let iterations = 0;
    while (!predicate() && iterations < maxIterations) {
      iterations++;
      if (
        states.Alice.status === 'voting' &&
        states.Alice.currentPhoto &&
        states.Alice.currentPhoto.id !== lastVotedPhotoId
      ) {
        const photo = states.Alice.currentPhoto;
        lastVotedPhotoId = photo.id;
        const ownerId = photo.ownerId;
        if (ownerId !== aliceId) alice.emit('submitVote', 4);
        if (ownerId !== bobId && bob.connected) bob.emit('submitVote', 2);
        votedCount++;
      }
      await wait(300);
    }
    return votedCount;
  }

  console.log('--- Voting through round 1 (4 photos) ---');
  const round1Votes = await voteUntil(() => states.Alice.status === 'lobby-between-rounds');
  assert(round1Votes === 2 * PHOTOS, `voted on exactly ${2 * PHOTOS} photos in round 1 (voted on ${round1Votes})`);
  assert(states.Alice.status === 'lobby-between-rounds', 'reached the new between-rounds screen after round 1');

  // Alice's photos: Bob votes 2 each => 2*1(mult)=2 per photo * PHOTOS(2) = 4
  // Bob's photos: Alice votes 4 each => 4*1(mult)=4 per photo * PHOTOS(2) = 8
  const aliceAfterR1 = states.Alice.players.find((p) => p.id === aliceId).totalScore;
  const bobAfterR1 = states.Alice.players.find((p) => p.id === bobId).totalScore;
  assert(aliceAfterR1 === 2 * PHOTOS, `Alice's score after round 1 is ${2 * PHOTOS} (got ${aliceAfterR1})`);
  assert(bobAfterR1 === 4 * PHOTOS, `Bob's score after round 1 is ${4 * PHOTOS} (got ${bobAfterR1})`);

  console.log('--- Checking the end-of-round best photo (round 1) ---');
  const r1 = roundCompleteByRound[1];
  assert(r1 && r1.final === false, 'round 1 end result is marked as not the final round');
  // Both of Bob's photos got a 4 from Alice (4 points each), so they TIE for best
  // of the round and both must be shown (Alice's photos only got 2s).
  assert(r1 && r1.bestPhotos.length === PHOTOS, `all ${PHOTOS} tied best photos are included, not just one (got ${r1 && r1.bestPhotos.length})`);
  assert(r1 && r1.bestPhotos.every((b) => b.ownerUsername === 'Bobby' && b.points === 4), "tied best photos are Bobby's, 4 points each");
  assert(r1 && new Set(r1.bestPhotos.map((b) => b.url)).size === PHOTOS, 'the tied best photos are distinct photos');

  console.log('--- Testing kick permissions ---');
  bob.emit('kickPlayer', aliceId); // non-host attempting to kick: should be ignored
  await wait(300);
  assert(states.Alice.players.length === 2, 'non-host kick attempt had no effect');

  alice.emit('kickPlayer', aliceId); // host attempting to kick themself: should be ignored
  await wait(300);
  assert(states.Alice.players.length === 2, 'host cannot kick themself');

  console.log('--- Testing a real kick (host removes Bob) ---');
  let bobWasKicked = false;
  bob.on('kicked', () => {
    bobWasKicked = true;
  });
  alice.emit('kickPlayer', bobId);
  await wait(400);
  assert(bobWasKicked === true, 'Bob received the "kicked" event');
  assert(bob.connected === false, "Bob's socket was forcibly disconnected");
  assert(states.Alice.players.length === 1, 'Bob removed from the player list after kick');
  assert(
    states.Alice.players.find((p) => p.id === bobId) === undefined,
    'Bob no longer appears anywhere in state'
  );

  console.log('--- Starting round 2 with only Alice remaining ---');
  alice.emit('startGame');
  await wait(300);
  assert(states.Alice.status === 'uploading', 'status moved to uploading for round 2');
  assert(states.Alice.currentRound === 2, 'currentRound is 2');

  await uploadPhotos(aliceId, 'alice-r2');
  await wait(500);
  alice.emit('startVoting');
  await wait(500);
  assert(states.Alice.status === 'voting', 'host started voting for round 2 (Alice-only)');

  console.log('--- Voting through round 2 (2 photos, zero eligible voters -> times out each photo) ---');
  const round2Votes = await voteUntil(() => states.Alice.status === 'gameover');
  assert(round2Votes === PHOTOS, `voted on exactly ${PHOTOS} photos in round 2 (voted on ${round2Votes})`);
  assert(states.Alice.status === 'gameover', 'game reached gameover after round 2');
  assert(Array.isArray(states.Alice.leaderboard), 'leaderboard is present');

  const r2 = roundCompleteByRound[2];
  assert(r2 && r2.final === true, 'round 2 end result is marked as the final round');
  assert(r2 && r2.bestPhotos.length === 0, 'no best photos in round 2 (nobody was left to vote)');
  assert(
    states.Alice.winnerPhotos.length === 1 && states.Alice.winnerPhotos[0].username === 'Alice',
    'winner photo is shown for the single first-place player'
  );
  assert(
    states.Alice.winnerPhotos[0].round === 1 && Math.abs(states.Alice.winnerPhotos[0].average - 2) < 1e-9,
    "winner's best photo comes from round 1 (the only round her photos were rated), average 2"
  );

  console.log('--- Final leaderboard ---');
  console.log(states.Alice.leaderboard);

  // Round 2: Alice owns all her photos and is the only player left, so there are
  // zero eligible voters for each - each photo earns 0 points (and each one
  // waits out the full 5s timer rather than early-closing).
  assert(states.Alice.leaderboard.length === 1, 'leaderboard only contains Alice (Bob was kicked)');
  const aliceFinalScore = states.Alice.leaderboard.find((p) => p.username === 'Alice').totalScore;
  assert(aliceFinalScore === 2 * PHOTOS, `Alice's final score is still ${2 * PHOTOS} from round 1 (got ${aliceFinalScore})`);

  console.log('--- Testing that leaving is ignored outside the pre-game lobby ---');
  alice.emit('leaveGame');
  await wait(300);
  assert(states.Alice.players.length === 1 && states.Alice.status === 'gameover', 'leaveGame ignored at game over');

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
  assert(states.Alice.winnerPhotos.length === 0, 'winner photos cleared by newGame');
  assert(remainingFiles.length === 0, `photo directory is empty after newGame (found ${remainingFiles.length})`);

  console.log('--- Testing leaving the pre-game lobby ---');
  const zedConn = await connectPlayer('Zed');
  const zed = zedConn.sock;
  await wait(300);
  assert(states.Alice.players.length === 2, 'Zed joined the lobby');
  let zedLeft = false;
  zed.on('left', () => (zedLeft = true));
  zed.emit('leaveGame');
  await wait(400);
  assert(zedLeft === true, 'Zed received the "left" event');
  assert(zed.connected === false, "Zed's socket was disconnected after leaving");
  assert(states.Alice.players.length === 1, 'Zed removed from the player list');
  assert(
    states.Alice.players[0].username === 'Alice' && states.Alice.players[0].isHost === true,
    'host unchanged when a non-host leaves'
  );

  console.log('--- Testing host handoff when the host leaves ---');
  const zed2Conn = await connectPlayer('Zed2');
  await wait(300);
  assert(states.Alice.players.length === 2, 'Zed2 joined, lobby has 2 players');
  let aliceLeft = false;
  alice.on('left', () => (aliceLeft = true));
  alice.emit('leaveGame');
  await wait(400);
  assert(aliceLeft === true, 'host Alice received the "left" event');
  assert(states.Zed2.players.length === 1, 'only Zed2 remains after the host left');
  assert(states.Zed2.players[0].isHost === true, 'host status passed to Zed2');
  assert(states.Zed2.hostId === zed2Conn.playerId, 'hostId updated to Zed2');

  zed2Conn.sock.disconnect();
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
