/**
 * MediKIOSK — Patient Clinical Consultation Interface
 * Voice-First, Touch-First Modern Hospital Triage Flow.
 */

import { submitMessage } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';
import { speakText, openVirtualKeyboard } from '../components/accessibility.js';

let isPriorityAlerted = false;

// ── Reusable Haptic Feedback Helper (Web Vibration API with Feature Detect) ──
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
    // Ignore blocked/unsupported environments
  }
}

// ── Reusable VoiceVisualizer Component (Web Audio AnalyserNode + Canvas) ─────
class VoiceVisualizer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement?.getContext('2d');
    this.analyser = null;
    this.dataArray = null;
    this.animationId = null;
    this.state = 'idle';
    this.smoothedVolume = 0;
  }

  attachStream(audioContext, sourceStream) {
    if (!audioContext || !sourceStream) return;
    try {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      sourceStream.connect(this.analyser);
    } catch {
      this.analyser = null;
    }
  }

  setState(state) {
    this.state = state;
    if (state === 'listening') {
      this.start();
    } else {
      this.stop();
    }
  }

  start() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    const render = () => {
      this.draw();
      if (this.state === 'listening') {
        this.animationId = requestAnimationFrame(render);
      }
    };
    render();
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.draw();
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    if (this.state === 'listening') {
      let currentVol = 0.2;
      if (this.analyser && this.dataArray) {
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          sum += this.dataArray[i];
        }
        const avg = sum / this.dataArray.length;
        currentVol = Math.max(0.12, avg / 128);
      } else {
        // Fallback smooth oscillation
        currentVol = 0.18 + 0.12 * Math.sin(Date.now() / 160);
      }
      this.smoothedVolume = this.smoothedVolume * 0.75 + currentVol * 0.25;

      const numBars = 9;
      const barWidth = 6;
      const barGap = 6;
      const totalWidth = numBars * barWidth + (numBars - 1) * barGap;
      const startX = (width - totalWidth) / 2;
      const centerY = height / 2;

      for (let i = 0; i < numBars; i++) {
        const distFromCenter = Math.abs(i - (numBars - 1) / 2) / ((numBars - 1) / 2);
        const factor = 1 - distFromCenter * 0.45;
        const waveOffset = Math.sin(Date.now() / 150 + i * 0.6) * 0.18;
        const barHeight = Math.max(8, (height * 0.8) * (this.smoothedVolume + waveOffset) * factor);

        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, '#0891b2');
        gradient.addColorStop(0.5, '#0d5c75');
        gradient.addColorStop(1, '#38bdf8');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(startX + i * (barWidth + barGap), centerY - barHeight / 2, barWidth, barHeight, 3);
        ctx.fill();
      }
    }
  }
}

// ── Main Render Function ───────────────────────────────────────────────────
export function renderChat() {
  const s = getState();
  const patientName = s.patient?.display_name || 'Patient';
  const mrn = s.patient?.external_id || s.patient?.mrn || s.session?.id?.slice(0, 8).toUpperCase() || 'NEW-RECORD';
  const lang = (s.patient?.preferred_language || 'en').toUpperCase();

  const el = document.createElement('div');
  el.className = 'kiosk__panel kiosk__panel--consultation fade-in';
  el.innerHTML = `
    <div class="consultation-card">
      
      <!-- Institutional Consultation Header -->
      <div class="consultation-header">
        <div class="consultation-header__meta">
          <span class="consultation-badge">OPD CLINICAL INTAKE</span>
          <span class="consultation-patient-info">Patient: <strong>${escapeHtml(patientName)}</strong> &bull; ABHA: <strong>${escapeHtml(mrn)}</strong> &bull; Lang: <strong>${lang}</strong></span>
        </div>

        <div class="consultation-mode-toggle" role="tablist">
          <button type="button" class="consult-mode-btn consult-mode-btn--active" id="mode-voice-btn" role="tab" aria-selected="true">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span>Voice Intake</span>
          </button>
          <button type="button" class="consult-mode-btn" id="mode-text-btn" role="tab" aria-selected="false">
            <svg class="icon" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
            <span>Keyboard Mode</span>
          </button>
        </div>
      </div>

      <!-- Main Consultation Body -->
      <div class="consultation-body">
        
        <!-- 1. Question from AMI (Doctor Triage Assistant) -->
        <div class="consult-question-box">
          <div class="consult-assistant-badge">
            <div class="consult-avatar">
              <svg class="icon" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
            </div>
            <div>
              <span class="consult-doctor-title">Ami &bull; Clinical Triage Assistant</span>
              <span class="consult-status-indicator" id="consult-status-indicator">Ready to listen</span>
            </div>
          </div>

          <div class="consult-question-text" id="consult-question-text">
            Hello <strong>${escapeHtml(patientName)}</strong>. What symptoms or medical concern brings you to the hospital today?
          </div>
        </div>

        <!-- 2. Central Touch & Voice Interactive Stage -->
        <div class="consult-voice-section" id="consult-voice-section">
          
          <div class="consult-voice-hub" id="consult-voice-hub">
            
            <!-- Central Microphone Interactive Touch Target -->
            <button type="button" class="consult-mic-target" id="consult-mic-target" aria-label="Tap to speak">
              <svg class="icon consult-mic-icon-large" viewBox="0 0 24 24" id="consult-mic-svg">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>

            <!-- Dynamic Voice State Container -->
            <div class="consult-voice-state-wrap" id="consult-voice-state-wrap">
              <div class="consult-voice-status-title" id="consult-status-title">Tap to speak</div>
              <div class="consult-voice-status-sub" id="consult-status-sub">Tell us what you're experiencing</div>
              <div class="consult-mic-live-tag" id="consult-mic-live-tag" hidden>
                <span class="pulse-dot"></span> <span id="consult-mic-live-label">Microphone Active</span>
              </div>
            </div>

            <!-- Waveform Canvas Visualizer (Visible when listening) -->
            <canvas id="consult-audio-visualizer" class="consult-audio-canvas" width="220" height="48" hidden></canvas>

            <!-- Live Interim / Confirmed Transcript Display -->
            <div class="consult-transcript-box" id="consult-transcript-box" hidden>
              <span class="consult-transcript-label" id="consult-transcript-label">You said:</span>
              <div class="consult-transcript-content" id="consult-transcript-content">
                <span class="consult-interim-text" id="consult-interim-text">...</span>
                <span class="consult-cursor" id="consult-cursor">▍</span>
              </div>
            </div>

            <!-- Review / Confirmation Buttons (When transcript is ready) -->
            <div class="consult-confirmation-card" id="consult-confirmation-card" hidden>
              <div class="consult-confirm-actions">
                <button type="button" class="btn btn--secondary btn--lg" id="consult-edit-btn">
                  <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  ✎ Edit
                </button>
                <button type="button" class="btn btn--primary btn--lg" id="consult-confirm-btn">
                  ✓ Looks correct
                </button>
              </div>
            </div>

            <!-- Voice Error Action State -->
            <div class="consult-error-card" id="consult-error-card" hidden>
              <div class="consult-error-msg">Sorry, I couldn't hear that clearly.</div>
              <div class="consult-error-actions">
                <button type="button" class="btn btn--secondary" id="consult-retry-btn">
                  🔄 Try again
                </button>
                <button type="button" class="btn btn--primary" id="consult-type-fallback-btn">
                  ⌨️ Type instead
                </button>
              </div>
            </div>

            <!-- Tap to Finish Listening Button (Shown during active recording) -->
            <button type="button" class="btn btn--danger btn--lg" id="consult-stop-listening-btn" style="min-width:200px;" hidden>
              ⏹ Tap to finish speaking
            </button>

          </div>

          <!-- Common Symptoms Quick-Select Pills -->
          <div class="consult-quick-symptoms">
            <span class="consult-quick-label">Or quick tap:</span>
            <button type="button" class="consult-symptom-pill" data-text="Fever and body pain">🌡️ Fever &amp; Body Pain</button>
            <button type="button" class="consult-symptom-pill" data-text="Cough and sore throat">😷 Cough &amp; Cold</button>
            <button type="button" class="consult-symptom-pill" data-text="Severe stomach pain">⚡ Stomach Pain</button>
            <button type="button" class="consult-symptom-pill" data-text="General routine checkup">📋 Routine Checkup</button>
          </div>

        </div>

        <!-- 3. Secondary Keyboard Section -->
        <div class="consult-text-section" id="consult-text-section" hidden>
          <div class="consult-history-log" id="consult-history-log"></div>
          
          <div class="consult-text-input-bar">
            <button type="button" class="btn btn--secondary" id="consult-vk-btn" title="On-Screen Touch Keyboard">
              <svg class="icon" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
            </button>
            <input
              type="text"
              class="consult-input-field"
              id="consult-input-field"
              placeholder="Type your symptoms or answer here..."
              autocomplete="off"
            />
            <button type="button" class="btn btn--primary" id="consult-send-btn">
              Send <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>

      </div>

      <!-- Action Footer Bar -->
      <div class="consultation-footer">
        <span class="consult-step-info">Responses are directly recorded for your physician's review.</span>
        <button type="button" class="btn btn--primary" id="consult-next-btn">
          Finish Intake &amp; Attach Documents &rarr;
        </button>
      </div>

    </div>
  `;
  return el;
}

// ── Main Mount Function ────────────────────────────────────────────────────
export function mountChat() {
  isPriorityAlerted = false;

  const voiceBtn = document.getElementById('mode-voice-btn');
  const textBtn = document.getElementById('mode-text-btn');
  const voiceSection = document.getElementById('consult-voice-section');
  const textSection = document.getElementById('consult-text-section');
  const micTarget = document.getElementById('consult-mic-target');
  const statusIndicator = document.getElementById('consult-status-indicator');
  const questionText = document.getElementById('consult-question-text');
  const historyLog = document.getElementById('consult-history-log');
  const inputField = document.getElementById('consult-input-field');
  const sendBtn = document.getElementById('consult-send-btn');
  const vkBtn = document.getElementById('consult-vk-btn');
  const nextBtn = document.getElementById('consult-next-btn');

  // New Voice UI Elements
  const statusTitle = document.getElementById('consult-status-title');
  const statusSub = document.getElementById('consult-status-sub');
  const canvasEl = document.getElementById('consult-audio-visualizer');
  const transcriptBox = document.getElementById('consult-transcript-box');
  const interimTextEl = document.getElementById('consult-interim-text');
  const cursorEl = document.getElementById('consult-cursor');
  const confirmCard = document.getElementById('consult-confirmation-card');
  const confirmBtn = document.getElementById('consult-confirm-btn');
  const editBtn = document.getElementById('consult-edit-btn');
  const errorCard = document.getElementById('consult-error-card');
  const retryBtn = document.getElementById('consult-retry-btn');
  const typeFallbackBtn = document.getElementById('consult-type-fallback-btn');
  const stopListeningBtn = document.getElementById('consult-stop-listening-btn');

  const visualizer = new VoiceVisualizer(canvasEl);

  let currentVoiceState = 'IDLE';
  let recordedTranscript = '';
  let recognitionInstance = null;
  let audioContext = null;
  let microphone = null;
  let voiceStream = null;

  function setVoiceUIState(state, customText = '') {
    currentVoiceState = state;
    visualizer.setState(state === 'LISTENING' ? 'listening' : 'idle');

    micTarget.className = 'consult-mic-target';
    canvasEl.hidden = true;
    confirmCard.hidden = true;
    errorCard.hidden = true;
    stopListeningBtn.hidden = true;
    transcriptBox.hidden = true;

    switch (state) {
      case 'IDLE':
        statusTitle.textContent = 'Tap to speak';
        statusSub.textContent = "Tell us what you're experiencing";
        statusIndicator.textContent = 'Ready to listen';
        statusIndicator.className = 'consult-status-indicator';
        break;

      case 'LISTENING':
        micTarget.classList.add('consult-mic-target--listening');
        statusTitle.textContent = 'Listening...';
        statusSub.textContent = 'Speak naturally into the microphone';
        statusIndicator.textContent = 'Listening...';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--listening';
        canvasEl.hidden = false;
        stopListeningBtn.hidden = false;
        transcriptBox.hidden = false;
        interimTextEl.textContent = customText || 'Listening for your voice...';
        cursorEl.hidden = false;
        break;

      case 'PROCESSING':
        micTarget.classList.add('consult-mic-target--processing');
        statusTitle.textContent = 'Understanding you...';
        statusSub.textContent = 'Analyzing clinical response';
        statusIndicator.textContent = 'Processing...';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--processing';
        transcriptBox.hidden = false;
        cursorEl.hidden = true;
        break;

      case 'TRANSCRIPT_READY':
        statusTitle.textContent = 'Review your response';
        statusSub.textContent = 'Confirm if this accurately describes what you feel';
        statusIndicator.textContent = 'Transcript ready';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--speaking';
        transcriptBox.hidden = false;
        cursorEl.hidden = true;
        confirmCard.hidden = false;
        break;

      case 'ERROR':
        statusTitle.textContent = 'Could not hear clearly';
        statusSub.textContent = 'Please try speaking again or type your answer';
        statusIndicator.textContent = 'Need clarification';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--processing';
        errorCard.hidden = false;
        break;
    }
  }

  function setMode(isVoice) {
    triggerHaptic('light');
    voiceBtn.classList.toggle('consult-mode-btn--active', isVoice);
    textBtn.classList.toggle('consult-mode-btn--active', !isVoice);
    voiceBtn.setAttribute('aria-selected', String(isVoice));
    textBtn.setAttribute('aria-selected', String(!isVoice));
    voiceSection.hidden = !isVoice;
    textSection.hidden = isVoice;

    if (!isVoice) {
      stopVoice();
      if (inputField) {
        inputField.focus();
      }
    } else {
      setVoiceUIState('IDLE');
    }
  }

  voiceBtn?.addEventListener('click', () => setMode(true));
  textBtn?.addEventListener('click', () => setMode(false));

  const s = getState();
  if (s.chatMessages.length > 0) {
    const lastMsg = s.chatMessages[s.chatMessages.length - 1];
    if (lastMsg.role === 'assistant') {
      questionText.innerHTML = formatMessage(lastMsg.content);
    }
    s.chatMessages.forEach(msg => appendLogItem(historyLog, msg.role, msg.content));
  } else {
    const initialGreeting = `Hello ${s.patient?.display_name || 'Patient'}. What symptoms or medical concern brings you to the hospital today?`;
    speakText(initialGreeting);
  }

  // Quick symptom pills
  document.querySelectorAll('.consult-symptom-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      triggerHaptic('light');
      recordedTranscript = pill.dataset.text;
      interimTextEl.textContent = `"${recordedTranscript}"`;
      setVoiceUIState('TRANSCRIPT_READY');
    });
  });

  // Next step
  nextBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    stopVoice();
    setState({ kioskStep: 3 });
  });

  // Text / Virtual Keyboard
  vkBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    openVirtualKeyboard(inputField);
  });

  inputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendText();
    }
  });
  sendBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    handleSendText();
  });

  function handleSendText() {
    const text = inputField.value.trim();
    if (!text) return;
    inputField.value = '';
    handlePatientAnswer(text);
  }

  // Confirm Transcript Button
  confirmBtn?.addEventListener('click', () => {
    if (!recordedTranscript.trim()) return;
    triggerHaptic('success');
    handlePatientAnswer(recordedTranscript);
  });

  // Edit Transcript Button
  editBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    setMode(false);
    inputField.value = recordedTranscript;
    inputField.focus();
  });

  // Error State Retry & Type Fallback
  retryBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    startVoiceRecording();
  });

  typeFallbackBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    setMode(false);
  });

  micTarget?.addEventListener('click', () => {
    triggerHaptic('light');
    if (currentVoiceState === 'LISTENING') {
      finishSpeaking();
    } else {
      startVoiceRecording();
    }
  });

  stopListeningBtn?.addEventListener('click', () => {
    triggerHaptic('medium');
    finishSpeaking();
  });

  function finishSpeaking() {
    setVoiceUIState('PROCESSING');
    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
      } catch {}
    }
  }

  function startVoiceRecording() {
    stopVoice();

    recordedTranscript = '';
    setVoiceUIState('LISTENING');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Microphone recognition not supported in this browser. Please type your answers.', 'info');
      setMode(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionInstance = recognition;
      recognition.lang = getSpeechRecognitionLanguage(s.patient?.preferred_language);
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      let isStarted = false;

      recognition.onstart = () => {
        isStarted = true;
        setVoiceUIState('LISTENING');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        transcript = transcript.trim();
        if (transcript) {
          recordedTranscript = transcript;
          interimTextEl.textContent = `"${transcript}"`;
        }
      };

      recognition.onerror = (e) => {
        console.warn('Speech recognition event:', e.error);
        if (recordedTranscript.trim()) {
          // If we already captured what the user said, show it for confirmation!
          setVoiceUIState('TRANSCRIPT_READY');
          return;
        }
        if (e.error === 'no-speech' || e.error === 'aborted') {
          setVoiceUIState('IDLE');
          return;
        }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          showToast('Microphone access blocked. Click the lock 🔒 icon in the browser address bar to allow mic, or switch to Keyboard Mode.', 'warning');
        } else if (e.error === 'audio-capture') {
          showToast('No microphone hardware detected. Please type your response using the keyboard.', 'info');
        }
        triggerHaptic('error');
        setVoiceUIState('ERROR');
      };

      recognition.onend = () => {
        if (recordedTranscript.trim()) {
          interimTextEl.textContent = `"${recordedTranscript}"`;
          setVoiceUIState('TRANSCRIPT_READY');
        } else if (currentVoiceState === 'LISTENING') {
          setVoiceUIState('IDLE');
        }
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      if (recordedTranscript.trim()) {
        setVoiceUIState('TRANSCRIPT_READY');
      } else {
        triggerHaptic('error');
        setVoiceUIState('ERROR');
      }
    }
  }

  function stopAudioStream() {
    visualizer.stop();
    if (voiceStream) {
      voiceStream.getTracks().forEach(track => track.stop());
      voiceStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      try { audioContext.close(); } catch {}
      audioContext = null;
    }
  }

  function stopVoice() {
    if (recognitionInstance) {
      try {
        recognitionInstance.onend = null;
        recognitionInstance.stop();
      } catch {}
      recognitionInstance = null;
    }
    stopAudioStream();
    if (currentVoiceState === 'LISTENING') {
      setVoiceUIState('IDLE');
    }
  }

  async function handlePatientAnswer(userText) {
    const cleanText = userText.trim();
    if (!cleanText) return;

    setVoiceUIState('PROCESSING');
    statusTitle.textContent = 'Doctor assistant is thinking...';

    appendLogItem(historyLog, 'user', cleanText);
    setState({ chatMessages: [...getState().chatMessages, { role: 'user', content: cleanText }] });

    const sessionId = getState().session?.id;
    if (!sessionId) {
      setVoiceUIState('IDLE');
      return;
    }

    try {
      const res = await submitMessage(sessionId, cleanText);
      const reply = res.assistant_reply;

      questionText.innerHTML = formatMessage(reply);
      speakText(reply);

      appendLogItem(historyLog, 'assistant', reply);
      setState({
        chatMessages: [
          ...getState().chatMessages,
          { role: 'assistant', content: reply, provider: res.provider, fallback_reason: res.fallback_reason }
        ]
      });

      if (res.is_priority && !isPriorityAlerted) {
        isPriorityAlerted = true;
        showToast('Urgent Symptoms Notice: Patient escalated for immediate care team review.', 'warning');
      }

      if (res.intake_complete) {
        showToast('Clinical history complete. Proceeding to document attachment.', 'success');
        window.setTimeout(() => setState({ kioskStep: 3 }), 1500);
      } else {
        setVoiceUIState('IDLE');
      }
    } catch (err) {
      setVoiceUIState('IDLE');
      showToast(err.message || 'Assistant response failed. Please retry.', 'error');
    }
  }
}

function getSpeechRecognitionLanguage(lang) {
  const map = {
    hi: 'hi-IN',
    bn: 'bn-IN',
    te: 'te-IN',
    ta: 'ta-IN',
    mr: 'mr-IN',
    gu: 'gu-IN',
    kn: 'kn-IN',
    ml: 'ml-IN',
    en: 'en-IN',
  };
  return map[lang?.toLowerCase()] || 'en-IN';
}

function appendLogItem(container, role, content) {
  if (!container) return;
  const isUser = role === 'user';
  const item = document.createElement('div');
  item.className = `consult-log-item consult-log-item--${isUser ? 'user' : 'assistant'}`;
  item.innerHTML = `
    <span class="consult-log-sender">${isUser ? 'Patient' : 'Assistant'}:</span>
    <span class="consult-log-text">${formatMessage(content)}</span>
  `;
  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
