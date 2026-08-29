import { renderHeader, mountHeader, cleanupHeader } from './components/header.js';
import { renderRegistration, mountRegistration } from './kiosk/registration.js';
import { renderConsent, mountConsent } from './kiosk/consent.js';
import { renderChat, mountChat } from './kiosk/chat.js';
import { renderUpload, mountUpload, cleanupUpload } from './kiosk/upload.js';
import { renderComplete, mountComplete, cleanupComplete } from './kiosk/complete.js';
import { renderQueue, mountQueue, cleanupQueue } from './dashboard/queue.js';
import { renderDetail, mountDetail, cleanupDetail } from './dashboard/detail.js';
import { renderAdmin, mountAdmin } from './admin.js';
import { initAccessibility } from './components/accessibility.js';

import { getState, subscribe, setState } from './state.js';
import { resetKiosk } from './state.js';
import { route, initRouter, navigate } from './router.js';
import { showModal } from './components/modal.js';

// Import CSS stylesheets so Vite bundles them
import './styles/index.css';
import './styles/components.css';
import './styles/kiosk.css';
import './styles/dashboard.css';
import './styles/dark-mode.css';
import './styles/admin.css';

// ── Register Routes ──────────────────────────────────────────────────

// Kiosk SPA Flow (Render based on kioskStep in state)
route('#/kiosk', () => {
  const container = document.createElement('div');
  container.className = 'page page--kiosk';

  let stepCleanup = null;
  let inactivityTimer = null;
  let inactivityPrompted = false;
  const inactivityEvents = ['pointerdown', 'keydown', 'touchstart'];

  function resetInactivityTimer() {
    if (inactivityPrompted) return;
    window.clearTimeout(inactivityTimer);
    inactivityTimer = window.setTimeout(() => {
      inactivityPrompted = true;
      showModal({
        title: 'Are you still there?',
        body: '<p>For your privacy, this session will end soon.</p>',
        confirmText: 'Continue session',
        cancelText: 'End session',
        onConfirm: () => {
          inactivityPrompted = false;
          resetInactivityTimer();
        },
        onCancel: () => {
          inactivityPrompted = false;
          resetKiosk();
        },
      });
    }, 4 * 60 * 1000);
  }

  function renderStep(state) {
    container.innerHTML = '';

    // Render Kiosk Step Indicator
    const indicator = document.createElement('div');
    indicator.className = 'kiosk';
    indicator.innerHTML = `
      <div class="kiosk__step-indicator" aria-label="Check-in progress">
        ${['Patient', 'Consent', 'Health', 'Documents', 'Complete'].map((label, index) => `
          <span class="kiosk__step ${state.kioskStep === index ? 'kiosk__step--active' : ''} ${state.kioskStep > index ? 'kiosk__step--done' : ''}">
            <span class="kiosk__step-number">${index + 1}</span><span>${label}</span>
          </span>
          ${index < 4 ? `<span class="kiosk__step-line ${state.kioskStep > index ? 'kiosk__step-line--done' : ''}"></span>` : ''}
        `).join('')}
      </div>
    `;
    container.appendChild(indicator);

    let stepEl, stepMountFn;
    switch (state.kioskStep) {
      case 0:
        stepEl = renderRegistration();
        stepMountFn = mountRegistration;
        break;
      case 1:
        stepEl = renderConsent();
        stepMountFn = mountConsent;
        break;
      case 2:
        stepEl = renderChat();
        stepMountFn = mountChat;
        break;
      case 3:
        stepEl = renderUpload();
        stepMountFn = mountUpload;
        stepCleanup = cleanupUpload;
        break;
      case 4:
        stepEl = renderComplete();
        stepMountFn = mountComplete;
        stepCleanup = cleanupComplete;
        break;
    }

    if (stepEl) {
      indicator.appendChild(stepEl);
      if (stepMountFn) {
        requestAnimationFrame(() => stepMountFn());
      }
    }
  }

  // Subscribe to kioskStep changes
  const unsubscribe = subscribe(['kioskStep'], (state) => {
    if (stepCleanup) {
      stepCleanup();
      stepCleanup = null;
    }
    renderStep(state);
  });

  renderStep(getState());

  return {
    render: container,
    mount: () => {
      inactivityEvents.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimer, { passive: true }));
      resetInactivityTimer();
    },
    cleanup: () => {
      window.clearTimeout(inactivityTimer);
      inactivityEvents.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimer));
      unsubscribe();
      if (stepCleanup) {
        stepCleanup();
        stepCleanup = null;
      }
    }
  };
});

// Doctor Dashboard Queue Route
route('#/dashboard', () => {
  return {
    render: renderQueue(),
    mount: mountQueue,
    cleanup: cleanupQueue
  };
});

// Doctor Dashboard Session Detail Route
route('#/dashboard/session', () => {
  return {
    render: renderDetail(),
    mount: mountDetail,
    cleanup: cleanupDetail
  };
});

route('#/admin', () => {
  return {
    render: renderAdmin(),
    mount: mountAdmin,
    cleanup: () => {}
  };
});


// ── App Init ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (!root) return;

  initAccessibility();

  // Render Header
  const header = renderHeader();
  document.body.insertBefore(header, root);
  mountHeader();

  // Create content area
  const mainContent = document.createElement('main');
  root.appendChild(mainContent);

  // Synchronize state and hash on reload
  const initialHash = window.location.hash;
  if (window.location.pathname === '/admin') {
    setState({ mode: 'dashboard' });
    navigate('#/admin');
  } else if (initialHash.startsWith('#/dashboard') || initialHash.startsWith('#/admin')) {
    setState({ mode: 'dashboard' });
  } else {
    setState({ mode: 'kiosk' });
    navigate('#/kiosk');
  }

  // Initialize router inside main content
  initRouter(mainContent);
});
