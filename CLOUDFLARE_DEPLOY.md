# Cloudflare Workers deployment

This repository's Next.js UI is the Cloudflare Worker project. Google Apps Script is kept separately under `apps-script/` and is deployed to Google, not bundled into the Worker.

## First-time setup

1. Install the locked dependencies with `npm ci`.
2. Sign in to Cloudflare from this project with `npx wrangler login`.
3. Preview the app in the Workers runtime with `npm run cf:preview`.
4. Deploy the UI with `npm run cf:deploy`.

`npm run dev` remains available for ordinary Next.js development. `npm run cf:upload` builds and uploads a Worker version without deploying it. `npm run cf:typegen` generates Cloudflare environment types.

Before deploying the UI, manually set the Google Apps Script Web App `/exec` URL in the `GAS_URL` constant near the top of `public/legacy.js`. The app does not ask for or store this link in Settings. Apps Script credentials and source stay in `apps-script/`.

## Project files

- `wrangler.jsonc` points Wrangler at the OpenNext Worker and its generated assets.
- `package.json` includes the OpenNext preview/deploy commands.
- `public/_headers` enables long-lived caching for hashed Next.js static assets.
- `.open-next/` and `.wrangler/` are generated locally and ignored by Git.
