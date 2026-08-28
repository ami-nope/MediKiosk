/**
 * MediKIOSK — Document Upload Step (Hospital Grade)
 */

import { uploadDocument } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';

const uploadedFiles = [];

export function renderUpload() {
  const el = document.createElement('div');
  el.className = 'kiosk__panel fade-in';
  el.innerHTML = `
    <div class="card" style="text-align:center;">
      <div class="registration__icon-wrap" style="background:var(--primary-light); color:var(--primary);">
        <svg class="icon" style="width:32px;height:32px;" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </div>
      <h2 class="registration__heading" style="font-size:1.5rem;">Add Medical Documents</h2>
      <p style="color:var(--text-sub); margin-bottom:24px; font-size:1rem;">
        Add prescriptions, lab reports, or referral letters so your care team can review them.
      </p>

      <div class="upload__dropzone" id="upload-dropzone">
        <svg class="icon" style="width:40px;height:40px;color:var(--primary);margin-bottom:12px;" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p style="font-weight:700; color:var(--navy);">Tap here to choose files</p>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Supports PDF, JPG, PNG up to 10MB each</p>
      </div>

      <input type="file" id="upload-file-input" multiple accept="image/*,.pdf,.doc,.docx" style="display:none" />

      <div class="upload__file-list" id="upload-file-list" style="text-align:left; margin-bottom:20px;"></div>

      <div style="display:flex; gap:12px; justify-content:center;">
        <button class="btn btn--secondary btn--lg" id="upload-skip-btn">
          Skip Document Upload
        </button>
        <button class="btn btn--primary btn--lg" id="upload-done-btn">
          Continue to Summary →
        </button>
      </div>
    </div>
  `;
  return el;
}

export function mountUpload() {
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('upload-file-input');
  const fileList = document.getElementById('upload-file-list');
  const skipBtn = document.getElementById('upload-skip-btn');
  const doneBtn = document.getElementById('upload-done-btn');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--primary)';
    dropzone.style.background = 'var(--primary-light)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-strong)';
    dropzone.style.background = 'var(--bg-surface)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-strong)';
    dropzone.style.background = 'var(--bg-surface)';
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
    fileInput.value = '';
  });

  skipBtn.addEventListener('click', () => goToSummary());
  doneBtn.addEventListener('click', () => goToSummary());

  async function handleFiles(files) {
    const s = getState();
    const sessionId = s.session?.id;
    if (!sessionId) return;

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'upload__file-item';
      item.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span style="flex:1; font-weight:500; font-size:0.875rem;">${escapeHtml(file.name)}</span>
        <span class="upload-file-status" style="font-size:0.75rem; color:var(--warning); font-weight:600;">
          <span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Uploading...
        </span>
      `;
      fileList.appendChild(item);

      try {
        const doc = await uploadDocument(sessionId, file);
        uploadedFiles.push(doc);

        const statusEl = item.querySelector('.upload-file-status');
        statusEl.style.color = 'var(--success)';
        statusEl.textContent = '✓ Attached';

        showToast(`${file.name} attached successfully`, 'success');
      } catch (err) {
        const statusEl = item.querySelector('.upload-file-status');
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = '✗ Upload Failed';
        showToast(`Failed to upload ${file.name}: ${err.message}`, 'error');
      }
    }
  }
}

async function goToSummary() {
  setState({ kioskStep: 4 });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
