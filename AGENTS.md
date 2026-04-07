# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the React client: `App.tsx`, `api.ts`, `data.ts`, `types.ts`, and styles in `App.css` and `index.css`. `server/` holds the Express API, SQLite store, smoke tests, and deployment/runtime helpers such as `index.js`, `sqlStore.js`, `smoke.mjs`, and `http-smoke.mjs`. Static assets live in `public/`, brand assets in `public/brand/`, and deployment files in `deploy/`. Planning and architecture notes live in `.planning/`, `docs/`, `ROADMAP.md`, `PROJECT.md`, and `DESIGN.md`.

## Build, Test, and Development Commands
- `npm run dev` starts Vite and the local Express API together for same-origin development.
- `npm run build` type-checks the client and produces the production bundle in `dist/`.
- `npm start` runs the built same-origin Node/Express runtime.
- `npm run lint` runs ESLint across the repo.
- `npm run test:backend` runs the server smoke test suite.
- `npm run test:http` runs the HTTP-level smoke test against the API.
- `npm run reset:data` resets the SQLite-backed local state.

## Coding Style & Naming Conventions
Use TypeScript for client code and modern ESM for server code. Keep formatting consistent with the existing codebase: 2-space indentation, single quotes in JS/TS, and semicolon-free style where already present. Prefer descriptive camelCase for variables and functions, PascalCase for React components and types, and kebab-case for files that are not modules. Keep UI text concise and stateful behavior explicit.

## Testing Guidelines
Use the smoke scripts for regression coverage. Add or update tests in `server/smoke.mjs` or `server/http-smoke.mjs` when changing server behavior, workflow mutations, or auth/session handling. Run `npm run build`, `npm run test:backend`, and `npm run test:http` before shipping changes that touch runtime logic.

## Commit & Pull Request Guidelines
Commit history uses short imperative prefixes such as `feat:`, `fix:`, `docs:`, `style:`, `chore:`, and `merge:`. Keep commits focused and describe the user-visible outcome. Pull requests should explain what changed, why it matters, and how to verify it. Include screenshots for UI changes and call out any data or deployment implications.

## Security & Configuration Tips
Keep secrets in `.env.local` or private environment variables. Do not commit admin credentials, session secrets, or live integration tokens. The supported runtime contract is one Node-capable origin serving both the SPA and `/api/*`; avoid split frontend/backend deployments unless the deployment path is updated intentionally.
