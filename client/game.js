const API_BASE_URL = 'http://localhost:6033/api';

const CARD_EMOJIS = {
  1: '馃惗',
  2: '馃惐',
  3: '馃惣',
  4: '馃',
  5: '馃',
  6: '馃惛',
  7: '馃惖',
  8: '馃惃'
};

const gameBoard = document.getElementById('gameBoard');
const timerEl = document.getElementById('timer');
const movesEl = document.getElementById('moves');
const matchedEl = document.getElementById('matched');
const restartBtn = document.getElementById('restartBtn');
const leaderboardBtn = document.getElementById('leaderboardBtn');
const winModal = document.getElementById('winModal');
const leaderboardModal = document.getElementById('leaderboardModal');
const finalTimeEl = document.getElementById('finalTime');
const finalMovesEl = document.getElementById('finalMoves');
const playerNameInput = document.getElementById('playerName');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const playAgainBtn = document.getElementById('playAgainBtn');
const closeLeaderboardBtn = document.getElementById('closeLeaderboardBtn');
const leaderboardList = document.getElementById('leaderboardList');

let cards = [];
let flippedCards = [];
let matchedPairs = 0;
let moves = 0;
let timer = null;
let startTime = null;
let elapsedTime = 0;
let gameStarted = false;
let isProcessing = false;
let playerId = '';
let cardIds = [];
let saveTimer = null;

function getOrCreatePlayerId() {
  let pid = localStorage.getItem('memory_game_player_id');
  if (!pid) {
    pid = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('memory_game_player_id', pid);
  }
  return pid;
}

function getCurrentCardState() {
  const flippedIndices = [];
  const matchedIndices = [];
  
  cards.forEach((card, index) => {
    if (card.classList.contains('matched')) {
      matchedIndices.push(index);
    } else if (card.classList.contains('flipped')) {
      flippedIndices.push(index);
    }
  });
  
  return { flippedIndices, matchedIndices };
}

function buildGameState() {
  if (!playerId) return null;
  
  const { flippedIndices, matchedIndices } = getCurrentCardState();
  const playerName = playerNameInput ? playerNameInput.value.trim() : '';
  
  return {
    playerId: playerId,
    playerName: playerName,
    cards: cardIds,
    flippedIndices: flippedIndices,
    matchedIndices: matchedIndices,
    matchedPairs: matchedPairs,
    moves: moves,
    elapsedTime: elapsedTime,
    gameStarted: gameStarted
  };
}

async function saveGameProgress(useBeacon = false) {
  const gameState = buildGameState();
  if (!gameState) return;
  
  try {
    localStorage.setItem(`memory_game_save_${playerId}`, JSON.stringify(gameState));
  } catch (e) {
    console.warn('localStorage保存失败:', e);
  }
  
  if (useBeacon && navigator.sendBeacon) {
    try {
      const blob = new Blob([JSON.stringify(gameState)], { type: 'application/json' });
      navigator.sendBeacon(`${API_BASE_URL}/game/save`, blob);
      return;
    } catch (e) {
      console.warn('sendBeacon失败，使用fetch:', e);
    }
  }
  
  try {
    await fetch(`${API_BASE_URL}/game/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(gameState)
    });
  } catch (error) {
    console.error('服务器保存进度失败:', error);
  }
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveGameProgress();
  }, 300);
}

async function loadGameProgress() {
  if (!playerId) return null;
  
  let serverSession = null;
  try {
    const response = await fetch(`${API_BASE_URL}/game/load?playerId=${encodeURIComponent(playerId)}`);
    const data = await response.json();
    
    if (data.success && data.session) {
      serverSession = data.session;
    }
  } catch (error) {
    console.error('从服务器加载进度失败:', error);
  }
  
  let localSession = null;
  try {
    const localData = localStorage.getItem(`memory_game_save_${playerId}`);
    if (localData) {
      localSession = JSON.parse(localData);
    }
  } catch (e) {
    console.error('从localStorage加载进度失败:', e);
  }
  
  if (serverSession && localSession) {
    return (serverSession.savedAt || 0) >= (localSession.savedAt || 0) ? serverSession : localSession;
  }
  
  return serverSession || localSession;
}

async function resetGameProgress() {
  if (!playerId) return;
  
  try {
    localStorage.removeItem(`memory_game_save_${playerId}`);
  } catch (e) {
    console.warn('清除localStorage进度失败:', e);
  }
  
  try {
    await fetch(`${API_BASE_URL}/game/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ playerId: playerId })
    });
  } catch (error) {
    console.error('重置服务器进度失败:', error);
  }
}

async function initGame() {
  playerId = getOrCreatePlayerId();
  
  const savedSession = await loadGameProgress();
  
  if (savedSession && savedSession.cards && savedSession.cards.length > 0 && savedSession.matchedPairs < 8) {
    restoreGameSession(savedSession);
  } else {
    resetGameState();
    const shuffledCards = await fetchShuffledCards();
    renderCards(shuffledCards);
  }
}

function restoreGameSession(session) {
  resetGameState();
  
  cardIds = session.cards;
  matchedPairs = session.matchedPairs;
  moves = session.moves;
  elapsedTime = session.elapsedTime;
  gameStarted = session.gameStarted;
  
  if (session.playerName) {
    playerNameInput.value = session.playerName;
  }
  
  renderCards(cardIds);
  
  cards.forEach((card, index) => {
    if (session.matchedIndices && session.matchedIndices.includes(index)) {
      card.classList.add('flipped', 'matched');
    } else if (session.flippedIndices && session.flippedIndices.includes(index)) {
      card.classList.add('flipped');
      flippedCards.push(card);
    }
  });
  
  movesEl.textContent = moves;
  matchedEl.textContent = `${matchedPairs}/8`;
  updateTimerDisplay();
  
  if (gameStarted && matchedPairs < 8) {
    startTimer();
  }
}

function resetGameState() {
  cards = [];
  flippedCards = [];
  matchedPairs = 0;
  moves = 0;
  elapsedTime = 0;
  gameStarted = false;
  isProcessing = false;
  cardIds = [];
  
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  
  updateTimerDisplay();
  movesEl.textContent = '0';
  matchedEl.textContent = '0/8';
  gameBoard.innerHTML = '';
}

async function fetchShuffledCards() {
  try {
    const response = await fetch(`${API_BASE_URL}/shuffle`);
    const data = await response.json();
    cardIds = data.cards;
    return data.cards;
  } catch (error) {
    console.error('获取洗牌数据失败:', error);
    const fallbackCards = [];
    for (let i = 1; i <= 8; i++) {
      fallbackCards.push(i, i);
    }
    for (let i = fallbackCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fallbackCards[i], fallbackCards[j]] = [fallbackCards[j], fallbackCards[i]];
    }
    cardIds = fallbackCards;
    return fallbackCards;
  }
}

function renderCards(cardIds) {
  cardIds.forEach((cardId, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = cardId;
    card.dataset.index = index;
    
    const cardBack = document.createElement('div');
    cardBack.className = 'card-face card-back';
    
    const cardFront = document.createElement('div');
    cardFront.className = 'card-face card-front';
    cardFront.textContent = CARD_EMOJIS[cardId] || '鉂?';
    
    card.appendChild(cardBack);
    card.appendChild(cardFront);
    
    card.addEventListener('click', () => handleCardClick(card));
    
    gameBoard.appendChild(card);
    cards.push(card);
  });
}

function handleCardClick(card) {
  if (isProcessing) return;
  if (card.classList.contains('flipped')) return;
  if (card.classList.contains('matched')) return;
  if (flippedCards.length >= 2) return;

  if (!gameStarted) {
    startTimer();
    gameStarted = true;
  }

  flipCard(card);
  flippedCards.push(card);

  if (flippedCards.length === 2) {
    moves++;
    movesEl.textContent = moves;
    checkMatch();
  } else {
    scheduleSave();
  }
}

function flipCard(card) {
  card.classList.add('flipped');
}

function unflipCard(card) {
  card.classList.remove('flipped');
}

function checkMatch() {
  isProcessing = true;
  
  const [card1, card2] = flippedCards;
  const id1 = parseInt(card1.dataset.id);
  const id2 = parseInt(card2.dataset.id);

  if (id1 === id2) {
    setTimeout(() => {
      card1.classList.add('matched');
      card2.classList.add('matched');
      matchedPairs++;
      matchedEl.textContent = `${matchedPairs}/8`;
      flippedCards = [];
      isProcessing = false;
      scheduleSave();
      
      if (matchedPairs === 8) {
        endGame();
      }
    }, 500);
  } else {
    setTimeout(() => {
      unflipCard(card1);
      unflipCard(card2);
      flippedCards = [];
      isProcessing = false;
      scheduleSave();
    }, 1000);
  }
}

function startTimer() {
  startTime = Date.now() - elapsedTime;
  timer = setInterval(() => {
    elapsedTime = Date.now() - startTime;
    updateTimerDisplay();
  }, 100);
}

function updateTimerDisplay() {
  const totalSeconds = Math.floor(elapsedTime / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function endGame() {
  clearInterval(timer);
  timer = null;
  
  finalTimeEl.textContent = timerEl.textContent;
  finalMovesEl.textContent = moves;
  
  saveGameProgress();
  
  setTimeout(() => {
    winModal.classList.remove('hidden');
  }, 500);
}

async function submitScore() {
  const playerName = playerNameInput.value.trim() || '匿名玩家';
  const timeInSeconds = Math.floor(elapsedTime / 1000);

  try {
    const response = await fetch(`${API_BASE_URL}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        time: timeInSeconds,
        playerName: playerName
      })
    });

    const data = await response.json();
    
    if (data.success) {
      await resetGameProgress();
      alert(`恭喜！你排名第 ${data.rank} 名！`);
      winModal.classList.add('hidden');
      showLeaderboard();
    }
  } catch (error) {
    console.error('提交成绩失败:', error);
    alert('提交成绩失败，请稍后重试');
  }
}

async function showLeaderboard() {
  try {
    const response = await fetch(`${API_BASE_URL}/leaderboard`);
    const data = await response.json();
    renderLeaderboard(data.leaderboard);
  } catch (error) {
    console.error('获取排行榜失败:', error);
    leaderboardList.innerHTML = '<li>加载排行榜失败</li>';
  }
  
  leaderboardModal.classList.remove('hidden');
}

function renderLeaderboard(leaderboard) {
  if (!leaderboard || leaderboard.length === 0) {
    leaderboardList.innerHTML = '<li class="empty-message">暂无记录，快来挑战吧！</li>';
    return;
  }

  leaderboardList.innerHTML = '';
  
  leaderboard.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'rank-item';
    
    const minutes = Math.floor(entry.time / 60);
    const seconds = entry.time % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    li.innerHTML = `
      <span class="rank-name">
        <span class="rank">#${index + 1}</span>
        <span class="name">${entry.playerName}</span>
      </span>
      <span class="time">${timeStr}</span>
    `;
    
    leaderboardList.appendChild(li);
  });
}

restartBtn.addEventListener('click', async () => {
  await resetGameProgress();
  initGame();
});

playAgainBtn.addEventListener('click', async () => {
  winModal.classList.add('hidden');
  await resetGameProgress();
  initGame();
});

leaderboardBtn.addEventListener('click', showLeaderboard);
closeLeaderboardBtn.addEventListener('click', () => {
  leaderboardModal.classList.add('hidden');
});
submitScoreBtn.addEventListener('click', submitScore);

window.addEventListener('beforeunload', () => {
  saveGameProgress(true);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveGameProgress(true);
  }
});

initGame();
