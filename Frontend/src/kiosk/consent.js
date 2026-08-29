/**
 * MediKIOSK - Patient Informed Consent & Terms of Intake (Hospital Grade)
 * Authentic clinical legal document layout. Zero glassmorphism, crisp institutional styling, 100% visible on one screen.
 */

import { recordConsent } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';

export function renderConsent() {
  const s = getState();
  const name = s.patient?.display_name || 'Patient';
  const mrn = s.patient?.external_id || s.patient?.mrn || s.session?.id?.slice(0, 8).toUpperCase() || 'NEW-RECORD';
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const el = document.createElement('div');
  el.className = 'kiosk__panel kiosk__panel--consent fade-in';
  el.innerHTML = `
    <div class="consent-document">
      
      <!-- Institutional Document Header -->
      <div class="consent-document__header">
        <div class="consent-document__header-top">
          <div class="consent-document__org">
            <span class="consent-document__badge">OFFICIAL INTAKE DOCUMENT</span>
            <span class="consent-document__code">DOC REF: MED-TOS-2026.4</span>
          </div>
          <span class="consent-document__facility">AMBULATORY CARE &amp; OPD SERVICES</span>
        </div>
        <h1 class="consent-document__title">Patient Informed Consent &amp; Terms of Digital Intake</h1>
      </div>

      <!-- Patient & Session Metadata Bar -->
      <div class="consent-document__patient-bar">
        <div class="consent-document__meta-item">
          <span class="consent-document__meta-label">Patient:</span>
          <span class="consent-document__meta-value">${escapeHtml(name)}</span>
        </div>
        <div class="consent-document__meta-item">
          <span class="consent-document__meta-label">MRN / ID:</span>
          <span class="consent-document__meta-value">${escapeHtml(mrn)}</span>
        </div>
        <div class="consent-document__meta-item">
          <span class="consent-document__meta-label">Date:</span>
          <span class="consent-document__meta-value">${currentDate}</span>
        </div>
        <div class="consent-document__meta-item">
          <span class="consent-document__meta-label">Status:</span>
          <span class="consent-document__meta-value consent-document__meta-value--status">Pending Consent</span>
        </div>
      </div>

      <!-- 4 Formal Terms of Service Clauses in 2x2 Grid -->
      <div class="consent-document__clauses">
        
        <div class="consent-clause">
          <div class="consent-clause__tag">&sect; 1.0</div>
          <div class="consent-clause__content">
            <h2 class="consent-clause__heading">Purpose &amp; Scope of Digital Intake</h2>
            <p class="consent-clause__text">
              This digital intake terminal collects patient-reported symptoms, visit objectives, and medical history prior to clinical consultation to assist healthcare staff with preliminary triage.
            </p>
          </div>
        </div>

        <div class="consent-clause">
          <div class="consent-clause__tag">&sect; 2.0</div>
          <div class="consent-clause__content">
            <h2 class="consent-clause__heading">Non-Diagnostic Administrative Scope</h2>
            <p class="consent-clause__text">
              This system is strictly an administrative data collection tool. It does <strong>not</strong> provide medical diagnoses, treatment recommendations, or prescriptions. Diagnosis is performed solely by your attending physician.
            </p>
          </div>
        </div>

        <div class="consent-clause">
          <div class="consent-clause__tag">&sect; 3.0</div>
          <div class="consent-clause__content">
            <h2 class="consent-clause__heading">Confidentiality &amp; EHR Integration</h2>
            <p class="consent-clause__text">
              All submitted health information is confidential, encrypted end-to-end, and transmitted directly into your hospital Electronic Health Record (EHR) in compliance with clinical privacy standards.
            </p>
          </div>
        </div>

        <div class="consent-clause">
          <div class="consent-clause__tag">&sect; 4.0</div>
          <div class="consent-clause__content">
            <h2 class="consent-clause__heading">Emergency &amp; Acute Symptoms Warning</h2>
            <p class="consent-clause__text">
              This kiosk is not designed for critical or life-threatening emergencies. If experiencing severe chest pain, shortness of breath, heavy bleeding, or acute trauma, notify the triage desk immediately.
            </p>
          </div>
        </div>

      </div>

      <!-- Patient Attestation Banner -->
      <div class="consent-document__attestation">
        <label class="consent-document__checkbox-label">
          <input type="checkbox" id="consent-attestation-check" class="consent-document__checkbox" checked />
          <span>
            <strong>Patient Acknowledgment:</strong> I confirm that I am the patient or an authorized representative, have reviewed the intake terms above, and consent to electronic recording of my clinical history for physician review.
          </span>
        </label>
      </div>

      <!-- Institutional Footer Actions -->
      <div class="consent-document__actions">
        <button type="button" class="consent-btn consent-btn--secondary" id="consent-decline-btn">
          Decline (Request Desk Assistance)
        </button>
        <button type="button" class="consent-btn consent-btn--primary" id="consent-accept-btn">
          I Accept Terms &amp; Begin Intake &rarr;
        </button>
      </div>

    </div>
  `;
  return el;
}

export function mountConsent() {
  const checkbox = document.getElementById('consent-attestation-check');
  const acceptBtn = document.getElementById('consent-accept-btn');

  if (checkbox && acceptBtn) {
    checkbox.addEventListener('change', () => {
      acceptBtn.disabled = !checkbox.checked;
    });
  }

  acceptBtn?.addEventListener('click', async () => {
    const s = getState();
    acceptBtn.disabled = true;
    acceptBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:6px;"></span> Recording Consent...';

    try {
      await recordConsent(s.session.id, true);
      setState({ kioskStep: 2 });
      showToast('Consent recorded. Starting clinical intake.', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to record consent', 'error');
      acceptBtn.disabled = false;
      acceptBtn.innerHTML = 'I Accept Terms &amp; Begin Intake &rarr;';
    }
  });

  document.getElementById('consent-decline-btn')?.addEventListener('click', async () => {
    const s = getState();
    try {
      await recordConsent(s.session.id, false);
      showToast('Consent declined. Please report to the reception desk for manual intake.', 'warning');
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

