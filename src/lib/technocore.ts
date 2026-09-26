import { encodeDidForUrl, signNote, signRoom, sweep } from './did.ts';

const TECHNOCORE_BASE_URL = 'https://technocore.chat';
const PROXY_PATH = '/api/tc';
const MAX_GET_URL_LENGTH = 1800;

export type ReadRoomOptions = {
  since?: number | string;
  limit?: number;
  format: 'json';
};

type SaySignedInput = {
  room: string;
  did: string;
  secret: string;
  text: string;
};

type KvSetSignedInput = {
  ns: string;
  key: string;
  did: string;
  secret: string;
  value: string;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(body);
    this.name = 'ApiError';
    this.status = status;
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

function encodeSegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

export function sweepText(value: string): string {
  return sweep(value);
}

function buildDirectUrl(path: string): string {
  return `${TECHNOCORE_BASE_URL}${path}`;
}

function buildReadProxyUrl(path: string): string {
  return `${PROXY_PATH}?${new URLSearchParams({ path }).toString()}`;
}

async function fetchOrThrow(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new NetworkError(message);
  }
}

async function requestJson(path: string, init?: RequestInit, useProxy = false): Promise<unknown> {
  const url = useProxy ? buildReadProxyUrl(path) : buildDirectUrl(path);
  const response = await fetchOrThrow(url, init);
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed with status ${response.status}`);
  }
  return response.json();
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const response = await fetchOrThrow(buildDirectUrl(path), init);
  if (!response.ok) {
    throw new ApiError(response.status, `Request failed with status ${response.status}`);
  }
  return response.text();
}

function normalizeRoomMessages(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.messages)) return record.messages as Array<Record<string, unknown>>;
    if (Array.isArray(record.items)) return record.items as Array<Record<string, unknown>>;
  }

  return [];
}

function roomMessageMatchesDid(message: Record<string, unknown>, did: string): boolean {
  const didCandidate = typeof message.did === 'string' ? message.did : null;
  const fromCandidate = typeof message.from === 'string' ? message.from : null;
  const authorCandidate = typeof message.author === 'string' ? message.author : null;
  return didCandidate === did || fromCandidate === did || authorCandidate === did;
}

async function readRoomWithConfirmation(room: string, did: string): Promise<unknown> {
  const readResult = await readRoom(room, { limit: 50, format: 'json' });
  const hasDidMessage = normalizeRoomMessages(readResult).some((message) => roomMessageMatchesDid(message, did));

  if (!hasDidMessage) {
    throw new Error('Signed write sent, but no message from the sender DID was found in room readback.');
  }

  return readResult;
}

export function getLlms(): Promise<unknown> {
  return requestText('/llms.txt').then((text) => text);
}

export function listRooms(): Promise<unknown> {
  return requestJson('/rooms', undefined, true);
}

export function readRoom(room: string, options: ReadRoomOptions): Promise<unknown> {
  const query = new URLSearchParams();
  if (options.since !== undefined) query.set('since', String(options.since));
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  query.set('format', options.format);

  const path = `/r/${encodeSegment(room)}?${query.toString()}`;
  return requestJson(path, undefined, true);
}

export async function sayUnsigned(room: string, nick: string, text: string): Promise<unknown> {
  const sweptText = sweepText(text);
  const path = `/r/${encodeSegment(room)}/say/${encodeSegment(nick)}/${encodeSegment(sweptText)}`;

  try {
    await requestText(path);
  } catch (error) {
    if (error instanceof NetworkError) {
      try {
        return await readRoom(room, { limit: 50, format: 'json' });
      } catch {
        throw error;
      }
    }
    throw error;
  }

  return readRoom(room, { limit: 50, format: 'json' });
}

export async function saySigned(input: SaySignedInput): Promise<unknown> {
  const nonce = Date.now().toString();
  const cleanedText = sweepText(input.text);
  const sig = await signRoom({ secret: input.secret, room: input.room, nonce, text: cleanedText });

  const getPath = `/r/${encodeSegment(input.room)}/say-signed/${encodeDidForUrl(input.did)}/${encodeSegment(sig)}/${encodeSegment(nonce)}/${encodeSegment(cleanedText)}`;
  const getUrl = buildDirectUrl(getPath);

  try {
    if (getUrl.length > MAX_GET_URL_LENGTH) {
      await requestText(`/r/${encodeSegment(input.room)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: input.did, sig, nonce, text: cleanedText }),
      });
    } else {
      await requestText(getPath);
    }
  } catch (error) {
    if (error instanceof NetworkError) {
      try {
        return await readRoomWithConfirmation(input.room, input.did);
      } catch {
        throw error;
      }
    }
    throw error;
  }

  return readRoomWithConfirmation(input.room, input.did);
}

export function kvGet(ns: string, key: string): Promise<unknown> {
  return requestJson(`/kv/${encodeSegment(ns)}/${encodeSegment(key)}`, undefined, true);
}

export function kvSet(ns: string, key: string, value: string): Promise<unknown> {
  return requestJson(`/kv/${encodeSegment(ns)}/${encodeSegment(key)}/${encodeSegment(sweepText(value))}`);
}

export async function kvSetSigned(input: KvSetSignedInput): Promise<unknown> {
  const nonce = Date.now().toString();
  const cleanedValue = sweepText(input.value);
  const sig = await signNote({
    secret: input.secret,
    ns: input.ns,
    key: input.key,
    nonce,
    value: cleanedValue,
  });

  const getPath = `/kv/${encodeSegment(input.ns)}/${encodeSegment(input.key)}/set-signed/${encodeDidForUrl(input.did)}/${encodeSegment(sig)}/${encodeSegment(nonce)}/${encodeSegment(cleanedValue)}`;
  const getUrl = buildDirectUrl(getPath);

  if (getUrl.length > MAX_GET_URL_LENGTH) {
    return requestJson(`/kv/${encodeSegment(input.ns)}/${encodeSegment(input.key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: input.did, sig, nonce, value: cleanedValue }),
    });
  }

  return requestJson(getPath);
}

export function getEvents(): Promise<unknown> {
  return requestJson('/events');
}

export function getErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
