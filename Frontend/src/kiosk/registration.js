/**
 * MediKIOSK — Patient Registration Step (Hospital Grade)
 */

import { createPatient, createSession } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';

export function renderRegistration() {
  const el = document.createElement('div');
  el.className = 'kiosk__panel fade-in';
  el.innerHTML = `
    <div class="card registration__card">
      <div class="registration__icon-wrap registration__icon-wrap--brand">
        <svg class="icon" style="width:32px;height:32px;" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <p class="kiosk__eyebrow">Patient check-in</p>
      <h1 class="registration__heading">Let's get a few details before your visit.</h1>
      <p class="registration__sub">This helps your care team prepare for you.</p>

      <form class="registration__form" id="registration-form">
        <div class="form-group">
          <label for="reg-name">Full Name *</label>
          <input type="text" id="reg-name" placeholder="e.g. John Doe" required autocomplete="name" autocapitalize="words" data-keyboard-capitalize="words" />
        </div>

        <fieldset class="registration__visit-type">
          <legend>Have you visited this hospital before?</legend>
          <label class="choice-card">
            <input type="radio" name="visit-type" value="returning" />
            <span><strong>Yes, I have a patient ID</strong><small>Use your hospital or ABHA number.</small></span>
          </label>
          <label class="choice-card">
            <input type="radio" name="visit-type" value="new" checked />
            <span><strong>No, I'm a new patient</strong><small>Continue without an ID.</small></span>
          </label>
        </fieldset>

        <div class="form-group registration__patient-id" id="registration-patient-id" hidden>
          <label for="reg-abha">Patient ID or ABHA number</label>
          <input type="text" id="reg-abha" placeholder="Enter your patient ID" />
          <button type="button" class="field-help" id="abha-help-btn">What is ABHA?</button>
          <span class="hint" id="abha-help-text" hidden>ABHA is a digital health ID. You can leave this blank if you do not have one.</span>
        </div>

        <div class="form-group">
          <label for="reg-lang">Preferred Language</label>
          <select id="reg-lang">
            <option value="en">English</option>
            <option value="hi">Hindi (हिन्दी)</option>
            <option value="bn">Bengali (বাংলা)</option>
            <option value="ta">Tamil (தமிழ்)</option>
            <option value="te">Telugu (తెలుగు)</option>
            <option value="mr">Marathi (मराठी)</option>
            <option value="gu">Gujarati (ગુજરાતી)</option>
            <option value="kn">Kannada (ಕನ್ನಡ)</option>
            <option value="ml">Malayalam (മലയാളം)</option>
          </select>
        </div>

        <button type="submit" class="btn btn--primary btn--lg btn--full" id="reg-submit-btn">
          Continue <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  `;
  return el;
}

export function mountRegistration() {
  const form = document.getElementById('registration-form');
  if (!form) return;

  const patientIdGroup = document.getElementById('registration-patient-id');
  form.querySelectorAll('input[name="visit-type"]').forEach((choice) => {
    choice.addEventListener('change', () => {
      patientIdGroup.hidden = choice.value !== 'returning' || !choice.checked;
      if (patientIdGroup.hidden) document.getElementById('reg-abha').value = '';
    });
  });
  document.getElementById('abha-help-btn')?.addEventListener('click', () => {
    const help = document.getElementById('abha-help-text');
    help.hidden = !help.hidden;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('reg-name').value.trim();
    const abha = document.getElementById('reg-abha').value.trim();
    const lang = document.getElementById('reg-lang').value;
    const btn = document.getElementById('reg-submit-btn');

    if (!name) {
      showToast('Please enter patient full name', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Starting Check-In...';

    try {
      const patient = await createPatient({
        display_name: name,
        external_id: abha || null,
        preferred_language: lang,
      });

      const session = await createSession(patient.id);

      setState({
        patient,
        session,
        kioskStep: 1,
      });

      showToast(`Welcome ${patient.display_name}. Check-in started.`, 'success');
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Start Check-In';
    }
  });
}
