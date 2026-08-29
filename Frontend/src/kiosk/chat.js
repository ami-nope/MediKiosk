import { submitMessage } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';
import { speakText, stopSpeaking, openVirtualKeyboard } from '../components/accessibility.js';

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
    this.state = 'idle'; // 'idle' | 'listening' | 'speaking' | 'processing'
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
    if (state === 'listening' || state === 'speaking') {
      this.start();
    } else {
      this.stop();
    }
  }

  start() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    const render = () => {
      this.draw();
      if (this.state === 'listening' || this.state === 'speaking') {
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
    } else if (this.state === 'speaking') {
      // Smooth sinusoidal voice wave representing Ami's speech
      const numBars = 11;
      const barWidth = 5;
      const barGap = 5;
      const totalWidth = numBars * barWidth + (numBars - 1) * barGap;
      const startX = (width - totalWidth) / 2;
      const centerY = height / 2;

      for (let i = 0; i < numBars; i++) {
        const wave = Math.sin(Date.now() / 180 + i * 0.55);
        const barHeight = Math.max(6, (height * 0.65) * (0.4 + 0.5 * Math.abs(wave)));

        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        gradient.addColorStop(0, '#38bdf8');
        gradient.addColorStop(0.5, '#0284c7');
        gradient.addColorStop(1, '#06b6d4');

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
              <span class="consult-status-indicator" id="consult-status-indicator">Speaking...</span>
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
            <button type="button" class="consult-mic-target" id="consult-mic-target" aria-label="Microphone Assistant">
              <svg class="icon consult-mic-icon-large" viewBox="0 0 24 24" id="consult-mic-svg">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>

            <!-- Dynamic Voice State Container -->
            <div class="consult-voice-state-wrap" id="consult-voice-state-wrap">
              <div class="consult-voice-status-title" id="consult-status-title">Ami is speaking...</div>
              <div class="consult-voice-status-sub" id="consult-status-sub">Listening starts automatically when Ami finishes</div>
              <div class="consult-mic-live-tag" id="consult-mic-live-tag" hidden>
                <span class="pulse-dot"></span> <span id="consult-mic-live-label">Microphone Active</span>
              </div>
            </div>

            <!-- Waveform Canvas Visualizer -->
            <canvas id="consult-audio-visualizer" class="consult-audio-canvas" width="220" height="48" hidden></canvas>

            <!-- Unified Direct Input Box (Voice Streams Here + Direct Tap to Edit) -->
            <div class="consult-unified-input-wrap">
              <div class="consult-input-inner" id="consult-input-inner">
                <textarea
                  id="consult-speech-input"
                  class="consult-speech-input"
                  rows="2"
                  placeholder="Speak naturally or tap here to type..."
                  autocomplete="off"
                ></textarea>
                <div class="consult-input-controls">
                  <button type="button" class="btn btn--xs btn--outline" id="consult-keypad-btn" title="Touch Keypad">
                    ⌨️ Keypad
                  </button>
                  <button type="button" class="btn btn--primary btn--sm" id="consult-send-action-btn">
                    Send &rarr;
                  </button>
                </div>
              </div>
            </div>

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
  const nextBtn = document.getElementById('consult-next-btn');

  // Unified Voice & Direct-Edit Elements
  const statusTitle = document.getElementById('consult-status-title');
  const statusSub = document.getElementById('consult-status-sub');
  const canvasEl = document.getElementById('consult-audio-visualizer');
  const speechInput = document.getElementById('consult-speech-input');
  const sendActionBtn = document.getElementById('consult-send-action-btn');
  const keypadBtn = document.getElementById('consult-keypad-btn');
  const inputInner = document.getElementById('consult-input-inner');

  const visualizer = new VoiceVisualizer(canvasEl);

  let currentVoiceState = 'SPEAKING'; // 'SPEAKING' | 'LISTENING' | 'PROCESSING' | 'IDLE'
  let recognitionInstance = null;
  let audioContext = null;
  let microphone = null;
  let voiceStream = null;
  let silenceTimer = null;
  let isComponentMounted = true;
  let isVoiceModeActive = true;
  let isUserTypingManually = false;

  function setVoiceUIState(state) {
    currentVoiceState = state;
    
    if (state === 'LISTENING') {
      visualizer.setState('listening');
    } else if (state === 'SPEAKING') {
      visualizer.setState('speaking');
    } else {
      visualizer.setState('idle');
    }

    micTarget.className = 'consult-mic-target';
    canvasEl.hidden = true;

    switch (state) {
      case 'SPEAKING':
        micTarget.classList.add('consult-mic-target--speaking');
        statusTitle.textContent = 'Ami is speaking...';
        statusSub.textContent = 'Listen to the question, then speak your answer';
        statusIndicator.textContent = 'Speaking...';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--speaking';
        canvasEl.hidden = false;
        break;

      case 'LISTENING':
        micTarget.classList.add('consult-mic-target--listening');
        statusTitle.textContent = 'Listening to you...';
        statusSub.textContent = 'Speak naturally, or type directly below';
        statusIndicator.textContent = 'Listening...';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--listening';
        canvasEl.hidden = false;
        break;

      case 'PROCESSING':
        micTarget.classList.add('consult-mic-target--processing');
        statusTitle.textContent = 'Ami is thinking...';
        statusSub.textContent = 'Analyzing clinical response';
        statusIndicator.textContent = 'Processing...';
        statusIndicator.className = 'consult-status-indicator consult-status-indicator--processing';
        break;

      case 'IDLE':
        statusTitle.textContent = 'Tap to speak';
        statusSub.textContent = "Tell us what you're experiencing or type below";
        statusIndicator.textContent = 'Ready';
        statusIndicator.className = 'consult-status-indicator';
        break;
    }
  }

  function setMode(isVoice) {
    isVoiceModeActive = isVoice;
    triggerHaptic('light');
    voiceBtn.classList.toggle('consult-mode-btn--active', isVoice);
    textBtn.classList.toggle('consult-mode-btn--active', !isVoice);
    voiceBtn.setAttribute('aria-selected', String(isVoice));
    textBtn.setAttribute('aria-selected', String(!isVoice));
    voiceSection.hidden = !isVoice;
    textSection.hidden = isVoice;

    if (!isVoice) {
      stopSpeaking();
      stopVoice();
      if (speechInput) speechInput.focus();
    } else {
      startVoiceListening();
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
    if (isVoiceModeActive) {
      startVoiceListening();
    }
  } else {
    const initialGreeting = `Hello ${s.patient?.display_name || 'Patient'}. What symptoms or medical concern brings you to the hospital today?`;
    runAssistantSpeechCycle(initialGreeting);
  }

  // Quick symptom pills: fills input and sends directly
  document.querySelectorAll('.consult-symptom-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      triggerHaptic('light');
      const text = pill.dataset.text;
      if (speechInput) speechInput.value = text;
      handlePatientAnswer(text);
    });
  });

  // Next step
  nextBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    isComponentMounted = false;
    stopSpeaking();
    stopVoice();
    setState({ kioskStep: 3 });
  });

  // Direct In-Place Input & Typing Handlers
  speechInput?.addEventListener('focus', () => {
    isUserTypingManually = true;
    inputInner?.classList.add('consult-input-inner--active');
  });

  speechInput?.addEventListener('blur', () => {
    inputInner?.classList.remove('consult-input-inner--active');
  });

  speechInput?.addEventListener('input', () => {
    isUserTypingManually = true;
    clearTimeout(silenceTimer);
  });

  speechInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitDirectInput();
    }
  });

  sendActionBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    submitDirectInput();
  });

  keypadBtn?.addEventListener('click', () => {
    triggerHaptic('light');
    openVirtualKeyboard(speechInput);
  });

  function submitDirectInput() {
    const text = speechInput?.value.trim();
    if (!text) return;
    triggerHaptic('success');
    handlePatientAnswer(text);
  }

  // Mic target click: Tap to interrupt or start listening
  micTarget?.addEventListener('click', () => {
    triggerHaptic('light');
    if (currentVoiceState === 'SPEAKING') {
      stopSpeaking();
      startVoiceListening();
    } else if (currentVoiceState === 'LISTENING') {
      const currentVal = speechInput?.value.trim();
      if (currentVal) {
        commitSpeech();
      } else {
        stopVoice();
        setVoiceUIState('IDLE');
      }
    } else {
      startVoiceListening();
    }
  });

  function commitSpeech() {
    clearTimeout(silenceTimer);
    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
      } catch {}
    }
    const val = speechInput?.value.trim();
    if (val) {
      handlePatientAnswer(val);
    } else {
      setVoiceUIState('IDLE');
    }
  }

  // ── Assistant Speech -> Auto Listen Cycle ─────────────────────────────────
  async function runAssistantSpeechCycle(text) {
    if (!isComponentMounted || !isVoiceModeActive) return;

    setVoiceUIState('SPEAKING');
    await speakText(text);

    if (isComponentMounted && isVoiceModeActive) {
      startVoiceListening();
    }
  }

  // ── Active Voice Listening & Automatic Turn-Taking (VAD) ──────────────────
  async function startVoiceListening() {
    if (!isComponentMounted || !isVoiceModeActive) return;
    stopVoice();

    isUserTypingManually = false;
    if (speechInput) speechInput.value = '';
    setVoiceUIState('LISTENING');

    const micTag = document.getElementById('consult-mic-live-tag');

    // Attach hardware audio stream for visualizer
    try {
      if (navigator.mediaDevices?.getUserMedia && !voiceStream) {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        microphone = audioContext.createMediaStreamSource(voiceStream);
        visualizer.attachStream(audioContext, microphone);
      }
      if (micTag) micTag.hidden = false;
    } catch (err) {
      console.warn('Microphone hardware notice:', err);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported in this browser. You can type directly in the input box.', 'info');
      setVoiceUIState('IDLE');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionInstance = recognition;
      recognition.lang = getSpeechRecognitionLanguage(s.patient?.preferred_language);
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
        }
        transcript = transcript.trim();
        if (transcript && !isUserTypingManually) {
          if (speechInput) speechInput.value = transcript;

          // Auto silence detection: ~950ms after speech ends, submit automatically!
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            if (speechInput && speechInput.value.trim() && currentVoiceState === 'LISTENING') {
              triggerHaptic('light');
              commitSpeech();
            }
          }, 950);
        }
      };

      recognition.onerror = (e) => {
        console.warn('Speech recognition notice:', e.error);
        if (speechInput && speechInput.value.trim()) {
          commitSpeech();
        }
      };

      recognition.onend = () => {
        if (speechInput && speechInput.value.trim() && currentVoiceState === 'LISTENING') {
          commitSpeech();
        } else if (currentVoiceState === 'LISTENING') {
          try { recognition.start(); } catch {}
        }
      };

      recognition.start();
    } catch (err) {
      console.warn('Speech recognition start notice:', err);
      if (speechInput && speechInput.value.trim()) {
        commitSpeech();
      }
    }
  }

  function stopAudioStream() {
    visualizer.stop();
    const micTag = document.getElementById('consult-mic-live-tag');
    if (micTag) micTag.hidden = true;
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
    clearTimeout(silenceTimer);
    if (recognitionInstance) {
      try {
        recognitionInstance.onend = null;
        recognitionInstance.stop();
      } catch {}
      recognitionInstance = null;
    }
    stopAudioStream();
  }

  // ── Handle Patient Answer & AI Conversation Turn ─────────────────────────
  async function handlePatientAnswer(userText) {
    const cleanText = userText.trim();
    if (!cleanText) return;

    stopVoice();
    setVoiceUIState('PROCESSING');

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
        await speakText(reply);
        window.setTimeout(() => setState({ kioskStep: 3 }), 1200);
      } else {
        runAssistantSpeechCycle(reply);
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
