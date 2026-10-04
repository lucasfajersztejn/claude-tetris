# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No `package.json`, no build, no lint, no tests. UI text is in Spanish (README, overlay strings).

## Running

Open `index.html` directly, or serve statically: `python -m http.server 8000` then visit `http://localhost:8000`.

## Architecture

Three files, all logic in `game.js` (single script, no modules, global state via top-level `let`).

- `index.html` declares DOM ids that `game.js` looks up at load: `board` (300x600 canvas), `next-canvas` (120x120), `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`. Renaming any id breaks the game.
- Board is a `ROWS x COLS` matrix; cell is `0` or piece type 1-7. The same index selects the entry in `COLORS` and `PIECES`.
- Game loop: `loop(ts)` on `requestAnimationFrame` accumulates `dropAccum` and drops one row when it exceeds `dropInterval`. `init()` resets all state; the restart button calls it. Pause cancels the frame and `togglePause` restarts `loop`.
- Piece lifecycle: `lockPiece()` = `merge()` -> `clearLines()` -> `spawn()`. `spawn()` calls `endGame()` if the new piece collides immediately.
- Scoring/speed live in `clearLines()` (`LINE_SCORES[n] * level`, level = lines/10 + 1, `dropInterval = max(100, 1000 - (level-1)*90)`), `softDrop()` (+1/row) and `hardDrop()` (+2/row).

## Gotchas

- Changing `COLS`, `ROWS` or `BLOCK` requires updating the `width`/`height` attributes of `<canvas id="board">` in `index.html` by hand.
- The next-piece preview uses a hardcoded 4x4 grid with `NB = 30` in `drawNext()`.
- Rotation is plain CW matrix rotation with horizontal kicks `[0,-1,1,-2,2]` only (no SRS tables, no floor kicks). Piece selection is uniform random (no 7-bag).
- `README.md` is a detailed Spanish description; keep it in sync if behavior changes.
