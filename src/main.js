import './styles.css';
import { getErrorText, readRoom, sayUnsigned } from './lib/technocore.ts';

const tabs = [
  { id: 'identity', label: 'Identity' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'registry', label: 'Registry' },
];

let activeTab = 'identity';
let importText = '';
let importMessage = '';

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
        <div class="status-pill" aria-live="polite" title="Will show shortened DID when wired">unsigned</div>
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
        <p class="muted">no key yet</p>

        <div class="field-grid">
          <label class="field"><span>DID</span><output aria-label="DID"></output></label>
          <label class="field"><span>Fingerprint</span><output aria-label="Fingerprint"></output></label>
          <label class="field"><span>DID-note path</span><output aria-label="DID-note path"></output></label>
        </div>

        <div class="action-row">
          <button type="button" disabled title="Crypto not implemented">Generate key</button>
          <button type="button" id="import-btn">Import key</button>
          <button type="button" disabled title="Crypto not implemented">Export backup</button>
          <button type="button" id="clear-btn">Clear from this device</button>
        </div>

        <label class="stacked" for="import-area">Import payload (placeholder only)</label>
        <textarea id="import-area" rows="6" placeholder="Paste key backup text for UI testing only">${escapeHtml(importText)}</textarea>
        <p class="hint">Import accepts text for UI flow only. No cryptographic parsing or storage is performed.</p>
        <p class="hint" aria-live="polite">${escapeHtml(importMessage)}</p>
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

  document.querySelector('#import-btn')?.addEventListener('click', () => {
    importMessage = importText.trim()
      ? 'Placeholder import captured for UI flow only. Nothing was parsed or persisted.'
      : 'Enter text to exercise the placeholder import flow.';
    render();
    document.querySelector('#import-area')?.focus();
  });

  document.querySelector('#clear-btn')?.addEventListener('click', () => {
    importText = '';
    importMessage = 'Placeholder data cleared from this screen.';
    render();
    document.querySelector('#import-area')?.focus();
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
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

render();
void loadRoomMessages();
