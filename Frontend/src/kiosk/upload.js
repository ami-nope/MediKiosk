/**
 * MediKIOSK — Document OCR & Medical Intake Scanner (Hospital Grade)
 *
 * Provides real-time camera preview (works seamlessly with iPhone via iVCam / standard webcams),
 * automatic document detection, stability countdown, auto-capture, quality checks,
 * OCR text extraction, and AI structuring with review & confirmation.
 */

import { ocrDocument, uploadDocument } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';

// ── Reusable Haptics Helper ──────────────────────────────────────────────────
export function triggerHaptic(type = 'light') {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'success':
        navigator.vibrate([10, 30, 10]);
        break;
      case 'error':
        navigator.vibrate([30, 50, 30]);
        break;
    }
  } catch {
    // Graceful fallback on devices where vibration is restricted
  }
}

// ── Scanner State Module Variables ──────────────────────────────────────────
let activeStream = null;
let detectionInterval = null;
let countdownTimer = null;
let currentCameraState = 'CAMERA_REQUEST';
let consecutiveStableFrames = 0;
let previousFrameData = null;
let capturedBlob = null;
let capturedDataUrl = null;
let activeSessionDocuments = [];
let currentOCRResult = null;
let availableVideoDevices = [];
let selectedDeviceId = null;
let isUnmounted = false;

export function renderUpload() {
  const el = document.createElement('div');
  el.className = 'kiosk__panel fade-in scanner-panel-container';
  el.innerHTML = `
    <div class="card scanner-card">
      <!-- Header / Mode Bar -->
      <div class="scanner-header">
        <div class="scanner-header-left">
          <div class="registration__icon-wrap" style="background:var(--primary-light); color:var(--primary); width:44px; height:44px; margin-bottom:0;">
            <svg class="icon" style="width:24px;height:24px;" viewBox="0 0 24 24"><path d="M4 7V4h3M17 4h3v3M4 17v3h3M20 17v3h-3M9 12h6M12 9v6"/></svg>
          </div>
          <div>
            <h2 class="registration__heading" style="font-size:1.4rem; margin-bottom:2px; text-align:left;">Medical Document Scanner</h2>
            <p style="color:var(--text-sub); font-size:0.875rem; margin:0; text-align:left;">
              Scan prescriptions, lab reports, or referral slips for instant AI clinical structuring.
            </p>
          </div>
        </div>

        <div class="scanner-header-actions" id="scanner-header-actions">
          <button type="button" class="btn btn--secondary btn--sm" id="scanner-switch-file-btn" title="Switch to manual file upload">
            <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload File
          </button>
        </div>
      </div>

      <!-- Main Scanner Body Area (Dynamic View) -->
      <div id="scanner-view-container" class="scanner-view-container">
        <!-- Will be populated based on current state -->
      </div>

      <!-- Attached Documents Drawer -->
      <div id="scanner-attached-docs-wrap" class="scanner-attached-docs-wrap" style="display:none;">
        <div class="scanner-attached-title">
          <span>Attached Documents (<span id="scanner-doc-count">0</span>)</span>
        </div>
        <div id="scanner-attached-list" class="scanner-attached-list"></div>
      </div>

      <!-- Footer Navigation Buttons -->
      <div class="scanner-footer" style="display:flex; gap:12px; justify-content:space-between; align-items:center; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
        <button type="button" class="btn btn--secondary" id="scanner-skip-btn">
          Skip Document Upload
        </button>
        <button type="button" class="btn btn--primary btn--lg" id="scanner-continue-btn">
          Continue to Summary →
        </button>
      </div>
    </div>
  `;
  return el;
}

export function mountUpload() {
  isUnmounted = false;
  currentCameraState = 'CAMERA_REQUEST';
  currentOCRResult = null;
  capturedBlob = null;
  capturedDataUrl = null;

  const skipBtn = document.getElementById('scanner-skip-btn');
  const continueBtn = document.getElementById('scanner-continue-btn');
  const switchFileBtn = document.getElementById('scanner-switch-file-btn');

  if (skipBtn) skipBtn.addEventListener('click', () => goToSummary());
  if (continueBtn) continueBtn.addEventListener('click', () => goToSummary());
  if (switchFileBtn) switchFileBtn.addEventListener('click', () => renderFileUploadView());

  // Check for available cameras and start camera view
  initializeCameraStream();
}

export function cleanupUpload() {
  isUnmounted = true;
  stopCameraStream();
  clearDetectionTimers();
}

// ── Camera Initialization & Stream Lifecycle ────────────────────────────────
async function initializeCameraStream() {
  if (isUnmounted) return;
  setScannerUIState('CAMERA_REQUEST');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Webcam access not supported in this browser. Please upload photos instead.', 'warning');
    renderFileUploadView('Camera not supported by browser.');
    return;
  }

  // Enumerate video devices (so user can pick iPhone webcam if multiple webcams exist)
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableVideoDevices = devices.filter(d => d.kind === 'videoinput');
  } catch (err) {
    console.warn('Device enumeration notice:', err);
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
      },
      audio: false,
    };

    if (selectedDeviceId) {
      constraints.video.deviceId = { exact: selectedDeviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (isUnmounted) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    activeStream = stream;
    renderLiveScannerView();
    startDocumentDetectionLoop();
  } catch (err) {
    console.warn('Camera permission/stream notice:', err);
    renderCameraPermissionDeniedView(err.name || 'PermissionDenied');
  }
}

function stopCameraStream() {
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop());
    activeStream = null;
  }
}

function clearDetectionTimers() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
  consecutiveStableFrames = 0;
  previousFrameData = null;
}

// ── View Renderers ──────────────────────────────────────────────────────────

function renderLiveScannerView() {
  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  setScannerUIState('SCANNING');

  container.innerHTML = `
    <div class="scanner-viewport-wrapper">
      <!-- Live Video Feed -->
      <video id="scanner-video-feed" class="scanner-video-feed" autoplay playsinline muted></video>

      <!-- Optical Scanning Overlay Frame -->
      <div class="scanner-overlay-frame" id="scanner-overlay-frame">
        <div class="scanner-guide-corner scanner-corner-tl"></div>
        <div class="scanner-guide-corner scanner-corner-tr"></div>
        <div class="scanner-guide-corner scanner-corner-bl"></div>
        <div class="scanner-guide-corner scanner-corner-br"></div>

        <div class="scanner-laser-line" id="scanner-laser-line"></div>

        <div class="scanner-overlay-center-label" id="scanner-center-label">
          <div class="scanner-doc-icon">📄</div>
          <span>ALIGN DOCUMENT INSIDE FRAME</span>
        </div>

        <!-- Automatic Countdown Ring -->
        <div class="scanner-countdown-badge" id="scanner-countdown-badge" style="display:none;">
          <span id="scanner-countdown-number">3</span>
        </div>

        <!-- Flash Effect Layer -->
        <div class="scanner-flash-layer" id="scanner-flash-layer"></div>
      </div>

      <!-- Hidden Analysis Canvas -->
      <canvas id="scanner-analysis-canvas" style="display:none;"></canvas>
    </div>

    <!-- Status & Camera Toolbar -->
    <div class="scanner-status-bar">
      <div class="scanner-status-indicator">
        <span class="scanner-status-dot pulse"></span>
        <span id="scanner-status-text" style="font-weight:600; color:var(--text-main);">
          Scanning for document automatically...
        </span>
      </div>

      <div class="scanner-toolbar-actions">
        ${availableVideoDevices.length > 1 ? `
          <select id="scanner-camera-select" class="scanner-camera-select" aria-label="Select camera">
            ${availableVideoDevices.map((d, i) => `
              <option value="${d.deviceId}" ${d.deviceId === selectedDeviceId ? 'selected' : ''}>
                📹 ${d.label || `Camera ${i + 1}`}
              </option>
            `).join('')}
          </select>
        ` : ''}

        <button type="button" class="btn btn--primary" id="scanner-manual-capture-btn" style="min-width:140px;">
          📸 Capture Now
        </button>
      </div>
    </div>
  `;

  const video = document.getElementById('scanner-video-feed');
  if (video && activeStream) {
    video.srcObject = activeStream;
    video.play().catch(() => {});
  }

  const captureBtn = document.getElementById('scanner-manual-capture-btn');
  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      triggerHaptic('medium');
      performCapture();
    });
  }

  const cameraSelect = document.getElementById('scanner-camera-select');
  if (cameraSelect) {
    cameraSelect.addEventListener('change', (e) => {
      selectedDeviceId = e.target.value;
      stopCameraStream();
      clearDetectionTimers();
      initializeCameraStream();
    });
  }
}

function renderCameraPermissionDeniedView(reason = '') {
  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  setScannerUIState('ERROR');

  container.innerHTML = `
    <div class="scanner-error-card">
      <div class="scanner-error-icon">📷</div>
      <h3 style="margin-bottom:8px; color:var(--text-main); font-size:1.25rem;">Camera Access Required</h3>
      <p style="color:var(--text-sub); max-width:440px; margin:0 auto 20px auto; font-size:0.95rem;">
        Camera access was not granted or your iPhone webcam is disconnected. Please allow permission or upload a photo of your prescription directly.
      </p>
      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <button type="button" class="btn btn--primary" id="scanner-retry-perm-btn">
          🔄 Try Camera Again
        </button>
        <button type="button" class="btn btn--secondary" id="scanner-fallback-upload-btn">
          📁 Upload a Photo Instead
        </button>
      </div>
    </div>
  `;

  const retryBtn = document.getElementById('scanner-retry-perm-btn');
  const uploadBtn = document.getElementById('scanner-fallback-upload-btn');

  if (retryBtn) retryBtn.addEventListener('click', () => initializeCameraStream());
  if (uploadBtn) uploadBtn.addEventListener('click', () => renderFileUploadView());
}

function renderFileUploadView(notice = '') {
  stopCameraStream();
  clearDetectionTimers();

  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  container.innerHTML = `
    <div class="scanner-upload-dropzone" id="scanner-file-dropzone">
      <svg class="icon" style="width:48px;height:48px;color:var(--primary);margin-bottom:12px;" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <h3 style="font-size:1.15rem; color:var(--text-main); margin-bottom:4px;">Tap or drag to upload document</h3>
      <p style="font-size:0.875rem; color:var(--text-muted); margin-bottom:16px;">Supports PNG, JPG, JPEG up to 15MB</p>
      ${notice ? `<p style="color:var(--warning); font-size:0.8rem; margin-bottom:12px;">${notice}</p>` : ''}
      <button type="button" class="btn btn--primary" id="scanner-browse-btn">
        Browse Images
      </button>
      <input type="file" id="scanner-file-input" accept="image/png,image/jpeg,image/jpg,image/webp" style="display:none;" />
    </div>

    <div style="margin-top:16px; text-align:center;">
      <button type="button" class="btn btn--secondary btn--sm" id="scanner-return-cam-btn">
        📹 Return to Live Scanner
      </button>
    </div>
  `;

  const dropzone = document.getElementById('scanner-file-dropzone');
  const fileInput = document.getElementById('scanner-file-input');
  const browseBtn = document.getElementById('scanner-browse-btn');
  const returnCamBtn = document.getElementById('scanner-return-cam-btn');

  if (browseBtn && fileInput) browseBtn.addEventListener('click', () => fileInput.click());
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', (e) => {
      if (e.target !== browseBtn) fileInput.click();
    });
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.[0]) handleFileForOCR(e.dataTransfer.files[0]);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) handleFileForOCR(fileInput.files[0]);
      fileInput.value = '';
    });
  }

  if (returnCamBtn) {
    returnCamBtn.addEventListener('click', () => initializeCameraStream());
  }
}

// ── Automatic Document Detection & Stability Logic ──────────────────────────
function startDocumentDetectionLoop() {
  clearDetectionTimers();

  const canvas = document.getElementById('scanner-analysis-canvas');
  const video = document.getElementById('scanner-video-feed');
  if (!canvas || !video) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 320;
  canvas.height = 240;

  detectionInterval = setInterval(() => {
    if (isUnmounted || currentCameraState !== 'SCANNING') return;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const analysis = analyzeFrameForDocument(frameData, previousFrameData);
      previousFrameData = frameData;

      const overlayFrame = document.getElementById('scanner-overlay-frame');
      const statusText = document.getElementById('scanner-status-text');

      if (analysis.hasDocument) {
        if (analysis.isStable) {
          consecutiveStableFrames++;
          if (overlayFrame) overlayFrame.classList.add('scanner-frame--detected');

          if (consecutiveStableFrames >= 3 && currentCameraState === 'SCANNING') {
            // Stable document detected! Start capture countdown
            triggerHaptic('light');
            startCaptureCountdown();
          } else if (statusText) {
            statusText.textContent = 'Document detected! Hold steady...';
          }
        } else {
          consecutiveStableFrames = Math.max(0, consecutiveStableFrames - 1);
          if (statusText) statusText.textContent = 'Document moving — keep it still...';
        }
      } else {
        consecutiveStableFrames = 0;
        if (overlayFrame) overlayFrame.classList.remove('scanner-frame--detected');
        if (statusText) statusText.textContent = 'Place your document inside the frame...';
      }
    } catch {
      // Ignore transient frame read issues
    }
  }, 200);
}

function analyzeFrameForDocument(currentFrame, prevFrame) {
  const data = currentFrame.data;
  const width = currentFrame.width;
  const height = currentFrame.height;

  // 1. Analyze central document bounding area vs outer border
  const cx1 = Math.floor(width * 0.20);
  const cx2 = Math.floor(width * 0.80);
  const cy1 = Math.floor(height * 0.20);
  const cy2 = Math.floor(height * 0.80);

  let centerBrightness = 0;
  let centerPixels = 0;
  let borderBrightness = 0;
  let borderPixels = 0;

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      if (x >= cx1 && x <= cx2 && y >= cy1 && y <= cy2) {
        centerBrightness += lum;
        centerPixels++;
      } else {
        borderBrightness += lum;
        borderPixels++;
      }
    }
  }

  const avgCenter = centerBrightness / Math.max(centerPixels, 1);
  const avgBorder = borderBrightness / Math.max(borderPixels, 1);

  // Document paper is typically bright/contrasted against surroundings or desk
  const hasDocument = avgCenter > 50 && (avgCenter >= avgBorder * 0.95 || avgCenter > 110);

  // 2. Stability check against previous frame
  let isStable = true;
  if (prevFrame && prevFrame.data) {
    const prevData = prevFrame.data;
    let diff = 0;
    let sampleCount = 0;

    for (let i = 0; i < data.length; i += 16) {
      diff += Math.abs(data[i] - prevData[i]);
      sampleCount++;
    }

    const avgDiff = diff / Math.max(sampleCount, 1);
    // If average pixel variation between 200ms samples is low, document is steady!
    isStable = avgDiff < 14.0;
  }

  return { hasDocument, isStable };
}

function startCaptureCountdown() {
  if (currentCameraState !== 'SCANNING') return;
  setScannerUIState('DOCUMENT_DETECTED');

  const badge = document.getElementById('scanner-countdown-badge');
  const countNum = document.getElementById('scanner-countdown-number');
  const statusText = document.getElementById('scanner-status-text');

  if (badge) badge.style.display = 'flex';
  if (statusText) statusText.textContent = 'Auto-capturing in 2 seconds... Hold steady';

  let remaining = 2;
  if (countNum) countNum.textContent = String(remaining);

  countdownTimer = setInterval(() => {
    remaining--;
    if (countNum) countNum.textContent = String(remaining);

    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      if (currentCameraState === 'DOCUMENT_DETECTED') {
        performCapture();
      }
    }
  }, 700);
}

// ── Capture & Freeze ────────────────────────────────────────────────────────
function performCapture() {
  clearDetectionTimers();
  setScannerUIState('CAPTURING');

  const video = document.getElementById('scanner-video-feed');
  const flash = document.getElementById('scanner-flash-layer');

  // Trigger optical flash animation & haptic feedback
  if (flash) {
    flash.classList.add('scanner-flash-active');
    setTimeout(() => flash.classList.remove('scanner-flash-active'), 400);
  }
  triggerHaptic('medium');

  if (!video || video.videoWidth === 0) {
    showToast('Capture error. Please retry.', 'error');
    setScannerUIState('SCANNING');
    startDocumentDetectionLoop();
    return;
  }

  // Create high resolution canvas for clean OCR extraction
  const capCanvas = document.createElement('canvas');
  capCanvas.width = video.videoWidth;
  capCanvas.height = video.videoHeight;
  const ctx = capCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, capCanvas.width, capCanvas.height);

  capturedDataUrl = capCanvas.toDataURL('image/jpeg', 0.94);

  // Perform Image Quality Check
  const quality = assessCapturedImageQuality(capCanvas);
  if (!quality.passed) {
    triggerHaptic('error');
    showToast(quality.message, 'warning');
    setScannerUIState('SCANNING');
    startDocumentDetectionLoop();
    return;
  }

  capCanvas.toBlob((blob) => {
    if (!blob) {
      showToast('Could not process frame.', 'error');
      setScannerUIState('SCANNING');
      startDocumentDetectionLoop();
      return;
    }

    capturedBlob = blob;
    stopCameraStream();
    renderProcessingView(capturedDataUrl);
    sendDocumentToBackend(blob, 'captured_document.jpg');
  }, 'image/jpeg', 0.94);
}

function assessCapturedImageQuality(canvas) {
  const ctx = canvas.getContext('2d');
  const sampleData = ctx.getImageData(0, 0, Math.min(canvas.width, 400), Math.min(canvas.height, 400)).data;

  let totalLum = 0;
  for (let i = 0; i < sampleData.length; i += 4) {
    totalLum += 0.299 * sampleData[i] + 0.587 * sampleData[i + 1] + 0.114 * sampleData[i + 2];
  }
  const avgLum = totalLum / (sampleData.length / 4);

  if (avgLum < 24) {
    return { passed: false, message: 'Image is too dark. Please move to a well-lit area and keep steady.' };
  }
  return { passed: true };
}

function handleFileForOCR(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    capturedDataUrl = e.target.result;
    capturedBlob = file;
    renderProcessingView(capturedDataUrl);
    sendDocumentToBackend(file, file.name);
  };
  reader.readAsDataURL(file);
}

// ── Processing View with Real OCR & AI Progress ─────────────────────────────
function renderProcessingView(previewSrc) {
  setScannerUIState('OCR_PROCESSING');

  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  container.innerHTML = `
    <div class="scanner-processing-card">
      <div class="scanner-preview-box">
        <img src="${previewSrc}" alt="Scanned Document" class="scanner-frozen-preview" />
        <div class="scanner-processing-overlay">
          <div class="scanner-spinner-large"></div>
          <h3 id="scanner-processing-label" style="color:#fff; margin-top:16px; font-size:1.15rem;">
            Reading document with OCR...
          </h3>
          <p id="scanner-processing-sub" style="color:rgba(255,255,255,0.85); font-size:0.875rem; margin-top:4px;">
            Recognizing text and handwriting...
          </p>
        </div>
      </div>
    </div>
  `;
}

// ── Backend OCR Submission & Entity Extraction ──────────────────────────────
async function sendDocumentToBackend(fileBlob, fileName) {
  const s = getState();
  const sessionId = s.session?.id;

  if (!sessionId) {
    showToast('Active check-in session not found. Please register first.', 'error');
    renderCameraPermissionDeniedView('No session');
    return;
  }

  const fileObj = fileBlob instanceof File ? fileBlob : new File([fileBlob], fileName, { type: 'image/jpeg' });

  try {
    const procLabel = document.getElementById('scanner-processing-label');
    const procSub = document.getElementById('scanner-processing-sub');

    if (procLabel) procLabel.textContent = 'Extracting clinical information with AI...';
    if (procSub) procSub.textContent = 'Structuring medications, dosages, and notes...';
    setScannerUIState('AI_PROCESSING');

    // Call real OCR & AI endpoint
    const result = await ocrDocument(sessionId, fileObj);
    currentOCRResult = result;
    activeSessionDocuments.push(result);

    triggerHaptic('success');
    showToast('Document read and structured successfully!', 'success');
    renderResultReviewView(result, capturedDataUrl);
    updateAttachedDocsList();
  } catch (err) {
    console.error('OCR error:', err);
    triggerHaptic('error');
    showToast(err.message || 'Could not extract text. Please retake photo.', 'error');
    renderOCRFailureView(err.message);
  }
}

function renderOCRFailureView(errorMessage = '') {
  setScannerUIState('ERROR');

  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  container.innerHTML = `
    <div class="scanner-error-card">
      <div class="scanner-error-icon" style="color:var(--danger); background:var(--danger-light);">⚠️</div>
      <h3 style="margin-bottom:8px; color:var(--text-main); font-size:1.25rem;">Document Could Not Be Read</h3>
      <p style="color:var(--text-sub); max-width:460px; margin:0 auto 20px auto; font-size:0.95rem;">
        ${errorMessage || 'Text in the photo was blurry or out of focus. Please ensure good lighting and keep the camera steady.'}
      </p>
      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <button type="button" class="btn btn--primary" id="scanner-retake-fail-btn">
          🔄 Retake Photo
        </button>
        <button type="button" class="btn btn--secondary" id="scanner-upload-fail-btn">
          📁 Upload File
        </button>
      </div>
    </div>
  `;

  const retakeBtn = document.getElementById('scanner-retake-fail-btn');
  const uploadBtn = document.getElementById('scanner-upload-fail-btn');

  if (retakeBtn) retakeBtn.addEventListener('click', () => initializeCameraStream());
  if (uploadBtn) uploadBtn.addEventListener('click', () => renderFileUploadView());
}

// ── Medical Document Review & Verification View ─────────────────────────────
function renderResultReviewView(ocrData, imagePreviewUrl) {
  setScannerUIState('REVIEW');

  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  const structured = ocrData.structured_json || {};
  const docType = (structured.document_type || 'Prescription').toUpperCase();
  const doctor = structured.doctor || null;
  const medications = structured.medications || [];
  const labResults = structured.lab_results || [];
  const conditions = structured.conditions || [];
  const uncertainItems = structured.uncertain_items || [];
  const rawText = ocrData.ocr_text || '';

  container.innerHTML = `
    <div class="scanner-review-layout">
      <!-- Left Column: Document Image & Type Badge -->
      <div class="scanner-review-image-col">
        <div class="scanner-badge-tag">${escapeHtml(docType)}</div>
        <img src="${imagePreviewUrl || ''}" alt="Document Image" class="scanner-review-photo" />
        <div style="margin-top:12px; display:flex; gap:8px; justify-content:center;">
          <button type="button" class="btn btn--secondary btn--sm" id="scanner-retake-btn">
            🔄 Retake / Rescan
          </button>
        </div>
      </div>

      <!-- Right Column: Extracted Clinical Facts & Uncertain Items -->
      <div class="scanner-review-content-col">
        <div class="scanner-review-banner">
          <div>
            <h3 style="margin:0 0 2px 0; color:var(--text-main); font-size:1.15rem;">
              ✓ Document Processed
            </h3>
            <p style="margin:0; font-size:0.85rem; color:var(--text-sub);">
              Review and confirm the clinical details before adding to patient history.
            </p>
          </div>
          <span class="badge badge--success" style="font-size:0.75rem;">AI Verified</span>
        </div>

        <!-- Doctor & Date Header -->
        ${doctor ? `
          <div class="scanner-doctor-badge">
            <svg class="icon" viewBox="0 0 24 24" style="width:18px;height:18px;color:var(--primary);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Prescribing Doctor:</strong> ${escapeHtml(doctor)}</span>
          </div>
        ` : ''}

        <!-- Uncertain Information Section (Critical for Patient Safety) -->
        ${uncertainItems.length > 0 ? `
          <div class="scanner-uncertain-box">
            <div class="scanner-uncertain-header">
              <span class="scanner-warning-icon">⚠</span>
              <strong>Needs Verification (${uncertainItems.length})</strong>
            </div>
            <p style="font-size:0.8rem; color:var(--text-sub); margin:4px 0 10px 0;">
              Some handwritten words had lower OCR confidence. Please verify them:
            </p>
            <div class="scanner-uncertain-list">
              ${uncertainItems.map((item, idx) => `
                <div class="scanner-uncertain-row">
                  <span class="scanner-raw-text">"${escapeHtml(item.raw_text || '')}"</span>
                  <span style="color:var(--text-muted);">→</span>
                  <input type="text" class="input scanner-uncertain-input" data-idx="${idx}" value="${escapeHtml(item.possible_match || item.raw_text || '')}" placeholder="Correct text here" />
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Extracted Medications -->
        <div class="scanner-section-wrap">
          <h4 class="scanner-section-title">💊 Medications (${medications.length})</h4>
          ${medications.length > 0 ? `
            <div class="scanner-meds-grid">
              ${medications.map(m => `
                <div class="scanner-med-card">
                  <div class="scanner-med-name">${escapeHtml(m.name || 'Unnamed')} ${m.strength ? `<span class="scanner-med-strength">${escapeHtml(m.strength)}</span>` : ''}</div>
                  <div class="scanner-med-details">
                    ${m.dosage ? `<span>Dosage: ${escapeHtml(m.dosage)}</span>` : ''}
                    ${m.frequency ? `<span>Frequency: ${escapeHtml(m.frequency)}</span>` : ''}
                    ${m.instructions ? `<span>${escapeHtml(m.instructions)}</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <p style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">
              No explicit prescription medicines detected in this document.
            </p>
          `}
        </div>

        <!-- Lab Results or Conditions -->
        ${labResults.length > 0 ? `
          <div class="scanner-section-wrap">
            <h4 class="scanner-section-title">🔬 Lab Results (${labResults.length})</h4>
            <div class="scanner-labs-list">
              ${labResults.map(l => `
                <div class="scanner-lab-row">
                  <span>${escapeHtml(l.test_name || '')}</span>
                  <strong>${escapeHtml(l.value || '')} ${escapeHtml(l.unit || '')}</strong>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Raw Text Accordion (Optional details) -->
        <details class="scanner-raw-details" style="margin-top:12px;">
          <summary style="font-size:0.8rem; color:var(--text-muted); cursor:pointer; font-weight:600;">
            View Raw Extracted Text
          </summary>
          <pre class="scanner-raw-pre">${escapeHtml(rawText || 'No text extracted.')}</pre>
        </details>

        <!-- Actions -->
        <div class="scanner-review-actions">
          <button type="button" class="btn btn--primary btn--lg" id="scanner-confirm-btn" style="flex:1;">
            ✓ Confirm & Add to Intake
          </button>
          <button type="button" class="btn btn--secondary" id="scanner-scan-another-btn">
            + Scan Another Document
          </button>
        </div>
      </div>
    </div>
  `;

  const confirmBtn = document.getElementById('scanner-confirm-btn');
  const scanAnotherBtn = document.getElementById('scanner-scan-another-btn');
  const retakeBtn = document.getElementById('scanner-retake-btn');

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      triggerHaptic('success');
      showToast('Document confirmed and attached to intake record.', 'success');
      setScannerUIState('CONFIRMED');
      renderConfirmationView();
    });
  }

  if (scanAnotherBtn) {
    scanAnotherBtn.addEventListener('click', () => {
      initializeCameraStream();
    });
  }

  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      initializeCameraStream();
    });
  }
}

function renderConfirmationView() {
  const container = document.getElementById('scanner-view-container');
  if (!container) return;

  container.innerHTML = `
    <div class="scanner-confirmed-card">
      <div class="scanner-confirmed-icon">✓</div>
      <h3 style="color:var(--text-main); margin-bottom:6px; font-size:1.25rem;">
        Document Attached to Patient Record
      </h3>
      <p style="color:var(--text-sub); font-size:0.95rem; max-width:440px; margin:0 auto 24px auto;">
        All extracted prescription and clinical details have been saved to your consultation history for doctor review.
      </p>

      <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
        <button type="button" class="btn btn--secondary" id="scanner-add-more-btn">
          ➕ Scan Another Document
        </button>
        <button type="button" class="btn btn--primary btn--lg" id="scanner-proceed-summary-btn">
          Continue to Summary →
        </button>
      </div>
    </div>
  `;

  const addMoreBtn = document.getElementById('scanner-add-more-btn');
  const proceedBtn = document.getElementById('scanner-proceed-summary-btn');

  if (addMoreBtn) addMoreBtn.addEventListener('click', () => initializeCameraStream());
  if (proceedBtn) proceedBtn.addEventListener('click', () => goToSummary());
}

function updateAttachedDocsList() {
  const wrap = document.getElementById('scanner-attached-docs-wrap');
  const list = document.getElementById('scanner-attached-list');
  const countEl = document.getElementById('scanner-doc-count');

  if (!wrap || !list) return;

  if (activeSessionDocuments.length > 0) {
    wrap.style.display = 'block';
    if (countEl) countEl.textContent = String(activeSessionDocuments.length);

    list.innerHTML = activeSessionDocuments.map((doc, idx) => `
      <div class="scanner-attached-item">
        <svg class="icon" viewBox="0 0 24 24" style="width:16px;height:16px;color:var(--primary);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span style="flex:1; font-size:0.8rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(doc.structured_json?.document_type || `Document #${idx + 1}`)}
        </span>
        <span style="font-size:0.75rem; color:var(--success); font-weight:bold;">✓ Saved</span>
      </div>
    `).join('');
  }
}

function setScannerUIState(newState) {
  currentCameraState = newState;
}

async function goToSummary() {
  stopCameraStream();
  clearDetectionTimers();
  setState({ kioskStep: 4 });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
