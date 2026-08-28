/**
 * MediKIOSK — Doctor Dashboard EHR Session Detail & Summary Editor
 */

import { getHistory, listDocuments, updateSummary } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

let summaryRefreshTimer = null;

export function renderDetail() {
  const s = getState();
  const session = s.selectedSession;

  if (!session) {
    return `
      <div class="page fade-in">
        <div class="page__container">
          <button class="detail__back" id="detail-back-btn">← Back to Queue</button>
          <div class="card" style="text-align:center; padding:48px;">
            <p style="font-weight:700; font-size:1.125rem;">No Active Patient Session</p>
          </div>
        </div>
      </div>
    `;
  }

  const name = session._patient?.display_name || 'Patient';
  const initials = name.charAt(0).toUpperCase();
  const createdDate = new Date(session.started_at).toLocaleString();

  const el = document.createElement('div');
  el.className = 'page fade-in';
  el.innerHTML = `
    <div class="page__container">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
        <button class="detail__back" id="detail-back-btn">← Back to Queue</button>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn--secondary btn--sm" id="ehr-copy-btn">
            <svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy EHR
          </button>
          <button type="button" class="btn btn--secondary btn--sm" id="ehr-print-btn">
            <svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print Summary
          </button>
        </div>
      </div>

      <div class="detail">
        <!-- Patient Banner -->
        <div class="detail__patient-card card">
          <div class="detail__patient-inner">
            <div class="detail__patient-avatar">${initials}</div>
            <div class="detail__patient-info">
              <h2>${escapeHtml(name)}</h2>
              <p>
                <strong>ID:</strong> ${escapeHtml(session._patient?.external_id || 'N/A')} | 
                <strong>Language:</strong> ${(session._patient?.preferred_language || 'en').toUpperCase()} | 
                <strong>Registered:</strong> ${createdDate}
              </p>
            </div>
            <div class="detail__patient-badges">
              <span class="badge badge--${session.status}" id="detail-status-badge">${session.status.replace(/_/g, ' ')}</span>
              ${session.is_priority ? '<span class="badge badge--priority">URGENT ESCALATION</span>' : ''}
            </div>
          </div>
        </div>

        <!-- Left: Intake Transcript -->
        <div class="detail__section">
          <h3 class="detail__section-title">
            <svg class="icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Intake Transcript
          </h3>
          <div class="detail__transcript" id="detail-transcript">
            <div style="padding:20px; text-align:center;"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Right: Uploaded Documents -->
        <div class="detail__section">
          <h3 class="detail__section-title">
            <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Session Documents
          </h3>
          <div class="detail__docs-list" id="detail-docs">
            <div style="padding:20px; text-align:center;"><div class="spinner"></div></div>
          </div>
        </div>

        <!-- Bottom: Clinical Summary Editor -->
        <div class="review card" id="printable-summary-area">
          <div class="review__header">
            <h3 class="detail__section-title" style="margin-bottom:0; color:var(--navy);">
              <svg class="icon" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg> Structured Clinical Summary
            </h3>
            <span class="badge badge--info" id="summary-ai-badge">Physician Verification</span>
          </div>

          <div id="review-editor-wrap">
            <div style="padding:20px; text-align:center;"><div class="spinner"></div></div>
          </div>

          <div class="review__actions">
            <button class="btn btn--secondary" id="summary-cancel-btn">Cancel</button>
            <button class="btn btn--primary" id="summary-save-btn">✓ Approve & Complete Consultation</button>
          </div>
        </div>
      </div>
    </div>
  `;

  return el;
}

export function mountDetail() {
  cleanupDetail();
  const s = getState();
  const session = s.selectedSession;
  if (!session) {
    document.getElementById('detail-back-btn')?.addEventListener('click', () => navigate('#/dashboard'));
    return;
  }

  document.getElementById('detail-back-btn')?.addEventListener('click', () => navigate('#/dashboard'));
  document.getElementById('summary-cancel-btn')?.addEventListener('click', () => navigate('#/dashboard'));

  document.getElementById('ehr-print-btn')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('ehr-copy-btn')?.addEventListener('click', () => {
    copyEhrSummaryToClipboard();
  });

  loadSessionDetails(session.id);
}

export function cleanupDetail() {
  if (summaryRefreshTimer) {
    window.clearTimeout(summaryRefreshTimer);
    summaryRefreshTimer = null;
  }
}

async function loadSessionDetails(sessionId) {
  const transcriptEl = document.getElementById('detail-transcript');
  const docsEl = document.getElementById('detail-docs');
  const editorEl = document.getElementById('review-editor-wrap');

  try {
    const history = await getHistory(sessionId);
    setState({ sessionHistory: history });

    if (transcriptEl) {
      if (!history.raw_transcript || history.raw_transcript.length === 0) {
        transcriptEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem;padding:16px;">No transcript recorded.</div>';
      } else {
        transcriptEl.innerHTML = history.raw_transcript.map(turn => {
          const isUser = turn.role === 'user';
          return `
            <div class="detail__transcript-msg detail__transcript-msg--${isUser ? 'user' : 'assistant'}">
              <div class="detail__transcript-text">${escapeHtml(turn.content)}</div>
            </div>
          `;
        }).join('');
      }
    }

    const docs = await listDocuments(sessionId);
    setState({ sessionDocuments: docs });

    if (docsEl) {
      if (!docs || docs.length === 0) {
        docsEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem;padding:16px;">No documents attached.</div>';
      } else {
        docsEl.innerHTML = docs.map(doc => {
          const name = doc.file_path.split(/[\\/]/).pop();
          const date = new Date(doc.uploaded_at).toLocaleString();
          return `
            <div style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg-subtle); border:1px solid var(--border); border-radius:var(--radius-md); margin-bottom:8px;">
              <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style="flex:1;">
                <div style="font-weight:600; font-size:0.875rem;"><a href="/${doc.file_path}" target="_blank" style="color:var(--primary);">${escapeHtml(name)}</a></div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${date}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const structured = history.structured_json || {};
    setState({ sessionSummary: structured });
    updateSummaryStatusBadge(structured);
    renderEditor(editorEl, structured);
    scheduleSummaryRefresh(sessionId, structured);

    document.getElementById('summary-save-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('summary-save-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';

      try {
        const updated = {};
        document.querySelectorAll('.review__field-textarea').forEach(area => {
          const key = area.dataset.key;
          let val = area.value.trim();
          if (key === 'red_flags' || key === 'associated_symptoms' || key === 'medications' || key === 'allergies') {
            if (val.includes(',')) {
              updated[key] = val.split(',').map(s => s.trim()).filter(Boolean);
            } else {
              updated[key] = val ? [val] : [];
            }
          } else {
            updated[key] = val;
          }
        });

        const res = await updateSummary(sessionId, updated);

        setState({
          selectedSession: { ...getState().selectedSession, status: res.status },
          sessionSummary: res.structured_json,
        });

        const badge = document.getElementById('detail-status-badge');
        if (badge) {
          badge.className = `badge badge--${res.status}`;
          badge.textContent = res.status.replace(/_/g, ' ');
        }

        showToast('Clinical summary approved and consultation marked COMPLETED!', 'success');
        navigate('#/dashboard');
      } catch (err) {
        showToast(err.message || 'Failed to save summary', 'error');
        btn.disabled = false;
        btn.innerHTML = '✓ Approve & Complete Consultation';
      }
    });

  } catch (err) {
    showToast('Error loading session details: ' + err.message, 'error');
  }
}

function scheduleSummaryRefresh(sessionId, structured) {
  cleanupDetail();
  if (structured.summary_status !== 'generating') return;
  summaryRefreshTimer = window.setTimeout(() => loadSessionDetails(sessionId), 5000);
}

function updateSummaryStatusBadge(structured) {
  const badge = document.getElementById('summary-ai-badge');
  if (!badge) return;

  const status = structured.summary_status;
  badge.className = 'badge badge--info';
  if (status === 'generating') {
    badge.textContent = 'Report Processing';
  } else if (status === 'ready') {
    badge.textContent = 'AI Draft Ready';
  } else if (status === 'local_fallback') {
    badge.textContent = 'Local Draft';
  } else {
    badge.textContent = 'Physician Verification';
  }
}

function renderEditor(container, data) {
  if (!container) return;

  const sections = [
    { key: 'chief_complaint', label: 'Chief Complaint' },
    { key: 'history_of_present_illness', label: 'History of Present Illness (HPI)' },
    { key: 'associated_symptoms', label: 'Associated Symptoms' },
    { key: 'pertinent_negatives', label: 'Pertinent Negatives' },
    { key: 'medications', label: 'Current Medications' },
    { key: 'allergies', label: 'Allergies' },
    { key: 'past_medical_history', label: 'Past Medical History' },
    { key: 'red_flags', label: 'Red Flags & Alerts' },
    { key: 'assessment', label: 'Physician Assessment' },
    { key: 'plan', label: 'Treatment & Care Plan' },
  ];

  let html = '<div class="review__grid">';

  sections.forEach(sec => {
    let val = data[sec.key] || '';
    if (Array.isArray(val)) {
      val = val.join(', ');
    } else if (typeof val === 'object' && val !== null) {
      val = JSON.stringify(val);
    }

    const isRedFlag = sec.key === 'red_flags' && val && val !== '[]';

    html += `
      <div class="review__field" style="${isRedFlag ? 'border: 1px solid var(--danger); background: var(--danger-bg);' : ''}">
        <div class="review__field-label" style="${isRedFlag ? 'color: var(--danger); font-weight:700;' : ''}">${sec.label}</div>
        <textarea class="review__field-textarea" data-key="${sec.key}">${escapeHtml(val)}</textarea>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

function copyEhrSummaryToClipboard() {
  const data = getState().sessionSummary || {};
  const patient = getState().selectedSession?._patient?.display_name || 'Patient';
  
  let formatted = `=== CLINICAL INTAKE SUMMARY ===\nPatient: ${patient}\n\n`;
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('summary_')) continue;
    const val = Array.isArray(v) ? v.join(', ') : v;
    formatted += `${k.toUpperCase().replace(/_/g, ' ')}: ${val}\n`;
  }

  navigator.clipboard.writeText(formatted).then(() => {
    showToast('Summary copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy summary', 'error');
  });
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = typeof text === 'string' ? text : JSON.stringify(text);
  return div.innerHTML;
}
