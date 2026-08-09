import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Database = {
  public: {
    Tables: {
      workout_state: {
        Row: {
          user_id: string;
          state: Json;
          revision: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          state: Json;
          revision?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          state?: Json;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type CloudSyncFailureReason =
  | "not-configured"
  | "not-signed-in"
  | "invalid-state"
  | "conflict"
  | "auth"
  | "database";

export type CloudSyncResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      reason: CloudSyncFailureReason;
      message: string;
      code?: string;
    };

export type CloudAuth = { user: User | null; session: Session | null };

export type RemoteWorkoutState<TState> = {
  userId: string;
  state: TState;
  revision: number;
  updatedAt: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export const cloudSyncConfigured = Boolean(
  supabaseUrl && supabasePublishableKey,
);

let client: SupabaseClient<Database> | null = null;

/** Returns null on the static/local-only build when cloud env vars are absent. */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!cloudSyncConfigured || !supabaseUrl || !supabasePublishableKey) return null;
  if (!client) {
    client = createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

function unavailable<T>(): CloudSyncResult<T> {
  return {
    ok: false,
    reason: "not-configured",
    message: "Cloud sync is not configured; progress remains on this device.",
  };
}

function failure<T>(
  reason: CloudSyncFailureReason,
  error: unknown,
  fallback: string,
): CloudSyncResult<T> {
  const candidate = error as { message?: string; code?: string } | null;
  return {
    ok: false,
    reason,
    message: candidate?.message || fallback,
    ...(candidate?.code ? { code: candidate.code } : {}),
  };
}

function stateAsJson(value: unknown): CloudSyncResult<Json> {
  try {
    const encoded = JSON.stringify(value);
    if (!encoded) {
      return failure("invalid-state", null, "Workout state is not JSON serializable.");
    }
    const decoded = JSON.parse(encoded) as Json;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      return failure("invalid-state", null, "Workout state must be a JSON object.");
    }
    return { ok: true, data: decoded };
  } catch (error) {
    return failure("invalid-state", error, "Workout state is not JSON serializable.");
  }
}

async function verifiedUser(
  supabase: SupabaseClient<Database>,
): Promise<CloudSyncResult<User>> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return failure("auth", error, "Could not verify the signed-in user.");
    if (!data.user) {
      return failure("not-signed-in", null, "Sign in to use cross-device sync.");
    }
    return { ok: true, data: data.user };
  } catch (error) {
    return failure("auth", error, "Could not verify the signed-in user.");
  }
}

export async function getCloudSession(): Promise<CloudSyncResult<CloudAuth>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return failure("auth", error, "Could not restore the session.");
    return {
      ok: true,
      data: { user: data.session?.user ?? null, session: data.session },
    };
  } catch (error) {
    return failure("auth", error, "Could not restore the session.");
  }
}

export function onCloudAuthStateChange(
  listener: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange(listener);
  return () => data.subscription.unsubscribe();
}

export async function signUpWithEmail(
  email: string,
  password: string,
  emailRedirectTo?: string,
): Promise<CloudSyncResult<CloudAuth>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(emailRedirectTo
        ? { options: { emailRedirectTo } }
        : {}),
    });
    if (error) return failure("auth", error, "Could not create the account.");
    return { ok: true, data: { user: data.user, session: data.session } };
  } catch (error) {
    return failure("auth", error, "Could not create the account.");
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<CloudSyncResult<CloudAuth>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return failure("auth", error, "Could not sign in.");
    return { ok: true, data: { user: data.user, session: data.session } };
  } catch (error) {
    return failure("auth", error, "Could not sign in.");
  }
}

export async function signOutCloud(): Promise<CloudSyncResult<null>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return failure("auth", error, "Could not sign out.");
    return { ok: true, data: null };
  } catch (error) {
    return failure("auth", error, "Could not sign out.");
  }
}

export async function requestPasswordReset(
  email: string,
  redirectTo: string,
): Promise<CloudSyncResult<null>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) return failure("auth", error, "Could not send the reset email.");
    return { ok: true, data: null };
  } catch (error) {
    return failure("auth", error, "Could not send the reset email.");
  }
}

export async function updateCloudPassword(
  password: string,
): Promise<CloudSyncResult<User>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) return failure("auth", error, "Could not update the password.");
    return { ok: true, data: data.user };
  } catch (error) {
    return failure("auth", error, "Could not update the password.");
  }
}

function remoteRow<TState>(row: Database["public"]["Tables"]["workout_state"]["Row"]): RemoteWorkoutState<TState> {
  return {
    userId: row.user_id,
    state: row.state as TState,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export async function loadRemoteWorkoutState<TState>(): Promise<
  CloudSyncResult<RemoteWorkoutState<TState> | null>
> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  const user = await verifiedUser(supabase);
  if (!user.ok) return user;
  try {
    const { data, error } = await supabase
      .from("workout_state")
      .select("user_id, state, revision, updated_at")
      .eq("user_id", user.data.id)
      .maybeSingle();
    if (error) return failure("database", error, "Could not load cloud progress.");
    return { ok: true, data: data ? remoteRow<TState>(data) : null };
  } catch (error) {
    return failure("database", error, "Could not load cloud progress.");
  }
}

/**
 * Optimistic save. Pass null only when creating the user's first row; otherwise
 * pass the revision returned by the latest load/save. A stale revision returns
 * `reason: "conflict"` so the caller can pull, merge, and retry.
 */
export async function saveRemoteWorkoutState<TState>(
  state: TState,
  expectedRevision: number | null,
): Promise<CloudSyncResult<RemoteWorkoutState<TState>>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  const json = stateAsJson(state);
  if (!json.ok) return json;
  const user = await verifiedUser(supabase);
  if (!user.ok) return user;

  try {
    if (expectedRevision === null) {
      const { data, error } = await supabase
        .from("workout_state")
        .insert({ user_id: user.data.id, state: json.data })
        .select("user_id, state, revision, updated_at")
        .single();
      if (error?.code === "23505") {
        return failure("conflict", error, "Cloud progress already exists.");
      }
      if (error) return failure("database", error, "Could not create cloud progress.");
      return { ok: true, data: remoteRow<TState>(data) };
    }

    const { data, error } = await supabase
      .from("workout_state")
      .update({ state: json.data, revision: expectedRevision + 1 })
      .eq("user_id", user.data.id)
      .eq("revision", expectedRevision)
      .select("user_id, state, revision, updated_at")
      .maybeSingle();
    if (error) return failure("database", error, "Could not save cloud progress.");
    if (!data) {
      return failure(
        "conflict",
        null,
        "Cloud progress changed on another device. Pull, merge, and retry.",
      );
    }
    return { ok: true, data: remoteRow<TState>(data) };
  } catch (error) {
    return failure("database", error, "Could not save cloud progress.");
  }
}

export async function deleteRemoteWorkoutState(): Promise<CloudSyncResult<null>> {
  const supabase = getSupabaseClient();
  if (!supabase) return unavailable();
  const user = await verifiedUser(supabase);
  if (!user.ok) return user;
  try {
    const { error } = await supabase
      .from("workout_state")
      .delete()
      .eq("user_id", user.data.id);
    if (error) return failure("database", error, "Could not erase cloud progress.");
    return { ok: true, data: null };
  } catch (error) {
    return failure("database", error, "Could not erase cloud progress.");
  }
}
