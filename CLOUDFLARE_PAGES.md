# Circuitera: GitHub → Cloudflare Pages

This is the complete current Vite + React source project, including the existing Uno, Nano and ATmega328PB support. No UI, compiler, upload, serial, worker, storage or feature source code was changed for this preparation.

## Exact Pages settings

| Setting | Value |
| --- | --- |
| Git repository | yuliniooo/circuitera |
| Production branch | main |
| Root directory | Repository root (leave blank) |
| Framework preset | Vite (or None with the settings below) |
| Build command | npm run build |
| Build output directory | dist |
| Node | 24.19.0, pinned in .node-version |
| Required secrets / runtime environment variables | None |
| Optional build variable | VITE_SITE_URL=https://your-final-production-domain |

Use a Cloudflare **Pages** Git integration, not a Workers deployment. No Wrangler deployment command, server, database or Pages Functions are needed. Leave automatic dependency installation enabled. A NODE_VERSION dashboard override is unnecessary; if one is present, align it with .node-version.

VITE_SITE_URL is already supported by the existing build. Set it to the final production origin (no path) to generate canonical URLs, social images and sitemap URLs for the new host. If omitted, metadata intentionally retains https://circuitera.netlify.app. It is public metadata, not a secret. Never put credentials in VITE_ variables.

## Upload the source, not a ZIP

Unzip the prepared source archive locally. The files inside it belong directly in the repository root: package.json, package-lock.json, index.html, vite.config.js, src/, public/, scripts/, vendor/, test/ and reports/. Include .gitignore and .node-version (hidden files). Do not put the ZIP itself in GitHub, and do not add an extra containing folder. GitHub Desktop or Git can upload this complete tree without the browser's 100-file upload limit.

For an existing clone of yuliniooo/circuitera, copy the extracted source into that clone, review the changes, then:

```sh
npm ci
npm run build
node scripts/check-cloudflare.mjs
git add .
git diff --cached --stat
git commit -m "Prepare Circuitera source for Cloudflare Pages"
git push origin main
```

The source has been prepared for upload to GitHub. Connect the repository to Pages after the upload.

## Build and routing decisions

The existing multi-step build script is required: it prepares the pinned library/core bundles, runs Vite, copies AVR WASM/tools/vendor sources, prerenders help pages, and creates the PWA cache. Do not replace it with bare vite build. Vite already uses base / and outDir dist. The HTML base href=/ keeps compiler URLs anchored to the site root on nested routes. Deploy at the domain root, not under /circuitera/ as on GitHub project Pages.

public/_redirects retains all 12 legacy 301 rules. Its Netlify-style catch-all rewrite was removed because Cloudflare follows redirect rules even when a real static asset matches. Pages supplies its own SPA fallback when there is no top-level 404.html. Existing prerendered help pages and real /assets/ and /avr/ files are therefore served directly. Do not add a root 404.html or a /* /index.html rewrite.

netlify.toml is retained for the existing Netlify deployment; Pages ignores it. Its security/cache behavior is already represented in public/_headers. Netlify's own catch-all remains in netlify.toml.

public/_headers is unchanged: serial=(self), nosniff, no-referrer, self-only CSP with wasm-unsafe-eval and self/blob workers, tool caching, revalidated library manifest, and noncached service worker. These headers are copied verbatim to dist. The compiler uses ordinary WASM in a dedicated module worker, with no identified shared-memory threading requirement; COOP/COEP was not added. Verify the delivered policies and JavaScript/WASM MIME types on the live host.

## Verification performed

- npm ci: PASS with the committed lockfile; 132 packages installed.
- npm run build: PASS on Node 24.19.0 / npm 11.9.0.
- npm test: PASS, 52 tests including software serial/upload and production-worker checks.
- npm run test:examples: PASS, Blink, Button, Servo, Ultrasonic, source-change and error regressions.
- npm run test:libraries: PASS, all 17 libraries including Servo; combined OLED/sensor sketch and object-cache check also passed.
- node scripts/check-cloudflare.mjs: checks runtime bundle hashes, WASM copy integrity, worker inclusion, PWA paths/hashes, all ten prerendered routes, local HTML asset references, required policies, and Pages file limits.
- Production output: 595 files. Largest asset: avr/tools/cc1plus.wasm, 13,844,490 bytes (13.20 MiB), below Pages' 25 MiB limit.
- Source archive has no individual file over GitHub's 100 MB limit. node_modules/ and dist/ are excluded from Git and the deliverable.
- Vite reports a nonfatal main-JavaScript chunk-size warning. Bundling was left unchanged to preserve the existing application.

These are local build, compiler and software tests. Live Cloudflare response headers/routing and a physical Uno upload have not been tested here. Library compilation reports were refreshed by the existing tests; they do not claim physical hardware validation.

## After deployment

1. Open the HTTPS production URL in desktop Chrome/Edge or Chromebook Chrome; confirm Circuitera loads and the console shows no blocked application scripts.
2. Open example sketches; refresh /getting-started and /supported-libraries directly and check the back button.
3. Compile Blink. In the Network panel, confirm /avr/curated/manifest.json is JSON, .wasm files are WASM bytes (application/wasm), and module/worker scripts are JavaScript rather than HTML.
4. Click Connect/Upload and confirm the Arduino serial-port picker appears. Web Serial requires a secure context, user action and browser/device permission; school policy can block access independently of hosting.
5. Select the correct Uno board profile, upload Blink, and verify the board LED blinks and flash verification succeeds.
6. Upload a sketch using Serial.begin(9600) and Serial.println, then open Serial Monitor at 9600 baud and check received data.
7. Compile Servo sweep and another library example; confirm compilation succeeds without missing assets or CSP errors.
8. Save/reopen an IndexedDB sketch and test the optional offline download/PWA behavior. Export sketches on the old host before switching: browser storage and USB permissions are origin-specific and do not transfer automatically.

## References

- https://developers.cloudflare.com/pages/configuration/redirects/
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/headers/
- https://developers.cloudflare.com/pages/configuration/build-image/
- https://developers.cloudflare.com/pages/platform/limits/

## GitHub source exclusions

The unused upstream vendor/arduino-core/drivers/ and vendor/arduino-core/firmwares/ folders are excluded. These contain desktop driver installers and Wi-Fi-shield firmware, not Circuitera runtime dependencies. Automatic upload review blocked a Windows driver binary. Build scripts use the Arduino core/variant sources and boards.txt, plus vendor/atmega328pb; all of these remain included.

Unused upstream library documentation illustrations and the LiquidCrystal_I2C prebuilt object are also excluded from GitHub. The IRremote photographs were verified byte-for-byte against public upstream Git, but automatic upload review still blocked one image. All library source files and example sketches remain. Circuitera compiles LiquidCrystal_I2C from source; its upstream prebuilt object is not used. Product UI images in public/ remain unchanged.
