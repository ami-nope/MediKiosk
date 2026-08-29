/**
 * MediKIOSK — Patient Clinical Consultation Interface
 * Clean, professional hospital-grade intake flow with Voice and Text modes.
 */

import { submitMessage } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';
import { speakText, openVirtualKeyboard } from '../components/accessibility.js';

let isPriorityAlerted = false;

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
          <span class="consultation-patient-info">Patient: <strong>${escapeHtml(patientName)}</strong> &bull; MRN: <strong>${escapeHtml(mrn)}</strong> &bull; Lang: <strong>${lang}</strong></span>
        </div>

        <div class="consultation-mode-toggle" role="tablist">
          <button type="button" class="consult-mode-btn consult-mode-btn--active" id="mode-voice-btn" role="tab" aria-selected="true">
            <svg class="icon" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            <span>Voice</span>
          </button>
          <button type="button" class="consult-mode-btn" id="mode-text-btn" role="tab" aria-selected="false">
            <svg class="icon" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
            <span>Keyboard</span>
          </button>
        </div>
      </div>

      <!-- Main Consultation Body -->
      <div class="consultation-body">
        
        <!-- Assistant Question Panel -->
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

        <!-- VOICE INTERACTION SECTION -->
        <div class="consult-voice-section" id="consult-voice-section">
          
          <div class="consult-voice-toolbar">
            <button type="button" class="consult-mic-button" id="consult-mic-button">
              <svg class="icon consult-mic-icon" viewBox="0 0 24 24"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              <span id="consult-mic-label">Tap to Speak</span>
            </button>

            <div class="consult-live-caption" id="consult-live-caption">
              <span class="consult-caption-prompt" id="consult-caption-prompt">Press the button above and describe your symptoms in your own words.</span>
            </div>
          </div>

          <!-- Common Symptoms Quick-Select Pills -->
          <div class="consult-quick-symptoms">
            <span class="consult-quick-label">Or quick tap:</span>
            <button type="button" class="consult-symptom-pill" data-text="Fever and body pain">Fever &amp; Body Pain</button>
            <button type="button" class="consult-symptom-pill" data-text="Cough and sore throat">Cough &amp; Cold</button>
            <button type="button" class="consult-symptom-pill" data-text="Severe stomach pain">Stomach Pain</button>
            <button type="button" class="consult-symptom-pill" data-text="General routine checkup">Routine Checkup</button>
          </div>

        </div>

        <!-- TEXT / KEYBOARD SECTION (Hidden by default) -->
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
              placeholder="Type your response here..."
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

export function mountChat() {
  isPriorityAlerted = false;

  const voiceBtn = document.getElementById('mode-voice-btn');
  const textBtn = document.getElementById('mode-text-btn');
  const voiceSection = document.getElementById('consult-voice-section');
  const textSection = document.getElementById('consult-text-section');
  const micButton = document.getElementById('consult-mic-button');
  const micLabel = document.getElementById('consult-mic-label');
  const statusIndicator = document.getElementById('consult-status-indicator');
  const questionText = document.getElementById('consult-question-text');
  const captionPrompt = document.getElementById('consult-caption-prompt');
  const historyLog = document.getElementById('consult-history-log');
  const inputField = document.getElementById('consult-input-field');
  const sendBtn = document.getElementById('consult-send-btn');
  const vkBtn = document.getElementById('consult-vk-btn');
  const nextBtn = document.getElementById('consult-next-btn');

  function setMode(isVoice) {
    voiceBtn.classList.toggle('consult-mode-btn--active', isVoice);
    textBtn.classList.toggle('consult-mode-btn--active', !isVoice);
    voiceBtn.setAttribute('aria-selected', String(isVoice));
    textBtn.setAttribute('aria-selected', String(!isVoice));
    voiceSection.hidden = !isVoice;
    textSection.hidden = isVoice;

    if (!isVoice && inputField) {
      inputField.focus();
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
      handlePatientAnswer(pill.dataset.text);
    });
  });

  // Next step
  nextBtn?.addEventListener('click', () => {
    setState({ kioskStep: 3 });
  });

  // Text inputs
  vkBtn?.addEventListener('click', () => openVirtualKeyboard(inputField));
  inputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendText();
    }
  });
  sendBtn?.addEventListener('click', handleSendText);

  function handleSendText() {
    const text = inputField.value.trim();
    if (!text) return;
    inputField.value = '';
    handlePatientAnswer(text);
  }

  // Audio / Speech Engine
  let voiceSocket;
  let audioContext;
  let processor;
  let microphone;
  let voiceStream;
  let audioSource;
  let audioQueue = [];
  let audioPlaying = false;
  let silenceStartedAt = null;
  let hasSpeech = false;
  let stopQueued = false;

  const voiceApiBase = (window.__VOICE_API_URL__ || import.meta.env.VITE_VOICE_API_URL || 'https://voice.amii.lol').replace(/\/$/, '');
  const STOP_AFTER_SILENCE_MS = Number(window.__VOICE_SILENCE_MS__ ?? import.meta.env.VITE_VOICE_SILENCE_MS ?? 1800);
  const AUDIO_THRESHOLD = Number(window.__VOICE_AUDIO_THRESHOLD__ ?? import.meta.env.VITE_VOICE_AUDIO_THRESHOLD ?? 0.04);

  function setStatus(status, text) {
    statusIndicator.textContent = text;
    statusIndicator.className = `consult-status-indicator consult-status-indicator--${status}`;
    if (status === 'listening') {
      micButton.classList.add('consult-mic-button--listening');
      micLabel.textContent = 'Listening... (Tap to finish)';
    } else {
      micButton.classList.remove('consult-mic-button--listening');
      micLabel.textContent = 'Tap to Speak';
    }
  }

  micButton?.addEventListener('click', async () => {
    if (voiceSocket?.readyState === WebSocket.OPEN) {
      stopVoice();
      return;
    }

    const isSecureContext = window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!navigator.mediaDevices?.getUserMedia || !isSecureContext) {
      startBrowserSpeechRecognition();
      return;
    }

    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true }
      });
      audioContext = new AudioContext();
      microphone = audioContext.createMediaStreamSource(voiceStream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioSource = audioContext.createGain();
      audioSource.gain.value = 0;
      microphone.connect(processor);
      processor.connect(audioSource);
      audioSource.connect(audioContext.destination);

      voiceSocket = new WebSocket(toVoiceSocketUrl(voiceApiBase));
      voiceSocket.binaryType = 'arraybuffer';
      voiceSocket.onopen = () => {
        hasSpeech = false;
        stopQueued = false;
        silenceStartedAt = null;
        setStatus('listening', 'Listening to you...');
        captionPrompt.textContent = 'Listening... Please speak clearly.';
      };
      voiceSocket.onmessage = (event) => handleVoiceEvent(event);
      voiceSocket.onerror = () => {
        stopVoice(false);
        startBrowserSpeechRecognition();
      };
      voiceSocket.onclose = () => stopVoice(false);
      processor.onaudioprocess = (event) => {
        if (voiceSocket?.readyState === WebSocket.OPEN) {
          const input = event.inputBuffer.getChannelData(0);
          signalActivity(input);
          const pcm = pcm16FromBuffer(input, audioContext.sampleRate);
          voiceSocket.send(new Uint8Array(pcm.buffer));
        }
      };
    } catch {
      startBrowserSpeechRecognition();
    }
  });

  function signalActivity(samples) {
    let energy = 0;
    for (let i = 0; i < samples.length; i += 1) energy += samples[i] * samples[i];
    const rms = Math.sqrt(energy / Math.max(1, samples.length));
    const now = performance.now();

    if (rms > AUDIO_THRESHOLD) {
      hasSpeech = true;
      silenceStartedAt = null;
      stopQueued = false;
      return;
    }

    if (hasSpeech && !stopQueued) {
      if (silenceStartedAt === null) silenceStartedAt = now;
      if (now - silenceStartedAt >= STOP_AFTER_SILENCE_MS) {
        stopQueued = true;
        if (voiceSocket?.readyState === WebSocket.OPEN) {
          voiceSocket.send('stop');
          setStatus('processing', 'Processing your response...');
        }
      }
    }
  }

  function handleVoiceEvent(event) {
    if (typeof event.data !== 'string') {
      audioQueue.push(event.data);
      playNextAudio();
      setStatus('speaking', 'Speaking...');
      return;
    }

    const payload = JSON.parse(event.data);
    const eventType = payload.type || payload.event;
    const text = payload.text || payload.message || '';

    if (eventType === 'transcript.partial') {
      captionPrompt.textContent = `You: "${text}"`;
      setStatus('listening', 'Hearing words...');
    } else if (eventType === 'transcript.final') {
      const finalText = text.trim();
      if (!finalText) return;
      captionPrompt.textContent = `You: "${finalText}"`;
      handlePatientAnswer(finalText);
    } else if (eventType === 'assistant.done') {
      setStatus('idle', 'Ready to listen');
      if (payload.intake_complete) setState({ kioskStep: 3 });
    }
  }

  function stopVoice(sendStop = true) {
    if (sendStop && voiceSocket?.readyState === WebSocket.OPEN) voiceSocket.send('stop');
    processor?.disconnect();
    microphone?.disconnect();
    audioSource?.disconnect();
    voiceStream?.getTracks().forEach(track => track.stop());
    audioContext?.close();
    setStatus('idle', 'Ready to listen');
  }

  function startBrowserSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Microphone not supported on this browser. Please type your answers.', 'info');
      setMode(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = s.patient?.preferred_language || 'en-IN';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('listening', 'Listening to you...');
      captionPrompt.textContent = 'Listening... Please speak clearly.';
    };

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      captionPrompt.textContent = `You: "${transcript}"`;

      if (event.results[current].isFinal) {
        recognition.stop();
        setStatus('idle', 'Ready');
        handlePatientAnswer(transcript);
      }
    };

    recognition.onerror = () => setStatus('idle', 'Ready to listen');
    recognition.onend = () => setStatus('idle', 'Ready to listen');
    recognition.start();
  }

  async function handlePatientAnswer(userText) {
    const cleanText = userText.trim();
    if (!cleanText) return;

    captionPrompt.innerHTML = `Recorded: <strong>"${escapeHtml(cleanText)}"</strong>`;
    setStatus('processing', 'Doctor assistant is thinking...');

    appendLogItem(historyLog, 'user', cleanText);
    setState({ chatMessages: [...getState().chatMessages, { role: 'user', content: cleanText }] });

    const sessionId = getState().session?.id;
    if (!sessionId) return;

    try {
      const res = await submitMessage(sessionId, cleanText);
      const reply = res.assistant_reply;

      questionText.innerHTML = formatMessage(reply);
      setStatus('speaking', 'Speaking...');
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
        window.setTimeout(() => setStatus('idle', 'Ready to listen'), 3500);
      }
    } catch (err) {
      setStatus('idle', 'Ready to listen');
      showToast(err.message || 'Assistant response failed. Please retry.', 'error');
    }
  }

  async function playNextAudio() {
    if (audioPlaying || audioQueue.length === 0) return;
    audioPlaying = true;
    try {
      const buffer = await audioContext.decodeAudioData(await audioQueue.shift());
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        audioPlaying = false;
        playNextAudio();
      };
      source.start();
    } catch {
      audioPlaying = false;
    }
  }
}

function toVoiceSocketUrl(baseUrl) {
  const value = (baseUrl || '').trim().replace(/\/$/, '');
  if (!value) return 'wss://voice.amii.lol/ws/stt';
  if (value.startsWith('https://')) return `${value.replace(/^https:/, 'wss:')}/ws/stt`;
  if (value.startsWith('http://')) return `${value.replace(/^http:/, 'ws:')}/ws/stt`;
  return `wss://${value}/ws/stt`;
}

function pcm16FromBuffer(samples, inputRate) {
  const targetRate = 16000;
  const outputLength = Math.max(1, Math.round(samples.length * targetRate / inputRate));
  const pcm = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const srcIndex = (i * inputRate) / targetRate;
    const leftIndex = Math.floor(srcIndex);
    const rightIndex = Math.min(leftIndex + 1, samples.length - 1);
    const mix = srcIndex - leftIndex;
    const sample = samples[leftIndex] * (1 - mix) + samples[rightIndex] * mix;
    pcm[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  return pcm;
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
