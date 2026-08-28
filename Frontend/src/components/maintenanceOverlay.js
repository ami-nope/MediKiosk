/**
 * Full-screen kiosk maintenance notice for AI service outages.
 */

export function showMaintenanceOverlay() {
  document.getElementById('vk-modal')?.remove();
  document.getElementById('maintenance-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'maintenance-overlay';
  overlay.className = 'maintenance-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="maintenance-overlay__panel">
      <div class="maintenance-overlay__icon" aria-hidden="true">
        <svg class="icon" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h1>Service Under Maintenance</h1>
      <p>AI intake is not responding right now.</p>
      <strong>Please go to reception.</strong>
    </div>
  `;

  document.body.appendChild(overlay);
}
