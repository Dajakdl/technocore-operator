const encoder = new TextEncoder();
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export type GeneratedIdentity = {
  secretB64url: string;
  publicRaw: Uint8Array;
  did: string;
};

type SignRoomInput = { secret: string; room: string; nonce: string | number; text: string };
type SignNoteInput = { secret: string; ns: string; key: string; nonce: string | number; value: string };

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto SubtleCrypto is not available.');
  return subtle;
}

function toUtf8Bytes(value: string): Uint8Array { return encoder.encode(value); }
function bytesToHex(bytes: Uint8Array): string { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''); }
function bytesToBase64(bytes: Uint8Array): string { let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function base64ToBytes(value: string): Uint8Array { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i); return bytes; }
function toBase64Url(bytes: Uint8Array): string { return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function fromBase64Url(value: string): Uint8Array { const base64 = value.replace(/-/g, '+').replace(/_/g, '/'); return base64ToBytes(`${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`); }

function toBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) { const value = digits[i] * 256 + carry; digits[i] = value % 58; carry = Math.floor(value / 58); }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let output = '';
  for (const byte of bytes) { if (byte === 0) output += BASE58_ALPHABET[0]; else break; }
  for (let i = digits.length - 1; i >= 0; i -= 1) output += BASE58_ALPHABET[digits[i]];
  return output;
}

function didFromPublicKey(publicRaw: Uint8Array): string {
  if (publicRaw.length !== 32) throw new Error('Expected a 32-byte Ed25519 public key.');
  const prefixed = new Uint8Array(34); prefixed[0] = 0xed; prefixed[1] = 0x01; prefixed.set(publicRaw, 2);
  return `did:key:z${toBase58(prefixed)}`;
}

export function sweep(text: string): string { return text.normalize('NFKC').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim(); }
export function randomHex(length = 24): string {
  if (!Number.isInteger(length) || length < 1) throw new Error('Hex length must be a positive integer.');
  const bytes = new Uint8Array(Math.ceil(length / 2));
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject?.getRandomValues) throw new Error('Secure random values are not available.');
  cryptoObject.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

export async function fingerprint(did: string): Promise<string> { const digest = await getSubtleCrypto().digest('SHA-256', toUtf8Bytes(did)); return bytesToHex(new Uint8Array(digest)).slice(0, 16); }
export async function notePath(did: string): Promise<string> { const fp = await fingerprint(did); return `/kv/did-${fp.slice(0, 2)}/${fp.slice(2, 16)}`; }

async function importSigningKey(secretB64url: string): Promise<CryptoKey> { return getSubtleCrypto().importKey('pkcs8', fromBase64Url(secretB64url), { name: 'Ed25519' }, false, ['sign']); }
async function sign(secretB64url: string, payload: string): Promise<string> {
  const signature = await getSubtleCrypto().sign('Ed25519', await importSigningKey(secretB64url), toUtf8Bytes(payload));
  const encoded = toBase64Url(new Uint8Array(signature));
  if (encoded.length !== 86) throw new Error('Unexpected signature length; expected 86-char base64url Ed25519 signature.');
  return encoded;
}

export async function generateIdentity(): Promise<GeneratedIdentity> {
  const keyPair = await getSubtleCrypto().generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicRaw = new Uint8Array(await getSubtleCrypto().exportKey('raw', keyPair.publicKey));
  const secretPkcs8 = new Uint8Array(await getSubtleCrypto().exportKey('pkcs8', keyPair.privateKey));
  return { secretB64url: toBase64Url(secretPkcs8), publicRaw, did: didFromPublicKey(publicRaw) };
}

export function encodeDidForUrl(did: string): string { return encodeURIComponent(did); }
export async function signRoom(input: SignRoomInput): Promise<string> { return sign(input.secret, `${input.room}|${input.nonce}|${sweep(input.text)}`); }
export async function signNote(input: SignNoteInput): Promise<string> { return sign(input.secret, `${input.ns}|${input.key}|${input.nonce}|${sweep(input.value)}`); }
