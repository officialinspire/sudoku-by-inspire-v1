/**
 * Shared "which difficulty am I looking at" tab control, used by both
 * the Statistics and High Scores screens — identical behavior in both
 * places, so it's one small module instead of two copies that could
 * drift apart.
 *
 * Implements the standard WAI-ARIA tabs pattern: each button is
 * `role="tab"`, only the selected one is in the natural Tab order
 * (roving `tabindex`), and Left/Right/Home/End move both focus and
 * selection between tabs — Tabbing *into* the group lands on the
 * selected tab, Tabbing *out* skips the other three entirely, matching
 * how a native tab widget behaves.
 */
export function initDifficultyFilter(containerEl, onChange) {
  const buttons = [...containerEl.querySelectorAll('[data-difficulty]')];
  const panelId = containerEl.dataset.panel;
  let selected = buttons[0]?.dataset.difficulty ?? 'easy';

  buttons.forEach((btn) => {
    btn.id = btn.id || `${containerEl.id}-tab-${btn.dataset.difficulty}`;
    btn.setAttribute('role', 'tab');
    if (panelId) btn.setAttribute('aria-controls', panelId);
  });

  function applySelection(id) {
    selected = id;
    for (const btn of buttons) {
      const isSelected = btn.dataset.difficulty === id;
      btn.setAttribute('aria-selected', String(isSelected));
      btn.tabIndex = isSelected ? 0 : -1;
    }
  }

  function select(id) {
    applySelection(id);
    onChange(id);
  }

  containerEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-difficulty]');
    if (!btn) return;
    select(btn.dataset.difficulty);
  });

  containerEl.addEventListener('keydown', (event) => {
    const { key } = event;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
    event.preventDefault();

    const currentIndex = buttons.findIndex((btn) => btn.dataset.difficulty === selected);
    let nextIndex = currentIndex;
    if (key === 'ArrowLeft') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    else if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;
    else if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = buttons.length - 1;

    const nextBtn = buttons[nextIndex];
    select(nextBtn.dataset.difficulty);
    nextBtn.focus();
  });

  applySelection(selected);

  return { select, getSelected: () => selected };
}
