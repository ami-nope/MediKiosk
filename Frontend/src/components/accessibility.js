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

export function setFontSize(size) {
  document.body.classList.remove('font-sm', 'font-lg');
  if (size === 'sm') document.body.classList.add('font-sm');
  if (size === 'lg') document.body.classList.add('font-lg');
  localStorage.setItem('medikiosk_fontsize', size);
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
  const savedSize = localStorage.getItem('medikiosk_fontsize');
  if (savedSize) setFontSize(savedSize);

  const savedContrast = localStorage.getItem('medikiosk_contrast');
  if (savedContrast === 'true') document.body.classList.add('high-contrast');

  const savedDark = localStorage.getItem('medikiosk_darkmode');
  if (savedDark === 'true') document.body.classList.add('dark-mode');

  document.addEventListener('focusin', (event) => {
    if (isTextInput(event.target)) {
      lastTextInput = event.target;
    }
  });
}

export function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  if (!voiceEnabled && synth) {
    synth.cancel();
  }
  return voiceEnabled;
}

export function speakText(text) {
  if (!voiceEnabled || !synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  synth.speak(utterance);
}

export function openVirtualKeyboard(inputElement) {
  if (!isTextInput(inputElement)) return;
  lastTextInput = inputElement;

  let modal = document.getElementById('vk-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'vk-modal';
  modal.className = 'vk-overlay slide-up';
  const fieldLabel = getKeyboardLabel(inputElement);
  const capitalizeMode = inputElement.dataset.keyboardCapitalize || 'none';

  const layout = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    ['COMMA', 'SPACE', 'PERIOD', 'BACKSPACE', 'CLEAR', 'DONE'],
  ];
  const labels = {
    BACKSPACE: 'Backspace',
    CLEAR: 'Clear',
    COMMA: ',',
    DONE: 'Done',
    PERIOD: '.',
    SPACE: 'Space',
  };

  const keysHtml = layout.map(row => `
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
  `).join('');

  modal.innerHTML = `
    <div class="vk-container">
      <div class="vk-compose">
        <div class="vk-compose__label">${escapeText(fieldLabel)}</div>
        <textarea id="vk-preview" rows="2" readonly>${escapeText(inputElement.value)}</textarea>
      </div>
      <div class="vk-header">
        <span>Touch Keyboard</span>
        <button class="vk-close" id="vk-close-btn" type="button" aria-label="Close keyboard">Close</button>
      </div>
      <div class="vk-board">
        ${keysHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const preview = modal.querySelector('#vk-preview');
  inputElement.classList.add('input--keyboard-active');
  focusInputAtEnd();

  const syncPreview = () => {
    preview.value = inputElement.value;
    preview.scrollTop = preview.scrollHeight;
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
        return;
      } else {
        inputElement.value += formatTypedKey(key, inputElement.value, capitalizeMode);
      }

      syncPreview();
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
      focusInputAtEnd();
    });
  });

  const externalSync = () => syncPreview();
  inputElement.addEventListener('input', externalSync);

  const closeOnOutsidePointer = (event) => {
    if (!modal.contains(event.target) && event.target !== inputElement) {
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
