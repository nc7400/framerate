# FrameRate

A locally-hosted, browser-based party game for up to 10 players. Everyone
joins on their phone over Wi-Fi, the host runs the game, each round players
upload photos (the host chooses 1-5), and the group scores each other's photos 1-5. Points per
vote are multiplied by the current round number (round 1 = x1, round 2 = x2,
round 3 = x3, ...). Highest total score at the end wins.

## Project structure

```
framerate/
  server/   Express + Socket.IO backend (game logic, photo storage/compression)
  client/   React + Vite frontend (what loads on each phone)
```

## One-time setup

You need [Node.js](https://nodejs.org) installed (v18+ recommended).

```
cd server
npm install

cd ../client
npm install
```

## Running it for development (two terminals)

**Terminal 1 — backend:**
```
cd server
npm start
```
You should see: `FrameRate server listening on http://0.0.0.0:3000`

**Terminal 2 — frontend (dev mode, with hot reload):**
```
cd client
npm run dev
```
Open the printed address (e.g. `http://localhost:5173`) in your browser to
work on the UI. The Vite dev server proxies `/api`, `/photos`, and
`/socket.io` requests through to the Express server on port 3000.

## Running it for an actual game night (production mode)

For real play, build the frontend once and let Express serve everything from
a single port — this is simpler and is what your phones should actually
connect to.

```
cd client
npm run build
```

This creates `client/dist`. The server is already configured to serve it
automatically if it exists. Then just run the server:

```
cd ../server
npm start
```

### Connecting phones

1. Make sure the host computer and every player's phone are on the **same
   Wi-Fi network**.
2. Find the host computer's local IP address:
   - Windows: `ipconfig` → look for "IPv4 Address"
   - Mac: System Settings → Wi-Fi → Details
   - Linux: `ip addr` or `hostname -I`
3. On each phone's browser, go to `http://<that-IP>:3000`.
4. You may need to allow inbound connections on port 3000 through the host
   computer's firewall.

The first person to submit a username becomes the host and gets extra
controls (round count, vote timer length, start/end game).

## Running the automated smoke test (optional)

A small script simulates two players through a full round (join, host
settings, uploads, voting, scoring, leaderboard, and cleanup) and asserts
the results are correct. Useful after making changes to confirm nothing
broke.

```
cd server
npm test
```

## Notes on design decisions

- **Scoring**: the points a photo earns = (sum of all votes it receives) x
  (current round number). The photo's **owner** receives those points — not
  the voters. Owners are automatically excluded from voting on their own
  photo.
- **Timer**: host-selectable, 30/45/60/75/90 seconds, enforced authoritatively
  on the server (not trusted from the client). Voting closes early the
  instant every eligible player has voted.
- **Photos per round**: the host picks 1-5 photos per player per round in the
  pre-game lobby (default 3). Settings lock once the game starts.
- **Starting voting**: voting never starts on its own. During uploads, each
  player's name is greyed out until they've uploaded the required number, then
  fills in. The host presses "Start Voting" when ready (they can start before
  everyone finishes, in which case stragglers just have fewer photos).
- **No repeats**: each round requires a fresh set of uploads per player, so
  there's no need to pull from a shared pool across rounds.
- **Cleanup**: "New Game" wipes all photos from disk, resets all scores to 0,
  and returns everyone to the lobby. "End Game" can be triggered by the host
  at any point mid-game and jumps straight to the final leaderboard using
  scores as they stand.
- **Reconnecting**: each browser stores a persistent player id in
  `localStorage` (separate from the underlying socket connection, which
  changes on every refresh/reconnect). Refreshing the page, backgrounding the
  tab, or a brief dropped connection reclaims the same player record — same
  username, same score, same host status — instead of creating a new player.
  A disconnected player stays visible in the lobby/player list (marked
  "disconnected") rather than disappearing.
- **Ties and medals**: players with the same score share one rank and are
  listed together, one name per line. First place gets 🥇, second 🥈, third 🥉
  (ranks are consecutive, so a tie for first is followed by the 🥈 group).
- **Replacing photos**: during the upload phase each player sees thumbnails of
  their own uploaded photos (labelled Photo 1, 2, ...) with a Replace button
  under each. Replacing swaps that photo for a new one in the same position
  and deletes the old file. Only you ever see your own thumbnails; other
  players' photos stay secret until voting. Replacing is closed once the host
  starts voting.
- **Best photos**: at the end of every round (including the final one), the
  round's best photo is shown to everyone. That's the photo with the most
  points that round, and if several photos are tied for the top score, all of
  them are shown. Photos nobody voted on never count. Only the points a photo
  scored are shown (no averages).
- **End-of-game screen**: after the final standings it shows the winner's
  top-scoring photo (the single photo of theirs that earned the most points,
  with its points and round; one per player if first place is tied), followed
  by a round-by-round recap: for each round, the title ("Round N"), who
  uploaded the highest-scoring photo, the points it scored, and the photo
  (several if tied). Note that later rounds are worth more points per vote, so
  a winner's top photo tends to come from a later round.
- **Final round**: after the last round the screen says the game is over and
  final scores are coming, instead of "get ready for the next round".
- **Between rounds**: after each round (except the last), everyone sees a
  standings screen showing current scores. The host gets a simpler control
  set here than the pre-game lobby — just "Start Next Round" and "End Game"
  (round count and timer length are locked in once the game has started).
- **Names**: players can change their name from the pre-game lobby. Names
  must be unique (case-insensitive); if a name is taken, the player sees a
  message and keeps their current name (or can pick another on the join screen).
- **Leaving**: any player can leave from the pre-game lobby with the "Leave
  Game" button. They're removed from the player list and disconnected, and
  reopening the page starts them fresh. If the host leaves, host status passes
  to the next player. Leaving isn't offered once a game has started.
- **Kicking players**: the host can remove a player from the pre-game lobby
  or from the between-rounds standings screen. It's deliberately not
  available mid-vote or mid-upload, where removing someone mid-flight would
  complicate the "has everyone voted/uploaded" logic. A kicked player sees a dedicated
  screen and is forcibly disconnected; if they reopen the page, it starts
  them fresh as a new player rather than quietly trying to rejoin as the
  player who was just removed.
- **Host disconnects**: host status is intentionally *not* auto-transferred
  when the host disconnects, since that would demote them off of something
  as routine as a page refresh. The host keeps their controls the moment
  they reconnect. If a host is genuinely gone for the rest of the session,
  there's currently no in-game way to hand control to someone else — that's
  a reasonable next feature to add if it comes up (e.g. a "claim host" button
  that only appears once the original host has been disconnected for some
  grace period).
