/**
 * MediKIOSK - Accessibility & Virtual Keyboard Tools
 *
 * Provides:
 * - Font Size Adjuster (A-, A, A+)
 * - High Contrast Mode Toggle
 * - Text-To-Speech (SpeechSynthesis)
 * - On-Screen QWERTY Virtual Keyboard
 */

let synth = window.speechSynthesis;
let voiceEnabled = false;
let lastTextInput = null;
const remoteVoiceApiBase = (window.__VOICE_API_URL__ || import.meta.env.VITE_VOICE_API_URL || 'https://voice.amii.lol').replace(/\/$/, '');

export function setScalePercent(percent) {
  const p = parseInt(percent, 10) || 100;
  document.documentElement.style.fontSize = `${(16 * p) / 100}px`;
  localStorage.setItem('medikiosk_scale_percent', p.toString());
  const select = document.getElementById('header-scale-select');
  if (select && select.value !== p.toString()) {
    select.value = p.toString();
  }
}

export function setFontSize(size) {
  if (size === 'sm') setScalePercent(90);
  else if (size === 'lg') setScalePercent(110);
  else setScalePercent(100);
}

export function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('medikiosk_darkmode', isDark ? 'true' : 'false');
  return isDark;
}

export function toggleHighContrast() {
  document.body.classList.toggle('high-contrast');
  const isHC = document.body.classList.contains('high-contrast');
  localStorage.setItem('medikiosk_contrast', isHC ? 'true' : 'false');
  return isHC;
}

export function initAccessibility() {
  const savedScale = localStorage.getItem('medikiosk_scale_percent') || '100';
  setScalePercent(savedScale);

  const savedContrast = localStorage.getItem('medikiosk_contrast');
  if (savedContrast === 'true') document.body.classList.add('high-contrast');

  const savedDark = localStorage.getItem('medikiosk_darkmode');
  if (savedDark === 'true') document.body.classList.add('dark-mode');

  setupInputKeyboardTriggers();
}

let currentTrigger = null;
let triggerBlurTimeout = null;

function setupInputKeyboardTriggers() {
  document.addEventListener('focusin', (e) => {
    if (isTextInput(e.target)) {
      showTriggerButton(e.target);
    }
  });

  document.addEventListener('focusout', (e) => {
    if (isTextInput(e.target)) {
      scheduleHideTriggerButton();
    }
  });

  window.addEventListener('resize', () => {
    if (currentTrigger && lastTextInput && document.contains(lastTextInput)) {
      positionTriggerButton(currentTrigger, lastTextInput);
    }
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (currentTrigger && lastTextInput && document.contains(lastTextInput)) {
      positionTriggerButton(currentTrigger, lastTextInput);
    }
  }, { passive: true });
}

function showTriggerButton(inputElement) {
  clearTimeout(triggerBlurTimeout);
  if (currentTrigger) {
    currentTrigger.remove();
    currentTrigger = null;
  }

  lastTextInput = inputElement;
  const isNumeric = isNumericInput(inputElement);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'vk-trigger-btn';
  btn.className = `vk-trigger-btn ${isNumeric ? 'vk-trigger-btn--num' : 'vk-trigger-btn--text'} fade-in`;
  btn.innerHTML = isNumeric
    ? `<span class="vk-trigger-icon">🔢</span><span>Numpad</span>`
    : `<span class="vk-trigger-icon">⌨️</span><span>Keyboard</span>`;
  btn.setAttribute('aria-label', `Open on-screen ${isNumeric ? 'numerical' : 'text'} keyboard`);

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // Prevent input blur
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openVirtualKeyboard(inputElement);
  });

  document.body.appendChild(btn);
  currentTrigger = btn;
  positionTriggerButton(btn, inputElement);
}

function positionTriggerButton(btn, inputElement) {
  if (!btn || !inputElement || !document.contains(inputElement)) {
    if (btn) btn.remove();
    return;
  }
  const rect = inputElement.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;

  const btnHeight = 28;
  const top = rect.top + (rect.height - btnHeight) / 2;
  const right = window.innerWidth - rect.right + 6;

  btn.style.position = 'fixed';
  btn.style.top = `${Math.max(4, top)}px`;
  btn.style.right = `${Math.max(4, right)}px`;
  btn.style.zIndex = '999';
}

function scheduleHideTriggerButton() {
  clearTimeout(triggerBlurTimeout);
  triggerBlurTimeout = setTimeout(() => {
    if (currentTrigger && (!document.activeElement || !isTextInput(document.activeElement))) {
      currentTrigger.remove();
      currentTrigger = null;
    }
  }, 250);
}

export function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  if (!voiceEnabled && synth) {
    synth.cancel();
  }
  return voiceEnabled;
}

export async function speakText(text) {
  if (!voiceEnabled || !text || !text.trim()) return;

  try {
    const response = await fetch(`${remoteVoiceApiBase}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: 'en' }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    await audio.play();
    return;
  } catch {
    if (!synth) return;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    synth.speak(utterance);
  }
}

export function openVirtualKeyboard(inputElement) {
  if (!isTextInput(inputElement)) return;
  lastTextInput = inputElement;

  let modal = document.getElementById('vk-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'vk-modal';
  modal.className = 'vk-overlay slide-up';
  
  const isNumeric = isNumericInput(inputElement);
  const fieldLabel = getKeyboardLabel(inputElement);
  const capitalizeMode = inputElement.dataset.keyboardCapitalize || 'none';
  const maxLength = inputElement.maxLength > 0 ? inputElement.maxLength : null;

  let boardHtml = '';

  if (isNumeric) {
    const numRows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['CLEAR', '0', 'BACKSPACE'],
    ];
    boardHtml = `
      <div class="vk-numpad">
        ${numRows.map(row => `
          <div class="vk-row vk-row--numpad">
            ${row.map(key => {
              const label = key === 'BACKSPACE' ? '⌫' : key === 'CLEAR' ? 'Clear' : key;
              const isAction = key === 'CLEAR' || key === 'BACKSPACE';
              return `<button type="button" class="vk-key vk-key--num ${isAction ? 'vk-key--action' : ''}" data-key="${key}" aria-label="${label}">${label}</button>`;
            }).join('')}
          </div>
        `).join('')}
        <div class="vk-row vk-row--numpad">
          <button type="button" class="vk-key vk-key--done vk-key--full" data-key="DONE" aria-label="Done">Done ✓</button>
        </div>
      </div>
    `;
  } else {
    const layout = [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
      ['COMMA', 'SPACE', 'PERIOD', 'BACKSPACE', 'CLEAR', 'DONE'],
    ];
    const labels = {
      BACKSPACE: '⌫ Back',
      CLEAR: 'Clear',
      COMMA: ',',
      DONE: 'Done ✓',
      PERIOD: '.',
      SPACE: 'Space',
    };

    boardHtml = `
      <div class="vk-board">
        ${layout.map(row => `
          <div class="vk-row">
            ${row.map(key => {
              const classes = ['vk-key'];
              if (key === 'SPACE') classes.push('vk-key--space');
              if (key === 'DONE') classes.push('vk-key--done');
              if (key === 'CLEAR' || key === 'BACKSPACE') classes.push('vk-key--action');
              if (key === 'COMMA' || key === 'PERIOD') classes.push('vk-key--punctuation');
              return `<button type="button" class="${classes.join(' ')}" data-key="${key}" aria-label="${labels[key] || key}">${labels[key] || key}</button>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  modal.innerHTML = `
    <div class="vk-container ${isNumeric ? 'vk-container--numeric' : ''}">
      <div class="vk-header">
        <div class="vk-header-title">
          <span class="vk-badge">${isNumeric ? '🔢 Numerical Keypad' : '⌨️ Touch Keyboard'}</span>
          <span class="vk-field-name">${escapeText(fieldLabel)}</span>
        </div>
        <button class="vk-close" id="vk-close-btn" type="button" aria-label="Close keyboard">✕ Close</button>
      </div>
      <div class="vk-compose">
        <input type="text" id="vk-preview" class="vk-preview-input" value="${escapeText(inputElement.value)}" readonly placeholder="Type with keypad..." />
      </div>
      ${boardHtml}
    </div>
  `;

  document.body.appendChild(modal);

  const preview = modal.querySelector('#vk-preview');
  inputElement.classList.add('input--keyboard-active');
  focusInputAtEnd();

  const syncPreview = () => {
    preview.value = inputElement.value;
  };

  modal.querySelectorAll('.vk-key').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.dataset.key;

      if (key === 'BACKSPACE') {
        inputElement.value = inputElement.value.slice(0, -1);
      } else if (key === 'CLEAR') {
        inputElement.value = '';
      } else if (key === 'SPACE') {
        inputElement.value += ' ';
      } else if (key === 'COMMA') {
        inputElement.value += ',';
      } else if (key === 'PERIOD') {
        inputElement.value += '.';
      } else if (key === 'DONE') {
        closeKeyboard();
        inputElement.focus();
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      } else {
        if (maxLength && inputElement.value.length >= maxLength) {
          // Max length reached
        } else if (isNumeric) {
          if (/\d/.test(key)) {
            inputElement.value += key;
          }
        } else {
          inputElement.value += formatTypedKey(key, inputElement.value, capitalizeMode);
        }
      }

      syncPreview();
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      inputElement.dispatchEvent(new Event('change', { bubbles: true }));
      focusInputAtEnd();
    });
  });

  const externalSync = () => syncPreview();
  inputElement.addEventListener('input', externalSync);

  const closeOnOutsidePointer = (event) => {
    if (!modal.contains(event.target) && event.target !== inputElement && !event.target.closest('#vk-trigger-btn')) {
      closeKeyboard();
    }
  };

  window.setTimeout(() => {
    document.addEventListener('pointerdown', closeOnOutsidePointer);
  }, 0);

  function closeKeyboard() {
    inputElement.classList.remove('input--keyboard-active');
    inputElement.removeEventListener('input', externalSync);
    document.removeEventListener('pointerdown', closeOnOutsidePointer);
    modal.remove();
    focusInputAtEnd();
  }

  function focusInputAtEnd() {
    inputElement.focus({ preventScroll: true });
    const end = inputElement.value.length;
    if (typeof inputElement.setSelectionRange === 'function') {
      inputElement.setSelectionRange(end, end);
    }
  }

  modal.querySelector('#vk-close-btn').addEventListener('click', closeKeyboard);
}

export function getActiveTextInput() {
  if (isTextInput(document.activeElement)) {
    lastTextInput = document.activeElement;
    return document.activeElement;
  }
  if (isTextInput(lastTextInput) && document.contains(lastTextInput)) {
    return lastTextInput;
  }
  return document.querySelector('input[type="text"], input[type="search"], textarea');
}

export function isNumericInput(element) {
  if (!element) return false;
  if (element.getAttribute('inputmode') === 'numeric') return true;
  if (element.getAttribute('type') === 'number') return true;
  if (element.id === 'reg-abha' || element.id === 'reg-age') return true;
  return false;
}

function formatTypedKey(key, currentValue, capitalizeMode) {
  if (key.length !== 1 || !/[A-Z]/.test(key)) return key;
  if (capitalizeMode === 'words') {
    const shouldCapitalize = currentValue.length === 0 || /[\s.'-]$/.test(currentValue);
    return shouldCapitalize ? key : key.toLowerCase();
  }
  if (capitalizeMode === 'first') {
    return currentValue.trim().length === 0 ? key : key.toLowerCase();
  }
  return key.toLowerCase();
}

function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function getKeyboardLabel(inputElement) {
  const explicitLabel = inputElement.dataset.keyboardLabel;
  if (explicitLabel) return explicitLabel;

  if (inputElement.id) {
    const label = document.querySelector(`label[for="${CSS.escape(inputElement.id)}"]`);
    if (label?.textContent?.trim()) {
      return label.textContent.replace(/\*/g, '').trim();
    }
  }

  const formGroupLabel = inputElement.closest('.form-group')?.querySelector('label');
  if (formGroupLabel?.textContent?.trim()) {
    return formGroupLabel.textContent.replace(/\*/g, '').trim();
  }

  return inputElement.placeholder || 'Type here';
}

function isTextInput(element) {
  if (!element) return false;
  if (element.tagName === 'TEXTAREA') return true;
  if (element.tagName !== 'INPUT') return false;
  const type = (element.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'search', 'tel', 'email', 'number', 'password'].includes(type);
}
