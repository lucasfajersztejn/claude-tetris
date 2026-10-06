'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const RETRO_COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

// Paleta activa: la reemplaza setSkin() según la skin elegida.
let COLORS = RETRO_COLORS;

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
const themeBtn = document.getElementById('theme-toggle');

let themeColors;

function readThemeColors() {
  const s = getComputedStyle(document.documentElement);
  themeColors = {
    // Neon fuerza fondo negro: rejilla oscura fija para que se vea en ambos temas
    grid: document.documentElement.dataset.skin === 'neon' ? '#1c1c28' : s.getPropertyValue('--grid').trim(),
    highlight: s.getPropertyValue('--highlight').trim(),
  };
}

let board, current, next, held, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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

// ---- Skins: cada una aporta su paleta y su función de dibujo de bloque ----
function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = themeColors.highlight;
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  context.fillRect(px + 5, py + 5, size - 10, 2);
}

function drawPastelBlock(context, px, py, size, color) {
  const r = size * 0.28;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(px + 1 + r, py + 1);
  context.arcTo(px + size - 1, py + 1, px + size - 1, py + size - 1, r);
  context.arcTo(px + size - 1, py + size - 1, px + 1, py + size - 1, r);
  context.arcTo(px + 1, py + size - 1, px + 1, py + 1, r);
  context.arcTo(px + 1, py + 1, px + size - 1, py + 1, r);
  context.closePath();
  context.fill();
  context.fillStyle = 'rgba(255, 255, 255, 0.45)';
  context.fillRect(px + r, py + 4, size - 2 * r, 3);
}

function drawPixelBlock(context, px, py, size, color) {
  const p = Math.max(2, Math.round(size / 10));
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // textura determinista: píxeles claros/oscuros según posición
  const n = Math.floor((size - 2) / p);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const k = (i * 3 + j * 5 + i * j) % 7;
      if (k === 0) context.fillStyle = 'rgba(255, 255, 255, 0.28)';
      else if (k === 3) context.fillStyle = 'rgba(0, 0, 0, 0.22)';
      else continue;
      context.fillRect(px + 1 + i * p, py + 1 + j * p, p, p);
    }
  }
  // borde oscuro y brillo pixelado
  context.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  context.lineWidth = 2;
  context.strokeRect(px + 2, py + 2, size - 4, size - 4);
  context.fillStyle = 'rgba(255, 255, 255, 0.5)';
  context.fillRect(px + 3, py + 3, p * 2, p);
}

const SKINS = {
  retro: { colors: RETRO_COLORS, drawBlock: drawRetroBlock },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d400ff', '#39ff14', '#ff1744', '#2979ff', '#ff9100'],
    drawBlock: drawNeonBlock,
  },
  pastel: {
    colors: [null, '#a8e6e2', '#fff1b8', '#d9c2f0', '#bfe8c3', '#f7b9c2', '#b9d4f5', '#fcd5b0'],
    drawBlock: drawPastelBlock,
  },
  pixel: {
    colors: [null, '#29b6c9', '#e8b923', '#8e44ad', '#4caf50', '#d84a4a', '#3f7fd0', '#e67e22'],
    drawBlock: drawPixelBlock,
  },
};

let skinName = 'retro';

function setSkin(name) {
  if (!SKINS[name]) name = 'retro';
  skinName = name;
  COLORS = SKINS[name].colors;
  document.documentElement.dataset.skin = name;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.save();
  context.globalAlpha = alpha ?? 1;
  SKINS[skinName].drawBlock(context, x * size, y * size, size, COLORS[colorIndex]);
  context.restore();
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
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
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
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
  // el selector de skin no debe robar las teclas del juego
  if (e.target === skinSelect) skinSelect.blur();
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

restartBtn.addEventListener('click', init);

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

const skinSelect = document.getElementById('skin-select');
skinSelect.addEventListener('change', () => {
  setSkin(skinSelect.value);
  try { localStorage.setItem('skin', skinName); } catch (e) {}
  skinSelect.blur(); // evita que Space cambie la skin durante la partida
  readThemeColors();
  draw();
  drawNext();
  drawHold();
});

try { setSkin(localStorage.getItem('skin')); } catch (e) { setSkin('retro'); }
skinSelect.value = skinName;

readThemeColors();
init();
