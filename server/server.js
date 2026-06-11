const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 6033;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const CARD_PAIRS = 8;
let leaderboard = [];
let gameSessions = new Map();

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

app.get('/api/shuffle', (req, res) => {
  const cardIds = [];
  for (let i = 1; i <= CARD_PAIRS; i++) {
    cardIds.push(i, i);
  }
  const shuffled = shuffle(cardIds);
  res.json({ cards: shuffled });
});

app.post('/api/score', (req, res) => {
  const { time, playerName } = req.body;
  
  if (typeof time !== 'number' || time <= 0) {
    return res.status(400).json({ error: 'Invalid score data' });
  }

  const entry = {
    id: Date.now(),
    time: time,
    playerName: playerName || 'Anonymous',
    date: new Date().toLocaleString('zh-CN')
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => a.time - b.time);
  leaderboard = leaderboard.slice(0, 10);

  const rank = leaderboard.findIndex(e => e.id === entry.id) + 1;

  res.json({
    success: true,
    rank: rank,
    leaderboard: leaderboard
  });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: leaderboard });
});

app.post('/api/game/save', (req, res) => {
  const {
    playerId,
    playerName,
    cards,
    flippedIndices,
    matchedIndices,
    matchedPairs,
    moves,
    elapsedTime,
    gameStarted
  } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Missing player ID' });
  }

  gameSessions.set(playerId, {
    playerId,
    playerName: playerName || '',
    cards: cards || [],
    flippedIndices: flippedIndices || [],
    matchedIndices: matchedIndices || [],
    matchedPairs: matchedPairs || 0,
    moves: moves || 0,
    elapsedTime: elapsedTime || 0,
    gameStarted: gameStarted || false,
    savedAt: Date.now()
  });

  res.json({ success: true });
});

app.get('/api/game/load', (req, res) => {
  const { playerId } = req.query;

  if (!playerId) {
    return res.status(400).json({ error: 'Missing player ID' });
  }

  const session = gameSessions.get(playerId);

  if (!session) {
    return res.json({ success: false, message: 'No saved game progress found' });
  }

  res.json({
    success: true,
    session: session
  });
});

app.post('/api/game/reset', (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({ error: 'Missing player ID' });
  }

  gameSessions.delete(playerId);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
