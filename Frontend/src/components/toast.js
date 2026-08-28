/**
 * MediKIOSK — Toast Notification System (Guaranteed Auto-Dismiss)
 */

const DURATION = 3500;

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.style.transition = 'all 0.25s ease';
  toast.style.opacity = '1';

  toast.innerHTML = `
    <span class="toast__icon" style="width:20px;height:20px;border-radius:50%;background:currentColor;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;">${icons[type]}</span>
    <span class="toast__msg" style="flex:1;">${escapeHtml(message)}</span>
    <span class="toast__close" style="cursor:pointer;padding:4px 8px;font-weight:bold;" role="button" aria-label="Dismiss">✕</span>
  `;

  container.appendChild(toast);

  const closeBtn = toast.querySelector('.toast__close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismiss(toast));
  }

  setTimeout(() => dismiss(toast), DURATION);
}

function dismiss(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-8px)';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 250);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
