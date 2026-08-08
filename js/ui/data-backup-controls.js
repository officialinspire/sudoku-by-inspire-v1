import { buildBackup, applyBackup } from '../data-backup.js';
import { suspendTimer, resumeTimer } from '../game-state.js';

const exportBtn = document.getElementById('btn-export-data');
const importBtn = document.getElementById('btn-import-data');
const fileInput = document.getElementById('import-data-file-input');
const statusEl = document.getElementById('import-data-status');
const confirmDialog = document.getElementById('import-data-confirm-dialog');
const confirmMessageEl = document.getElementById('import-data-confirm-message');

// Set once a selected file passes the initial shape check, consumed by
// the confirm dialog's 'close' handler — keeps the actual write gated
// behind an explicit confirmation, same as every other destructive
// action in this app (Clear Data, the per-difficulty clears).
let pendingBackup = null;

function formatBackupDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'an unknown date' : date.toLocaleString();
}

function downloadBackup() {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sudoku-by-inspire-backup-${new Date().toISOString().slice(0, 10)}.json`;
  // Firefox requires the link to actually be in the document for
  // .click() to trigger a download reliably; briefly appending and
  // removing it is invisible and standard practice for this pattern.
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  statusEl.textContent = 'Backup downloaded.';
}

function handleFileSelected(event) {
  const file = event.target.files[0];
  fileInput.value = ''; // clears the picker so selecting the same file again still fires 'change'
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      statusEl.textContent = 'That file is not valid JSON.';
      return;
    }
    // A cheap upfront check so an obviously-wrong file gets an instant
    // answer instead of opening a confirmation dialog for an import
    // that's just going to fail anyway — applyBackup() (called after
    // confirmation) is still the authoritative check.
    if (!parsed || parsed.app !== 'Sudoku by Inspire' || typeof parsed.data !== 'object') {
      statusEl.textContent = "That file doesn't look like a Sudoku by Inspire backup.";
      return;
    }

    pendingBackup = parsed;
    confirmMessageEl.textContent =
      `This overwrites your current settings, statistics, high scores, and saved game with the backup from ${formatBackupDate(parsed.exportedAt)}. This can't be undone.`;
    suspendTimer('dialog');
    confirmDialog.showModal();
  };
  reader.onerror = () => {
    statusEl.textContent = 'Could not read that file.';
  };
  reader.readAsText(file);
}

export function initDataBackupControls() {
  exportBtn.addEventListener('click', downloadBackup);
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelected);

  confirmDialog.addEventListener('close', () => {
    resumeTimer('dialog');
    if (confirmDialog.returnValue === 'confirm' && pendingBackup) {
      const result = applyBackup(pendingBackup);
      if (result.ok) {
        // Several store modules cache their own settings in memory
        // after init() and only update that cache through their own
        // setters (see js/data-backup.js's doc comment) — a reload is
        // what actually makes the restored data take effect everywhere,
        // not just in localStorage.
        location.reload();
      } else {
        statusEl.textContent = result.reason;
      }
    }
    pendingBackup = null;
  });
}
