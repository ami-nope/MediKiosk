/**
 * MediKIOSK — Header Component (Hospital Grade)
 */

import { checkHealth } from '../api.js';
import { getState, setState, subscribe } from '../state.js';
import { navigate } from '../router.js';
import { setScalePercent, toggleDarkMode, toggleHighContrast } from './accessibility.js';
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

      <!-- Display Scale Size Dropdown in % -->
      <div class="header__control-group" title="Adjust display and text size">
        <select id="header-scale-select" class="header__scale-select" aria-label="Display size in percent">
          <option value="80">80%</option>
          <option value="90">90%</option>
          <option value="100" selected>100%</option>
          <option value="110">110%</option>
          <option value="120">120%</option>
          <option value="130">130%</option>
        </select>
      </div>

      <!-- High Contrast Toggle Button -->
      <button type="button" class="theme-toggle" id="header-contrast-btn"
        title="Toggle High Contrast mode" aria-label="Toggle High Contrast mode">
        <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
      </button>

      <!-- Light / Dark Mode Toggle Button -->
      <button type="button" class="theme-toggle theme-toggle--header" id="header-theme-btn"
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

  // Scale dropdown in %
  const scaleSelect = document.getElementById('header-scale-select');
  if (scaleSelect) {
    const savedScale = localStorage.getItem('medikiosk_scale_percent') || '100';
    scaleSelect.value = savedScale;
    scaleSelect.addEventListener('change', (e) => {
      setScalePercent(e.target.value);
    });
  }

  // Dark / Light Theme Button
  const themeBtn = document.getElementById('header-theme-btn');
  if (themeBtn) {
    const isDark = document.body.classList.contains('dark-mode');
    themeBtn.classList.toggle('theme-toggle--active', isDark);
    themeBtn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    themeBtn.setAttribute('aria-label', themeBtn.title);

    themeBtn.addEventListener('click', () => {
      const darkActive = toggleDarkMode();
      themeBtn.classList.toggle('theme-toggle--active', darkActive);
      themeBtn.title = darkActive ? 'Switch to light mode' : 'Switch to dark mode';
      themeBtn.setAttribute('aria-label', themeBtn.title);
    });
  }

  // High Contrast Button
  const contrastBtn = document.getElementById('header-contrast-btn');
  if (contrastBtn) {
    const isHC = document.body.classList.contains('high-contrast');
    contrastBtn.classList.toggle('theme-toggle--active', isHC);

    contrastBtn.addEventListener('click', () => {
      const hcActive = toggleHighContrast();
      contrastBtn.classList.toggle('theme-toggle--active', hcActive);
      contrastBtn.title = hcActive ? 'Disable High Contrast mode' : 'Toggle High Contrast mode';
    });
  }

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
