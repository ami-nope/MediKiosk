/**
 * MediKIOSK — Header Component (Hospital Grade)
 */

import { checkHealth } from '../api.js';
import { getState, setState, subscribe } from '../state.js';
import { navigate } from '../router.js';
import { setFontSize, toggleDarkMode, toggleHighContrast, toggleVoice } from './accessibility.js';
import { showModal } from './modal.js';


let healthInterval = null;
const HEALTH_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function renderHeader() {
  const s = getState();

  const header = document.createElement('header');
  header.className = 'header';
  header.innerHTML = `
    <div class="header__brand">
      <img src="/brand-full.png" alt="MediKIOSK" class="header__logo" />
      <div class="header__brand-text">
        <span class="header__title">MediKIOSK</span>
        <span class="header__subtitle">Patient Intake</span>
      </div>
    </div>

    <div class="a11y-bar" aria-label="Kiosk controls">
      <button type="button" class="a11y-btn a11y-btn--font" id="a11y-font-sm" title="Small Font">
        <span class="a11y-btn__mark">A-</span>
        <span>Small</span>
      </button>
      <button type="button" class="a11y-btn a11y-btn--font a11y-btn--selected" id="a11y-font-base" title="Normal Font">
        <span class="a11y-btn__mark">A</span>
        <span>Normal</span>
      </button>
      <button type="button" class="a11y-btn a11y-btn--font" id="a11y-font-lg" title="Large Font">
        <span class="a11y-btn__mark">A+</span>
        <span>Large</span>
      </button>
      <button type="button" class="a11y-btn" id="a11y-contrast-btn" title="High Contrast Mode">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg> Contrast
      </button>
      <button type="button" class="a11y-btn" id="a11y-voice-btn" title="Text to Speech Read Aloud">
        <svg class="icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> Voice
      </button>
      <label class="a11y-language" for="a11y-language-select">
        <span>Language</span>
        <select id="a11y-language-select" aria-label="Choose language">
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="ta">தமிழ்</option>
          <option value="te">తెలుగు</option>
          <option value="kn">ಕನ್ನಡ</option>
          <option value="ml">മലയാളം</option>
          <option value="mr">मराठी</option>
          <option value="bn">বাংলা</option>
        </select>
      </label>
      <button type="button" class="a11y-btn" id="a11y-help-btn" title="Get help">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.5 2.5 0 1 1 4.35 1.68c-.98.98-1.85 1.34-1.85 2.82"/><path d="M12 17h.01"/></svg> Help
      </button>
      <button type="button" class="a11y-btn" id="admin-link-btn" title="AI Admin">
        AI Admin
      </button>
    </div>


    <div class="header__actions">
      <div class="header__health" id="health-indicator">
        <span class="header__health-dot" id="health-dot"></span>
        <span id="health-text">System Ready</span>
      </div>
      <div class="mode-switch" id="mode-switch">
        <button class="mode-switch__btn ${s.mode === 'kiosk' ? 'mode-switch__btn--active' : ''}" data-mode="kiosk" id="mode-kiosk-btn">
          <svg class="icon" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> Patient Check-In
        </button>
        <button class="mode-switch__btn ${s.mode === 'dashboard' ? 'mode-switch__btn--active' : ''}" data-mode="dashboard" id="mode-dashboard-btn">
          <svg class="icon" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg> Staff Workspace
        </button>
      </div>
      <button type="button" class="theme-toggle theme-toggle--header" id="a11y-theme-btn"
        title="Switch to dark mode" aria-label="Switch to dark mode">
        <svg class="icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
    </div>

  `;

  return header;
}

export function mountHeader() {
  applyModeToBody(getState().mode);
  updateHealthVisibility();
  window.addEventListener('hashchange', updateHealthVisibility);

  document.getElementById('mode-kiosk-btn')?.addEventListener('click', () => {
    setState({ mode: 'kiosk' });
    navigate('#/kiosk');
  });

  document.getElementById('mode-dashboard-btn')?.addEventListener('click', () => {
    setState({ mode: 'dashboard' });
    navigate('#/dashboard');
  });

  document.getElementById('a11y-font-sm')?.addEventListener('click', () => setFontSize('sm'));
  document.getElementById('a11y-font-base')?.addEventListener('click', () => setFontSize('base'));
  document.getElementById('a11y-font-lg')?.addEventListener('click', () => setFontSize('lg'));

  document.getElementById('a11y-theme-btn')?.addEventListener('click', (e) => {
    const isDark = toggleDarkMode();
    e.currentTarget.classList.toggle('theme-toggle--active', isDark);
    e.currentTarget.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    e.currentTarget.setAttribute('aria-label', e.currentTarget.title);
  });

  document.getElementById('a11y-contrast-btn')?.addEventListener('click', (e) => {
    const isHC = toggleHighContrast();
    e.currentTarget.classList.toggle('a11y-btn--active', isHC);
  });


  document.getElementById('a11y-voice-btn')?.addEventListener('click', (e) => {
    const active = toggleVoice();
    e.currentTarget.classList.toggle('a11y-btn--active', active);
  });

  document.getElementById('a11y-language-select')?.addEventListener('change', (e) => {
    const registrationLanguage = document.getElementById('reg-lang');
    if (registrationLanguage) registrationLanguage.value = e.target.value;
  });

  document.getElementById('a11y-help-btn')?.addEventListener('click', () => {
    showModal({
      title: 'Need help?',
      body: '<p>Use the large buttons to move through check-in. You can ask the reception desk for help at any time.</p>',
      confirmText: 'Close',
      cancelText: 'Close',
    });
  });

  document.getElementById('admin-link-btn')?.addEventListener('click', () => {
    setState({ mode: 'dashboard' });
    navigate('#/admin');
  });

  pollHealth();
  healthInterval = setInterval(pollHealth, HEALTH_POLL_INTERVAL_MS);

  subscribe(['mode'], (s) => {
    applyModeToBody(s.mode);
    const kioskBtn = document.getElementById('mode-kiosk-btn');
    const dashBtn = document.getElementById('mode-dashboard-btn');
    if (kioskBtn) {
      kioskBtn.className = `mode-switch__btn ${s.mode === 'kiosk' ? 'mode-switch__btn--active' : ''}`;
    }
    if (dashBtn) {
      dashBtn.className = `mode-switch__btn ${s.mode === 'dashboard' ? 'mode-switch__btn--active' : ''}`;
    }
  });
}

function applyModeToBody(mode) {
  document.body.dataset.mode = mode || 'kiosk';
}

export function cleanupHeader() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
  window.removeEventListener('hashchange', updateHealthVisibility);
}

function updateHealthVisibility() {
  const indicator = document.getElementById('health-indicator');
  if (!indicator) return;

  const isAdminPortal = window.location.pathname === '/admin' || window.location.hash === '#/admin';
  indicator.hidden = !isAdminPortal;
}

async function pollHealth() {
  const dot = document.getElementById('health-dot');
  const text = document.getElementById('health-text');
  if (!dot || !text) return;

  try {
    const health = await checkHealth();
    setState({ health });
    const provider = health.llm_provider?.toUpperCase?.() || 'AI';
    dot.className = `header__health-dot ${health.llm_reachable ? 'header__health-dot--ok' : 'header__health-dot--warning'}`;
    text.textContent = health.llm_reachable
      ? `${provider} Ready`
      : `Backend Online - ${health.llm_error || `${provider} Offline`}`;
  } catch {
    dot.className = 'header__health-dot header__health-dot--error';
    text.textContent = 'Backend Offline';
  }
}
