/**
 * MediKIOSK — Consent Collection Step (Hospital Grade)
 */

import { recordConsent } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';

export function renderConsent() {
  const s = getState();
  const name = s.patient?.display_name || 'Patient';

  const el = document.createElement('div');
  el.className = 'kiosk__panel fade-in';
  el.innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="registration__icon-wrap" style="background:#ecfdf5; color:#059669;">
        <svg class="icon" style="width:32px;height:32px;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </div>
      <h2 class="registration__heading" style="font-size:1.5rem;">Before we start</h2>
      <p style="color:var(--text-sub); margin-bottom:20px; font-size:0.95rem;">
        Patient: <strong>${escapeHtml(name)}</strong>
      </p>

      <div class="consent__text">
        <p style="font-weight:700; color:var(--navy); margin-bottom:10px;">Please read this before continuing:</p>
        <ul>
          <li>An <strong>AI intake assistant</strong> will ask simple health questions before you meet the care team.</li>
          <li>This is only to collect your history and <strong>does not replace a doctor, examination, or diagnosis</strong>.</li>
          <li>Your answers will be organized into a summary for the care team to review.</li>
          <li>If you describe urgent symptoms, your visit may be marked for faster attention.</li>
          <li>You can attach prescriptions, lab reports, or referral letters later if needed.</li>
        </ul>
      </div>

      <div style="display:flex; gap:12px; justify-content:center;">
        <button class="btn btn--secondary btn--lg" id="consent-decline-btn">
          Decline
        </button>
        <button class="btn btn--primary btn--lg" id="consent-accept-btn">
          I Consent & Agree →
        </button>
      </div>
    </div>
  `;
  return el;
}

export function mountConsent() {
  document.getElementById('consent-accept-btn')?.addEventListener('click', async () => {
    const s = getState();
    const btn = document.getElementById('consent-accept-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Recording Consent...';

    try {
      await recordConsent(s.session.id, true);
      setState({ kioskStep: 2 });
      showToast('Consent recorded. Starting your questions.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to record consent', 'error');
      btn.disabled = false;
      btn.innerHTML = 'I Consent & Agree →';
    }
  });

  document.getElementById('consent-decline-btn')?.addEventListener('click', async () => {
    const s = getState();
    try {
      await recordConsent(s.session.id, false);
      showToast('Consent declined. Please report to the receptionist.', 'warning');
    } catch {
      // ignore
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
