# Repository Guidelines

This repository is in an early stage: only `README.md` exists so far. The layout and commands below follow the architecture documented in the README and should be treated as the target structure for new contributions.

## Project Structure & Module Organization

- `server/` — Signaling server and mediasoup SFU (Node.js). Entry at `server/src/index.js`; SFU and room logic in `server/src/services/`; socket handlers in `server/src/socket/handlers.js`.
- `client/` — React 18 + Vite frontend with Ant Design (antd). UI code lives in `client/src/` (e.g. `App.jsx`).
- `pocs/` — Technical spikes (`mediasoup-poc/`, `iframe-sync-poc/`); keep experiments here, not in `server/` or `client/`.
- `nginx/nginx.conf` — Reverse proxy config. `docker-compose.yml` — service orchestration.
- Docs (`LivePage_*.md`) sit at the repo root.

## Build, Test, and Development Commands

```bash
docker compose up -d          # Build and run the full stack at http://localhost
cd server && npm install      # Install backend deps
cd server && npm run dev      # Run signaling server with reload
cd client && npm install      # Install frontend deps
cd client && npm run dev      # Run Vite dev server
cd client && npm run build    # Produce a production bundle
```

## Coding Style & Naming Conventions

- Use 2-space indentation for JavaScript/JSX, JSON, and YAML.
- React components use `PascalCase.jsx`; utilities and services use `kebab-case.js` (e.g. `room-manager.js`).
- Prefer ES modules and `camelCase` for variables and functions.
- Build UI from Ant Design (antd) components before hand-rolling; keep custom CSS minimal and prefer antd theming.
- Run ESLint and Prettier before committing; keep each package's config authoritative.

## Testing Guidelines

- No test suite exists yet. When adding one, use Vitest for the client and Node's test runner (or Jest) for the server.
- Name tests `*.test.js` / `*.test.jsx`, colocated with the code or under `__tests__/`.
- Expose tests via `npm test` in each package and cover room lifecycle, signaling, and iframe sync paths.

## Commit & Pull Request Guidelines

- No commit history is established; adopt Conventional Commits (e.g. `feat: add room join flow`, `fix: handle SFU reconnect`).
- Keep commits focused and imperative.
- PRs should include a clear description, linked issue, testing notes, and screenshots or a short clip for UI changes.

## Security & Configuration Tips

- Keep secrets in `.env` files (gitignored); never commit credentials.
- Licensed under AGPLv3—ensure contributions comply.
