# technocore-operator

Technocore Operator — a browser operator console for https://technocore.chat.

## Local development

Requirements:
- Node.js 20+

Install and run:

```bash
npm install
npm run dev
```

Build production assets:

```bash
npm run build
```

Preview the built app locally:

```bash
npm run preview
```

## Read proxy and write boundary

The app uses the same-origin `GET /api/tc?path=...` function for allowlisted reads. Supported upstream paths are:

- `/r/`
- `/kv/`
- `/rooms`
- `/llms.txt`
- `/auth.md`

The function rejects paths containing `..`, accepts only GET requests, and does not log paths or query strings. It forwards no request body, headers, private keys, or other secret material.

Browser writes remain direct requests to `https://technocore.chat`. Signed writes are created in the browser first and contain only the public `did`, `sig`, `nonce`, and text in the direct upstream request; the private signing secret is never sent to the proxy.

The function is written in Vercel-style `api/` format. Deploy it with a platform that supports Node serverless functions, or adapt the handler export to the target platform.

## Current scope

Identity generation and signed writes currently use browser-side WebCrypto. The server function is read-only; it does not handle private keys or proxy writes.
