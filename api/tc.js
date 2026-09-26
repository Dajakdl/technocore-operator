const UPSTREAM_ORIGIN = 'https://technocore.chat';
const ALLOWED_EXACT_PATHS = new Set(['/rooms', '/llms.txt', '/auth.md']);
const ALLOWED_PREFIXES = ['/r/', '/kv/'];

function isAllowedPath(path) {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.includes('..') &&
    (ALLOWED_EXACT_PATHS.has(path.split('?')[0]) || ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)))
  );
}

function jsonError(status, message) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ error: message }),
  };
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).setHeader('allow', 'GET').json({ error: 'GET only' });
    return;
  }

  const path = typeof request.query?.path === 'string' ? request.query.path : '';
  if (!isAllowedPath(path)) {
    response.status(400).json({ error: 'Unsupported path' });
    return;
  }

  // Do not log path, query strings, request headers, or upstream URLs.
  const upstreamUrl = new URL(path, UPSTREAM_ORIGIN);
  if (upstreamUrl.origin !== UPSTREAM_ORIGIN || !isAllowedPath(`${upstreamUrl.pathname}${upstreamUrl.search}`)) {
    response.status(400).json({ error: 'Unsupported path' });
    return;
  }

  try {
    const upstream = await fetch(upstreamUrl, { method: 'GET' });
    const body = await upstream.arrayBuffer();
    response.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) response.setHeader('content-type', contentType);
    response.send(Buffer.from(body));
  } catch {
    response.status(502).json({ error: 'Upstream read failed' });
  }
}

export { isAllowedPath, jsonError };
