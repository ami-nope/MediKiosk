/**
 * MediKIOSK — Doctor Dashboard Queue (Hospital EHR Workstation)
 */

import { listSessions, getPatient } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';

let pollInterval = null;

export function renderQueue() {
  const el = document.createElement('div');
  el.className = 'page fade-in';
  el.innerHTML = `
    <div class="page__container">
      <div class="page__header">
        <h1 class="page__title">Physician EHR Workstation</h1>
        <p class="page__desc">Outpatient Department (OPD) Intake Queue & Triage Dashboard</p>
      </div>

      <!-- Stats Grid -->
      <div class="queue__stats" id="queue-stats">
        <div class="queue__stat-card">
          <div class="queue__stat-icon queue__stat-icon--active">
            <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div>
            <div class="queue__stat-value" id="stat-active">-</div>
            <div class="queue__stat-label">In Progress</div>
          </div>
        </div>

        <div class="queue__stat-card">
          <div class="queue__stat-icon queue__stat-icon--review">
            <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div>
            <div class="queue__stat-value" id="stat-review">-</div>
            <div class="queue__stat-label">Awaiting Review</div>
          </div>
        </div>

        <div class="queue__stat-card">
          <div class="queue__stat-icon queue__stat-icon--complete">
            <svg class="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div>
            <div class="queue__stat-value" id="stat-complete">-</div>
            <div class="queue__stat-label">Completed</div>
          </div>
        </div>

        <div class="queue__stat-card">
          <div class="queue__stat-icon queue__stat-icon--priority">
            <svg class="icon" viewBox="0 0 24 24"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <div class="queue__stat-value" id="stat-priority">-</div>
            <div class="queue__stat-label">Urgent Escalated</div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="queue__filters" id="queue-filters">
        <button class="queue__filter-btn queue__filter-btn--active" data-filter="all">All Patients</button>
        <button class="queue__filter-btn" data-filter="in_progress">In Progress</button>
        <button class="queue__filter-btn" data-filter="awaiting_review">Awaiting Review</button>
        <button class="queue__filter-btn" data-filter="completed">Completed</button>
        <button class="queue__filter-btn" data-filter="priority">Urgent Priority</button>
      </div>

      <!-- Session Queue -->
      <div class="queue__list" id="queue-list">
        <div style="padding:40px; text-align:center;"><div class="spinner"></div></div>
      </div>
    </div>
  `;
  return el;
}

export function mountQueue() {
  loadSessions();
  pollInterval = setInterval(loadSessions, 15000);

  document.getElementById('queue-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.queue__filter-btn');
    if (!btn) return;

    document.querySelectorAll('.queue__filter-btn').forEach(b => b.classList.remove('queue__filter-btn--active'));
    btn.classList.add('queue__filter-btn--active');

    setState({ filter: btn.dataset.filter });
    renderList();
  });
}

export function cleanupQueue() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function loadSessions() {
  try {
    const sessions = await listSessions();

    const patientCache = {};
    for (const session of sessions) {
      if (!patientCache[session.patient_id]) {
        try {
          patientCache[session.patient_id] = await getPatient(session.patient_id);
        } catch {
          patientCache[session.patient_id] = { display_name: 'Patient Intake', id: session.patient_id };
        }
      }
      session._patient = patientCache[session.patient_id];
    }

    setState({ sessions });
    updateStats(sessions);
    renderList();
  } catch (err) {
    showToast('Failed to sync session queue: ' + err.message, 'error');
  }
}

function updateStats(sessions) {
  const active = sessions.filter(s => s.status === 'in_progress').length;
  const review = sessions.filter(s => s.status === 'awaiting_review').length;
  const complete = sessions.filter(s => s.status === 'completed').length;
  const priority = sessions.filter(s => s.is_priority).length;

  const statActive = document.getElementById('stat-active');
  const statReview = document.getElementById('stat-review');
  const statComplete = document.getElementById('stat-complete');
  const statPriority = document.getElementById('stat-priority');

  if (statActive) statActive.textContent = active;
  if (statReview) statReview.textContent = review;
  if (statComplete) statComplete.textContent = complete;
  if (statPriority) statPriority.textContent = priority;
}

function renderList() {
  const listEl = document.getElementById('queue-list');
  if (!listEl) return;

  const s = getState();
  let sessions = [...s.sessions].sort((a, b) => new Date(a.started_at) - new Date(b.started_at));

  if (s.filter === 'priority') {
    sessions = sessions.filter(s => s.is_priority);
  } else if (s.filter !== 'all') {
    sessions = sessions.filter(ses => ses.status === s.filter);
  }

  if (sessions.length === 0) {
    listEl.innerHTML = `
      <div class="card" style="text-align:center; padding:48px; color:var(--text-muted);">
        <p style="font-weight:600; font-size:1rem; color:var(--navy);">No Patient Sessions Found</p>
        <p style="font-size:0.875rem;">No active or queued sessions match the selected filter.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = sessions.map(session => {
    const name = session._patient?.display_name || 'Patient';
    const initials = name.charAt(0).toUpperCase();
    const time = formatTime(session.started_at);
    const statusLabel = session.status.replace(/_/g, ' ');

    return `
      <div class="queue__item ${session.is_priority ? 'queue__item--priority' : ''}" data-session-id="${session.id}">
        <div class="queue__item-icon">${initials}</div>
        <div class="queue__item-info">
          <div class="queue__item-name">${escapeHtml(name)}</div>
          <div class="queue__item-meta">
            <span>Registered: ${time}</span>
            ${session._patient?.external_id ? `<span>ID: ${escapeHtml(session._patient.external_id)}</span>` : ''}
            <span>Language: ${(session._patient?.preferred_language || 'en').toUpperCase()}</span>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span class="badge badge--${session.status}">${statusLabel}</span>
          ${session.is_priority ? '<span class="badge badge--priority">URGENT</span>' : ''}
          <span style="color:var(--text-muted); font-size:1.25rem;">→</span>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.queue__item').forEach(item => {
    item.addEventListener('click', () => {
      const sessionId = item.dataset.sessionId;
      const session = s.sessions.find(ses => ses.id === sessionId);
      if (session) {
        setState({ selectedSession: session });
        navigate('#/dashboard/session');
      }
    });
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
