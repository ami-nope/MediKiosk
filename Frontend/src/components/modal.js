/**
 * MediKIOSK — Modal Component
 */

/**
 * Show a modal dialog.
 * @param {{ title, body, confirmText?, cancelText?, onConfirm?, onCancel?, danger? }} opts
 */
export function showModal({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel, danger = false }) {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.innerHTML = `
    <div class="modal" id="modal-dialog">
      <div class="modal__header">
        <h3 class="modal__title">${title}</h3>
        <button class="btn btn--ghost modal__close-btn" id="modal-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal__body">${body}</div>
      <div class="modal__footer">
        <button class="btn btn--secondary" id="modal-cancel-btn">${cancelText}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="modal-confirm-btn">${confirmText}</button>
      </div>
    </div>
  `;

  overlay.classList.add('active');

  const close = () => {
    overlay.classList.remove('active');
    overlay.innerHTML = '';
  };

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    close();
    onCancel?.();
  });

  document.getElementById('modal-cancel-btn').addEventListener('click', () => {
    close();
    onCancel?.();
  });

  document.getElementById('modal-confirm-btn').addEventListener('click', () => {
    close();
    onConfirm?.();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
      onCancel?.();
    }
  });
}
