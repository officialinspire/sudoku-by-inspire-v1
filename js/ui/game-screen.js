import { generatePuzzle, DIFFICULTIES } from '../sudoku-generator.js';

const statusEl = document.getElementById('game-status');

let currentGame = null;

export function getCurrentGame() {
  return currentGame;
}

function renderStatus(message) {
  statusEl.textContent = message;
}

// Difficulty selection UI doesn't exist yet (Phase 5 territory — the
// board screen isn't built either). New Game defaults to Easy for now
// so this phase has something real to generate and display status for.
export async function startNewGame(difficultyId = 'easy') {
  currentGame = null;
  renderStatus('Generating puzzle…');

  const result = await generatePuzzle(difficultyId, {
    onStatus: (info) => {
      if (info.status === 'generating' && info.attempt > 1) {
        renderStatus(`Generating puzzle… (attempt ${info.attempt}/${info.maxAttempts})`);
      }
    },
  });

  currentGame = result;

  const label = DIFFICULTIES[difficultyId].label;
  const clueWord = result.clueCount === 1 ? 'clue' : 'clues';
  const detail =
    result.status === 'generated'
      ? `generated in ${Math.round(result.elapsedMs)}ms, attempt ${result.attempts}`
      : `live generation didn't finish in time — used a bundled puzzle`;

  renderStatus(`Ready — ${label} puzzle, ${result.clueCount} ${clueWord} (${detail}).`);
}
