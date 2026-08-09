import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);
const fromRoot = (path) => new URL(path, projectRoot);
const workoutData = await import(fromRoot("app/workout-data.ts").href);

const templates = [
  ...workoutData.HOME_WORKOUTS.map((template) => ({ group: "home", template })),
  ...workoutData.GYM_WORKOUTS.map((template) => ({ group: "gym", template })),
  { group: "recovery", template: workoutData.RECOVERY_WORKOUT },
];

function moveLabel(group, template, move) {
  return `${group} session ${template.code}, ${move.exerciseId}`;
}

function assertTypedLogging(logging, label) {
  assert.ok(logging, `${label} must declare logging metadata`);
  assert.ok(["reps", "duration", "distance"].includes(logging.metric), `${label} has an unsupported metric`);
  assert.ok(["reps", "seconds", "minutes", "meters", "feet"].includes(logging.unit), `${label} has an unsupported unit`);
  assert.equal(typeof logging.loadLoggable, "boolean", `${label} must type loadLoggable`);
  assert.equal(typeof logging.prEligible, "boolean", `${label} must type prEligible`);
  assert.equal(typeof logging.loadPrEligible, "boolean", `${label} must type loadPrEligible`);
  if (logging.perSide !== undefined) assert.equal(typeof logging.perSide, "boolean", `${label} must type perSide`);

  if (logging.metric === "reps") assert.equal(logging.unit, "reps", `${label} rep logging must use reps`);
  if (logging.metric === "duration") assert.ok(["seconds", "minutes"].includes(logging.unit), `${label} duration logging needs a time unit`);
  if (logging.metric === "distance") assert.ok(["meters", "feet"].includes(logging.unit), `${label} distance logging needs a distance unit`);
  if (logging.loadPrEligible) {
    assert.equal(logging.loadLoggable, true, `${label} cannot award a load PR without logging load`);
    assert.equal(logging.prEligible, true, `${label} load PRs require the movement to be PR eligible`);
  }
}

test("every programmed move resolves to an exercise and declares coherent typed logging", () => {
  for (const { group, template } of templates) {
    assert.ok(template.moves.length > 0, `${group} session ${template.code} must include moves`);
    for (const move of template.moves) {
      const label = moveLabel(group, template, move);
      const exercise = workoutData.EXERCISES[move.exerciseId];
      assert.ok(exercise, `${label} does not resolve to EXERCISES`);
      assert.equal(exercise.id, move.exerciseId, `${label} resolves to a mismatched exercise id`);
      assertTypedLogging(move.logging, label);
    }
  }
});

test("recovery, walking, and mobility logs cannot create PRs", () => {
  const recoveryIds = new Set(workoutData.RECOVERY_WORKOUT.moves.map((move) => move.exerciseId));
  assert.ok(recoveryIds.has("easy-walk"));
  assert.ok(recoveryIds.has("mobility-flow"));

  for (const move of workoutData.RECOVERY_WORKOUT.moves) {
    assert.equal(move.logging.prEligible, false, `${move.exerciseId} must not create a metric PR`);
    assert.equal(move.logging.loadPrEligible, false, `${move.exerciseId} must not create a load PR`);
  }

  for (const exercise of Object.values(workoutData.EXERCISES).filter((item) => item.pattern === "Recovery")) {
    assert.ok(recoveryIds.has(exercise.id), `${exercise.id} must be explicitly programmed and tested in recovery`);
  }
});

test("timed side planks use seconds and carries avoid simplistic PRs", () => {
  const sidePlanks = templates.flatMap(({ template }) => template.moves).filter((move) => move.exerciseId === "side-plank");
  assert.ok(sidePlanks.length > 0, "expected side plank in at least one template");
  for (const move of sidePlanks) {
    assert.equal(move.logging.metric, "duration");
    assert.equal(move.logging.unit, "seconds");
    assert.equal(move.logging.perSide, true);
  }

  const carries = templates.flatMap(({ template }) => template.moves).filter((move) => move.exerciseId === "suitcase-carry");
  assert.ok(carries.length > 0, "expected suitcase carry in at least one template");
  for (const move of carries) {
    assert.equal(move.logging.metric, "duration");
    assert.equal(move.logging.unit, "seconds");
    assert.equal(move.logging.loadLoggable, true);
    assert.equal(move.logging.prEligible, false, "carry duration alone must not become a PR");
    assert.equal(move.logging.loadPrEligible, false, "carry load alone must not become a PR");
  }
});

test("every declared exercise illustration resolves to a packaged local asset", async () => {
  const illustrated = Object.values(workoutData.EXERCISES).filter((exercise) => exercise.illustration);
  assert.ok(illustrated.length > 0, "expected exercises with form illustrations");

  for (const exercise of illustrated) {
    assert.match(exercise.illustration, /^\/form\/[a-z0-9-]+\.webp$/, `${exercise.id} must use a local WebP form path`);
    await assert.doesNotReject(
      access(fromRoot(`public${exercise.illustration}`)),
      `${exercise.id} references a missing illustration: ${exercise.illustration}`,
    );
  }
});

test("user-facing source has no WPI phone policy or publisher email copy", async () => {
  const sources = await Promise.all([
    readFile(fromRoot("app/page.tsx"), "utf8"),
    readFile(fromRoot("app/workout-data.ts"), "utf8"),
    readFile(fromRoot("app/layout.tsx"), "utf8"),
  ]);
  const userFacingSource = sources.join("\n");

  assert.doesNotMatch(userFacingSource, /phone[- ]free|phone use (?:is|was) prohibited|fitness floor policy/i);
  assert.doesNotMatch(userFacingSource, /WPI[\s\S]{0,160}(?:phone[- ]free|phone use|fitness floor|prohibit)/i);
  assert.doesNotMatch(userFacingSource, /(?:phone[- ]free|phone use|fitness floor|prohibit)[\s\S]{0,160}WPI/i);
  assert.doesNotMatch(userFacingSource, /hello@thegravgear\.com|thegravgear\.com/i);
});
