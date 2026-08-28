/**
 * MediKIOSK — Patient AI Intake Chat (Hospital Grade)
 */

import { submitMessage } from '../api.js';
import { getState, setState } from '../state.js';
import { showToast } from '../components/toast.js';
import { speakText, openVirtualKeyboard } from '../components/accessibility.js';
import { showMaintenanceOverlay } from '../components/maintenanceOverlay.js';

let isPriorityAlerted = false;

export function renderChat() {
  const el = document.createElement('div');
  el.className = 'chat fade-in';
  el.innerHTML = `
    <div class="chat__header">
      <div class="chat__avatar">
        <svg class="icon" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
      </div>
      <div class="chat__info">
        <h3>Health Questions</h3>
        <span>Session Active • OPD Patient History</span>
      </div>
    </div>

    <div class="chat__messages" id="chat-messages">
      <div class="chat__welcome">
        <h3>Tell us what brings you in today</h3>
        <p>Speak naturally, or type your answer below.</p>
      </div>
    </div>

    <div class="voice-panel" id="voice-panel">
      <button type="button" class="voice-mic" id="voice-mic-btn" aria-label="Start speaking">
        <svg class="icon" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 19v3M8 22h8"/></svg>
      </button>
      <div class="voice-status" aria-live="polite">
        <strong id="voice-state">Tap the microphone to speak</strong>
        <span id="voice-subtitle">Your words will appear here as you speak.</span>
      </div>
    </div>

    <div id="chat-done-container"></div>

    <div class="chat__input-bar" id="chat-input-bar">
      <button type="button" class="btn btn--secondary" id="chat-vk-trigger" title="On-Screen Touch Keyboard" style="padding:10px 14px;">
        <svg class="icon" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="8" y1="16" x2="16" y2="16"/></svg>
      </button>
      <input
        type="text"
        class="chat__input"
        id="chat-input"
        data-keyboard-label="Your answer"
        placeholder="Or type your answer here..."
        autocomplete="off"
      />
      <button class="chat__send" id="chat-send-btn" aria-label="Send message">
        <svg class="icon" style="width:20px;height:20px;" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;
  return el;
}

export function mountChat() {
  isPriorityAlerted = false;
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const messagesEl = document.getElementById('chat-messages');
  const vkBtn = document.getElementById('chat-vk-trigger');
  const voiceMic = document.getElementById('voice-mic-btn');
  const voiceState = document.getElementById('voice-state');
  const voiceSubtitle = document.getElementById('voice-subtitle');

  if (!input || !sendBtn || !messagesEl) return;

  const s = getState();
  if (s.chatMessages.length > 0) {
    messagesEl.innerHTML = '';
    s.chatMessages.forEach(msg => appendMessage(messagesEl, msg.role, msg.content, msg.provider, msg.fallback_reason));
    scrollToBottom(messagesEl);
  }

  vkBtn?.addEventListener('click', () => openVirtualKeyboard(input));

  messagesEl.addEventListener('click', (e) => {
    const mark = e.target.closest('.chat__provider-mark');
    const reason = mark?.dataset.fallbackReason;
    if (reason) {
      showToast(`Fallback reason: ${reason}`, 'info');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  let voiceSocket;
  let audioContext;
  let processor;
  let microphone;
  let voiceStream;
  let audioSource;
  let audioQueue = [];
  let audioPlaying = false;

  voiceMic?.addEventListener('click', async () => {
    if (voiceSocket?.readyState === WebSocket.OPEN) {
      stopVoice();
      return;
    }
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext();
      microphone = audioContext.createMediaStreamSource(voiceStream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);
      audioSource = audioContext.createGain();
      audioSource.gain.value = 0;
      microphone.connect(processor);
      processor.connect(audioSource);
      audioSource.connect(audioContext.destination);
      voiceSocket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/voice/${getState().session?.id}`);
      voiceSocket.binaryType = 'arraybuffer';
      voiceSocket.onopen = () => {
        setVoiceState('listening', 'Listening...', 'Speak naturally. I will show your words here.');
        voiceMic.classList.add('voice-mic--listening');
      };
      voiceSocket.onmessage = (event) => handleVoiceEvent(event);
      voiceSocket.onerror = () => showVoiceError('voice connection');
      voiceSocket.onclose = () => stopVoice(false);
      processor.onaudioprocess = (event) => {
        if (voiceSocket?.readyState === WebSocket.OPEN) {
          voiceSocket.send(pcm16FromBuffer(event.inputBuffer.getChannelData(0), audioContext.sampleRate));
        }
      };
    } catch (error) {
      showVoiceError(error.name === 'NotAllowedError' ? 'microphone permission' : 'microphone');
    }
  });

  function handleVoiceEvent(event) {
    if (typeof event.data !== 'string') {
      audioQueue.push(event.data);
      playNextAudio();
      setVoiceState('speaking', 'Ami is speaking', 'You can interrupt by speaking again.');
      return;
    }
    const payload = JSON.parse(event.data);
    if (payload.type === 'transcript.partial') {
      setVoiceState('listening', 'Listening...', payload.text || '');
    } else if (payload.type === 'transcript.final') {
      setVoiceState('processing', 'Working on your answer...', payload.text || '');
      appendMessage(messagesEl, 'user', payload.text);
      setState({ chatMessages: [...getState().chatMessages, { role: 'user', content: payload.text }] });
      scrollToBottom(messagesEl);
    } else if (payload.type === 'assistant.text') {
      appendMessage(messagesEl, 'assistant', payload.text, payload.provider, payload.fallback_reason);
      setState({ chatMessages: [...getState().chatMessages, { role: 'assistant', content: payload.text, provider: payload.provider, fallback_reason: payload.fallback_reason }] });
    } else if (payload.type === 'assistant.done') {
      setVoiceState('idle', 'Your turn', 'Tap the microphone whenever you are ready.');
      if (payload.intake_complete) setState({ kioskStep: 3 });
    } else if (payload.type === 'error') {
      showVoiceError(`${payload.stage}: ${payload.message}`);
    }
  }

  function stopVoice(sendStop = true) {
    if (sendStop && voiceSocket?.readyState === WebSocket.OPEN) voiceSocket.send(JSON.stringify({ type: 'stop' }));
    processor?.disconnect();
    microphone?.disconnect();
    audioSource?.disconnect();
    voiceStream?.getTracks().forEach(track => track.stop());
    audioContext?.close();
    voiceMic?.classList.remove('voice-mic--listening');
    setVoiceState('idle', 'Tap the microphone to speak', 'Your words will appear here as you speak.');
  }

  function setVoiceState(state, title, subtitle) {
    voiceState.textContent = title;
    voiceSubtitle.textContent = subtitle;
    voiceMic.className = `voice-mic ${state === 'listening' ? 'voice-mic--listening' : ''} ${state === 'speaking' ? 'voice-mic--speaking' : ''}`;
  }

  function showVoiceError(message) {
    showToast(`Voice error: ${message}`, 'error');
    stopVoice(false);
    setVoiceState('error', 'Voice unavailable', `Please use the text box. Error: ${message}`);
  }

  async function playNextAudio() {
    if (audioPlaying || audioQueue.length === 0) return;
    audioPlaying = true;
    try {
      const buffer = await audioContext.decodeAudioData(await audioQueue.shift());
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => { audioPlaying = false; playNextAudio(); };
      source.start();
    } catch {
      audioPlaying = false;
      showVoiceError('audio playback');
    }
  }

  async function handleSend() {
    if (input.disabled || sendBtn.disabled) return;

    const text = input.value.trim();
    if (!text) return;

    const state = getState();
    const sessionId = state.session?.id;
    if (!sessionId) return;


    input.value = '';

    const welcome = messagesEl.querySelector('.chat__welcome');
    if (welcome) welcome.remove();

    appendMessage(messagesEl, 'user', text);
    scrollToBottom(messagesEl);

    const typing = showTyping(messagesEl);
    scrollToBottom(messagesEl);

    input.disabled = true;
    sendBtn.disabled = true;
    let shouldUnlockInput = true;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);

    try {
      const res = await submitMessage(sessionId, text, { signal: controller.signal });
      typing.remove();

      appendMessage(messagesEl, 'assistant', res.assistant_reply, res.provider, res.fallback_reason);
      scrollToBottom(messagesEl);

      speakText(res.assistant_reply);

      const messages = [
        ...state.chatMessages,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: res.assistant_reply,
          provider: res.provider,
          fallback_reason: res.fallback_reason,
        },
      ];
      setState({ chatMessages: messages });

      if (res.is_priority && !isPriorityAlerted) {
        isPriorityAlerted = true;
        const alert = document.createElement('div');
        alert.className = 'chat__priority-alert';
        alert.innerHTML = '<strong>Priority Escalation Alert</strong> — Potential urgent symptoms detected. Session escalated for nursing triage.';
        messagesEl.appendChild(alert);
        scrollToBottom(messagesEl);
        showToast('Priority Escalation: Case flagged for immediate physician review.', 'warning');
      }

      if (res.is_priority) {
        setState({ session: { ...getState().session, is_priority: true } });
      }

      if (res.intake_complete) {
        input.disabled = true;
        sendBtn.disabled = true;
        shouldUnlockInput = false;
        showToast('Questions complete. Moving to document upload.', 'success');
        window.setTimeout(() => setState({ kioskStep: 3 }), 1200);
        return;
      }

    } catch (err) {
      typing.remove();
      if (isGroqToolChoiceError(err)) {
        const fallbackReply = getLocalFallbackReply(text);
        appendMessage(messagesEl, 'assistant', fallbackReply, 'local');
        scrollToBottom(messagesEl);
        setState({
          chatMessages: [
            ...state.chatMessages,
            { role: 'user', content: text },
            { role: 'assistant', content: fallbackReply, provider: 'local' },
          ],
        });
        speakText(fallbackReply);
        return;
      }

      const message = err.name === 'AbortError'
        ? 'AI assistant timed out. Please retry.'
        : (err.message || 'AI assistant is unavailable. Please retry.');
      showToast(message, 'error');
      if (!err.status || err.status >= 500) {
        console.warn('Chat request failed', err);
      }
    } finally {
      window.clearTimeout(timeout);
      if (shouldUnlockInput) {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }
  }

  showDoneBar();
}

function pcm16FromBuffer(samples, inputRate) {
  const ratio = inputRate / 16000;
  const length = Math.floor(samples.length / ratio);
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const sample = samples[Math.floor(index * ratio)] || 0;
    pcm[index] = Math.max(-1, Math.min(1, sample)) * 0x7fff;
  }
  return pcm.buffer;
}

function appendMessage(container, role, content, provider, fallbackReason) {
  const msg = document.createElement('div');
  msg.className = `chat__msg chat__msg--${role}`;
  
  const iconSvg = role === 'user'
    ? '<svg class="icon" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    : '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>';

  const providerMark = role === 'assistant' && provider
    ? `<span class="chat__provider-mark" title="${escapeHtml(providerTitle(provider, fallbackReason))}" data-fallback-reason="${escapeHtml(fallbackReason || '')}">${escapeHtml(providerMarkLabel(provider))}</span>`
    : '';

  msg.innerHTML = `
    <div class="chat__msg-avatar">${iconSvg}</div>
    <div class="chat__msg-bubble">${formatMessage(content)}${providerMark}</div>
  `;
  container.appendChild(msg);
}

function providerMarkLabel(provider) {
  return String(provider || '').toLowerCase() === 'ami' ? 'ami' : 'other';
}

function providerTitle(provider, fallbackReason) {
  const label = providerMarkLabel(provider);
  if (label === 'ami') return 'Answered by Ami';
  return fallbackReason ? `Fallback reason: ${fallbackReason}` : 'Answered by fallback provider';
}

function showTyping(container) {
  const typing = document.createElement('div');
  typing.className = 'chat__typing';
  typing.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 0;';
  typing.innerHTML = `
    <div class="chat__msg-avatar" style="background:var(--primary);color:#fff;">
      <svg class="icon" viewBox="0 0 24 24"><path d="M12 2v20M2 12h20"/></svg>
    </div>
    <div style="background:var(--bg-surface); padding:8px 14px; border-radius:12px; border:1px solid var(--border); font-size:0.875rem; color:var(--text-muted);">
      <span class="spinner" style="width:14px;height:14px;border-width:2px;margin-right:6px;"></span> Assistant is typing...
    </div>
  `;
  container.appendChild(typing);
  return typing;
}

function showDoneBar() {
  const container = document.getElementById('chat-done-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 20px; background:var(--success-bg); border-top:1px solid var(--success-border);">
      <span style="font-size:0.875rem; font-weight:600; color:var(--success);">Completed history intake?</span>
      <button class="btn btn--primary btn--sm" id="chat-done-btn">Proceed to Document Upload →</button>
    </div>
  `;

  document.getElementById('chat-done-btn')?.addEventListener('click', () => {
    const s = getState();
    if (s.chatMessages.length === 0) {
      showToast('Please enter at least one symptom or select a button before continuing', 'warning');
      return;
    }
    setState({ kioskStep: 3 });
  });
}

function scrollToBottom(el) {
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
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

function isGroqToolChoiceError(err) {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('tool choice is none') && message.includes('model called a tool');
}

function getLocalFallbackReply(text) {
  const value = ` ${String(text || '').trim().toLowerCase()} `;
  const hasAge = /\b(?:[1-9]\d?|1[01]\d|120)\b/.test(value);
  const hasGender = /\b(?:m|f|fem|male|female|other|man|woman|boy|girl)\b/.test(value);

  if (hasGender && !hasAge) {
    return '**Age:** Please enter your age in years.';
  }
  if (hasAge && !hasGender) {
    return '**Gender:** Please enter Male, Female, or Other.';
  }
  if (hasAge && hasGender) {
    return '**What brings you in today?** Please describe your main concern in your own words.';
  }
  return '**Please continue.** Tell me your main problem and when it started.';
}
