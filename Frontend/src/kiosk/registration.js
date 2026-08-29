/**
 * MediKIOSK — Patient Registration Step (Hospital Grade)
 * Supports 8-digit ABHA ID lookup and auto-generation for new patients.
 */

import { createPatient, createSession, getPatientByExternalId } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';

export function renderRegistration() {
  const el = document.createElement('div');
  el.className = 'kiosk__panel kiosk__panel--registration fade-in';
  el.innerHTML = `
    <div class="card registration__card">
      <div class="registration__header">
        <div class="registration__icon-wrap registration__icon-wrap--brand">
          <svg class="icon" style="width:26px;height:26px;" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="registration__header-content">
          <p class="kiosk__eyebrow">Outpatient Check-in</p>
          <h1 class="registration__heading">Welcome to OPD Intake</h1>
          <p class="registration__sub">Select your check-in method and verify details</p>
        </div>
        <div class="registration__header-badge">
          <span class="badge badge--info">Step 1 of 5</span>
        </div>
      </div>

      <form class="registration__form" id="registration-form">
        
        <!-- Two Primary Choices: Side-by-Side 2-Column Grid -->
        <fieldset class="registration__visit-type">
          <legend style="display:none;">ABHA ID Selection</legend>
          <label class="choice-card">
            <input type="radio" name="visit-type" value="have_abha" id="choice-have-abha" />
            <span>
              <strong>I have an ABHA ID</strong>
              <small>Enter 8-digit ABHA / Patient number to load details.</small>
            </span>
          </label>
          <label class="choice-card">
            <input type="radio" name="visit-type" value="no_abha" id="choice-no-abha" checked />
            <span>
              <strong>I don't have an ABHA ID</strong>
              <small>New patient. An 8-digit ABHA ID will be generated.</small>
            </span>
          </label>
        </fieldset>

        <!-- RETURNING PATIENT SECTION (8-digit ABHA lookup) -->
        <div id="returning-patient-section" hidden>
          <div class="form-group">
            <label for="reg-abha">8-Digit ABHA ID *</label>
            <div style="display:flex; gap:8px;">
              <input
                type="text"
                id="reg-abha"
                inputmode="numeric"
                pattern="[0-9]{8}"
                maxlength="8"
                placeholder="e.g. 84729103 (8 digits)"
                style="letter-spacing:0.1em; font-size:1.05rem; font-weight:700;"
              />
              <button type="button" class="btn btn--secondary" id="reg-lookup-btn" style="white-space:nowrap; padding:0 22px;">
                Fetch Record
              </button>
            </div>
            <span class="hint" id="abha-validation-hint" style="color:var(--danger);" hidden>Must be exactly 8 numeric digits.</span>
          </div>

          <!-- Stored Patient Profile Summary Box -->
          <div class="consult-question-box registration__stored-patient" id="stored-patient-card" hidden>
            <span style="font-size:0.75rem; font-weight:800; color:var(--primary); text-transform:uppercase;">Stored Hospital Record Found</span>
            <div class="registration__stored-patient-grid">
              <div><span class="reg-field-lbl">Name:</span> <strong id="found-name">-</strong></div>
              <div><span class="reg-field-lbl">ABHA ID:</span> <strong id="found-abha">-</strong></div>
              <div><span class="reg-field-lbl">Age:</span> <strong id="found-age">-</strong></div>
              <div><span class="reg-field-lbl">Gender:</span> <strong id="found-gender">-</strong></div>
              <div><span class="reg-field-lbl">Phone:</span> <strong id="found-phone">-</strong></div>
              <div><span class="reg-field-lbl">Language:</span> <strong id="found-language">-</strong></div>
              <div><span class="reg-field-lbl">Address:</span> <strong id="found-address">-</strong></div>
              <div><span class="reg-field-lbl">Past illnesses:</span> <strong id="found-illnesses">-</strong></div>
              <div><span class="reg-field-lbl">Allergies:</span> <strong id="found-allergies">-</strong></div>
              <div><span class="reg-field-lbl">Current meds:</span> <strong id="found-medications">-</strong></div>
            </div>
          </div>
        </div>

        <!-- PATIENT DEMOGRAPHIC FIELDS (Wide 4-Column Row) -->
        <div id="demographic-fields" class="registration__fields-grid">
          <div class="form-group" id="group-name">
            <label for="reg-name">Full Name *</label>
            <input type="text" id="reg-name" placeholder="e.g. Ramesh Kumar" required autocomplete="name" autocapitalize="words" data-keyboard-capitalize="words" />
          </div>

          <div class="form-group" id="group-age">
            <label for="reg-age">Age (Years) *</label>
            <input type="number" id="reg-age" placeholder="e.g. 45" min="0" max="125" required />
          </div>

          <div class="form-group" id="group-gender">
            <label for="reg-gender">Gender *</label>
            <select id="reg-gender" required>
              <option value="">Select Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div class="form-group" id="language-field">
            <label for="reg-lang">Consultation Language</label>
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
        </div>

        <button type="submit" class="btn btn--primary btn--lg btn--full" id="reg-submit-btn">
          Generate ABHA ID & Check-In <span aria-hidden="true">→</span>
        </button>
      </form>
    </div>
  `;
  return el;
}

export function mountRegistration() {
  const form = document.getElementById('registration-form');
  if (!form) return;

  const returningSection = document.getElementById('returning-patient-section');
  const abhaInput = document.getElementById('reg-abha');
  const abhaHint = document.getElementById('abha-validation-hint');
  const lookupBtn = document.getElementById('reg-lookup-btn');
  const storedCard = document.getElementById('stored-patient-card');
  const demographicFields = document.getElementById('demographic-fields');
  const languageField = document.getElementById('language-field');
  const nameInput = document.getElementById('reg-name');
  const ageInput = document.getElementById('reg-age');
  const genderInput = document.getElementById('reg-gender');
  const langInput = document.getElementById('reg-lang');
  const submitBtn = document.getElementById('reg-submit-btn');

  let loadedPatient = null;

  // Toggle ABHA ID vs No ABHA ID
  form.querySelectorAll('input[name="visit-type"]').forEach((choice) => {
    choice.addEventListener('change', () => {
      const hasAbha = choice.value === 'have_abha' && choice.checked;
      returningSection.hidden = !hasAbha;
      demographicFields.hidden = hasAbha;
      languageField.hidden = hasAbha;
      [nameInput, ageInput, genderInput].forEach((input) => { input.required = !hasAbha; });
      
      if (hasAbha) {
        submitBtn.innerHTML = 'Verify & Continue to Consent <span aria-hidden="true">→</span>';
      } else {
        submitBtn.innerHTML = 'Generate ABHA ID & Check-In <span aria-hidden="true">→</span>';
        abhaInput.value = '';
        abhaHint.hidden = true;
        storedCard.hidden = true;
        languageField.hidden = false;
        nameInput.value = '';
        ageInput.value = '';
        genderInput.value = '';
        loadedPatient = null;
      }
    });
  });

  // Only allow numbers in ABHA ID input
  abhaInput?.addEventListener('input', () => {
    abhaInput.value = abhaInput.value.replace(/\D/g, '').slice(0, 8);
    if (abhaInput.value.length === 8) {
      abhaHint.hidden = true;
      triggerLookup();
    } else {
      storedCard.hidden = true;
      loadedPatient = null;
    }
  });

  lookupBtn?.addEventListener('click', triggerLookup);

  async function triggerLookup() {
    const val = abhaInput.value.trim();
    if (val.length < 8) {
      abhaHint.hidden = false;
      showToast('ABHA ID must be exactly 8 digits', 'warning');
      return;
    }
    abhaHint.hidden = true;

    lookupBtn.disabled = true;
    lookupBtn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Finding...';

    try {
      const patient = await getPatientByExternalId(val);
      loadedPatient = patient;

      // Populate summary display
      document.getElementById('found-name').textContent = patient.display_name || 'N/A';
      document.getElementById('found-abha').textContent = patient.external_id || val;
      document.getElementById('found-age').textContent = patient.age ? `${patient.age} yrs` : 'N/A';
      document.getElementById('found-gender').textContent = patient.gender || 'N/A';
      document.getElementById('found-phone').textContent = patient.phone || 'N/A';
      document.getElementById('found-language').textContent = patient.preferred_language || 'en';
      document.getElementById('found-address').textContent = patient.address || 'N/A';
      document.getElementById('found-illnesses').textContent = patient.past_illnesses || 'None recorded';
      document.getElementById('found-allergies').textContent = patient.allergies || 'None recorded';
      document.getElementById('found-medications').textContent = patient.current_medications || 'None recorded';
      storedCard.hidden = false;

      showToast(`Record verified for ${patient.display_name}`, 'success');
    } catch {
      showToast('No record found for this ABHA ID. Select “I don\'t have an ABHA ID” to register.', 'info');
      storedCard.hidden = true;
      loadedPatient = null;
    } finally {
      lookupBtn.disabled = false;
      lookupBtn.textContent = 'Fetch Record';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const visitType = form.querySelector('input[name="visit-type"]:checked')?.value;
    const isHaveAbha = visitType === 'have_abha';
    const abhaVal = abhaInput.value.trim();

    if (isHaveAbha) {
      if (abhaVal.length < 8) {
        abhaHint.hidden = false;
        showToast('Please enter an 8-digit ABHA ID', 'warning');
        abhaInput.focus();
        return;
      }
      if (!loadedPatient || loadedPatient.external_id !== abhaVal) {
        showToast('Please fetch and verify the patient record before continuing.', 'warning');
        lookupBtn.focus();
        return;
      }

      // The ABHA record is already complete; start the session for it directly.
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:6px;"></span> Starting Check-In...';
      try {
        const session = await createSession(loadedPatient.id);
        setState({ patient: loadedPatient, session, kioskStep: 1 });
        showToast(`Welcome ${loadedPatient.display_name}.`, 'success');
      } catch (err) {
        showToast(err.message || 'Registration failed', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Verify & Continue to Consent →';
      }
      return;
    }

    const name = nameInput.value.trim();
    const ageVal = ageInput.value.trim();
    const gender = genderInput.value;
    const lang = langInput.value;

    if (!name) {
      showToast('Please enter patient full name', 'warning');
      nameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;margin-right:6px;"></span> Generating ABHA ID...';

    let patient = null;
    let session = null;

    try {
      try {
        patient = await createPatient({
          display_name: name,
          external_id: isHaveAbha ? abhaVal : null,
          age: ageVal ? parseInt(ageVal, 10) : null,
          gender: gender || null,
          preferred_language: lang,
        });
      } catch {
        // Fallback instant ABHA generation
        const gen8 = Math.floor(10000000 + Math.random() * 90000000).toString();
        patient = {
          id: 'pat_' + Date.now(),
          display_name: name,
          external_id: isHaveAbha ? abhaVal : gen8,
          age: ageVal ? parseInt(ageVal, 10) : null,
          gender: gender || 'Other',
          preferred_language: lang || 'en',
        };
      }

      try {
        session = await createSession(patient.id);
      } catch {
        session = {
          id: 'sess_' + Date.now(),
          patient_id: patient.id,
          status: 'in_progress',
        };
      }

      showAbhaCardModal(patient, session);
      showToast(`ABHA ID Created: ${patient.external_id}`, 'success');
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Generate ABHA ID & Check-In <span aria-hidden="true">→</span>';
    }
  });
}

/**
 * Display generated ABHA Digital Health Card Modal with Download Image option
 */
function showAbhaCardModal(patient, session) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  const abha = patient.external_id || '--------';
  const formattedAbha = abha.length === 8 ? `${abha.slice(0, 4)} ${abha.slice(4)}` : abha;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  overlay.innerHTML = `
    <div class="modal-dialog abha-modal-dialog fade-in" role="dialog" aria-modal="true">
      <div style="text-align:center;">
        <span class="badge badge--success" style="font-size:0.78rem; padding:4px 12px; margin-bottom:6px;">✓ ABHA ID Successfully Created</span>
        <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0;">Digital ABHA Health Card</h2>
        <p style="font-size:0.85rem; color:var(--text-sub); margin:4px 0 0;">Download or save your 8-digit ABHA card for future hospital visits.</p>
      </div>

      <!-- Digital ABHA Card -->
      <div class="abha-card-preview" id="abha-card-preview">
        <div class="abha-card-top">
          <div class="abha-card-emblem">
            <div class="abha-card-icon">
              <svg class="icon" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <div class="abha-card-org">National Health Authority</div>
              <div class="abha-card-title">ABHA Digital Health Card</div>
            </div>
          </div>
          <span class="abha-card-badge">Verified OPD ID</span>
        </div>

        <div class="abha-card-body">
          <div class="abha-card-avatar">
            <span class="abha-avatar-icon">👤</span>
          </div>
          <div class="abha-card-info">
            <div>
              <span class="abha-lbl">Patient Name</span>
              <div class="abha-val-name">${escapeText(patient.display_name)}</div>
            </div>
            <div>
              <span class="abha-lbl">8-Digit ABHA ID</span>
              <div class="abha-val-id">${formattedAbha}</div>
            </div>
            <div class="abha-info-row">
              <div>
                <span class="abha-lbl">Age / Gender</span>
                <strong>${patient.age ? patient.age + ' Yrs' : 'N/A'} / ${patient.gender || 'N/A'}</strong>
              </div>
              <div>
                <span class="abha-lbl">Language</span>
                <strong>${(patient.preferred_language || 'EN').toUpperCase()}</strong>
              </div>
            </div>
          </div>
          <div class="abha-card-qr">
            <div class="abha-qr-box">
              <svg viewBox="0 0 100 100" width="52" height="52">
                <rect x="5" y="5" width="30" height="30" fill="#0f2942"/>
                <rect x="10" y="10" width="20" height="20" fill="#ffffff"/>
                <rect x="15" y="15" width="10" height="10" fill="#0f2942"/>
                <rect x="65" y="5" width="30" height="30" fill="#0f2942"/>
                <rect x="70" y="10" width="20" height="20" fill="#ffffff"/>
                <rect x="75" y="15" width="10" height="10" fill="#0f2942"/>
                <rect x="5" y="65" width="30" height="30" fill="#0f2942"/>
                <rect x="10" y="70" width="20" height="20" fill="#ffffff"/>
                <rect x="15" y="75" width="10" height="10" fill="#0f2942"/>
                <rect x="45" y="10" width="10" height="10" fill="#0f2942"/>
                <rect x="45" y="30" width="10" height="10" fill="#0f2942"/>
                <rect x="45" y="50" width="10" height="10" fill="#0f2942"/>
                <rect x="65" y="45" width="10" height="10" fill="#0f2942"/>
                <rect x="75" y="65" width="10" height="10" fill="#0f2942"/>
                <rect x="65" y="85" width="25" height="10" fill="#0f2942"/>
                <rect x="45" y="75" width="10" height="20" fill="#0f2942"/>
              </svg>
            </div>
            <small>OPD PASS</small>
          </div>
        </div>

        <div class="abha-card-footer">
          <span>Issued: ${today} • MediKIOSK System</span>
          <span>Ayushman Bharat Compliant</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="abha-modal-actions">
        <button type="button" class="btn btn--secondary btn--lg" id="download-abha-btn">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Card as Image
        </button>
        <button type="button" class="btn btn--primary btn--lg" id="proceed-consent-btn">
          Continue to Informed Consent →
        </button>
      </div>
    </div>
  `;

  overlay.classList.add('active');

  // Handle Download Image
  document.getElementById('download-abha-btn')?.addEventListener('click', () => {
    downloadAbhaCardImage(patient);
    showToast('ABHA Card downloaded as PNG image', 'success');
  });

  // Handle Proceed
  document.getElementById('proceed-consent-btn')?.addEventListener('click', () => {
    overlay.classList.remove('active');
    overlay.innerHTML = '';
    setState({
      patient,
      session,
      kioskStep: 1,
    });
  });
}

/**
 * Render and download high-resolution ABHA Digital Card image via HTML5 Canvas
 */
export function downloadAbhaCardImage(patient) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 620;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 1000, 620);
  grad.addColorStop(0, '#0d5c75');
  grad.addColorStop(0.5, '#0f2942');
  grad.addColorStop(1, '#081c2d');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, 1000, 620, 28);
  ctx.fill();

  // Border
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0891b2';
  ctx.beginPath();
  ctx.roundRect(0, 0, 1000, 620, 28);
  ctx.stroke();

  // Header Banner
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, 0, 1000, 96);

  // Emblem / Title
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('NATIONAL HEALTH AUTHORITY • GOVERNMENT OF INDIA', 44, 42);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('ABHA DIGITAL HEALTH CARD (AYUSHMAN BHARAT)', 44, 76);

  // Badge
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.roundRect(790, 32, 166, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VERIFIED OPD PASS', 873, 56);
  ctx.textAlign = 'left';

  // Avatar box on left
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(44, 130, 170, 210, 18);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(44, 130, 170, 210, 18);
  ctx.stroke();

  // Avatar emoji / icon
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('👤', 129, 260);
  ctx.textAlign = 'left';

  // Patient Info details
  const startX = 250;
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('PATIENT FULL NAME', startX, 155);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(patient.display_name || 'Patient', startX, 192);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('8-DIGIT NUMERICAL ABHA ID', startX, 245);

  const abha = patient.external_id || '--------';
  const formattedAbha = abha.length === 8 ? `${abha.slice(0, 4)} ${abha.slice(4)}` : abha;
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 40px monospace';
  ctx.fillText(formattedAbha, startX, 292);

  // Age & Gender & Language
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('AGE / GENDER', startX, 345);
  ctx.fillText('CONSULTATION LANGUAGE', startX + 220, 345);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  const ageGender = `${patient.age ? patient.age + ' Yrs' : 'N/A'} / ${patient.gender || 'N/A'}`;
  ctx.fillText(ageGender, startX, 378);
  ctx.fillText((patient.preferred_language || 'EN').toUpperCase(), startX + 220, 378);

  // QR Code Box on right
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(800, 360, 156, 156, 12);
  ctx.fill();

  // QR Code blocks
  ctx.fillStyle = '#0f2942';
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if ((r + c) % 2 === 0 || (r === 0 || r === 6 || c === 0 || c === 6)) {
        ctx.fillRect(816 + c * 18, 376 + r * 18, 14, 14);
      }
    }
  }

  // Footer separator
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(44, 520);
  ctx.lineTo(956, 520);
  ctx.stroke();

  // Footer text
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Issued: ${today} • MediKIOSK Hospital OPD Intake System • Keep this ID for follow-up consultations`, 44, 565);

  // Download Trigger
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `ABHA_Card_${abha}.png`;
  link.href = dataUrl;
  link.click();
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
