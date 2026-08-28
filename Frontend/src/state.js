/**
 * MediKIOSK — State Management
 *
 * Simple reactive pub/sub store. Components subscribe to state changes
 * and re-render when relevant data updates.
 */

const state = {
  // App mode
  mode: 'kiosk',   // 'kiosk' | 'dashboard'

  // Health
  health: null,    // { status, llm_provider, llm_reachable }

  // Kiosk flow state
  kioskStep: 0,     // 0=register, 1=consent, 2=chat, 3=upload, 4=complete
  patient: null,    // PatientResponse
  session: null,    // SessionResponse
  chatMessages: [], // [{ role, content, timestamp }]

  // Dashboard state
  sessions: [],
  selectedSession: null,
  sessionHistory: null,
  sessionDocuments: [],
  sessionSummary: null,

  // Filters
  filter: 'all',  // 'all' | 'in_progress' | 'awaiting_review' | 'completed' | 'priority'
};

const listeners = new Map();

/**
 * Get the current state (read-only snapshot).
 */
export function getState() {
  return { ...state };
}

/**
 * Update state and notify subscribers.
 */
export function setState(updates) {
  const changedKeys = [];
  for (const [key, value] of Object.entries(updates)) {
    if (state[key] !== value) {
      state[key] = value;
      changedKeys.push(key);
    }
  }
  if (changedKeys.length > 0) {
    notify(changedKeys);
  }
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 * @param {string[]} keys - State keys to watch
 * @param {Function} callback - Called with the full state on change
 */
export function subscribe(keys, callback) {
  const id = Symbol();
  for (const key of keys) {
    if (!listeners.has(key)) listeners.set(key, new Map());
    listeners.get(key).set(id, callback);
  }
  return () => {
    for (const key of keys) {
      listeners.get(key)?.delete(id);
    }
  };
}

function notify(changedKeys) {
  const called = new Set();
  for (const key of changedKeys) {
    const subs = listeners.get(key);
    if (subs) {
      for (const [id, cb] of subs) {
        if (!called.has(id)) {
          called.add(id);
          cb({ ...state });
        }
      }
    }
  }
}

/**
 * Reset kiosk flow state (for starting a new session).
 */
export function resetKiosk() {
  setState({
    kioskStep: 0,
    patient: null,
    session: null,
    chatMessages: [],
  });
}

/**
 * Reset dashboard state.
 */
export function resetDashboard() {
  setState({
    selectedSession: null,
    sessionHistory: null,
    sessionDocuments: [],
    sessionSummary: null,
  });
}
