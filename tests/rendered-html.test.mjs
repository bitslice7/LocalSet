import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const projectRoot = new URL("../", import.meta.url);
const fromRoot = (path) => new URL(path, projectRoot);

async function fileExists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  assert.equal(buffer.subarray(0, 8).toString("hex"), signature);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function basicResponse(body, headers = {}) {
  return {
    status: 200,
    type: "basic",
    headers: new Headers(headers),
    async text() {
      return body;
    },
    clone() {
      return basicResponse(body, headers);
    },
  };
}

test("configures a Netlify static export", async () => {
  const [nextConfig, netlify, packageJson] = await Promise.all([
    readFile(fromRoot("next.config.ts"), "utf8"),
    readFile(fromRoot("netlify.toml"), "utf8"),
    readFile(fromRoot("package.json"), "utf8"),
  ]);
  const pkg = JSON.parse(packageJson);

  assert.match(nextConfig, /output:\s*["']export["']/);
  assert.match(nextConfig, /trailingSlash:\s*true/);
  assert.match(netlify, /command\s*=\s*["']npm run build["']/);
  assert.match(netlify, /publish\s*=\s*["']dist\/client["']/);
  assert.match(netlify, /from\s*=\s*["']\/\*["'][\s\S]*to\s*=\s*["']\/index\.html["'][\s\S]*status\s*=\s*200/);
  assert.match(netlify, /for\s*=\s*["']\/sw\.js["'][\s\S]*Service-Worker-Allowed\s*=\s*["']\/["']/);
  assert.match(netlify, /connect-src\s+'self'\s+https:\/\/\*\.supabase\.co/);
  assert.match(netlify, /for\s*=\s*["']\/form\/\*["']/);
  assert.equal(pkg.name, "localset");
  assert.equal(pkg.license, "MIT");
  assert.doesNotMatch(pkg.scripts.test, /(?:^|\s)(?:npm\s+run\s+)?build(?:\s|$)/);
});

test("includes the MIT license and creator website in Settings", async () => {
  const [license, page] = await Promise.all([
    readFile(fromRoot("LICENSE"), "utf8"),
    readFile(fromRoot("app/page.tsx"), "utf8"),
  ]);

  assert.match(license, /^MIT License\r?\n/);
  assert.match(license, /Copyright \(c\) 2026 Thomas Joubran/);
  assert.match(license, /Permission is hereby granted, free of charge/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);

  const websiteLink = page.match(
    /<a className="creator-link" href="https:\/\/www\.tjoubran\.com"[^>]*>/,
  );
  assert.ok(websiteLink, "expected the creator website link in Settings");
  assert.match(websiteLink[0], /target="_blank"/);
  assert.match(websiteLink[0], /rel="[^"]*noopener[^"]*noreferrer[^"]*"/);
  assert.match(page, /Thomas Joubran/);
  assert.match(page, /opens in a new tab/);
  assert.match(page, /aria-hidden="true">↗/);
});

test("declares installable LocalSet metadata and correctly sized brand assets", async () => {
  const [manifestText, layout, icon180, icon192, icon512, ogImage] = await Promise.all([
    readFile(fromRoot("public/manifest.webmanifest"), "utf8"),
    readFile(fromRoot("app/layout.tsx"), "utf8"),
    readFile(fromRoot("public/icon-180.png")),
    readFile(fromRoot("public/icon-192.png")),
    readFile(fromRoot("public/icon-512.png")),
    readFile(fromRoot("public/og.png")),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.name, "LocalSet");
  assert.equal(manifest.short_name, "LocalSet");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.theme_color, "#000000");
  assert.deepEqual(pngDimensions(icon180), { width: 180, height: 180 });
  assert.deepEqual(pngDimensions(icon192), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions(icon512), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions(ogImage), { width: 1725, height: 912 });
  assert.match(layout, /width:\s*1725/);
  assert.match(layout, /height:\s*912/);
  assert.match(layout, /manifest:\s*["']\/manifest\.webmanifest["']/);
  assert.match(layout, /appleWebApp:\s*\{/);
  assert.match(layout, /viewportFit:\s*["']cover["']|viewport-fit=cover/);
  assert.doesNotMatch(layout, /Starter Project|Your site is taking shape/);
});

test("registers a versioned service worker without caching account endpoints", async () => {
  const [page, serviceWorker] = await Promise.all([
    readFile(fromRoot("app/page.tsx"), "utf8"),
    readFile(fromRoot("public/sw.js"), "utf8"),
  ]);

  assert.match(page, /serviceWorker\.register\(["']\/sw\.js["']\)/);
  assert.match(serviceWorker, /CACHE_VERSION\s*=\s*["']v\d+["']/);
  assert.match(serviceWorker, /CACHE_PREFIX\s*=\s*["']localset["']/);
  assert.match(serviceWorker, /LEGACY_CACHE_PREFIXES\s*=\s*\[[^\]]*["']localfit-["'][^\]]*["']form-daily-["']/);
  assert.match(serviceWorker, /cacheAppShell\(cache\)/);
  assert.match(serviceWorker, /discoverShellDependencies/);
  assert.match(serviceWorker, /pathname\.startsWith\(["']\/api\/["']\)/);
  assert.match(serviceWorker, /request\.method\s*!==\s*["']GET["']/);
  assert.match(serviceWorker, /url\.origin\s*!==\s*self\.location\.origin/);
  assert.match(serviceWorker, /\/form\/push-up\.webp/);
  assert.doesNotMatch(serviceWorker, /caches?\.put\([^\n]*(?:supabase|signin-with-chatgpt|signout-with-chatgpt|callback)/i);
});

test("precaches hashed HTML dependencies during service-worker installation", async () => {
  const source = await readFile(fromRoot("public/sw.js"), "utf8");
  const listeners = new Map();
  const cachedPaths = new Set();
  const html = `<!doctype html><html><head>
    <link rel="stylesheet" href="/_next/static/css/app.HASH.css">
    <link rel="modulepreload" href="/_next/static/chunks/framework.HASH.js">
    <script type="module" src="/_next/static/chunks/app.HASH.js"></script>
    <script src="https://cdn.example.test/not-local.js"></script>
  </head></html>`;

  const cache = {
    async put(key) {
      const url = new URL(typeof key === "string" ? key : key.url, "https://form.test");
      cachedPaths.add(url.pathname);
    },
    async keys() {
      return [];
    },
    async delete() {
      return true;
    },
  };
  const context = {
    Headers,
    Response,
    Set,
    URL,
    caches: {
      async open() {
        return cache;
      },
      async keys() {
        return [];
      },
      async delete() {
        return true;
      },
      async match() {
        return undefined;
      },
    },
    async fetch(input) {
      const url = new URL(typeof input === "string" ? input : input.url, "https://form.test");
      return basicResponse(url.pathname === "/" ? html : `asset:${url.pathname}`);
    },
    self: {
      location: { origin: "https://form.test" },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      async skipWaiting() {},
      clients: { async claim() {} },
    },
  };

  vm.runInNewContext(source, context, { filename: "public/sw.js" });
  let installation;
  listeners.get("install")({ waitUntil(promise) { installation = promise; } });
  await installation;

  assert.ok(cachedPaths.has("/"));
  assert.ok(cachedPaths.has("/_next/static/css/app.HASH.css"));
  assert.ok(cachedPaths.has("/_next/static/chunks/framework.HASH.js"));
  assert.ok(cachedPaths.has("/_next/static/chunks/app.HASH.js"));
  assert.ok(!cachedPaths.has("/not-local.js"));
});

const builtIndex = fromRoot("dist/client/index.html");
test(
  "generated static export references deployable local assets",
  { skip: !(await fileExists(builtIndex)) },
  async () => {
    const html = await readFile(builtIndex, "utf8");
    assert.match(html, /<title>LocalSet/);
    const viewportTags = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/g) || [];
    assert.equal(viewportTags.length, 1, "expected one authoritative viewport tag");
    assert.match(viewportTags[0], /viewport-fit=cover/);
    assert.match(html, /rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/);
    assert.match(html, /rel=["']apple-touch-icon["'][^>]+href=["']\/icon-180\.png["']/);
    assert.doesNotMatch(html, /Your site is taking shape|Building your site/);

    const localAssets = new Set(
      [...html.matchAll(/\b(?:href|src)=["'](\/_next\/static\/[^"']+)["']/g)].map(
        (match) => match[1],
      ),
    );
    assert.ok(localAssets.size >= 3, "expected CSS and JavaScript build assets");
    for (const asset of localAssets) {
      assert.ok(
        await fileExists(fromRoot(`dist/client${asset}`)),
        `generated HTML references missing asset: ${asset}`,
      );
    }

    for (const path of [
      "manifest.webmanifest",
      "sw.js",
      "icon-180.png",
      "icon-192.png",
      "icon-512.png",
      "form/dumbbell-rdl.webp",
      "form/dumbbell-row.webp",
      "form/goblet-squat.webp",
      "form/incline-push-up.webp",
      "form/pike-push-up.webp",
      "form/push-up.webp",
      "form/split-squat.webp",
      "form/squat.webp",
    ]) {
      assert.ok(await fileExists(fromRoot(`dist/client/${path}`)), `missing ${path}`);
    }
  },
);
