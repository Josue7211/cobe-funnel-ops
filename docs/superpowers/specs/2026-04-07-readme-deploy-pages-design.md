# README, Production Deploy, and GitHub Pages Design

## Goal

Make the public project surfaces consistent:
- production runtime lives at `https://cobe.aparcedo.org`
- GitHub Pages becomes a static companion page
- README documents the real runtime contract and live URLs clearly

## Decisions

1. Keep the app runtime contract unchanged.
   - Production remains a same-origin React + Express deployment.
   - GitHub Pages does not host the operator runtime.

2. Make GitHub Pages a companion project page.
   - It should explain what the app is, link to the live runtime, and provide local run instructions.
   - It should not pretend to support login, API, or realtime flows.

3. Update production by refreshing the existing server deployment.
   - The current live target is the server-backed Docker deployment used by `cobe.aparcedo.org`.
   - The deploy should preserve local server secrets and persisted SQLite data.

## Scope

- Update `README.md`
- Add a static GitHub Pages source page in the repo
- Publish the companion page to the `gh-pages` branch
- Roll the real site forward on the existing production server

## Non-goals

- Re-architecting deployment
- Moving production to static hosting
- Changing the same-origin backend contract

## Verification

- `npm run build` passes locally
- `main` is pushed with the README/page-source updates
- `gh-pages` is updated with the companion page content
- production container is rebuilt/restarted and serves the updated app
