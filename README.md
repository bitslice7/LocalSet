# LocalSet

LocalSet is a local-first workout log and installable web app for calisthenics, bodyweight-and-dumbbell training, and a general full-gym mode. It tracks completed sessions, streaks, goals, and personal records. Optional Supabase authentication adds private cross-device sync.

## Requirements

- Node.js 22.13 or newer
- npm
- A Netlify site for deployment
- Optional: a Supabase project for account-based sync

## Local development

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

`npm test` checks the static-export configuration, PWA metadata and icons, service-worker installation behavior, and generated assets when `dist/client` already exists. It intentionally does not invoke the build, so a known Windows Vinext/libuv shutdown assertion cannot turn otherwise valid tests red after Vinext reports a completed build.

## Local data

Without Supabase variables, the app stores progress and the current in-progress workout in browser local storage. Export a JSON backup before clearing Safari data or changing devices. With Supabase configured and a user signed in, that same state can follow the account across devices.

The app is static, but a normal Netlify URL is publicly reachable. Use Netlify access controls if the whole site itself must be private. Local workout data and credentials are not placed in the static deployment.

## Optional Supabase sync

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. It creates one private workout-state row per user and enables row-level security.
3. Copy `.env.example` to `.env.local` and fill in the site URL, project URL, and publishable key:

   ```dotenv
   NEXT_PUBLIC_SITE_URL=https://YOUR_SITE.netlify.app
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

4. In Supabase Auth URL Configuration, set the production Site URL to the final Netlify origin. Add the exact local and deploy-preview redirect URLs that should be allowed.
5. Add `NEXT_PUBLIC_SITE_URL` and the two Supabase public variables in Netlify under **Site configuration → Environment variables**.
6. Update the production Content Security Policy so `connect-src` permits the exact Supabase project origin. Add its `wss://` origin only if Realtime is enabled.

The publishable key is expected in the browser; row-level security protects the records. Never expose a Supabase secret or service-role key through a `NEXT_PUBLIC_*` variable. Cloud sync transmits the signed-in user’s workout state to Supabase, while signed-out use remains local.

## Netlify deployment

[`netlify.toml`](netlify.toml) already defines:

- build command: `npm run build`
- publish directory: `dist/client`
- Node.js 22.13
- the single-page fallback, PWA headers, and cache policy

Connect the GitHub repository in Netlify and deploy with those defaults. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin so Open Graph metadata uses the correct address. Set the optional Supabase variables described above only when sync is configured.

After deploying, verify:

1. Reload the site directly at `/` and at an arbitrary client-side path.
2. In Safari on the iPhone, use **Share → Add to Home Screen**.
3. Open the installed app once online, close it, enable airplane mode, and confirm a cold launch still renders the workout UI.
4. If sync is enabled, sign in on two devices and confirm a completed test session appears on both before using real history.

## PWA cache updates

[`public/sw.js`](public/sw.js) precaches the app shell plus hashed JavaScript and CSS discovered in the generated HTML. Bump `CACHE_VERSION` whenever cache behavior or shell compatibility changes substantially. Authentication, API, and cross-origin requests must remain outside the service-worker cache.

## Brand assets

The install icon is the LocalSet `LS` monogram in SVG plus 180, 192, and 512 pixel PNG exports. The Open Graph image is 1725 × 912 pixels and uses the LocalSet name with the “Show up. Move well. Log it.” campaign line. Keep the dimensions in `app/layout.tsx` synchronized with the actual image whenever these assets change.

## License

LocalSet is available under the [MIT License](LICENSE). Copyright © 2026 Thomas Joubran.
