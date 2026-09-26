const TECHNOCORE_BASE_URL = 'https://technocore.chat';

export type ReadRoomOptions = {
  since?: number | string;
  limit?: number;
  format: 'json';
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
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOrThrow(path: string): Promise<Response> {
  try {
    return await fetch(`${TECHNOCORE_BASE_URL}${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new NetworkError(message);
  }
}

async function requestJson(path: string): Promise<unknown> {
  const response = await fetchOrThrow(path);
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }
  return response.json();
}

async function requestText(path: string): Promise<string> {
  const response = await fetchOrThrow(path);
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }
  return response.text();
}

export function getLlms(): Promise<unknown> {
  return requestJson('/llms');
}

export function listRooms(): Promise<unknown> {
  return requestJson('/r');
}

export function readRoom(room: string, options: ReadRoomOptions): Promise<unknown> {
  const query = new URLSearchParams();
  if (options.since !== undefined) query.set('since', String(options.since));
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  query.set('format', options.format);

  const path = `/r/${encodeSegment(room)}/read?${query.toString()}`;
  return requestJson(path);
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

export function kvGet(ns: string, key: string): Promise<unknown> {
  return requestJson(`/kv/${encodeSegment(ns)}/${encodeSegment(key)}`);
}

export function kvSet(ns: string, key: string, value: string): Promise<unknown> {
  return requestJson(`/kv/${encodeSegment(ns)}/${encodeSegment(key)}/${encodeSegment(sweepText(value))}`);
}

export function getEvents(): Promise<unknown> {
  return requestJson('/events');
}

export function getErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
