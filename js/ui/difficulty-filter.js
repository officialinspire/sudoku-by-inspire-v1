/**
 * Shared "which difficulty am I looking at" tab control, used by both
 * the Statistics and High Scores screens — identical behavior in both
 * places, so it's one small module instead of two copies that could
 * drift apart.
 */
export function initDifficultyFilter(containerEl, onChange) {
  const buttons = [...containerEl.querySelectorAll('[data-difficulty]')];
  let selected = buttons[0]?.dataset.difficulty ?? 'easy';

  function select(id) {
    selected = id;
    for (const btn of buttons) {
      btn.setAttribute('aria-selected', String(btn.dataset.difficulty === id));
    }
    onChange(id);
  }

  containerEl.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-difficulty]');
    if (!btn) return;
    select(btn.dataset.difficulty);
  });

  return { select, getSelected: () => selected };
}
