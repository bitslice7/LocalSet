"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXERCISES,
  RECOVERY_WORKOUT,
  SOURCE_LINKS,
  getWorkoutsForMode,
  type SessionCode,
  type TrainingMode,
  type WorkoutLogUnit,
  type WorkoutTemplate,
} from "./workout-data";
import {
  cloudSyncConfigured,
  deleteRemoteWorkoutState,
  getCloudSession,
  loadRemoteWorkoutState,
  onCloudAuthStateChange,
  requestPasswordReset,
  saveRemoteWorkoutState,
  signInWithEmail,
  signOutCloud,
  signUpWithEmail,
  updateCloudPassword,
} from "./lib/supabase";

type Tab = "today" | "plan" | "progress" | "settings";
type Readiness = "standard" | "lighter" | "recovery";

type Profile = {
  name: string;
  mode: TrainingMode;
  daysPerWeek: 3 | 4 | 5;
  goal: "consistency" | "strength" | "movement";
  pushGoal: number;
  createdAt: string;
};

type SetLog = {
  reps: string;
  load: string;
  rir: string;
  done: boolean;
};

type SessionRecord = {
  date: string;
  code: SessionCode;
  title: string;
  mode: TrainingMode;
  completedAt: string;
  readiness: Readiness;
  sets: Record<string, SetLog[]>;
  newPrs: string[];
};

type PersonalRecord = {
  exerciseId: string;
  label: string;
  value: number;
  unit: WorkoutLogUnit | "lb";
  date: string;
};

type ActiveSession = {
  key: string;
  date: string;
  workoutCode: SessionCode;
  mode: TrainingMode;
  readiness: Readiness;
  sessionStarted: boolean;
  draft: Record<string, SetLog[]>;
  updatedAt: string;
};

type AppState = {
  version: 1;
  profile: Profile | null;
  history: Record<string, SessionRecord>;
  prs: Record<string, PersonalRecord>;
  activeSession: ActiveSession | null;
};

const STORAGE_KEY = "localset-v1";
const LEGACY_LOCALFIT_STORAGE_KEY = "localfit-v1";
const LEGACY_FORM_DAILY_STORAGE_KEY = "form-daily-v1";
const SYNC_META_KEY = "localset-sync-v1";
const LEGACY_LOCALFIT_SYNC_META_KEY = "localfit-sync-v1";
const LEGACY_FORM_DAILY_SYNC_META_KEY = "form-daily-sync-v1";

const EMPTY_STATE: AppState = {
  version: 1,
  profile: null,
  history: {},
  prs: {},
  activeSession: null,
};

type CloudStatus =
  | "disabled"
  | "checking"
  | "signed-out"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "error";

type CloudUser = { id: string; email: string | null };

type SyncMeta = {
  version: 1;
  userId: string;
  revision: number;
  base: AppState;
};

const SCHEDULES: Record<3 | 4 | 5, number[]> = {
  3: [1, 3, 5],
  4: [1, 2, 4, 6],
  5: [1, 2, 3, 4, 5],
};

const STRENGTH_SCHEDULES: Record<3 | 4 | 5, number[]> = {
  3: [1, 3, 5],
  4: [1, 2, 4, 6],
  5: [1, 3, 5],
};

const RECOVERY_SCHEDULES: Record<3 | 4 | 5, number[]> = {
  3: [],
  4: [],
  5: [2, 4],
};

type ScheduleKind = "strength" | "recovery" | "off";

const LOG_UNIT_COPY: Record<WorkoutLogUnit, { heading: string; aria: string; short: string }> = {
  reps: { heading: "Reps", aria: "repetitions", short: "reps" },
  seconds: { heading: "Seconds", aria: "seconds", short: "sec" },
  minutes: { heading: "Minutes", aria: "minutes", short: "min" },
  meters: { heading: "Meters", aria: "meters", short: "m" },
  feet: { heading: "Feet", aria: "feet", short: "ft" },
};

const PR_UNITS: PersonalRecord["unit"][] = ["reps", "seconds", "minutes", "meters", "feet", "lb"];

function getMoveLogging(move: WorkoutTemplate["moves"][number]) {
  return move.logging;
}

function getScheduleKind(daysPerWeek: 3 | 4 | 5, day: number): ScheduleKind {
  if (STRENGTH_SCHEDULES[daysPerWeek].includes(day)) return "strength";
  if (RECOVERY_SCHEDULES[daysPerWeek].includes(day)) return "recovery";
  return "off";
}

const GOAL_LABELS: Record<Profile["goal"], string> = {
  consistency: "Build the habit",
  strength: "Get stronger",
  movement: "Move better",
};

const READINESS_COPY: Record<Readiness, { label: string; note: string }> = {
  standard: { label: "Standard", note: "Follow the full plan" },
  lighter: { label: "Lighter", note: "One fewer set each" },
  recovery: { label: "Recovery", note: "Move gently or rest" },
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date = new Date()) {
  const next = new Date(date);
  const day = next.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  next.setHours(0, 0, 0, 0);
  return addDays(next, distance);
}

function getTrainingOrdinal(date: Date, daysPerWeek: 3 | 4 | 5) {
  const start = new Date(date.getFullYear(), 0, 1);
  let ordinal = 0;
  const cursor = new Date(start);
  while (cursor <= date) {
    if (STRENGTH_SCHEDULES[daysPerWeek].includes(cursor.getDay())) ordinal += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(0, ordinal - 1);
}

function getPlannedWorkout(profile: Profile, date = new Date()) {
  const scheduleKind = getScheduleKind(profile.daysPerWeek, date.getDay());
  if (scheduleKind !== "strength") return RECOVERY_WORKOUT;
  const plans = getWorkoutsForMode(profile.mode);
  return plans[getTrainingOrdinal(date, profile.daysPerWeek) % plans.length];
}

function getStreak(history: AppState["history"]) {
  const today = new Date();
  let cursor = history[localDateKey(today)] ? today : addDays(today, -1);
  let streak = 0;
  while (history[localDateKey(cursor)]) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function getBestStreak(history: AppState["history"]) {
  const dates = Object.keys(history).sort();
  if (!dates.length) return 0;
  let best = 1;
  let current = 1;
  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T12:00:00`);
    const next = new Date(`${dates[index]}T12:00:00`);
    const diff = Math.round((next.getTime() - previous.getTime()) / 86_400_000);
    current = diff === 1 ? current + 1 : 1;
    best = Math.max(best, current);
  }
  return best;
}

function parseFirstNumber(value: string) {
  const match = value.match(/\d+/);
  return match ? match[0] : "";
}

function buildDraft(workout: WorkoutTemplate, readiness: Readiness) {
  return Object.fromEntries(
    workout.moves.map((move) => {
      const setCount = readiness === "lighter" ? Math.max(1, move.sets - 1) : move.sets;
      return [
        move.exerciseId,
        Array.from({ length: setCount }, () => ({
          reps: "",
          load: "",
          rir: move.rir.startsWith("2") ? "2" : "",
          done: false,
        })),
      ];
    }),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isIsoTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isMode(value: unknown): value is TrainingMode {
  return value === "home" || value === "gym";
}

function isReadiness(value: unknown): value is Readiness {
  return value === "standard" || value === "lighter" || value === "recovery";
}

function isSessionCode(value: unknown): value is SessionCode {
  return value === "A" || value === "B" || value === "C" || value === "R";
}

function isKnownExercise(value: unknown): value is string {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EXERCISES, value);
}

function safeSetLog(value: unknown): SetLog | null {
  if (!isObject(value)) return null;
  if (
    typeof value.reps !== "string" || value.reps.length > 24 ||
    typeof value.load !== "string" || value.load.length > 24 ||
    typeof value.rir !== "string" || !["", "4+", "3", "2", "1", "0"].includes(value.rir) ||
    typeof value.done !== "boolean"
  ) return null;
  return { reps: value.reps, load: value.load, rir: value.rir, done: value.done };
}

function safeSetMap(value: unknown): Record<string, SetLog[]> | null {
  if (!isObject(value) || Object.keys(value).length > 100) return null;
  const result: Record<string, SetLog[]> = {};
  for (const [exerciseId, candidateSets] of Object.entries(value)) {
    if (!isKnownExercise(exerciseId) || !Array.isArray(candidateSets) || candidateSets.length > 50) return null;
    const sets = candidateSets.map(safeSetLog);
    if (sets.some((set) => !set)) return null;
    result[exerciseId] = sets as SetLog[];
  }
  return result;
}

function safeProfile(value: unknown): Profile | null | undefined {
  if (value === null) return null;
  if (!isObject(value)) return undefined;
  if (
    typeof value.name !== "string" || value.name.length > 80 ||
    !isMode(value.mode) || ![3, 4, 5].includes(value.daysPerWeek as number) ||
    !["consistency", "strength", "movement"].includes(String(value.goal)) ||
    typeof value.pushGoal !== "number" || !Number.isFinite(value.pushGoal) || value.pushGoal < 1 || value.pushGoal > 1000 ||
    !isIsoTime(value.createdAt)
  ) return undefined;
  return {
    name: value.name,
    mode: value.mode,
    daysPerWeek: value.daysPerWeek as 3 | 4 | 5,
    goal: value.goal as Profile["goal"],
    pushGoal: value.pushGoal,
    createdAt: value.createdAt,
  };
}

function safeHistory(value: unknown): AppState["history"] | null {
  if (!isObject(value) || Object.keys(value).length > 5000) return null;
  const result: AppState["history"] = {};
  for (const [date, candidate] of Object.entries(value)) {
    if (!isDateKey(date) || !isObject(candidate) || candidate.date !== date) return null;
    const sets = safeSetMap(candidate.sets);
    if (
      !sets || !isSessionCode(candidate.code) || typeof candidate.title !== "string" || candidate.title.length > 200 ||
      !isMode(candidate.mode) || !isIsoTime(candidate.completedAt) || !isReadiness(candidate.readiness) ||
      !Array.isArray(candidate.newPrs) || candidate.newPrs.length > 100 ||
      candidate.newPrs.some((item) => typeof item !== "string" || item.length > 240)
    ) return null;
    result[date] = {
      date,
      code: candidate.code,
      title: candidate.title,
      mode: candidate.mode,
      completedAt: candidate.completedAt,
      readiness: candidate.readiness,
      sets,
      newPrs: candidate.newPrs as string[],
    };
  }
  return result;
}

function safePrs(value: unknown): AppState["prs"] | null {
  if (!isObject(value) || Object.keys(value).length > 500) return null;
  const result: AppState["prs"] = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isObject(candidate) || !isKnownExercise(candidate.exerciseId)) return null;
    const unit = candidate.unit as PersonalRecord["unit"];
    const normalizedKey = `${candidate.exerciseId}:${unit}`;
    const isLegacyLoadKey = unit === "lb" && key === `${candidate.exerciseId}:load`;
    if (
      typeof candidate.label !== "string" || candidate.label.length > 160 ||
      typeof candidate.value !== "number" || !Number.isFinite(candidate.value) || candidate.value < 0 || candidate.value > 1_000_000 ||
      !PR_UNITS.includes(unit) || !isDateKey(candidate.date) ||
      (key !== normalizedKey && !isLegacyLoadKey)
    ) return null;
    result[normalizedKey] = {
      exerciseId: candidate.exerciseId,
      label: candidate.label,
      value: candidate.value,
      unit,
      date: candidate.date,
    };
  }
  return result;
}

function activeSessionKey(date: string, mode: TrainingMode, code: SessionCode) {
  return `${date}:${mode}:${code}`;
}

function safeActiveSession(value: unknown): ActiveSession | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isObject(value) || !isDateKey(value.date) || !isSessionCode(value.workoutCode) || !isMode(value.mode)) return undefined;
  const draft = safeSetMap(value.draft);
  if (
    !draft || value.key !== activeSessionKey(value.date, value.mode, value.workoutCode) ||
    !isReadiness(value.readiness) || typeof value.sessionStarted !== "boolean" || !isIsoTime(value.updatedAt)
  ) return undefined;
  return {
    key: value.key,
    date: value.date,
    workoutCode: value.workoutCode,
    mode: value.mode,
    readiness: value.readiness,
    sessionStarted: value.sessionStarted,
    draft,
    updatedAt: value.updatedAt,
  };
}

function safeState(value: unknown): AppState | null {
  if (!isObject(value) || value.version !== 1) return null;
  const profile = safeProfile(value.profile);
  const history = safeHistory(value.history);
  const prs = safePrs(value.prs);
  const activeSession = safeActiveSession(value.activeSession);
  if (profile === undefined || !history || !prs || activeSession === undefined) return null;
  return {
    version: 1,
    profile,
    history,
    prs,
    activeSession: activeSession && history[activeSession.date] ? null : activeSession,
  };
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function chooseThreeWay<T>(base: T | undefined, local: T, remote: T): T {
  if (sameValue(local, remote)) return local;
  if (base !== undefined && sameValue(local, base)) return remote;
  if (base !== undefined && sameValue(remote, base)) return local;
  return local;
}

function mergeStates(base: AppState | null, local: AppState, remote: AppState): AppState {
  const history: AppState["history"] = {};
  const historyDates = new Set([...Object.keys(local.history), ...Object.keys(remote.history)]);
  historyDates.forEach((date) => {
    const localRecord = local.history[date];
    const remoteRecord = remote.history[date];
    const baseRecord = base?.history[date];
    if (!localRecord) history[date] = remoteRecord;
    else if (!remoteRecord) history[date] = localRecord;
    else if (baseRecord && sameValue(localRecord, baseRecord)) history[date] = remoteRecord;
    else if (baseRecord && sameValue(remoteRecord, baseRecord)) history[date] = localRecord;
    else history[date] = localRecord.completedAt >= remoteRecord.completedAt ? localRecord : remoteRecord;
  });

  const prs: AppState["prs"] = {};
  const prKeys = new Set([...Object.keys(local.prs), ...Object.keys(remote.prs)]);
  prKeys.forEach((key) => {
    const localPr = local.prs[key];
    const remotePr = remote.prs[key];
    if (!localPr) prs[key] = remotePr;
    else if (!remotePr) prs[key] = localPr;
    else if (localPr.value !== remotePr.value) prs[key] = localPr.value > remotePr.value ? localPr : remotePr;
    else prs[key] = localPr.date >= remotePr.date ? localPr : remotePr;
  });

  let activeSession = !base && !local.activeSession
    ? remote.activeSession
    : chooseThreeWay(base?.activeSession, local.activeSession, remote.activeSession);
  if (local.activeSession && remote.activeSession && local.activeSession.key === remote.activeSession.key) {
    activeSession = local.activeSession.updatedAt >= remote.activeSession.updatedAt ? local.activeSession : remote.activeSession;
  }
  if (activeSession && history[activeSession.date]) activeSession = null;

  return {
    version: 1,
    profile: chooseThreeWay(base?.profile, local.profile, remote.profile),
    history,
    prs,
    activeSession,
  };
}

function hasUserData(value: AppState) {
  return Boolean(
    value.profile || value.activeSession || Object.keys(value.history).length || Object.keys(value.prs).length,
  );
}

function readSyncMeta(userId: string): SyncMeta | null {
  try {
    const stored = window.localStorage.getItem(SYNC_META_KEY)
      ?? window.localStorage.getItem(LEGACY_LOCALFIT_SYNC_META_KEY)
      ?? window.localStorage.getItem(LEGACY_FORM_DAILY_SYNC_META_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<SyncMeta>;
    const base = safeState(value.base);
    if (value.version !== 1 || value.userId !== userId || !Number.isInteger(value.revision) || Number(value.revision) < 1 || !base) return null;
    return { version: 1, userId, revision: Number(value.revision), base };
  } catch {
    return null;
  }
}

function writeSyncMeta(userId: string, revision: number, base: AppState) {
  try {
    const meta: SyncMeta = { version: 1, userId, revision, base };
    window.localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
    window.localStorage.removeItem(LEGACY_LOCALFIT_SYNC_META_KEY);
    window.localStorage.removeItem(LEGACY_FORM_DAILY_SYNC_META_KEY);
  } catch {
    // Cloud sync still works; the next load will conservatively merge without a base.
  }
}

function draftMatchesWorkout(draft: Record<string, SetLog[]>, workout: WorkoutTemplate) {
  const expected = new Set(workout.moves.map((move) => move.exerciseId));
  const actual = Object.keys(draft);
  return actual.length === expected.size && actual.every((exerciseId) => expected.has(exerciseId));
}

function AppMark() {
  return (
    <span className="app-mark" aria-hidden="true">
      <span>L</span><i /><span>S</span>
    </span>
  );
}

function FormFigure({ src, name }: { src?: string; name: string }) {
  if (!src) return null;
  return (
    <figure className="form-plate">
      {/* Static export: these local plates are already pre-compressed WebP assets. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Original two-position form study for ${name}: start on the left and working position on the right.`}
        width="1536"
        height="1024"
        loading="lazy"
        decoding="async"
      />
      <figcaption>Original form study · written cues are the standard</figcaption>
    </figure>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [readiness, setReadiness] = useState<Readiness>("standard");
  const [sessionStarted, setSessionStarted] = useState(false);
  const [draft, setDraft] = useState<Record<string, SetLog[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ sets: number; prs: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(cloudSyncConfigured ? "checking" : "disabled");
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<AppState>(EMPTY_STATE);
  const cloudUserRef = useRef<CloudUser | null>(null);
  const cloudReadyRef = useRef(false);
  const cloudRevisionRef = useRef<number | null>(null);
  const cloudBaseRef = useRef<AppState | null>(null);
  const cloudHydrationIdRef = useRef(0);

  const todayKey = localDateKey();
  const profile = state.profile;
  const scheduledWorkout = profile ? getPlannedWorkout(profile) : RECOVERY_WORKOUT;
  const workout = readiness === "recovery" ? RECOVERY_WORKOUT : scheduledWorkout;
  const completedToday = state.history[todayKey];
  const streak = getStreak(state.history);
  const bestStreak = getBestStreak(state.history);

  const restoreSessionFromState = useCallback((next: AppState) => {
    const date = localDateKey();
    const nextProfile = next.profile;
    if (!nextProfile || next.history[date]) {
      setReadiness("standard");
      setSessionStarted(false);
      setDraft({});
      setExpanded(null);
      return;
    }

    const planned = getPlannedWorkout(nextProfile);
    const active = next.activeSession;
    const activeWorkout = active?.readiness === "recovery" ? RECOVERY_WORKOUT : planned;
    if (
      active && active.date === date && active.mode === nextProfile.mode &&
      active.workoutCode === activeWorkout.code &&
      active.key === activeSessionKey(date, nextProfile.mode, activeWorkout.code) &&
      draftMatchesWorkout(active.draft, activeWorkout)
    ) {
      setReadiness(active.readiness);
      setSessionStarted(active.sessionStarted);
      setDraft(active.draft);
    } else {
      setReadiness("standard");
      setSessionStarted(false);
      setDraft(buildDraft(planned, "standard"));
    }
    setExpanded(null);
  }, []);

  const applyState = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
    restoreSessionFromState(next);
  }, [restoreSessionFromState]);

  const finishCloudSave = useCallback((userId: string, revision: number, saved: AppState) => {
    cloudRevisionRef.current = revision;
    cloudBaseRef.current = saved;
    writeSyncMeta(userId, revision, saved);
    setLastSyncedAt(new Date().toISOString());
    setCloudStatus("synced");
  }, []);

  const pushCloudState = useCallback(async (candidate: AppState, announce = false) => {
    const user = cloudUserRef.current;
    if (!user || !cloudReadyRef.current) return;
    setCloudStatus("syncing");

    let desired = candidate;
    let result = await saveRemoteWorkoutState<AppState>(desired, cloudRevisionRef.current);
    if (!result.ok && result.reason === "conflict") {
      const fresh = await loadRemoteWorkoutState<AppState>();
      if (!fresh.ok || !fresh.data) {
        setCloudStatus("conflict");
        if (announce) setNotice("Sync paused because another device changed your data. Try Sync now again.");
        return;
      }
      const safeRemote = safeState(fresh.data.state);
      if (!safeRemote) {
        setCloudStatus("error");
        setNotice("Cloud data did not pass validation, so this device kept its local copy.");
        return;
      }
      desired = mergeStates(cloudBaseRef.current, desired, safeRemote);
      applyState(desired);
      cloudRevisionRef.current = fresh.data.revision;
      cloudBaseRef.current = safeRemote;
      result = await saveRemoteWorkoutState<AppState>(desired, fresh.data.revision);
    }

    if (!result.ok) {
      setCloudStatus(result.reason === "conflict" ? "conflict" : "offline");
      if (announce) setNotice("Could not reach cloud sync. Your progress is still saved on this device.");
      return;
    }
    finishCloudSave(user.id, result.data.revision, desired);
    if (announce) setNotice("Progress synced across devices.");
  }, [applyState, finishCloudSave]);

  const hydrateFromCloud = useCallback(async (user: CloudUser, announce = false) => {
    const hydrationId = ++cloudHydrationIdRef.current;
    cloudReadyRef.current = false;
    cloudUserRef.current = user;
    setCloudUser(user);
    setCloudStatus("syncing");

    const remote = await loadRemoteWorkoutState<AppState>();
    if (hydrationId !== cloudHydrationIdRef.current) return;
    if (!remote.ok) {
      setCloudStatus("offline");
      if (announce) setNotice("Cloud sync is unavailable. This device will keep saving locally.");
      return;
    }

    const local = stateRef.current;
    const meta = readSyncMeta(user.id);
    if (!remote.data) {
      cloudRevisionRef.current = null;
      cloudBaseRef.current = null;
      cloudReadyRef.current = true;
      await pushCloudState(local, announce);
      return;
    }

    const safeRemote = safeState(remote.data.state);
    if (!safeRemote) {
      setCloudStatus("error");
      setNotice("Cloud data did not pass validation, so it was not loaded or overwritten.");
      return;
    }

    const merged = !meta && !hasUserData(local)
      ? safeRemote
      : mergeStates(meta?.base ?? null, local, safeRemote);
    cloudRevisionRef.current = remote.data.revision;
    cloudBaseRef.current = safeRemote;
    cloudReadyRef.current = true;
    applyState(merged);

    if (sameValue(merged, safeRemote)) {
      finishCloudSave(user.id, remote.data.revision, safeRemote);
      if (announce) setNotice("Progress is up to date.");
    } else {
      await pushCloudState(merged, announce);
    }
  }, [applyState, finishCloudSave, pushCloudState]);

  useEffect(() => {
    let restored = EMPTY_STATE;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_LOCALFIT_STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_FORM_DAILY_STORAGE_KEY);
      if (stored) {
        const parsed = safeState(JSON.parse(stored));
        if (parsed) restored = parsed;
      }
    } catch {
      // A private browsing mode or malformed backup should not block the app.
    }
    queueMicrotask(() => {
      applyState(restored);
      setHydrated(true);
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, [applyState]);

  useEffect(() => {
    stateRef.current = state;
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.localStorage.removeItem(LEGACY_LOCALFIT_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_FORM_DAILY_STORAGE_KEY);
    } catch {
      queueMicrotask(() => setNotice("This browser could not save progress. Export a backup before closing."));
    }
  }, [hydrated, state]);

  useEffect(() => {
    if (!hydrated) return;
    if (!cloudSyncConfigured) return;
    let active = true;
    void getCloudSession().then((result) => {
      if (!active) return;
      const user = result.ok && result.data.user
        ? { id: result.data.user.id, email: result.data.user.email ?? null }
        : null;
      if (user) void hydrateFromCloud(user);
      else setCloudStatus("signed-out");
    });

    const unsubscribe = onCloudAuthStateChange((event, session) => {
      if (!active || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setTab("settings");
      }
      if (event === "SIGNED_OUT" || !session?.user) {
        ++cloudHydrationIdRef.current;
        cloudReadyRef.current = false;
        cloudUserRef.current = null;
        cloudRevisionRef.current = null;
        cloudBaseRef.current = null;
        setCloudUser(null);
        setCloudStatus("signed-out");
        return;
      }
      const user = { id: session.user.id, email: session.user.email ?? null };
      if (cloudUserRef.current?.id === user.id && cloudReadyRef.current && event === "SIGNED_IN") return;
      void hydrateFromCloud(user);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [hydrated, hydrateFromCloud]);

  useEffect(() => {
    if (!hydrated || !profile || completedToday || !Object.keys(draft).length) return;
    const nextActive: ActiveSession = {
      key: activeSessionKey(todayKey, profile.mode, workout.code),
      date: todayKey,
      workoutCode: workout.code,
      mode: profile.mode,
      readiness,
      sessionStarted,
      draft,
      updatedAt: new Date().toISOString(),
    };
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setState((current) => {
        const active = current.activeSession;
        if (
          active?.key === nextActive.key && active.readiness === readiness &&
          active.sessionStarted === sessionStarted && sameValue(active.draft, draft)
        ) return current;
        return { ...current, activeSession: nextActive };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [completedToday, draft, hydrated, profile, readiness, sessionStarted, todayKey, workout.code]);

  useEffect(() => {
    if (!hydrated || !cloudUser || !cloudReadyRef.current || sameValue(state, cloudBaseRef.current)) return;
    const timeout = window.setTimeout(() => {
      void pushCloudState(state);
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [cloudUser, hydrated, pushCloudState, state]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const week = useMemo(() => {
    const monday = startOfWeek();
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index);
      const key = localDateKey(date);
      const scheduled = profile ? SCHEDULES[profile.daysPerWeek].includes(date.getDay()) : false;
      const kind = profile ? getScheduleKind(profile.daysPerWeek, date.getDay()) : "off";
      return { date, key, scheduled, kind, complete: Boolean(state.history[key]) };
    });
  }, [profile, state.history]);

  const recentDays = useMemo(() => {
    return Array.from({ length: 28 }, (_, index) => {
      const date = addDays(new Date(), index - 27);
      const key = localDateKey(date);
      return { key, complete: Boolean(state.history[key]) };
    });
  }, [state.history]);

  const weeklyComplete = week.filter((day) => day.scheduled && day.complete).length;
  const prList = Object.values(state.prs).sort((a, b) => b.date.localeCompare(a.date));

  async function submitCloudAccount(mode: "signin" | "signup", email: string, password: string) {
    if (!email.trim() || password.length < 6) {
      setNotice("Enter your email and a password with at least 6 characters.");
      return;
    }
    setCloudStatus("checking");
    const result = mode === "signup"
      ? await signUpWithEmail(email.trim(), password, window.location.origin)
      : await signInWithEmail(email.trim(), password);
    if (!result.ok) {
      setCloudStatus("signed-out");
      setNotice(result.message);
      return;
    }
    if (!result.data.user || !result.data.session) {
      setCloudStatus("signed-out");
      setNotice("Check your email to confirm the account, then sign in here.");
      return;
    }
    const user = { id: result.data.user.id, email: result.data.user.email ?? null };
    await hydrateFromCloud(user, true);
  }

  async function sendPasswordReset(email: string) {
    if (!email.trim()) {
      setNotice("Enter your account email first.");
      return;
    }
    const result = await requestPasswordReset(email.trim(), window.location.origin);
    setNotice(result.ok ? "If that account exists, a password reset email is on its way." : result.message);
  }

  async function finishPasswordReset(password: string) {
    if (password.length < 6) {
      setNotice("Use a password with at least 6 characters.");
      return;
    }
    const result = await updateCloudPassword(password);
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    setPasswordRecovery(false);
    setNotice("Password updated.");
  }

  async function disconnectCloud() {
    const result = await signOutCloud();
    if (!result.ok) {
      setNotice(result.message);
      return;
    }
    ++cloudHydrationIdRef.current;
    cloudReadyRef.current = false;
    cloudUserRef.current = null;
    cloudRevisionRef.current = null;
    cloudBaseRef.current = null;
    setCloudUser(null);
    setCloudStatus("signed-out");
    setNotice("Signed out. This device will keep saving locally.");
  }

  async function manualCloudSync() {
    if (!cloudUser) return;
    await hydrateFromCloud(cloudUser, true);
  }

  function createProfile(formData: FormData) {
    const name = String(formData.get("name") || "Athlete").trim() || "Athlete";
    const mode = (formData.get("mode") || "home") as TrainingMode;
    const daysPerWeek = Number(formData.get("days")) as 3 | 4 | 5;
    const goal = (formData.get("goal") || "consistency") as Profile["goal"];
    applyState({
      ...EMPTY_STATE,
      profile: {
        name,
        mode,
        daysPerWeek,
        goal,
        pushGoal: 20,
        createdAt: new Date().toISOString(),
      },
    });
  }

  function updateProfile(patch: Partial<Profile>) {
    const scheduleChanged = Boolean(
      profile && ((patch.mode && patch.mode !== profile.mode) || (patch.daysPerWeek && patch.daysPerWeek !== profile.daysPerWeek)),
    );
    if (scheduleChanged && profile) {
      const nextProfile = { ...profile, ...patch };
      setReadiness("standard");
      setSessionStarted(false);
      setDraft(buildDraft(getPlannedWorkout(nextProfile), "standard"));
      setExpanded(null);
    }
    setState((current) =>
      current.profile
        ? {
            ...current,
            profile: { ...current.profile, ...patch },
            activeSession: scheduleChanged ? null : current.activeSession,
          }
        : current,
    );
  }

  function changeReadiness(value: Readiness) {
    if (!profile || sessionStarted) return;
    const nextWorkout = value === "recovery" ? RECOVERY_WORKOUT : scheduledWorkout;
    setReadiness(value);
    setDraft(buildDraft(nextWorkout, value));
    setSessionStarted(false);
    setExpanded(null);
    setState((current) => ({ ...current, activeSession: null }));
  }

  function updateSet(exerciseId: string, index: number, patch: Partial<SetLog>) {
    setDraft((current) => ({
      ...current,
      [exerciseId]: current[exerciseId].map((set, setIndex) =>
        setIndex === index ? { ...set, ...patch } : set,
      ),
    }));
  }

  function toggleSet(exerciseId: string, index: number, repTarget: string) {
    const currentSet = draft[exerciseId][index];
    updateSet(exerciseId, index, {
      done: !currentSet.done,
      reps: currentSet.reps || parseFirstNumber(repTarget),
    });
  }

  function finishSession() {
    if (!profile) return;
    const completedSets = Object.values(draft).flat().filter((set) => set.done).length;
    if (!completedSets && workout.code !== "R") {
      setNotice("Mark at least one set complete before finishing the session.");
      return;
    }

    const newPrs = { ...state.prs };
    const prLabels: string[] = [];

    Object.entries(draft).forEach(([exerciseId, sets]) => {
      const exercise = EXERCISES[exerciseId];
      const move = workout.moves.find((candidate) => candidate.exerciseId === exerciseId);
      if (!move) return;
      const logging = getMoveLogging(move);
      const finished = sets.filter((set) => set.done);
      const maxPrimary = Math.max(0, ...finished.map((set) => Number(set.reps) || 0));
      const maxLoad = Math.max(0, ...finished.map((set) => Number(set.load) || 0));
      const primaryKey = `${exerciseId}:${logging.unit}`;
      const loadKey = `${exerciseId}:lb`;

      if (logging.prEligible && maxPrimary > (newPrs[primaryKey]?.value || 0)) {
        newPrs[primaryKey] = {
          exerciseId,
          label: exercise.name,
          value: maxPrimary,
          unit: logging.unit,
          date: todayKey,
        };
        prLabels.push(`${exercise.name} · ${maxPrimary} ${LOG_UNIT_COPY[logging.unit].short}`);
      }
      if (logging.loadPrEligible && maxLoad > (newPrs[loadKey]?.value || 0)) {
        newPrs[loadKey] = {
          exerciseId,
          label: exercise.name,
          value: maxLoad,
          unit: "lb",
          date: todayKey,
        };
        prLabels.push(`${exercise.name} · ${maxLoad} lb`);
      }
    });

    const record: SessionRecord = {
      date: todayKey,
      code: workout.code,
      title: workout.title,
      mode: profile.mode,
      completedAt: new Date().toISOString(),
      readiness,
      sets: draft,
      newPrs: prLabels,
    };

    setState((current) => ({
      ...current,
      history: { ...current.history, [todayKey]: record },
      prs: newPrs,
      activeSession: null,
    }));
    setSummary({ sets: completedSets, prs: prLabels.length });
    setSessionStarted(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `localset-backup-${todayKey}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Backup exported.");
  }

  async function importData(file: File) {
    try {
      const parsed = safeState(JSON.parse(await file.text()));
      if (!parsed) throw new Error("Invalid backup");
      applyState(parsed);
      setNotice("Backup restored.");
    } catch {
      setNotice("That file is not a valid LocalSet backup.");
    }
  }

  async function resetData() {
    const scope = cloudUser ? "this device and your synced account" : "this device";
    if (!window.confirm(`Erase this profile, workout history, goals, and PRs from ${scope}?`)) return;
    if (cloudUser) {
      cloudReadyRef.current = false;
      const result = await deleteRemoteWorkoutState();
      if (!result.ok) {
        cloudReadyRef.current = true;
        setNotice("Cloud data could not be erased, so no data was removed.");
        return;
      }
      cloudRevisionRef.current = null;
      cloudBaseRef.current = EMPTY_STATE;
      cloudReadyRef.current = true;
      setCloudStatus("synced");
    }
    applyState(EMPTY_STATE);
    setTab("today");
    setSummary(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_LOCALFIT_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_FORM_DAILY_STORAGE_KEY);
    window.localStorage.removeItem(SYNC_META_KEY);
    window.localStorage.removeItem(LEGACY_LOCALFIT_SYNC_META_KEY);
    window.localStorage.removeItem(LEGACY_FORM_DAILY_SYNC_META_KEY);
  }

  if (!hydrated) {
    return (
      <main className="loading-screen">
        <AppMark />
        <p>Preparing today&apos;s plan</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <Onboarding
        onSubmit={createProfile}
        cloudStatus={cloudStatus}
        cloudUser={cloudUser}
        lastSyncedAt={lastSyncedAt}
        passwordRecovery={passwordRecovery}
        submitCloudAccount={submitCloudAccount}
        sendPasswordReset={sendPasswordReset}
        finishPasswordReset={finishPasswordReset}
        disconnectCloud={disconnectCloud}
        manualCloudSync={manualCloudSync}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => setTab("today")} aria-label="Go to today">
          <AppMark />
          <span>LocalSet</span>
        </button>
        <button className="mode-chip" onClick={() => setTab("settings")}>
          <span className="status-dot" />
          {profile.mode === "gym" ? "Full Gym" : "Body + DB"}
        </button>
      </header>

      <main className="app-main">
        {tab === "today" && (
          <TodayView
            profile={profile}
            workout={workout}
            scheduledWorkout={scheduledWorkout}
            completed={completedToday}
            state={state}
            streak={streak}
            readiness={readiness}
            setReadiness={changeReadiness}
            sessionStarted={sessionStarted}
            setSessionStarted={setSessionStarted}
            draft={draft}
            expanded={expanded}
            setExpanded={setExpanded}
            toggleSet={toggleSet}
            updateSet={updateSet}
            finishSession={finishSession}
            summary={summary}
            onPrint={() => window.print()}
          />
        )}

        {tab === "plan" && (
          <PlanView
            profile={profile}
            state={state}
            week={week}
            scheduledWorkout={scheduledWorkout}
            updateProfile={updateProfile}
            onPrint={() => window.print()}
          />
        )}

        {tab === "progress" && (
          <ProgressView
            profile={profile}
            state={state}
            streak={streak}
            bestStreak={bestStreak}
            weeklyComplete={weeklyComplete}
            recentDays={recentDays}
            prList={prList}
            updateProfile={updateProfile}
          />
        )}

        {tab === "settings" && (
          <SettingsView
            profile={profile}
            updateProfile={updateProfile}
            exportData={exportData}
            importRef={importRef}
            importData={importData}
            resetData={resetData}
            cloudStatus={cloudStatus}
            cloudUser={cloudUser}
            lastSyncedAt={lastSyncedAt}
            passwordRecovery={passwordRecovery}
            submitCloudAccount={submitCloudAccount}
            sendPasswordReset={sendPasswordReset}
            finishPasswordReset={finishPasswordReset}
            disconnectCloud={disconnectCloud}
            manualCloudSync={manualCloudSync}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {([
          ["today", "01", "Today"],
          ["plan", "02", "Plan"],
          ["progress", "03", "Progress"],
          ["settings", "04", "Settings"],
        ] as const).map(([value, number, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => {
              setTab(value);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-current={tab === value ? "page" : undefined}
          >
            <span>{number}</span>
            {label}
          </button>
        ))}
      </nav>

      <PrintCard profile={profile} workout={workout} readiness={readiness} />
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

type AccountActions = {
  cloudStatus: CloudStatus;
  cloudUser: CloudUser | null;
  lastSyncedAt?: string | null;
  passwordRecovery: boolean;
  submitCloudAccount: (mode: "signin" | "signup", email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  finishPasswordReset: (password: string) => Promise<void>;
  disconnectCloud: () => Promise<void>;
  manualCloudSync: () => Promise<void>;
};

function AccountPanel(props: AccountActions) {
  const {
    cloudStatus,
    cloudUser,
    lastSyncedAt,
    passwordRecovery,
    submitCloudAccount,
    sendPasswordReset,
    finishPasswordReset,
    disconnectCloud,
    manualCloudSync,
  } = props;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const busy = cloudStatus === "checking" || cloudStatus === "syncing";
  const statusCopy: Record<CloudStatus, string> = {
    disabled: "Local-only on this deployment",
    checking: "Checking account",
    "signed-out": "Local-only until you sign in",
    syncing: "Syncing securely",
    synced: "Up to date across devices",
    offline: "Offline — local save is active",
    conflict: "Another device changed your data",
    error: "Cloud sync needs attention",
  };

  if (!cloudSyncConfigured) {
    return (
      <section className="settings-card data-card">
        <div className="section-heading"><span>OPTIONAL ACCOUNT</span><h2>Local-first privacy</h2></div>
        <p>Your profile, active workout, history, goals, and PRs stay in this browser. Export a backup before clearing Safari data.</p>
      </section>
    );
  }

  if (cloudUser) {
    return (
      <section className="settings-card data-card">
        <div className="section-heading"><span>PRIVATE SYNC</span><h2>{statusCopy[cloudStatus]}</h2></div>
        <p>Signed in as <strong>{cloudUser.email || "your private account"}</strong>. Local storage remains the offline copy.</p>
        {lastSyncedAt && <p>Last synced {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(lastSyncedAt))}.</p>}
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => void manualCloudSync()} disabled={busy}>Sync now <span>↻</span></button>
          <button className="secondary-button" type="button" onClick={() => void disconnectCloud()} disabled={busy}>Sign out</button>
        </div>
        {passwordRecovery && (
          <div>
            <label>New password<input className="text-input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} /></label>
            <button className="primary-button" type="button" onClick={() => void finishPasswordReset(newPassword)} disabled={busy}>Update password</button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="settings-card data-card">
      <div className="section-heading"><span>OPTIONAL ACCOUNT</span><h2>{mode === "signin" ? "Continue on another device" : "Turn on private sync"}</h2></div>
      <p>{statusCopy[cloudStatus]}. Email/password is used only to keep your workout data in your own row.</p>
      <div className="mode-toggle" aria-label="Account action">
        <button type="button" className={mode === "signin" ? "active" : ""} aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>Sign in</button>
        <button type="button" className={mode === "signup" ? "active" : ""} aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>Create account</button>
      </div>
      <label>Email<input className="text-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitCloudAccount(mode, email, password); } }} autoComplete="email" /></label>
      <label>Password<input className="text-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void submitCloudAccount(mode, email, password); } }} autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={6} /></label>
      <div className="button-row">
        <button className="primary-button" type="button" onClick={() => void submitCloudAccount(mode, email, password)} disabled={busy}>{busy ? "Working…" : mode === "signin" ? "Sign in and sync" : "Create private account"}</button>
        <button className="secondary-button" type="button" onClick={() => void sendPasswordReset(email)} disabled={busy}>Reset password</button>
      </div>
    </section>
  );
}

function Onboarding({ onSubmit, ...account }: { onSubmit: (data: FormData) => void } & AccountActions) {
  const [mode, setMode] = useState<TrainingMode>("home");
  const [days, setDays] = useState<3 | 4 | 5>(3);

  return (
    <main className="onboarding">
      <div className="onboarding-rail">
        <div className="onboarding-brand"><AppMark /><span>LocalSet</span></div>
        <div className="onboarding-statement">
          <p className="eyebrow">A practice, not a punishment.</p>
          <h1>Show up.<br />Move well.<br />Log it.</h1>
          <p>One clear daily plan built around push, pull, squat, and recovery.</p>
        </div>
        <div className="onboarding-proof">
          <span><b>2 RIR</b> normal target</span>
          <span><b>3-5</b> planned days</span>
          <span><b>{account.cloudUser ? "Synced" : "Local"}</b> private data</span>
        </div>
      </div>

      <form action={onSubmit} className="onboarding-form">
        <div className="form-heading">
          <span>SETUP · 60 SECONDS</span>
          <h2>Make it yours.</h2>
          <p>You can change every choice later.</p>
        </div>

        <label className="field-label" htmlFor="name">What should we call you?</label>
        <input className="text-input" id="name" name="name" placeholder="Your name" autoComplete="given-name" maxLength={30} />

        <fieldset>
          <legend>Where are you training?</legend>
          <div className="choice-grid">
            <label className={`choice-card ${mode === "home" ? "selected" : ""}`}>
              <input type="radio" name="mode" value="home" checked={mode === "home"} onChange={() => setMode("home")} />
              <span className="choice-number">01</span>
              <strong>Body + dumbbells</strong>
              <small>Home, dorm, or anywhere</small>
            </label>
            <label className={`choice-card ${mode === "gym" ? "selected" : ""}`}>
              <input type="radio" name="mode" value="gym" checked={mode === "gym"} onChange={() => setMode("gym")} />
              <span className="choice-number">02</span>
              <strong>Full Gym</strong>
              <small>Free weights, machines, and cardio options</small>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Planned days each week</legend>
          <div className="segment-control">
            {([3, 4, 5] as const).map((value) => (
              <label key={value} className={days === value ? "selected" : ""}>
                <input type="radio" name="days" value={value} checked={days === value} onChange={() => setDays(value)} />
                <strong>{value}</strong><span>{value === 5 ? "3 strength + 2 recovery" : "strength days"}</span>
              </label>
            ))}
          </div>
          {days === 5 && <p className="privacy-note">Strength on Mon / Wed / Fri; low-fatigue recovery and technique on Tue / Thu.</p>}
        </fieldset>

        <label className="field-label" htmlFor="goal">Primary goal</label>
        <select className="text-input" id="goal" name="goal" defaultValue="consistency">
          <option value="consistency">Build the habit</option>
          <option value="strength">Get stronger</option>
          <option value="movement">Move better</option>
        </select>

        <button className="primary-button wide" type="submit">Build my first day <span>→</span></button>
        <p className="privacy-note">{account.cloudUser ? "Signed in: local progress also syncs to your private account." : "Your workout history stays in this browser unless you choose private sync."}</p>
        <AccountPanel {...account} />
      </form>
    </main>
  );
}

type TodayProps = {
  profile: Profile;
  workout: WorkoutTemplate;
  scheduledWorkout: WorkoutTemplate;
  completed?: SessionRecord;
  state: AppState;
  streak: number;
  readiness: Readiness;
  setReadiness: (value: Readiness) => void;
  sessionStarted: boolean;
  setSessionStarted: (value: boolean) => void;
  draft: Record<string, SetLog[]>;
  expanded: string | null;
  setExpanded: (value: string | null) => void;
  toggleSet: (exerciseId: string, index: number, repTarget: string) => void;
  updateSet: (exerciseId: string, index: number, patch: Partial<SetLog>) => void;
  finishSession: () => void;
  summary: { sets: number; prs: number } | null;
  onPrint: () => void;
};

function TodayView(props: TodayProps) {
  const {
    profile,
    workout,
    scheduledWorkout,
    completed,
    streak,
    readiness,
    setReadiness,
    sessionStarted,
    setSessionStarted,
    draft,
    expanded,
    setExpanded,
    toggleSet,
    updateSet,
    finishSession,
    summary,
    onPrint,
  } = props;
  const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  const completedSets = Object.values(draft).flat().filter((set) => set.done).length;
  const totalSets = Object.values(draft).flat().length;

  if (completed) {
    return (
      <section className="view today-view">
        <div className="page-intro compact">
          <div><p className="eyebrow">{dateLabel}</p><h1>Day held.</h1></div>
          <div className="streak-lockup"><b>{streak}</b><span>day<br />streak</span></div>
        </div>
        <div className="completion-card">
          <span className="completion-index">✓</span>
          <p>{completed.readiness === "recovery" || completed.code === "R" ? "RECOVERY COMPLETE" : "SESSION COMPLETE"}</p>
          <h2>{completed.title}</h2>
          <div className="completion-stats">
            <span><b>{summary?.sets ?? Object.values(completed.sets).flat().filter((set) => set.done).length}</b> sets logged</span>
            <span><b>{summary?.prs ?? completed.newPrs.length}</b> new PRs</span>
            <span><b>{streak}</b> day streak</span>
          </div>
          {completed.newPrs.length > 0 && (
            <div className="pr-ribbon"><span>NEW</span>{completed.newPrs.join(" · ")}</div>
          )}
        </div>
        <div className="quote-block">
          <p>Consistency beats complexity.</p>
          <span>Come back tomorrow. Recovery counts too.</span>
        </div>
        <button className="secondary-button" onClick={onPrint}>Print today&apos;s completed plan</button>
      </section>
    );
  }

  return (
    <section className="view today-view">
      <div className="page-intro">
        <div>
          <p className="eyebrow">{dateLabel}</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},<br />{profile.name}.</h1>
        </div>
        <div className="streak-lockup"><b>{streak}</b><span>day<br />streak</span></div>
      </div>

      <div className="readiness-panel">
        <div className="section-heading inline">
          <div><span>READINESS CHECK</span><h2>How are you showing up?</h2></div>
          <p>Quality sets the dose.</p>
        </div>
        <div className="readiness-options">
          {(Object.keys(READINESS_COPY) as Readiness[]).map((value) => (
            <button key={value} className={readiness === value ? "active" : ""} aria-pressed={readiness === value} onClick={() => setReadiness(value)} disabled={sessionStarted}>
              <span className="radio-dot" /><strong>{READINESS_COPY[value].label}</strong><small>{READINESS_COPY[value].note}</small>
            </button>
          ))}
        </div>
      </div>

      {scheduledWorkout.code === "R" && readiness !== "recovery" && (
        <div className="plan-note"><span>RECOVERY IS THE PLAN</span>Today is intentionally easy. Move gently if it helps, or take full rest when that is what you need.</div>
      )}

      <article className="workout-hero">
        <div className="workout-index">{workout.code === "R" ? "R" : `0${workout.code.charCodeAt(0) - 64}`}</div>
        <div className="workout-copy">
          <p>{workout.eyebrow}</p>
          <h2>{workout.title}</h2>
          <span>{workout.duration} · {readiness === "lighter" ? "Reduced volume" : workout.moves.length + " movements"}</span>
          <blockquote>{workout.intent}</blockquote>
        </div>
        <div className="workout-actions">
          <button className="primary-button" onClick={() => setSessionStarted(!sessionStarted)}>
            {sessionStarted ? "Pause session" : "Start session"}<span>{sessionStarted ? "Ⅱ" : "→"}</span>
          </button>
          {profile.mode === "gym" && <button className="text-button" onClick={onPrint}>Print pre-gym card ↗</button>}
        </div>
      </article>

      {sessionStarted && (
        <div className="session-progress" aria-live="polite">
          <div><span style={{ width: `${totalSets ? (completedSets / totalSets) * 100 : 0}%` }} /></div>
          <p>{completedSets} of {totalSets} sets logged</p>
        </div>
      )}

      <div className="exercise-list">
        {workout.moves.map((move, moveIndex) => {
          const exercise = EXERCISES[move.exerciseId];
          const logging = getMoveLogging(move);
          const unitCopy = LOG_UNIT_COPY[logging.unit];
          const primaryHeading = `${unitCopy.heading}${logging.perSide ? " / side" : ""}`;
          const isExpanded = expanded === exercise.id;
          const sets = draft[exercise.id] || [];
          const completedForMove = sets.filter((set) => set.done).length;
          return (
            <article className={`exercise-card ${completedForMove === sets.length && sets.length ? "complete" : ""}`} key={exercise.id}>
              <button className="exercise-summary" onClick={() => setExpanded(isExpanded ? null : exercise.id)} aria-expanded={isExpanded}>
                <span className="exercise-number">{String(moveIndex + 1).padStart(2, "0")}</span>
                <span className="exercise-title"><small>{exercise.pattern} · {exercise.equipment}</small><strong>{exercise.name}</strong><em>{move.sets} × {move.reps} · {move.rest}</em></span>
                <span className="exercise-status">{sets.length ? `${completedForMove}/${sets.length}` : "+"}</span>
              </button>

              {sessionStarted && (
                <div className="set-table">
                  <div className="set-head"><span>Set</span><span>{primaryHeading}</span><span>{logging.loadLoggable ? "Load lb" : "Load —"}</span><span>RIR</span><span>Done</span></div>
                  {sets.map((set, setIndex) => (
                    <div className={`set-row ${set.done ? "done" : ""}`} key={setIndex}>
                      <b>{setIndex + 1}</b>
                      <input aria-label={`${exercise.name} set ${setIndex + 1} ${unitCopy.aria}${logging.perSide ? " per side" : ""}`} inputMode="decimal" value={set.reps} placeholder={parseFirstNumber(move.reps)} onChange={(event) => updateSet(exercise.id, setIndex, { reps: event.target.value })} />
                      {logging.loadLoggable
                        ? <input aria-label={`${exercise.name} set ${setIndex + 1} load in pounds`} inputMode="decimal" value={set.load} placeholder="—" onChange={(event) => updateSet(exercise.id, setIndex, { load: event.target.value })} />
                        : <span aria-label={`${exercise.name} does not use a load entry`}>—</span>}
                      <select aria-label={`${exercise.name} set ${setIndex + 1} clean reps left`} value={set.rir} onChange={(event) => updateSet(exercise.id, setIndex, { rir: event.target.value })}>
                        <option value="">—</option><option value="4+">4+</option><option value="3">3</option><option value="2">2</option><option value="1">1</option><option value="0">0</option>
                      </select>
                      <button aria-label={`${set.done ? "Undo" : "Complete"} ${exercise.name} set ${setIndex + 1}`} onClick={() => toggleSet(exercise.id, setIndex, move.reps)}>{set.done ? "✓" : "○"}</button>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && (
                <div className={`form-drawer${exercise.illustration ? "" : " form-drawer-text-only"}`}>
                  <FormFigure src={exercise.illustration} name={exercise.name} />
                  <div>
                    <p>{exercise.summary}</p>
                    <ol>{exercise.cues.map((cue) => <li key={cue}>{cue}</li>)}</ol>
                    <div className="avoid"><span>WATCH FOR</span>{exercise.avoid}</div>
                    <div className="progression"><span>NEXT STEP</span>{exercise.progression}</div>
                    {exercise.sourceNote && <small className="source-note">{exercise.sourceNote}</small>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {sessionStarted && (
        <div className="finish-dock">
          <div><span>{completedSets}/{totalSets}</span><p>You can finish a partial session. Honest logs beat perfect logs.</p></div>
          <button className="primary-button" onClick={finishSession}>{workout.code === "R" && completedSets === 0 ? "Log recovery / rest" : "Finish day"} <span>✓</span></button>
        </div>
      )}

      <div className="intensity-card">
        <div className="intensity-number">02</div>
        <div><span>DEFAULT INTENSITY</span><h3>Leave two clean reps.</h3><p>End the set when the next rep would change your position or tempo. Hard is useful; failure is optional.</p></div>
        <div className="rir-scale" aria-label="Reps in reserve scale"><span>4+</span><span>3</span><b>2</b><span>1</span><span>0</span><small>clean reps left</small></div>
      </div>

      <p className="safety-strip">General fitness education, not medical advice. Stop for chest pressure, lightheadedness, confusion, unusual shortness of breath, or a fast or irregular heartbeat. Seek appropriate medical help.</p>
    </section>
  );
}

type PlanProps = {
  profile: Profile;
  state: AppState;
  week: { date: Date; key: string; scheduled: boolean; kind: ScheduleKind; complete: boolean }[];
  scheduledWorkout: WorkoutTemplate;
  updateProfile: (patch: Partial<Profile>) => void;
  onPrint: () => void;
};

function PlanView({ profile, week, scheduledWorkout, updateProfile, onPrint }: PlanProps) {
  const plans = getWorkoutsForMode(profile.mode);
  return (
    <section className="view">
      <div className="page-intro compact"><div><p className="eyebrow">YOUR ROTATION</p><h1>Simple enough<br />to repeat.</h1></div><p className="intro-aside">{profile.daysPerWeek === 5 ? "Strength runs Mon / Wed / Fri; Tue / Thu are scheduled low-fatigue recovery and technique days." : "Every strength day trains the whole body, with a different push / pull / squat emphasis."}</p></div>

      <div className="week-strip">
        {week.map((day) => (
          <div key={day.key} title={day.kind === "strength" ? "Strength day" : day.kind === "recovery" ? "Recovery and technique day" : "Unscheduled day"} className={`${day.complete ? "complete" : ""} ${day.key === localDateKey() ? "today" : ""}`}>
            <span>{new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(day.date)}</span>
            <b>{day.date.getDate()}</b>
            <i>{day.complete ? "✓" : day.kind === "strength" ? "S" : day.kind === "recovery" ? "R" : "–"}</i>
          </div>
        ))}
      </div>

      <div className="mode-switch-card">
        <div><span>TRAINING MODE</span><h2>{profile.mode === "gym" ? "Full Gym" : "Bodyweight + dumbbells"}</h2><p>Switching keeps your history and goals intact.</p></div>
        <div className="mode-toggle">
          <button className={profile.mode === "home" ? "active" : ""} aria-pressed={profile.mode === "home"} onClick={() => updateProfile({ mode: "home" })}>Body + DB</button>
          <button className={profile.mode === "gym" ? "active" : ""} aria-pressed={profile.mode === "gym"} onClick={() => updateProfile({ mode: "gym" })}>Full Gym</button>
        </div>
        <button className="secondary-button" onClick={onPrint}>Print today&apos;s card</button>
      </div>

      <div className="plan-stack">
        {plans.map((plan) => (
          <article key={plan.code} className={scheduledWorkout.code === plan.code ? "current" : ""}>
            <div className="plan-code">{plan.code}</div>
            <div className="plan-main"><span>{plan.eyebrow}</span><h2>{plan.title}</h2><p>{plan.intent}</p></div>
            <div className="plan-moves">
              {plan.moves.map((move) => <span key={move.exerciseId}><b>{EXERCISES[move.exerciseId].name}</b>{move.sets} × {move.reps}</span>)}
            </div>
            {scheduledWorkout.code === plan.code && <em>TODAY</em>}
          </article>
        ))}
      </div>

      <div className="recovery-explainer"><span>R</span><div><h3>Recovery is part of the rotation.</h3><p>{profile.daysPerWeek === 5 ? "Tuesday and Thursday are planned low-fatigue days. Easy walking, mobility, or technique are options; full rest is valid when you need it." : "On non-lifting days, full rest is valid. Choose an easy walk, mobility, or technique only when it helps you feel better."}</p></div></div>
    </section>
  );
}

type ProgressProps = {
  profile: Profile;
  state: AppState;
  streak: number;
  bestStreak: number;
  weeklyComplete: number;
  recentDays: { key: string; complete: boolean }[];
  prList: PersonalRecord[];
  updateProfile: (patch: Partial<Profile>) => void;
};

function ProgressView({ profile, state, streak, bestStreak, weeklyComplete, recentDays, prList, updateProfile }: ProgressProps) {
  const sessions = Object.keys(state.history).length;
  const pushPr = state.prs["floor-push-up:reps"]?.value || state.prs["incline-push-up:reps"]?.value || 0;
  const weeklyPercent = Math.min(100, Math.round((weeklyComplete / profile.daysPerWeek) * 100));
  const pushPercent = Math.min(100, Math.round((pushPr / profile.pushGoal) * 100));

  return (
    <section className="view">
      <div className="page-intro compact"><div><p className="eyebrow">YOUR PROOF</p><h1>Quiet work,<br />made visible.</h1></div><p className="intro-aside">PRs track clean reps, controlled hold time, or load—not form breakdown.</p></div>

      <div className="metric-grid">
        <article className="metric primary"><span>CURRENT STREAK</span><b>{streak}</b><p>days</p></article>
        <article className="metric"><span>BEST STREAK</span><b>{bestStreak}</b><p>days</p></article>
        <article className="metric"><span>SESSIONS</span><b>{sessions}</b><p>logged</p></article>
      </div>

      <article className="activity-card">
        <div className="section-heading inline"><div><span>LAST 28 DAYS</span><h2>Show-up map</h2></div><p>{recentDays.filter((day) => day.complete).length} days held</p></div>
        <div className="activity-grid">{recentDays.map((day) => <span key={day.key} className={day.complete ? "active" : ""} role="img" aria-label={`${day.key}: ${day.complete ? "workout completed" : "not completed"}`} title={`${day.key}${day.complete ? ": completed" : ""}`} />)}</div>
        <small>Every completed plan counts—including recovery.</small>
      </article>

      <div className="progress-columns">
        <article className="goals-card">
          <div className="section-heading"><span>GOALS</span><h2>{GOAL_LABELS[profile.goal]}</h2></div>
          <div className="goal-row"><div><b>{weeklyComplete} / {profile.daysPerWeek}</b><span>plans this week</span></div><div className="goal-track"><span style={{ width: `${weeklyPercent}%` }} /></div><em>{weeklyPercent}%</em></div>
          <div className="goal-row"><div><b>{pushPr} / {profile.pushGoal}</b><span>best push-up reps</span></div><div className="goal-track"><span style={{ width: `${pushPercent}%` }} /></div><em>{pushPercent}%</em></div>
          <label className="mini-field">Push-up target <input type="number" min="1" max="200" value={profile.pushGoal} onChange={(event) => updateProfile({ pushGoal: Math.max(1, Number(event.target.value) || 1) })} /></label>
        </article>

        <article className="pr-card">
          <div className="section-heading"><span>PERSONAL RECORDS</span><h2>Current bests</h2></div>
          {prList.length ? (
            <div className="pr-list">{prList.slice(0, 8).map((pr) => <div key={`${pr.exerciseId}:${pr.unit}`}><span>{pr.label}<small>{pr.date}</small></span><b>{pr.value}<em>{pr.unit === "lb" ? "lb" : LOG_UNIT_COPY[pr.unit].short}</em></b></div>)}</div>
          ) : (
            <div className="empty-state"><b>—</b><p>Log eligible reps, hold time, or weight during a session and your first PRs will appear here.</p></div>
          )}
        </article>
      </div>
    </section>
  );
}

type SettingsProps = {
  profile: Profile;
  updateProfile: (patch: Partial<Profile>) => void;
  exportData: () => void;
  importRef: React.RefObject<HTMLInputElement | null>;
  importData: (file: File) => void;
  resetData: () => void | Promise<void>;
} & AccountActions;

function SettingsView(props: SettingsProps) {
  const {
    profile,
    updateProfile,
    exportData,
    importRef,
    importData,
    resetData,
    cloudUser,
  } = props;
  return (
    <section className="view settings-view">
      <div className="page-intro compact"><div><p className="eyebrow">PREFERENCES</p><h1>Your practice,<br />your rules.</h1></div><p className="intro-aside">{cloudUser ? "Saved locally first, then synced to your private account for cross-device use." : "Saved locally on this device unless you choose private account sync."}</p></div>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="section-heading"><span>PROFILE</span><h2>Training setup</h2></div>
          <label>Name<input className="text-input" value={profile.name} onChange={(event) => updateProfile({ name: event.target.value })} maxLength={30} /></label>
          <label>Primary goal<select className="text-input" value={profile.goal} onChange={(event) => updateProfile({ goal: event.target.value as Profile["goal"] })}><option value="consistency">Build the habit</option><option value="strength">Get stronger</option><option value="movement">Move better</option></select></label>
          <label>Planned days each week<select className="text-input" value={profile.daysPerWeek} onChange={(event) => updateProfile({ daysPerWeek: Number(event.target.value) as 3 | 4 | 5 })}><option value="3">3 strength · Mon / Wed / Fri</option><option value="4">4 strength · Mon / Tue / Thu / Sat</option><option value="5">5 planned · 3 strength + 2 recovery</option></select></label>
          <div className="settings-mode"><span>Training mode</span><div className="mode-toggle"><button className={profile.mode === "home" ? "active" : ""} aria-pressed={profile.mode === "home"} onClick={() => updateProfile({ mode: "home" })}>Body + DB</button><button className={profile.mode === "gym" ? "active" : ""} aria-pressed={profile.mode === "gym"} onClick={() => updateProfile({ mode: "gym" })}>Full Gym</button></div></div>
        </section>

        <section className="settings-card install-card">
          <div className="section-heading"><span>IPHONE 16 PRO</span><h2>Add it like an app</h2></div>
          <ol>
            <li><b>1</b><span>Open your deployed site in <strong>Safari</strong>.</span></li>
            <li><b>2</b><span>Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span></li>
            <li><b>3</b><span>Confirm the name and tap <strong>Add</strong>. It opens full-screen and works offline after the first visit.</span></li>
          </ol>
          <p>Keep Safari data enabled so your local workout history remains available.</p>
        </section>

        <AccountPanel {...props} />

        <section className="settings-card data-card">
          <div className="section-heading"><span>YOUR DATA</span><h2>{cloudUser ? "Synced and portable" : "Local and portable"}</h2></div>
          <p>{cloudUser ? "Automatic sync is on; exports remain a useful personal backup." : "Export a small backup before clearing Safari data or moving to another phone."}</p>
          <div className="button-row"><button className="primary-button" onClick={exportData}>Export backup <span>↓</span></button><button className="secondary-button" onClick={() => importRef.current?.click()}>Restore backup</button></div>
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importData(file); event.target.value = ""; }} />
          <button className="danger-button" onClick={() => void resetData()}>Erase all {cloudUser ? "local + synced" : "local"} data</button>
        </section>

        <section className="settings-card about-card">
          <div className="about-copy">
            <div className="section-heading"><span>ABOUT LOCALSET</span><h2>Local by design.</h2></div>
            <p>Built by Thomas Joubran and released under the MIT License.</p>
          </div>
          <a className="creator-link" href="https://www.tjoubran.com" target="_blank" rel="noopener noreferrer">
            <span><b>Thomas Joubran</b><small>Visit tjoubran.com<span className="visually-hidden"> (opens in a new tab)</span></small></span>
            <b aria-hidden="true">↗</b>
          </a>
        </section>

        <section className="settings-card sources-card">
          <div className="section-heading"><span>METHOD + SOURCES</span><h2>What this is built on</h2></div>
          <p>Exercise form is grounded in the supplied calisthenics playbook. Consistency ideas come from NACD; actual workout effort guidance comes from resistance-training sources, because NACD&apos;s “intensity” scale is about child development—not workout RPE.</p>
          <div className="source-list">{SOURCE_LINKS.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer"><span>{source.label}</span><small>{source.note}</small><b>↗</b></a>)}</div>
        </section>
      </div>

      <div className="medical-note"><b>Before you train</b><p>This app provides general fitness education, not diagnosis or medical care. Start with small amounts and build gradually. If you have a medical condition, recent procedure, injury, or concerning symptoms, ask a qualified healthcare professional what is appropriate for you.</p></div>
    </section>
  );
}

function PrintCard({ profile, workout, readiness }: { profile: Profile; workout: WorkoutTemplate; readiness: Readiness }) {
  return (
    <section className="print-card">
      <header><div><AppMark /><b>LocalSet</b></div><span>{localDateKey()} · {profile.name}</span></header>
      <div className="print-title"><span>{workout.eyebrow}</span><h1>{workout.title}</h1><p>{workout.intent}</p></div>
      <table><thead><tr><th>#</th><th>Movement</th><th>Work</th><th>Rest</th><th>Log</th></tr></thead><tbody>{workout.moves.map((move, index) => <tr key={move.exerciseId}><td>{String(index + 1).padStart(2, "0")}</td><td><b>{EXERCISES[move.exerciseId].name}</b><small>{move.rir}</small></td><td>{readiness === "lighter" ? Math.max(1, move.sets - 1) : move.sets} × {move.reps}</td><td>{move.rest}</td><td>________</td></tr>)}</tbody></table>
      <footer><span>Leave about 2 clean reps on normal working sets.</span><span>form / load / reps / repeat</span></footer>
    </section>
  );
}
