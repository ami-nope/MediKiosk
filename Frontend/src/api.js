/**
 * MediKIOSK — API Client
 *
 * All backend API calls wrapped in clean async functions.
 * Uses the Vite dev proxy so all requests go to the same origin.
 */

const BASE = '';  // Vite proxy handles forwarding to localhost:8000

/**
 * Generic fetch wrapper with error handling.
 */
async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  };

  // Don't set Content-Type for FormData (file uploads)
  if (options.body instanceof FormData) {
    delete config.headers['Content-Type'];
  }

  const res = await fetch(url, config);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = body.detail || `Request failed: ${res.status}`;
    const err = new Error(detail.replace(/^Provider '[^']+' error:\s*/, ''));
    err.status = res.status;
    err.provider = body.provider;
    throw err;
  }

  return res.json();
}


// ── Health ────────────────────────────────────────────────────────────

export async function checkHealth() {
  return request('/health');
}

export async function getAiConfig() {
  return request('/admin/ai-config');
}

export async function updateAiConfig(config) {
  return request('/admin/ai-config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}


// ── Patients ─────────────────────────────────────────────────────────

export async function createPatient({ display_name, external_id, preferred_language }) {
  return request('/patients', {
    method: 'POST',
    body: JSON.stringify({ display_name, external_id: external_id || null, preferred_language }),
  });
}

export async function getPatient(patientId) {
  return request(`/patients/${patientId}`);
}


// ── Sessions ─────────────────────────────────────────────────────────

export async function createSession(patientId) {
  return request('/sessions', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId }),
  });
}

export async function listSessions({ status, is_priority } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (is_priority !== undefined && is_priority !== null) params.set('is_priority', is_priority);
  const qs = params.toString();
  return request(`/sessions${qs ? `?${qs}` : ''}`);
}

export async function getSession(sessionId) {
  return request(`/sessions/${sessionId}`);
}


// ── History (AI Chat) ────────────────────────────────────────────────

export async function submitMessage(sessionId, message, options = {}) {
  return request(`/sessions/${sessionId}/history`, {
    method: 'POST',
    body: JSON.stringify({ message }),
    signal: options.signal,
  });
}

export async function getHistory(sessionId) {
  return request(`/sessions/${sessionId}/history`);
}


// ── Documents ────────────────────────────────────────────────────────

export async function uploadDocument(sessionId, file) {
  const form = new FormData();
  form.append('file', file);
  return request(`/sessions/${sessionId}/documents`, {
    method: 'POST',
    body: form,
  });
}

export async function listDocuments(sessionId) {
  return request(`/sessions/${sessionId}/documents`);
}


// ── Summary ──────────────────────────────────────────────────────────

export async function generateSummary(sessionId, options = {}) {
  return request(`/sessions/${sessionId}/summary`, {
    method: 'POST',
    body: JSON.stringify({}),
    signal: options.signal,
  });
}

export async function updateSummary(sessionId, structuredJson) {
  return request(`/sessions/${sessionId}/summary`, {
    method: 'PATCH',
    body: JSON.stringify({ structured_json: structuredJson }),
  });
}


// ── Consent ──────────────────────────────────────────────────────────

export async function recordConsent(sessionId, consented) {
  return request(`/sessions/${sessionId}/consent`, {
    method: 'POST',
    body: JSON.stringify({ consented }),
  });
}
