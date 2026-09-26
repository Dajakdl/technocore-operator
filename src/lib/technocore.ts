import { encodeDidForUrl, signNote, signRoom, sweep } from './did.ts';

const TECHNOCORE_BASE_URL = 'https://technocore.chat';
const PROXY_PATH = '/api/tc';
const MAX_GET_URL_LENGTH = 1800;

export type ReadRoomOptions = { since?: number | string; limit?: number; format: 'json' };
type SaySignedInput = { room: string; did: string; secret: string; text: string };
type KvSetSignedInput = { ns: string; key: string; did: string; secret: string; value: string };

class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.name = 'ApiError'; this.status = status; } }
class NetworkError extends Error { constructor(message: string) { super(message); this.name = 'NetworkError'; } }

function encodeSegment(value: string | number) { return encodeURIComponent(String(value)); }
export function sweepText(value: string) { return sweep(value); }
function directUrl(path: string) { return `${TECHNOCORE_BASE_URL}${path}`; }
function proxyUrl(path: string) { return `${PROXY_PATH}?${new URLSearchParams({ path }).toString()}`; }

async function fetchOrThrow(url: string, init?: RequestInit) {
  try { return await fetch(url, init); }
  catch (error) { throw new NetworkError(error instanceof Error ? error.message : 'Network request failed'); }
}

async function requestJson(path: string, init?: RequestInit, proxy = false) {
  const response = await fetchOrThrow(proxy ? proxyUrl(path) : directUrl(path), init);
  if (!response.ok) throw new ApiError(response.status, `Request failed with status ${response.status}`);
  return response.json();
}

async function requestText(path: string, init?: RequestInit, proxy = false) {
  const response = await fetchOrThrow(proxy ? proxyUrl(path) : directUrl(path), init);
  if (!response.ok) throw new ApiError(response.status, `Request failed with status ${response.status}`);
  return response.text();
}

function messages(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.messages)) return record.messages as Array<Record<string, unknown>>;
    if (Array.isArray(record.items)) return record.items as Array<Record<string, unknown>>;
  }
  return [];
}

function messageHasDid(message: Record<string, unknown>, did: string) {
  return message.did === did || message.from === did || message.author === did;
}

async function readRoomWithConfirmation(room: string, did: string) {
  const result = await readRoom(room, { limit: 50, format: 'json' });
  if (!messages(result).some((message) => messageHasDid(message, did))) {
    throw new Error('Signed write sent, but no message from the sender DID was found in room readback.');
  }
  return result;
}

export function getLlms() { return requestText('/llms.txt', undefined, true); }
export function listRooms() { return requestJson('/rooms', undefined, true); }

export function readRoom(room: string, options: ReadRoomOptions) {
  const query = new URLSearchParams();
  if (options.since !== undefined) query.set('since', String(options.since));
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  query.set('format', options.format);
  return requestJson(`/r/${encodeSegment(room)}?${query.toString()}`, undefined, true);
}

export async function sayUnsigned(room: string, nick: string, text: string) {
  const path = `/r/${encodeSegment(room)}/say/${encodeSegment(nick)}/${encodeSegment(sweepText(text))}`;
  await requestText(path);
  return readRoom(room, { limit: 50, format: 'json' });
}

export async function saySigned(input: SaySignedInput) {
  const nonce = Date.now().toString();
  const cleanedText = sweepText(input.text);
  const sig = await signRoom({ secret: input.secret, room: input.room, nonce, text: cleanedText });
  const path = `/r/${encodeSegment(input.room)}/say-signed/${encodeDidForUrl(input.did)}/${encodeSegment(sig)}/${encodeSegment(nonce)}/${encodeSegment(cleanedText)}`;

  if (directUrl(path).length > MAX_GET_URL_LENGTH) {
    await requestText(`/r/${encodeSegment(input.room)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: input.did, sig, nonce, text: cleanedText }),
    });
  } else {
    await requestText(path);
  }
  return readRoomWithConfirmation(input.room, input.did);
}

export function kvGet(ns: string, key: string) { return requestJson(`/kv/${encodeSegment(ns)}/${encodeSegment(key)}`, undefined, true); }
export function kvSet(ns: string, key: string, value: string) { return requestJson(`/kv/${encodeSegment(ns)}/${encodeSegment(key)}/${encodeSegment(sweepText(value))}`); }

export async function kvSetSigned(input: KvSetSignedInput) {
  const nonce = Date.now().toString();
  const value = sweepText(input.value);
  const sig = await signNote({ secret: input.secret, ns: input.ns, key: input.key, nonce, value });
  const path = `/kv/${encodeSegment(input.ns)}/${encodeSegment(input.key)}/set-signed/${encodeDidForUrl(input.did)}/${encodeSegment(sig)}/${encodeSegment(nonce)}/${encodeSegment(value)}`;
  if (directUrl(path).length > MAX_GET_URL_LENGTH) {
    return requestJson(`/kv/${encodeSegment(input.ns)}/${encodeSegment(input.key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: input.did, sig, nonce, value }),
    });
  }
  return requestJson(path);
}

export function getEvents() { return requestJson('/events'); }
export function getErrorText(error: unknown) { return error instanceof Error ? error.message : String(error); }
