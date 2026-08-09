export type TrainingMode = "home" | "gym";
export type SessionCode = "A" | "B" | "C" | "R";

export type Exercise = {
  id: string;
  name: string;
  pattern: "Push" | "Pull" | "Squat" | "Hinge" | "Core" | "Carry" | "Recovery";
  equipment: string;
  summary: string;
  cues: string[];
  avoid: string;
  progression: string;
  illustration?: string;
  sourceNote?: string;
};

export type WorkoutLogMetric = "reps" | "duration" | "distance";
export type WorkoutLogUnit = "reps" | "seconds" | "minutes" | "meters" | "feet";

export type WorkoutLogging = {
  metric: WorkoutLogMetric;
  unit: WorkoutLogUnit;
  perSide?: boolean;
  loadLoggable: boolean;
  prEligible: boolean;
  loadPrEligible: boolean;
};

export type WorkoutMove = {
  exerciseId: string;
  sets: number;
  reps: string;
  rest: string;
  rir: string;
  logging: WorkoutLogging;
};

export type WorkoutTemplate = {
  code: SessionCode;
  title: string;
  eyebrow: string;
  duration: string;
  intent: string;
  moves: WorkoutMove[];
};

const BODYWEIGHT_REPS_LOGGING: WorkoutLogging = {
  metric: "reps",
  unit: "reps",
  loadLoggable: false,
  prEligible: true,
  loadPrEligible: false,
};

const LOADED_REPS_LOGGING: WorkoutLogging = {
  metric: "reps",
  unit: "reps",
  loadLoggable: true,
  prEligible: true,
  loadPrEligible: true,
};

const BODYWEIGHT_REPS_PER_SIDE_LOGGING: WorkoutLogging = {
  ...BODYWEIGHT_REPS_LOGGING,
  perSide: true,
};

const LOADED_REPS_PER_SIDE_LOGGING: WorkoutLogging = {
  ...LOADED_REPS_LOGGING,
  perSide: true,
};

const TIMED_HOLD_PER_SIDE_LOGGING: WorkoutLogging = {
  metric: "duration",
  unit: "seconds",
  perSide: true,
  loadLoggable: false,
  prEligible: true,
  loadPrEligible: false,
};

const TIMED_CARRY_PER_SIDE_LOGGING: WorkoutLogging = {
  metric: "duration",
  unit: "seconds",
  perSide: true,
  loadLoggable: true,
  // A carry PR needs load and duration/distance context; neither maximum is safe in isolation.
  prEligible: false,
  loadPrEligible: false,
};

const RECOVERY_MINUTES_LOGGING: WorkoutLogging = {
  metric: "duration",
  unit: "minutes",
  loadLoggable: false,
  prEligible: false,
  loadPrEligible: false,
};

const PRACTICE_REPS_LOGGING: WorkoutLogging = {
  metric: "reps",
  unit: "reps",
  loadLoggable: false,
  prEligible: false,
  loadPrEligible: false,
};

export const EXERCISES: Record<string, Exercise> = {
  "incline-push-up": {
    id: "incline-push-up",
    name: "Incline push-up",
    pattern: "Push",
    equipment: "Stable bench, counter, or rail",
    summary: "Use a higher surface to make every rep clean and repeatable.",
    cues: [
      "Hands just outside shoulder width; grip the surface firmly.",
      "Brace glutes and abs so head, ribs, hips, and heels move as one line.",
      "Lower the chest between the hands with elbows angled back, then push the surface away.",
    ],
    avoid: "Do not let the hips sag, shrug toward the ears, or lead with the chin.",
    progression: "Reach 3 x 12 with two clean reps left, then choose a slightly lower surface.",
    illustration: "/form/incline-push-up.webp",
    sourceNote: "Form and regression logic paraphrased from the supplied playbook, pp. 14-24.",
  },
  "floor-push-up": {
    id: "floor-push-up",
    name: "Floor push-up",
    pattern: "Push",
    equipment: "Floor",
    summary: "A full-body press: stiff plank, controlled descent, strong lockout.",
    cues: [
      "Set hands just outside shoulder width and spread the fingers.",
      "Keep ribs down and squeeze the glutes before the first rep.",
      "Bring the chest close to the floor; finish by pushing tall without losing the plank.",
    ],
    avoid: "Stop the set when the hips sag, the head reaches, or the shoulders roll forward.",
    progression: "Add reps to 3 x 15, then use a slower lowering phase or feet elevation.",
    illustration: "/form/push-up.webp",
    sourceNote: "Form and progression logic paraphrased from the supplied playbook, pp. 20-24.",
  },
  "pike-push-up": {
    id: "pike-push-up",
    name: "Pike push-up",
    pattern: "Push",
    equipment: "Floor",
    summary: "A bodyweight overhead press that shifts more work toward the shoulders.",
    cues: [
      "Start with hips high and knees softly bent if hamstrings limit the position.",
      "Lower the crown of the head forward of the hands, making a small tripod.",
      "Press the floor away and return the hips to the same high position.",
    ],
    avoid: "Do not turn it into a shallow push-up or flare the elbows straight sideways.",
    progression: "Build to 3 x 10, then elevate the feet on a stable surface.",
    illustration: "/form/pike-push-up.webp",
  },
  "one-arm-db-row": {
    id: "one-arm-db-row",
    name: "One-arm dumbbell row",
    pattern: "Pull",
    equipment: "One dumbbell + stable support",
    summary: "A dependable pull when a pull-up bar is not available.",
    cues: [
      "Brace on a stable surface and keep the spine long from head to tailbone.",
      "Let the shoulder blade reach, then pull the elbow toward the back pocket.",
      "Pause briefly at the top without rotating the torso.",
    ],
    avoid: "Do not yank the weight, shrug, or twist open to manufacture range.",
    progression: "First add reps, then add the smallest available weight while keeping the pause.",
    illustration: "/form/dumbbell-row.webp",
    sourceNote: "Row setup and elbow-path guidance adapted from the supplied playbook, pp. 56-58.",
  },
  "supported-row": {
    id: "supported-row",
    name: "Supported row",
    pattern: "Pull",
    equipment: "Weight machine or dumbbell",
    summary: "Choose a supported pulling station, or use a one-arm dumbbell row.",
    cues: [
      "Set the support so the shoulders can reach forward without rounding the low back.",
      "Pull elbows toward the ribs and keep the shoulders away from the ears.",
      "Return under control until the arms are long again.",
    ],
    avoid: "Do not bounce off the support or shorten the return to move more weight.",
    progression: "Add reps through the range, then make the smallest load increase available.",
    illustration: "/form/dumbbell-row.webp",
  },
  "machine-pull-or-pullover": {
    id: "machine-pull-or-pullover",
    name: "Vertical pull / pullover",
    pattern: "Pull",
    equipment: "Available pulling machine or one dumbbell",
    summary: "Use a vertical-pull machine if present; otherwise perform a floor dumbbell pullover.",
    cues: [
      "Keep ribs stacked over the pelvis instead of leaning farther back each rep.",
      "Start the pull by bringing the shoulders down, then drive elbows toward the ribs.",
      "Use the longest pain-free range you can control.",
    ],
    avoid: "Do not pull behind the neck or turn the movement into a full-body swing.",
    progression: "Own the full range before increasing the machine pin or dumbbell load.",
  },
  "floor-db-pullover": {
    id: "floor-db-pullover",
    name: "Floor dumbbell pullover",
    pattern: "Pull",
    equipment: "One dumbbell + floor",
    summary: "A floor-based option for training the lats without a bar or machine.",
    cues: [
      "Lie down with knees bent and hold one dumbbell securely over the chest.",
      "Keep ribs down as the arms travel back; stop before the low back arches.",
      "Pull the weight back over the chest with nearly straight arms.",
    ],
    avoid: "Do not chase depth by flaring the ribs or loosen your grip over the face.",
    progression: "Increase the pain-free range first, then reps, then load.",
  },
  "goblet-squat": {
    id: "goblet-squat",
    name: "Goblet squat",
    pattern: "Squat",
    equipment: "One dumbbell",
    summary: "A loaded squat that reinforces balance, depth, and whole-foot pressure.",
    cues: [
      "Choose a comfortable stance and keep heel, big toe, and little toe planted.",
      "Brace, then sit down between the hips while knees track with the toes.",
      "Drive the floor away and finish tall without leaning back.",
    ],
    avoid: "Do not let the arches collapse or sacrifice a neutral, controlled position for depth.",
    progression: "Reach 3 x 15 with clean tempo, then add load or use a split-squat variation.",
    illustration: "/form/goblet-squat.webp",
    sourceNote: "Squat position and fatigue standards paraphrased from the supplied playbook, pp. 80-83.",
  },
  "bodyweight-squat": {
    id: "bodyweight-squat",
    name: "Bodyweight squat",
    pattern: "Squat",
    equipment: "Floor",
    summary: "Practice the squat pattern with repeatable depth and balance.",
    cues: [
      "Use a stance that lets the knees follow the direction of the toes.",
      "Keep the whole foot heavy as you sit down between the hips.",
      "Stand by driving evenly through both feet and squeezing the glutes.",
    ],
    avoid: "Do not bounce into a depth you cannot control or allow the knees to collapse inward.",
    progression: "Add a slow three-second descent, then move to a goblet squat.",
    illustration: "/form/squat.webp",
    sourceNote: "Squat form paraphrased from the supplied playbook, pp. 80-83.",
  },
  "split-squat": {
    id: "split-squat",
    name: "Split squat",
    pattern: "Squat",
    equipment: "Bodyweight or dumbbells",
    summary: "Build single-leg strength without needing a large load.",
    cues: [
      "Set feet on two tracks, not a tightrope, and keep the front foot fully planted.",
      "Lower mostly straight down while the front knee tracks over the toes.",
      "Push through the front foot and finish with the pelvis level.",
    ],
    avoid: "Do not wobble on a narrow stance or push off the back foot to escape the hard range.",
    progression: "Add reps, then hold dumbbells, then elevate the rear foot on a stable surface.",
    illustration: "/form/split-squat.webp",
    sourceNote: "Split-squat standards paraphrased from the supplied playbook, pp. 88-91.",
  },
  "reverse-lunge": {
    id: "reverse-lunge",
    name: "Reverse lunge",
    pattern: "Squat",
    equipment: "Bodyweight or dumbbells",
    summary: "A step-back lunge option that some people find easier to control while training one leg at a time.",
    cues: [
      "Step back far enough that the front heel stays grounded.",
      "Lower under control with the front knee following the toes.",
      "Drive through the front foot to return without rushing the balance.",
    ],
    avoid: "Do not slam the back knee down or let the front arch and knee collapse inward.",
    progression: "Build stable reps first, then add light dumbbells.",
  },
  "db-rdl": {
    id: "db-rdl",
    name: "Dumbbell Romanian deadlift",
    pattern: "Hinge",
    equipment: "One or two dumbbells",
    summary: "Train hamstrings and glutes by moving at the hips, not the low back.",
    cues: [
      "Keep a soft knee bend, brace, and push the hips straight back.",
      "Slide the weights close to the legs while keeping a long spine.",
      "Stop when the hamstrings are loaded, then stand by driving the hips forward.",
    ],
    avoid: "Do not squat the weight down, round to reach lower, or lean back at the top.",
    progression: "Add range only while the spine stays steady; then add reps and load.",
    illustration: "/form/dumbbell-rdl.webp",
  },
  "glute-bridge": {
    id: "glute-bridge",
    name: "Glute bridge",
    pattern: "Hinge",
    equipment: "Floor; dumbbell optional",
    summary: "A low-complexity hinge accessory for glutes and trunk control.",
    cues: [
      "Set feet flat and close enough that the shins are nearly vertical at the top.",
      "Exhale, tuck the ribs, and drive through the whole foot.",
      "Pause with glutes tight without arching the low back.",
    ],
    avoid: "Do not push through the toes or chase height by flaring the ribs.",
    progression: "Add pauses, then a dumbbell across the hips, then single-leg reps.",
  },
  "hamstring-machine": {
    id: "hamstring-machine",
    name: "Hamstring machine / bridge",
    pattern: "Hinge",
    equipment: "Available weight machine or floor",
    summary: "Use a hamstring-focused machine if present; otherwise perform glute bridges.",
    cues: [
      "Align the machine pivot and pads as shown on its placard before loading it.",
      "Keep the pelvis heavy and move through a smooth, pain-free range.",
      "Pause the squeeze, then control the return.",
    ],
    avoid: "Do not use a machine you cannot adjust correctly or lift the stack with momentum.",
    progression: "Add clean reps, then the smallest load increment available.",
  },
  "db-overhead-press": {
    id: "db-overhead-press",
    name: "Dumbbell overhead press",
    pattern: "Push",
    equipment: "One or two dumbbells",
    summary: "A scalable overhead press for the full-gym plan.",
    cues: [
      "Stack ribs over pelvis and start with forearms close to vertical.",
      "Press up and slightly back so the weights finish over the shoulders.",
      "Lower with control to the deepest comfortable position.",
    ],
    avoid: "Do not turn the rep into a standing backbend or force a painful shoulder range.",
    progression: "Complete the top of the rep range, then use the smallest load increase.",
  },
  "chest-press-or-push-up": {
    id: "chest-press-or-push-up",
    name: "Chest press / push-up",
    pattern: "Push",
    equipment: "Available weight machine, dumbbells, or floor",
    summary: "Choose the press that fits the equipment available and keeps the shoulder comfortable.",
    cues: [
      "Set handles or hands so the forearms are close to vertical at the bottom.",
      "Keep shoulder blades controlled and wrists stacked over elbows.",
      "Press smoothly; stop with one or two clean reps still available.",
    ],
    avoid: "Do not bounce out of the bottom or chase load with a shortened, painful range.",
    progression: "Add reps first, then a small load increase or harder push-up angle.",
  },
  "dead-bug": {
    id: "dead-bug",
    name: "Dead bug",
    pattern: "Core",
    equipment: "Floor",
    summary: "Teach the trunk to stay steady while the arms and legs move.",
    cues: [
      "Exhale until the ribs settle and gently press the low back toward the floor.",
      "Reach the opposite arm and leg only as far as the trunk stays still.",
      "Move slowly and reset the breath between sides.",
    ],
    avoid: "Do not extend farther once the low back lifts or the ribs flare.",
    progression: "Increase reach, then pause each extension, then hold a light dumbbell.",
  },
  "side-plank": {
    id: "side-plank",
    name: "Side plank",
    pattern: "Core",
    equipment: "Floor",
    summary: "Build lateral trunk strength with a clean shoulder-to-ankle line.",
    cues: [
      "Place the elbow under the shoulder and press the forearm firmly down.",
      "Lift the hips and keep head, ribs, pelvis, and feet stacked.",
      "Breathe behind the brace instead of holding the breath.",
    ],
    avoid: "Do not hang from the shoulder or let the hips rotate toward the floor.",
    progression: "Add seconds, then reach the top arm, then use a long-lever variation.",
  },
  "suitcase-carry": {
    id: "suitcase-carry",
    name: "Suitcase carry",
    pattern: "Carry",
    equipment: "One dumbbell + clear walking lane",
    summary: "Train grip and trunk stability by walking tall with an uneven load.",
    cues: [
      "Choose a clear route and hold the weight at one side without leaning.",
      "Walk quietly with ribs stacked and the free arm relaxed.",
      "Turn carefully, switch hands, and match the distance.",
    ],
    avoid: "Do not rush turns, drag the weight into the leg, or use a crowded lane.",
    progression: "Add distance, then load, while the torso stays level.",
  },
  "easy-walk": {
    id: "easy-walk",
    name: "Easy walk",
    pattern: "Recovery",
    equipment: "Treadmill, indoor track, or outdoors",
    summary: "Keep the daily rhythm without turning recovery into another hard workout.",
    cues: [
      "Use a pace where conversation stays comfortable.",
      "Let the shoulders relax and use an easy, natural stride.",
      "Finish feeling better than when you started.",
    ],
    avoid: "Do not turn a recovery day into a time trial.",
    progression: "Add five minutes only when the walk continues to feel restorative.",
  },
  "mobility-flow": {
    id: "mobility-flow",
    name: "Five-minute mobility flow",
    pattern: "Recovery",
    equipment: "Floor",
    summary: "Move gently through the joints and ranges that feel useful today.",
    cues: [
      "Use slow neck turns, shoulder circles, cat-cow, hip shifts, and ankle rocks.",
      "Stay in an easy, pain-free range and breathe normally.",
      "Spend extra time where you feel stiff, not sharp pain.",
    ],
    avoid: "Do not force end range, bounce, or stretch through numbness or pain.",
    progression: "Consistency is the progression; keep the flow easy.",
  },
  "skill-practice": {
    id: "skill-practice",
    name: "Form practice",
    pattern: "Recovery",
    equipment: "Floor or wall",
    summary: "Rehearse one easy push, pull, or squat variation with perfect control.",
    cues: [
      "Choose a version that feels much easier than normal training.",
      "Perform five slow reps, review one cue, then repeat.",
      "Finish while every repetition still looks the same.",
    ],
    avoid: "Do not chase fatigue or turn practice into a max-rep test.",
    progression: "Better positions and smoother reps are the only goal today.",
  },
};

const sharedA: WorkoutMove[] = [
  { exerciseId: "incline-push-up", sets: 3, reps: "6-12", rest: "75 sec", rir: "2 clean reps left", logging: BODYWEIGHT_REPS_LOGGING },
  { exerciseId: "one-arm-db-row", sets: 3, reps: "8-12 / side", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_PER_SIDE_LOGGING },
  { exerciseId: "goblet-squat", sets: 3, reps: "8-15", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
  { exerciseId: "db-rdl", sets: 2, reps: "8-12", rest: "90 sec", rir: "2-3 clean reps left", logging: LOADED_REPS_LOGGING },
  { exerciseId: "dead-bug", sets: 2, reps: "6-8 / side", rest: "45 sec", rir: "Perfect control", logging: BODYWEIGHT_REPS_PER_SIDE_LOGGING },
];

export const HOME_WORKOUTS: WorkoutTemplate[] = [
  {
    code: "A",
    title: "Push / Squat",
    eyebrow: "Session A · Foundation",
    duration: "35-45 min",
    intent: "Own the plank, the whole foot, and every controlled rep.",
    moves: sharedA,
  },
  {
    code: "B",
    title: "Pull / Hinge",
    eyebrow: "Session B · Back + posterior chain",
    duration: "35-45 min",
    intent: "Pull without twisting, hinge without borrowing from the low back.",
    moves: [
      { exerciseId: "one-arm-db-row", sets: 3, reps: "8-12 / side", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_PER_SIDE_LOGGING },
      { exerciseId: "pike-push-up", sets: 3, reps: "5-10", rest: "90 sec", rir: "2 clean reps left", logging: BODYWEIGHT_REPS_LOGGING },
      { exerciseId: "reverse-lunge", sets: 3, reps: "8-12 / side", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_PER_SIDE_LOGGING },
      { exerciseId: "glute-bridge", sets: 3, reps: "10-20", rest: "60 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "side-plank", sets: 2, reps: "20-40 sec / side", rest: "45 sec", rir: "Crisp position", logging: TIMED_HOLD_PER_SIDE_LOGGING },
    ],
  },
  {
    code: "C",
    title: "Squat / Full body",
    eyebrow: "Session C · Unilateral control",
    duration: "35-45 min",
    intent: "Balance the week with single-leg work and another clean push-pull dose.",
    moves: [
      { exerciseId: "split-squat", sets: 3, reps: "8-12 / side", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_PER_SIDE_LOGGING },
      { exerciseId: "floor-push-up", sets: 3, reps: "6-15", rest: "75 sec", rir: "2 clean reps left", logging: BODYWEIGHT_REPS_LOGGING },
      { exerciseId: "db-rdl", sets: 3, reps: "8-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "floor-db-pullover", sets: 3, reps: "8-15", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "dead-bug", sets: 2, reps: "6-8 / side", rest: "45 sec", rir: "Perfect control", logging: BODYWEIGHT_REPS_PER_SIDE_LOGGING },
    ],
  },
];

export const GYM_WORKOUTS: WorkoutTemplate[] = [
  {
    code: "A",
    title: "Push / Squat",
    eyebrow: "Session A · Full gym",
    duration: "40-50 min",
    intent: "Use free weights or a machine where useful; keep the movement standards strict.",
    moves: [
      { exerciseId: "chest-press-or-push-up", sets: 3, reps: "6-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "supported-row", sets: 3, reps: "8-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "goblet-squat", sets: 3, reps: "8-15", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "db-rdl", sets: 3, reps: "8-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "dead-bug", sets: 2, reps: "6-8 / side", rest: "45 sec", rir: "Perfect control", logging: BODYWEIGHT_REPS_PER_SIDE_LOGGING },
    ],
  },
  {
    code: "B",
    title: "Pull / Hinge",
    eyebrow: "Session B · Full gym",
    duration: "40-50 min",
    intent: "Make the pull and hinge the stars; stop before technique becomes a negotiation.",
    moves: [
      { exerciseId: "machine-pull-or-pullover", sets: 3, reps: "6-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "db-overhead-press", sets: 3, reps: "6-10", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "reverse-lunge", sets: 3, reps: "8-12 / side", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_PER_SIDE_LOGGING },
      { exerciseId: "hamstring-machine", sets: 3, reps: "10-15", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "side-plank", sets: 2, reps: "20-40 sec / side", rest: "45 sec", rir: "Crisp position", logging: TIMED_HOLD_PER_SIDE_LOGGING },
    ],
  },
  {
    code: "C",
    title: "Squat / Full body",
    eyebrow: "Session C · Full gym",
    duration: "40-50 min",
    intent: "Train every major pattern, then leave with a little capacity in reserve.",
    moves: [
      { exerciseId: "split-squat", sets: 3, reps: "8-12 / side", rest: "75 sec", rir: "2 clean reps left", logging: LOADED_REPS_PER_SIDE_LOGGING },
      { exerciseId: "floor-push-up", sets: 3, reps: "6-15", rest: "75 sec", rir: "2 clean reps left", logging: BODYWEIGHT_REPS_LOGGING },
      { exerciseId: "supported-row", sets: 3, reps: "8-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "db-rdl", sets: 3, reps: "8-12", rest: "90 sec", rir: "2 clean reps left", logging: LOADED_REPS_LOGGING },
      { exerciseId: "suitcase-carry", sets: 3, reps: "30-45 sec / side", rest: "60 sec", rir: "Tall posture", logging: TIMED_CARRY_PER_SIDE_LOGGING },
    ],
  },
];

export const RECOVERY_WORKOUT: WorkoutTemplate = {
  code: "R",
  title: "Restore / Practice",
  eyebrow: "Recovery day · Rest is valid",
  duration: "0-30 min",
  intent: "Consistency includes recovery. Choose only what helps today; full rest is a valid plan.",
  moves: [
    { exerciseId: "easy-walk", sets: 1, reps: "15-25 min", rest: "—", rir: "Conversational pace", logging: RECOVERY_MINUTES_LOGGING },
    { exerciseId: "mobility-flow", sets: 1, reps: "5 min", rest: "—", rir: "Easy range", logging: RECOVERY_MINUTES_LOGGING },
    { exerciseId: "skill-practice", sets: 2, reps: "5 slow reps", rest: "45 sec", rir: "4+ clean reps left", logging: PRACTICE_REPS_LOGGING },
  ],
};

export const SOURCE_LINKS = [
  {
    label: "NACD · The Importance of Consistency",
    href: "https://www.nacd.org/the-importance-of-consistency/",
    note: "Used for the consistency and quality-over-fatigue mindset, not exercise prescription.",
  },
  {
    label: "NACD · Intensity: Get It – Got It – Good!",
    href: "https://www.nacd.org/intensity-get-it-got-it-good/",
    note: "Its child-development intensity scale is not workout RPE; the app uses reps-in-reserve instead.",
  },
  {
    label: "ACSM · Resistance Training Guidelines Update (2026)",
    href: "https://acsm.org/resistance-training-guidelines-update-2026/",
    note: "Supports simple, consistent resistance training and notes that failure is not required for most healthy adults.",
  },
  {
    label: "Full-gym equipment reference",
    href: "https://www.wpi.edu/student-experience/sports-recreation/sports-recreation-center",
    note: "The full-gym templates use its listed free weights, weight machines, cardio equipment, and indoor track as an equipment baseline.",
  },
];

export const getWorkoutsForMode = (mode: TrainingMode) =>
  mode === "gym" ? GYM_WORKOUTS : HOME_WORKOUTS;
