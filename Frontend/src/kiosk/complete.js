/**
 * MediKIOSK — Complete / Summary Generation Step (Hospital Grade)
 */

import { generateSummary } from '../api.js';
import { getState, resetKiosk } from '../state.js';
import { showToast } from '../components/toast.js';

export function renderComplete() {
  const el = document.createElement('div');
  el.className = 'kiosk__panel fade-in';
  el.innerHTML = `
    <div class="card complete-card">
      <div id="complete-icon-wrap" class="complete__icon registration__icon-wrap" style="background:var(--primary-light); color:var(--primary);">
        <svg class="icon" style="width:36px;height:36px;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      </div>

      <h2 class="registration__heading" id="complete-heading" style="font-size:1.5rem;">You're all checked in</h2>
      <p id="complete-sub" class="complete__sub">
        Your answers are being prepared for the care team. The next patient can begin now.
      </p>

      <div id="complete-actions" class="complete__actions">
        <button class="btn btn--primary btn--lg" id="complete-new-btn">
          Start Next Check-In
        </button>
      </div>
    </div>
  `;
  return el;
}

export function mountComplete() {
  triggerSummaryInBackground();
  showDone(
    true,
    "You're all checked in",
    'Your answers are being prepared for the care team. The next patient can begin now.',
  );
  document.getElementById('complete-new-btn')?.addEventListener('click', () => {
    resetKiosk();
  });
}

export function cleanupComplete() {
}

function triggerSummaryInBackground() {
  const s = getState();
  const sessionId = s.session?.id;

  if (!sessionId) {
    showDone(false, 'Session Not Found', 'No active session recorded.');
    return;
  }

  generateSummary(sessionId)
    .then(() => showToast('Report generation queued for doctor review.', 'success'))
    .catch((err) => {
      showToast(err.message || 'Report queue failed. Staff can still review the transcript.', 'warning');
    });
}

function showDone(success, heading, sub) {
  const iconWrap = document.getElementById('complete-icon-wrap');
  const headingEl = document.getElementById('complete-heading');
  const subEl = document.getElementById('complete-sub');
  const actionsEl = document.getElementById('complete-actions');

  if (iconWrap) {
    iconWrap.style.background = success ? 'var(--success-bg)' : 'var(--danger-bg)';
    iconWrap.style.color = success ? 'var(--success)' : 'var(--danger)';
    iconWrap.innerHTML = success
      ? '<svg class="icon" style="width:36px;height:36px;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg class="icon" style="width:36px;height:36px;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }

  if (headingEl) headingEl.textContent = heading;
  if (subEl) subEl.textContent = sub;
  if (actionsEl) {
    actionsEl.hidden = !success;
    actionsEl.style.display = success ? 'block' : 'none';
  }
}
