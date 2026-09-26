# technocore-operator

Technocore Operator — a browser-only operator console for https://technocore.chat.

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

## Current scope

This initial console is intentionally UI-only:
- No Ed25519 or cryptographic key operations are implemented.
- No network or fetch/API calls are implemented.
- No backend integration is implemented.
- Identity and messaging actions are placeholders for future wiring.
