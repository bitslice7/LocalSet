import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const fromRoot = (path) => new URL(path, projectRoot);

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function importFreshSupabaseHelper(label) {
  const url = fromRoot("app/lib/supabase.ts");
  url.searchParams.set("test", `${label}-${Date.now()}-${Math.random()}`);
  return import(url.href);
}

test("cloud helper stays local-only unless both public variables are present", async () => {
  const urlName = "NEXT_PUBLIC_SUPABASE_URL";
  const keyName = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
  const previousUrl = process.env[urlName];
  const previousKey = process.env[keyName];
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("local-only configuration must not access the network");
  };

  try {
    delete process.env[urlName];
    delete process.env[keyName];
    const missing = await importFreshSupabaseHelper("missing");

    assert.equal(missing.cloudSyncConfigured, false);
    assert.equal(missing.getSupabaseClient(), null);
    assert.deepEqual(await missing.getCloudSession(), {
      ok: false,
      reason: "not-configured",
      message: "Cloud sync is not configured; progress remains on this device.",
    });
    assert.deepEqual(await missing.loadRemoteWorkoutState(), {
      ok: false,
      reason: "not-configured",
      message: "Cloud sync is not configured; progress remains on this device.",
    });
    const unsubscribe = missing.onCloudAuthStateChange(() => {
      assert.fail("an unconfigured helper must not subscribe to auth");
    });
    assert.equal(typeof unsubscribe, "function");
    unsubscribe();

    process.env[urlName] = "https://example.supabase.co";
    delete process.env[keyName];
    const partial = await importFreshSupabaseHelper("partial");
    assert.equal(partial.cloudSyncConfigured, false);
    assert.equal(partial.getSupabaseClient(), null);
    assert.equal(fetchCalls, 0);
  } finally {
    restoreEnv(urlName, previousUrl);
    restoreEnv(keyName, previousKey);
    globalThis.fetch = previousFetch;
  }
});

test("browser-facing configuration contains no privileged Supabase secret", async () => {
  const files = await Promise.all([
    readFile(fromRoot("app/lib/supabase.ts"), "utf8"),
    readFile(fromRoot(".env.example"), "utf8"),
    readFile(fromRoot("netlify.toml"), "utf8"),
  ]);
  const browserSurface = files.join("\n");

  assert.match(browserSurface, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(browserSurface, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(browserSurface, /SUPABASE_(?:SERVICE_ROLE|SECRET)(?:_KEY)?/i);
  assert.doesNotMatch(browserSurface, /\bservice[-_ ]?role\b/i);
  assert.doesNotMatch(browserSurface, /\bsb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(browserSurface, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./);
});

test("Supabase schema enforces one owner-only row with strict RLS", async () => {
  const source = await readFile(fromRoot("supabase/schema.sql"), "utf8");
  const sql = source.replace(/--.*$/gm, " ").replace(/\s+/g, " ").trim();

  assert.match(sql, /user_id uuid primary key references auth\.users \(id\) on delete cascade/i);
  assert.match(sql, /state jsonb not null/i);
  assert.match(sql, /alter table public\.workout_state enable row level security/i);
  assert.match(sql, /alter table public\.workout_state force row level security/i);
  assert.match(sql, /revoke all on table public\.workout_state from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.workout_state to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+[\s\S]*?\s+to\s+anon\b/i);
  assert.equal((sql.match(/create policy /gi) || []).length, 4);

  assert.match(sql, /create policy "workout_state_select_own" on public\.workout_state for select to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /create policy "workout_state_insert_own" on public\.workout_state for insert to authenticated with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /create policy "workout_state_update_own" on public\.workout_state for update to authenticated using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /create policy "workout_state_delete_own" on public\.workout_state for delete to authenticated using \(\(select auth\.uid\(\)\) = user_id\)/i);
});

test("Netlify CSP permits only the intended Supabase connection host", async () => {
  const netlify = await readFile(fromRoot("netlify.toml"), "utf8");
  const match = netlify.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  assert.ok(match, "expected a Content-Security-Policy header");

  const connectSrc = match[1]
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("connect-src "));
  assert.equal(connectSrc, "connect-src 'self' https://*.supabase.co");
  assert.doesNotMatch(connectSrc, /(?:^|\s)\*(?:\s|$)/);
});
