import './styles.css';
import { getErrorText, readRoom, sayUnsigned } from './lib/technocore.ts';
import {
  encodeDidForUrl,
  fingerprint,
  generateIdentity,
  notePath,
} from './lib/did.ts';

const tabs = [
  { id: 'identity', label: 'Identity' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'registry', label: 'Registry' },
];

const IDENTITY_STORAGE_KEY = 'tc.identity.v1';

let activeTab = 'identity';
let importText = '';
let identityMessage = '';
let identity = null;
let identityFingerprint = '';
let identityNotePath = '';

let roomName = 'lobby';
let roomNick = '';
let roomText = '';
let roomMessages = [];
let roomLoading = false;
let roomError = '';

const app = document.querySelector('#app');

function render() {
  app.innerHTML = `
    <main class="shell" aria-labelledby="app-title">
      <header class="shell__header">
        <h1 id="app-title">Technocore Operator</h1>
        <div class="status-pill" aria-live="polite" title="${escapeHtml(statusTitle())}">${escapeHtml(statusLabel())}</div>
      </header>

      <nav class="tabs" role="tablist" aria-label="Technocore Operator panels">
        ${tabs
          .map(
            (tab) => `
              <button
                type="button"
                id="tab-${tab.id}"
                role="tab"
                class="tab"
                aria-controls="panel-${tab.id}"
                aria-selected="${activeTab === tab.id}"
                tabindex="${activeTab === tab.id ? 0 : -1}"
                data-tab="${tab.id}"
              >
                ${tab.label}
              </button>
            `,
          )
          .join('')}
      </nav>

      <section id="panel-identity" class="panel" role="tabpanel" aria-labelledby="tab-identity" ${activeTab !== 'identity' ? 'hidden' : ''}>
        <h2>Identity</h2>
        <p class="muted">${identity ? 'key loaded' : 'no key yet'}</p>

        <div class="field-grid">
          <label class="field"><span>DID</span><output aria-label="DID">${escapeHtml(identity?.did ?? '')}</output></label>
          <label class="field"><span>Fingerprint</span><output aria-label="Fingerprint">${escapeHtml(identityFingerprint)}</output></label>
          <label class="field"><span>DID-note path</span><output aria-label="DID-note path">${escapeHtml(identityNotePath)}</output></label>
        </div>

        <div class="action-row">
          <button type="button" id="generate-btn">Generate key</button>
          <button type="button" id="import-btn">Import key</button>
          <button type="button" id="export-btn" ${identity ? '' : 'disabled'}>Export backup</button>
          <button type="button" id="save-btn" ${identity ? '' : 'disabled'}>Save on this device</button>
          <button type="button" id="clear-btn">Clear from this device</button>
        </div>

        <label class="stacked" for="import-area">Import backup JSON</label>
        <textarea id="import-area" rows="6" placeholder='{"v":1,"did":"did:key:...","secretB64url":"...","createdAt":"..."}'>${escapeHtml(importText)}</textarea>
        <p class="hint">Import expects JSON with v, did, secretB64url, and createdAt. This app never logs secrets.</p>
        <p class="hint" aria-live="polite">${escapeHtml(identityMessage)}</p>
      </section>

      <section id="panel-rooms" class="panel" role="tabpanel" aria-labelledby="tab-rooms" ${activeTab !== 'rooms' ? 'hidden' : ''}>
        <h2>Rooms</h2>
        <div class="room-controls">
          <div>
            <label class="stacked" for="room-name">Room name</label>
            <input id="room-name" type="text" value="${escapeHtml(roomName)}" autocomplete="off" />
          </div>
          <button type="button" id="refresh-room" ${roomLoading ? 'disabled' : ''}>Refresh</button>
        </div>

        <div class="messages" role="log" aria-label="Message list">
          ${renderMessages()}
        </div>

        ${roomError ? `<p class="error" aria-live="polite">${escapeHtml(roomError)}</p>` : ''}

        <div class="composer">
          <label class="stacked" for="nick">Nickname</label>
          <input id="nick" type="text" placeholder="operator" value="${escapeHtml(roomNick)}" autocomplete="off" />

          <label class="stacked" for="body">Message</label>
          <input id="body" type="text" placeholder="Type a message" value="${escapeHtml(roomText)}" autocomplete="off" />

          <label class="checkbox" for="signed-send">
            <input id="signed-send" type="checkbox" disabled /> Signed send
          </label>

          <button type="button" id="send-unsigned" ${canSendUnsigned() ? '' : 'disabled'}>
            ${roomLoading ? 'Sending…' : 'Send unsigned'}
          </button>
        </div>
      </section>

      <section id="panel-registry" class="panel" role="tabpanel" aria-labelledby="tab-registry" ${activeTab !== 'registry' ? 'hidden' : ''}>
        <h2>Registry</h2>
        <p class="muted">Registry integration is not connected yet.</p>
        <div class="action-row">
          <button type="button" disabled>Publish DID note</button>
          <button type="button" disabled>Publish builder proof</button>
        </div>
      </section>

      <footer class="shell__footer">Not affiliated with Flop Labs. Keys stay in this browser.</footer>
    </main>
  `;

  bindEvents();
}

function renderMessages() {
  if (roomLoading && roomMessages.length === 0) {
    return '<p class="muted">Loading…</p>';
  }

  if (roomMessages.length === 0) {
    return '<p class="muted">No messages yet.</p>';
  }

  return roomMessages
    .map((msg) => {
      const seq = valueOrBlank(msg.seq);
      const from = valueOrBlank(msg.from);
      const text = valueOrBlank(msg.text);
      const verified = msg.verified === true;
      const nickLabel = verified ? from : `~${from}`;

      return `
        <article class="message">
          <strong>${escapeHtml(String(seq))} · ${escapeHtml(nickLabel)}</strong>
          <p>${escapeHtml(String(text))}</p>
        </article>
      `;
    })
    .join('');
}

function valueOrBlank(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
}

function canSendUnsigned() {
  return !roomLoading && roomNick.trim().length > 0 && roomText.trim().length > 0;
}

function statusLabel() {
  if (!identity?.did) return 'unsigned';
  const did = identity.did;
  if (did.length <= 22) return did;
  return `${did.slice(0, 14)}…${did.slice(-6)}`;
}

function statusTitle() {
  if (!identity?.did) return 'Will show shortened DID when wired';
  return `DID: ${identity.did} | URL: ${encodeDidForUrl(identity.did)}`;
}

function bindEvents() {
  const tabButtons = Array.from(document.querySelectorAll('[role="tab"]'));
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      render();
      document.querySelector(`#tab-${activeTab}`)?.focus();
    });

    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();

      const currentIndex = tabButtons.findIndex((tab) => tab.dataset.tab === activeTab);
      let nextIndex = currentIndex;

      if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
      if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabButtons.length - 1;

      activeTab = tabButtons[nextIndex].dataset.tab;
      render();
      document.querySelector(`#tab-${activeTab}`)?.focus();
    });
  });

  const importArea = document.querySelector('#import-area');
  importArea?.addEventListener('input', (event) => {
    importText = event.target.value;
  });

  document.querySelector('#generate-btn')?.addEventListener('click', () => {
    void handleGenerateIdentity();
  });

  document.querySelector('#import-btn')?.addEventListener('click', () => {
    void handleImportIdentity();
  });

  document.querySelector('#export-btn')?.addEventListener('click', () => {
    handleExportIdentity();
  });

  document.querySelector('#save-btn')?.addEventListener('click', () => {
    handleSaveIdentity();
  });

  document.querySelector('#clear-btn')?.addEventListener('click', () => {
    handleClearIdentity();
  });

  const roomNameInput = document.querySelector('#room-name');
  roomNameInput?.addEventListener('input', (event) => {
    roomName = event.target.value;
  });

  document.querySelector('#refresh-room')?.addEventListener('click', () => {
    void loadRoomMessages();
  });

  const nickInput = document.querySelector('#nick');
  nickInput?.addEventListener('input', (event) => {
    roomNick = event.target.value;
    render();
    document.querySelector('#nick')?.focus();
  });

  const bodyInput = document.querySelector('#body');
  bodyInput?.addEventListener('input', (event) => {
    roomText = event.target.value;
    render();
    document.querySelector('#body')?.focus();
  });

  document.querySelector('#send-unsigned')?.addEventListener('click', () => {
    void sendUnsignedMessage();
  });
}

async function handleGenerateIdentity() {
  try {
    const generated = await generateIdentity();
    identity = {
      did: generated.did,
      secretB64url: generated.secretB64url,
      createdAt: new Date().toISOString(),
    };
    importText = '';
    await hydrateIdentityFields();
    identityMessage = 'Key generated in memory. Export backup now; this is your only backup.';
  } catch (error) {
    identityMessage = getErrorText(error);
  }
  render();
}

async function handleImportIdentity() {
  try {
    const parsed = parseIdentityJson(importText);
    identity = parsed;
    await hydrateIdentityFields();
    identityMessage = 'Identity imported into memory.';
  } catch (error) {
    identityMessage = getErrorText(error);
  }
  render();
}

function handleExportIdentity() {
  if (!identity) return;

  const backup = {
    v: 1,
    did: identity.did,
    secretB64url: identity.secretB64url,
    createdAt: identity.createdAt,
  };

  const blob = new Blob([`${JSON.stringify(backup, null, 2)}\n`], { type: 'application/json' });
  const filename = `technocore-identity-${identity.createdAt.slice(0, 10)}.json`;
  downloadBlob(blob, filename);

  identityMessage = 'Backup downloaded. This file is your only backup; keep it safe.';
  render();
}

function handleSaveIdentity() {
  if (!identity) return;

  const payload = {
    v: 1,
    did: identity.did,
    secretB64url: identity.secretB64url,
    createdAt: identity.createdAt,
  };

  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
    identityMessage = 'Saved on this device.';
  } catch (error) {
    identityMessage = getErrorText(error);
  }

  render();
}

function handleClearIdentity() {
  identity = null;
  identityFingerprint = '';
  identityNotePath = '';
  importText = '';

  try {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
    identityMessage = 'Identity cleared from memory and this device.';
  } catch (error) {
    identityMessage = getErrorText(error);
  }

  render();
}

async function hydrateIdentityFields() {
  if (!identity?.did) {
    identityFingerprint = '';
    identityNotePath = '';
    return;
  }

  identityFingerprint = await fingerprint(identity.did);
  identityNotePath = await notePath(identity.did);
}

function parseIdentityJson(input) {
  const parsed = JSON.parse(input);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid identity JSON object.');
  }

  if (parsed.v !== 1) {
    throw new Error('Unsupported identity backup version.');
  }

  if (typeof parsed.did !== 'string' || !parsed.did.startsWith('did:key:')) {
    throw new Error('Backup DID is missing or invalid.');
  }

  if (typeof parsed.secretB64url !== 'string' || parsed.secretB64url.length < 20) {
    throw new Error('Backup secretB64url is missing or invalid.');
  }

  if (typeof parsed.createdAt !== 'string' || parsed.createdAt.length < 10) {
    throw new Error('Backup createdAt is missing or invalid.');
  }

  return {
    did: parsed.did,
    secretB64url: parsed.secretB64url,
    createdAt: parsed.createdAt,
  };
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function loadIdentityFromStorage() {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    return parseIdentityJson(raw);
  } catch {
    return null;
  }
}

async function initializeIdentity() {
  identity = loadIdentityFromStorage();
  if (!identity) return;

  try {
    await hydrateIdentityFields();
    identityMessage = 'Loaded saved identity from this device.';
  } catch (error) {
    identity = null;
    identityMessage = getErrorText(error);
  }
}

async function loadRoomMessages() {
  const targetRoom = roomName.trim() || 'lobby';
  roomName = targetRoom;
  roomLoading = true;
  roomError = '';
  render();

  try {
    const response = await readRoom(targetRoom, { limit: 50, format: 'json' });
    roomMessages = normalizeMessages(response);
  } catch (error) {
    roomError = getErrorText(error);
  } finally {
    roomLoading = false;
    render();
  }
}

async function sendUnsignedMessage() {
  if (!canSendUnsigned()) return;

  const targetRoom = roomName.trim() || 'lobby';
  roomName = targetRoom;
  roomLoading = true;
  roomError = '';
  render();

  try {
    const response = await sayUnsigned(targetRoom, roomNick.trim(), roomText);
    roomMessages = normalizeMessages(response);
    roomText = '';
  } catch (error) {
    roomError = getErrorText(error);
  } finally {
    roomLoading = false;
    render();
  }
}

function normalizeMessages(payload) {
  const list =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.messages)
        ? payload.messages
        : Array.isArray(payload?.items)
          ? payload.items
          : [];

  return list.map((item) => ({
    seq: item?.seq ?? item?.id ?? '',
    from: item?.from ?? item?.nick ?? 'unknown',
    text: item?.text ?? item?.body ?? item?.msg ?? '',
    verified: item?.verified === true,
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

render();
void initializeIdentity().finally(() => {
  render();
  void loadRoomMessages();
});
