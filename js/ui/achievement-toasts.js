/**
 * Floating "achievement unlocked" toasts, for unlocks that happen
 * outside a dialog: the ones credited at startup (from history after an
 * update or an imported backup, or added by a newer catalog). A won
 * game's unlocks are listed inside the Puzzle Solved dialog instead (see
 * js/ui/completion-dialog.js): that dialog is modal, and a toast outside
 * a modal dialog is inert — skipped by screen readers — while being
 * drawn over the dialog itself.
 *
 * So a toast never gets in the way:
 *  - it only shows on the main menu, with no dialog open and the page
 *    visible — never over a puzzle, its controls, or another screen's
 *    (styles.css places it clear of the menu's own buttons at every
 *    size); until then it waits. Opening the Achievements screen
 *    dismisses it: the same unlocks are listed right there;
 *  - it's never focusable and is click-through (styles.css), so it
 *    can't take focus or swallow a tap;
 *  - one shows at a time, and unlocks that arrive while one is waiting
 *    join it (js/toast-queue.js).
 */

import { getCurrentScreen, onScreenChange } from '../screens.js';
import { createToastQueue } from '../toast-queue.js';
import { describeUnlockBatch } from '../achievement-view.js';
import { badgeSvg } from './achievement-badges.js';

const TOAST_SCREENS = new Set(['menu']);
const VISIBLE_MS = 6000;
const GAP_MS = 400;
const LEAVE_MS = 200; // styles.css's --duration-dialog, the exit fade

const region = document.getElementById('achievement-toasts');
let queue;

function canShow() {
  return TOAST_SCREENS.has(getCurrentScreen()) && document.visibilityState === 'visible' && !document.querySelector('dialog[open]');
}

function line(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function buildToast(ids) {
  const batch = describeUnlockBatch(ids);
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';
  toast.insertAdjacentHTML('afterbegin', badgeSvg(batch.shown[0]?.category, true));
  const count = line('achievement-toast-count', `+${batch.count}`); // the badge-only variant's label
  count.setAttribute('aria-hidden', 'true');
  toast.append(count);
  const text = document.createElement('p');
  text.className = 'achievement-toast-text';
  text.append(
    line('achievement-toast-title', `${batch.title}.`),
    line('achievement-toast-names', `${batch.list}.`),
    line('achievement-toast-note', "From games you'd already played — see Achievements.")
  );
  toast.append(text);
  return toast;
}

function show(ids) {
  region.replaceChildren(buildToast(ids));
}

function hide() {
  const toast = region.firstElementChild;
  if (!toast) return;
  toast.classList.add('is-leaving');
  setTimeout(() => toast.remove(), LEAVE_MS);
}

function handleScreenChange(screenId) {
  // Leaving for a game or another screen means the player moved on (or
  // went to the Achievements screen, which lists these unlocks anyway).
  if (TOAST_SCREENS.has(screenId)) queue.update();
  else queue.dismiss();
}

// A dialog opening covers the toast, and a hidden page can't be read:
// either one puts it back in line, to show again once that's over.
function handleCoverChange() {
  if (canShow()) queue.update();
  else queue.interrupt();
}

/** `startupUnlocks`: what initAchievementProgress() unlocked at startup. */
export function initAchievementToasts(startupUnlocks = []) {
  queue = createToastQueue({ canShow, show, hide, visibleMs: VISIBLE_MS, gapMs: GAP_MS });
  onScreenChange(handleScreenChange);
  document.addEventListener('visibilitychange', handleCoverChange);
  // Every <dialog> opens and closes by toggling its `open` attribute.
  new MutationObserver(handleCoverChange).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
  queue.enqueue(startupUnlocks);
}
