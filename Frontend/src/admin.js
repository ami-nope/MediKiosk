import { getAiConfig, updateAiConfig } from './api.js';
import { showToast } from './components/toast.js';

const PROVIDERS = [
  {
    id: 'gemini',
    name: 'Gemini',
    keyLabel: 'Gemini API key',
    modelPlaceholder: 'gemini-3.7-flash',
  },
  {
    id: 'groq',
    name: 'Groq',
    keyLabel: 'Groq API key',
    modelPlaceholder: 'openai/gpt-oss-20b',
    baseUrlPlaceholder: 'https://api.groq.com',
  },
  {
    id: 'omniroute',
    name: 'Omniroute',
    keyLabel: 'Omniroute API key',
    modelPlaceholder: 'openai/gpt-4o-mini',
    baseUrlPlaceholder: 'http://localhost:20128/v1',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyLabel: 'OpenAI API key',
    modelPlaceholder: 'gpt-4o-mini',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyLabel: 'Anthropic API key',
    modelPlaceholder: 'claude-sonnet-4-20250514',
  },
  {
    id: 'ollama',
    name: 'Ollama Local',
    keyLabel: '',
    modelPlaceholder: 'llama3',
    baseUrlPlaceholder: 'http://localhost:11434',
  },
];

let aiConfig = null;

export function renderAdmin() {
  const el = document.createElement('div');
  el.className = 'admin-page fade-in';
  el.innerHTML = `
    <div class="admin-page__header">
      <div>
        <h1>AI Admin</h1>
        <p>Choose the active intake model and store local API settings.</p>
      </div>
      <button type="button" class="btn btn--secondary" id="admin-refresh-btn">Refresh</button>
    </div>
    <div id="admin-status" class="admin-status">Loading AI settings...</div>
    <form id="admin-ai-form" class="admin-provider-grid"></form>
    <div class="admin-actions">
      <button type="button" class="btn btn--secondary" id="admin-kiosk-btn">Back to Kiosk</button>
      <button type="submit" form="admin-ai-form" class="btn btn--primary">Save AI Settings</button>
    </div>
  `;
  return el;
}

export function mountAdmin() {
  document.getElementById('admin-refresh-btn')?.addEventListener('click', loadConfig);
  document.getElementById('admin-kiosk-btn')?.addEventListener('click', () => {
    window.location.hash = '#/kiosk';
  });
  document.getElementById('admin-ai-form')?.addEventListener('submit', saveConfig);
  loadConfig();
}

async function loadConfig() {
  const status = document.getElementById('admin-status');
  const form = document.getElementById('admin-ai-form');
  if (!status || !form) return;

  status.textContent = 'Loading AI settings...';
  try {
    aiConfig = await getAiConfig();
    form.innerHTML = PROVIDERS.map(provider => providerCard(provider, aiConfig)).join('');
    status.innerHTML = `Active provider: <strong>${providerName(aiConfig.active_provider)}</strong>`;
  } catch (err) {
    status.textContent = err.message || 'Failed to load AI settings';
    showToast(status.textContent, 'error');
  }
}

async function saveConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const active = form.querySelector('input[name="active_provider"]:checked')?.value || 'gemini';
  const update = { active_provider: active, providers: {} };

  for (const provider of PROVIDERS) {
    const card = form.querySelector(`[data-provider="${provider.id}"]`);
    if (!card) continue;
    update.providers[provider.id] = {
      api_key: card.querySelector(`[name="${provider.id}-api-key"]`)?.value.trim() || null,
      clear_api_key: card.querySelector(`[name="${provider.id}-clear-key"]`)?.checked || false,
      model: card.querySelector(`[name="${provider.id}-model"]`)?.value.trim() || null,
      base_url: card.querySelector(`[name="${provider.id}-base-url"]`)?.value.trim() || null,
    };
  }

  try {
    aiConfig = await updateAiConfig(update);
    showToast('AI settings saved.', 'success');
    await loadConfig();
  } catch (err) {
    showToast(err.message || 'Failed to save AI settings', 'error');
  }
}

function providerCard(provider, config) {
  const values = config.providers?.[provider.id] || {};
  const isActive = config.active_provider === provider.id;
  const keyStatus = values.api_key_configured ? 'Key saved' : 'No key saved';
  return `
    <section class="admin-provider" data-provider="${provider.id}">
      <div class="admin-provider__top">
        <div>
          <h2>${provider.name}</h2>
          <span class="admin-provider__status ${values.api_key_configured || provider.id === 'ollama' ? 'admin-provider__status--ok' : ''}">
            ${provider.id === 'ollama' ? 'Local model' : keyStatus}
          </span>
        </div>
        <label class="admin-radio">
          <input type="radio" name="active_provider" value="${provider.id}" ${isActive ? 'checked' : ''} />
          Use
        </label>
      </div>

      ${provider.keyLabel ? `
        <div class="form-group">
          <label for="${provider.id}-api-key">${provider.keyLabel}</label>
          <input type="password" id="${provider.id}-api-key" name="${provider.id}-api-key" placeholder="${values.api_key_configured ? 'Leave blank to keep saved key' : 'Paste API key'}" autocomplete="off" />
        </div>
        <label class="admin-check">
          <input type="checkbox" name="${provider.id}-clear-key" />
          Clear saved key
        </label>
      ` : ''}

      <div class="form-group">
        <label for="${provider.id}-model">Model</label>
        <input type="text" id="${provider.id}-model" name="${provider.id}-model" value="${escapeHtml(values.model || '')}" placeholder="${provider.modelPlaceholder}" />
      </div>

      ${provider.baseUrlPlaceholder ? `
        <div class="form-group">
          <label for="${provider.id}-base-url">Base URL</label>
          <input type="text" id="${provider.id}-base-url" name="${provider.id}-base-url" value="${escapeHtml(values.base_url || '')}" placeholder="${provider.baseUrlPlaceholder}" />
        </div>
      ` : ''}
    </section>
  `;
}

function providerName(id) {
  return PROVIDERS.find(provider => provider.id === id)?.name || id;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
