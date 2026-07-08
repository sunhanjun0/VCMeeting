# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

LivePage is at the **planning/pre-implementation stage**: the repo currently contains only documentation and spec-workflow templates. No `server/`, `client/`, or `docker-compose.yml` exists yet. The structure and commands below are the **target design** to build toward.

**Start here each session: `PROGRESS.md`** — the work handoff doc (current phase, frozen decisions, doc map, and the exact next step). Read it before anything else to resume seamlessly.

**Authoritative docs**: `LivePage_MVP_PRD_v2.md` (product spec, v2) and `LivePage_技术设计文档.md` (technical design — data model, Socket.io event protocol, sync-engine algorithms, WebRTC mesh signaling, upload pipeline, directory layout). `LivePage_MVP_PRD.md` (v1) and `README.md` describe the older "full meeting system" vision and are **superseded** — see PRD v2 §0 for the rationale. When docs conflict, v2 + the tech design win.

## What LivePage Is

A pure-browser, self-hostable **real-time presentation sync tool** (AGPLv3), for small teams (≤10). Its two defining ideas:
- **Interactive HTML replaces PPT** — the host uploads HTML content (multi-file or `.zip`), the server hosts it same-origin, and it renders in a sandboxed iframe.
- **Lightweight built-in voice** — multi-party audio over native **WebRTC P2P mesh** (no media server), reusing the Socket.io channel for signaling.

The host's scroll/click actions are broadcast as **events** (using stable selectors / `data-*` anchors, not absolute coordinates) so participants follow in real time; participants can detach to browse freely and one-click return.

> **Design pivot note**: v1 used a mediasoup SFU for 100-person rooms. v2 dropped it — the SFU's deploy/NAT complexity diluted the product's only real differentiator (the sync engine). Voice is now P2P mesh, which reuses existing signaling at near-zero backend cost and covers the sharp use cases (3–10 person code reviews / design walkthroughs). The voice layer sits behind a `VoiceProvider` interface so a `LiveKitProvider` can be added later for large audiences without touching app code.

## Target Commands

```bash
docker compose up -d          # Build and run the full stack at http://localhost
cd server && npm install && npm run dev   # Signaling server with reload
cd client && npm install && npm run dev   # Vite dev server
cd client && npm run build    # Production bundle
```

Testing is not yet set up. When adding it: Vitest for the client, Node test runner (or Jest) for the server; name tests `*.test.js` / `*.test.jsx`; prioritize room lifecycle, signaling, and iframe-sync paths.

## Target Architecture

Four cooperating layers (see `LivePage_MVP_PRD_v2.md` §7 for the full flow):

- **`client/`** — React 18 + Vite + Ant Design. Owns the meeting UI, the iframe presentation container, host-side event capture / follower-side event apply, and the WebRTC mesh endpoint. Build UI from antd components before hand-rolling; keep custom CSS minimal.
- **`server/`** — Node.js + Socket.io. Room management, state broadcast, permission commands, and **WebRTC signaling relay** (SDP/ICE exchange for the mesh). No media server. Entry `server/src/index.js`; room logic in `server/src/services/room-manager.js`; Socket.io handlers in `server/src/socket/handlers.js`.
- **`nginx/nginx.conf`** — reverse proxy + TLS termination (WebRTC/mic require HTTPS).
- **`pocs/`** — technical spikes (e.g. `iframe-sync-poc/`); keep experiments here, never in `server/` or `client/`.

NAT traversal uses public STUN by default, with an **optional self-hosted coturn** container for symmetric-NAT users (a plain relay — far simpler than a media server).

Join flow: room ID + password/link-token validated server-side → Socket.io signaling → SDP/ICE exchanged over signaling to build the P2P audio mesh → pull `latestState` snapshot for instant sync → iframe renders and follows the host.

## Design Constraints That Shape Code

These come from the PRD's non-functional requirements and drive non-obvious implementation choices:

- **Uploaded HTML is untrusted.** Enforce a sandboxed iframe (`allow-scripts allow-same-origin`) with CSP, an external-link/form-submit whitelist, a type whitelist, and a ≤50MB size cap. Zip extraction **must** guard against path traversal (zip slip).
- **Room IDs must be non-enumerable.** Joining requires password validation; share-link tokens are time-limited (open question: one-time vs. TTL).
- **Sync is event-based, resolution-independent, and low-bandwidth.** Use a viewport anchor (topmost visible element + offset ratio), NOT absolute pixels, for scroll. Use stable selectors (`id` → `data-sync-id` → `nth-of-type` CSS path), NOT coordinates, for clicks. Debounce/throttle events; on reconnect, send only the latest state rather than replaying a backlog. Target sync latency < 150ms.
- **One state model serves three needs.** The room holds a single `latestState` (viewport anchor + current page + timestamp). New joiners pull it for instant sync; a disconnected host's state freezes and is restored on reconnect (target: within 5s). Don't build separate paths for first-sync, reconnect-catchup, and host-rejoin.
- **Voice is P2P mesh with size-adaptive speaking.** Audio never touches a server; SDP/ICE ride the Socket.io signaling channel. ≤10 participants speak freely; 10–20 are forced into push-to-talk (PTT) to cap concurrent upstream bandwidth; >20 is rejected (mesh's per-client connection count and per-speaker encoding fan-out can't be fixed by PTT — that's an SFU's job).
- **Assume mesh WILL be replaced by an SFU (LiveKit).** This is treated as near-inevitable, so the voice layer is isolated on BOTH sides (tech design §7.4): client `VoiceProvider` exposes only semantic bus events (`voice:remote-stream`, `voice:speaking`, …) and NEVER leaks `RTCPeerConnection`/SDP; server `VoiceBackend` encapsulates signaling/token logic, and the mesh-only `webrtc:signal` relay is owned exclusively by the mesh backend (it disappears cleanly when switching). Mesh specifics (peer connections, Perfect Negotiation, `webrtc:signal`) must NEVER appear in `core/`, `sync`, `content`, `permission`, or `participants`. The client picks its provider dynamically from the `voice.provider` field in the join snapshot — never hardcode mesh. Switching to LiveKit = add `LiveKitProvider` + `LiveKitBackend` + flip `VOICE_PROVIDER` env; everything else stays untouched.
- **Host role is transferable.** Transfer hands the receiver presentation control, permission commands, and `latestState` write access; the old host becomes a regular participant. Transfer is server-validated then broadcast so all clients update roles in sync.
- **Share-link tokens default to 24h TTL**, configurable, invalidated when the room is destroyed, and NOT one-time (multiple attendees reuse one link). On expiry, fall back to room-ID + password.
- **Audio is never persisted.** Signaling and media run over TLS; HTTPS is required for WebRTC + mic.
- **Modular + bus-driven + low coupling (non-negotiable, features will keep expanding).** Code is organized as `core/` + self-contained `features/*`. Three iron rules (tech design §13): (1) feature modules NEVER import each other — they talk only via the event bus and shared store slices; (2) dependency is one-way `features → core`, and `core` must never import any feature; (3) each feature owns its UI, logic, network events, and state slice, so a new capability = a new feature module + registration, never edits to core or existing modules. Communication is two-layer: an in-process pub/sub **event bus** (namespaced events `sync:*`, `voice:*`, `room:*`, `chat:*`…), and the Socket.io **network bus** using a versioned envelope `{ type, v, payload }` where unknown types are ignored for forward-compat. Only `core/socket*` bridges network↔bus; feature modules never touch the socket directly. The `VoiceProvider` interface is an instance of this pattern.

## Conventions

- 2-space indentation for JS/JSX/JSON/YAML; ES modules; `camelCase` variables/functions.
- React components `PascalCase.jsx`; services/utilities `kebab-case.js` (e.g. `room-manager.js`).
- Conventional Commits (`feat: add room join flow`, `fix: handle SFU reconnect`).
- Secrets live in gitignored `.env` files.
