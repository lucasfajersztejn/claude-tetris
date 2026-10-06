'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const recordsBox = document.getElementById('records');
const recordsList = document.getElementById('records-list');
const recordsBests = document.getElementById('records-bests');
const resetRecordsBtn = document.getElementById('reset-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const themeBtn = document.getElementById('theme-toggle');

let themeColors;

function readThemeColors() {
  const s = getComputedStyle(document.documentElement);
  themeColors = {
    grid: s.getPropertyValue('--grid').trim(),
    highlight: s.getPropertyValue('--highlight').trim(),
  };
}

let board, current, next, held, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false, combo, maxCombo, pendingRecord;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  combo = cleared ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = themeColors.highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = themeColors.grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawPreview(context, cvs, piece) {
  const NB = 30;
  context.clearRect(0, 0, cvs.width, cvs.height);
  if (!piece) return;
  const shape = piece.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB);
}

function drawNext() {
  drawPreview(nextCtx, nextCanvas, next);
}

function drawHold() {
  drawPreview(holdCtx, holdCanvas, held);
  holdCanvas.style.setProperty('--c', held ? COLORS[held.type] : '');
  holdCanvas.classList.toggle('has-piece', !!held);
}

// H: guarda la pieza actual (solo si el hueco está libre) y pasa a la siguiente.
function holdPiece() {
  if (held) return;
  held = { type: current.type, shape: PIECES[current.type].map(row => [...row]) };
  drawHold();
  dropAccum = 0;
  spawn();
}

// J: suelta la pieza guardada y la pone en juego, liberando el hueco.
function releasePiece() {
  if (!held) return;
  const shape = held.shape;
  current = { type: held.type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
  held = null;
  drawHold();
  dropAccum = 0;
  if (collide(current.shape, current.x, current.y)) endGame();
}

// ---- Records (localStorage.highscores / localStorage.bests) ----
const MAX_RECORDS = 5;

function loadRecords() {
  try {
    const list = JSON.parse(localStorage.getItem('highscores'));
    if (!Array.isArray(list)) return [];
    return list
      .filter(r => r && Number.isFinite(r.score))
      .map(r => ({ name: String(r.name || 'Anónimo').slice(0, 12), score: r.score, lines: r.lines | 0, combo: r.combo | 0, date: r.date }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (e) { return []; }
}

function saveRecords(list) {
  try { localStorage.setItem('highscores', JSON.stringify(list)); } catch (e) {}
}

function loadBests() {
  try {
    const b = JSON.parse(localStorage.getItem('bests'));
    return { combo: (b && b.combo) | 0, lines: (b && b.lines) | 0 };
  } catch (e) { return { combo: 0, lines: 0 }; }
}

function renderRecords(list, highlight = -1, pendingName = null) {
  recordsList.textContent = '';
  for (let i = 0; i < MAX_RECORDS; i++) {
    const li = document.createElement('li');
    const rank = document.createElement('span');
    const name = document.createElement('span');
    const pts = document.createElement('span');
    name.className = 'rec-name';
    rank.textContent = `${i + 1}.`;
    const r = list[i];
    if (r) {
      name.textContent = i === highlight && pendingName !== null ? pendingName : r.name;
      pts.textContent = r.score.toLocaleString();
      if (i === highlight) li.classList.add('highlight');
    } else {
      li.classList.add('empty');
      name.textContent = '---';
    }
    li.append(rank, name, pts);
    recordsList.appendChild(li);
  }
  const b = loadBests();
  recordsBests.textContent = `Mejor combo: ${b.combo} · Líneas máx.: ${b.lines}`;
  recordsBox.classList.remove('hidden');
}

// Guarda la puntuación pendiente (si la hay) con el nombre escrito.
function commitRecord() {
  if (!pendingRecord) return;
  const name = nameInput.value.trim().slice(0, 12) || 'Anónimo';
  const list = loadRecords();
  const entry = { ...pendingRecord, name };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX_RECORDS);
  saveRecords(top);
  pendingRecord = null;
  nameForm.classList.add('hidden');
  renderRecords(top, top.indexOf(entry));
}

function resetRecords() {
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem('highscores'); localStorage.removeItem('bests'); } catch (e) {}
  pendingRecord = null;
  nameForm.classList.add('hidden');
  renderRecords([]);
}

function showStart() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  nameForm.classList.add('hidden');
  renderRecords(loadRecords());
  overlay.classList.remove('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  restartBtn.textContent = 'Reiniciar';
  const bests = loadBests();
  bests.combo = Math.max(bests.combo, maxCombo);
  bests.lines = Math.max(bests.lines, lines);
  try { localStorage.setItem('bests', JSON.stringify(bests)); } catch (e) {}
  const list = loadRecords();
  const rank = list.filter(r => r.score >= score).length;
  if (score > 0 && rank < MAX_RECORDS) {
    pendingRecord = { score, lines, combo: maxCombo, date: new Date().toISOString() };
    const preview = list.slice();
    preview.splice(rank, 0, pendingRecord);
    renderRecords(preview.slice(0, MAX_RECORDS), rank, '???');
    nameInput.value = '';
    nameForm.classList.remove('hidden');
    setTimeout(() => nameInput.focus(), 0);
  } else {
    pendingRecord = null;
    nameForm.classList.add('hidden');
    renderRecords(list);
  }
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    recordsBox.classList.add('hidden');
    restartBtn.textContent = 'Reiniciar';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() ya canceló el frame; no reprogramarlo
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  started = true;
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  nameForm.classList.add('hidden');
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  held = null;
  drawHold();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return; // escribir el nombre no dispara teclas de juego
  if (!started) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyH':
      holdPiece();
      break;
    case 'KeyJ':
      releasePiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  commitRecord();
  restartBtn.blur();
  init();
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitRecord();
  restartBtn.focus();
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecords();
  resetRecordsBtn.blur();
});

themeBtn.addEventListener('click', () => {
  const root = document.documentElement;
  const light = root.dataset.theme !== 'light';
  if (light) root.dataset.theme = 'light';
  else delete root.dataset.theme;
  themeBtn.setAttribute('aria-checked', light);
  try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
  themeBtn.blur(); // evita que Space active el botón durante la partida
  readThemeColors();
  draw();
  drawNext();
  drawHold();
});

themeBtn.setAttribute('aria-checked', document.documentElement.dataset.theme === 'light');

readThemeColors();
init();
// Pantalla de inicio: el juego no arranca hasta pulsar «Jugar».
cancelAnimationFrame(animId);
started = false;
draw();
showStart();
