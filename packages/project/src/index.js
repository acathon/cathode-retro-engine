/**
 * The Cathode project format: what a game is, in one file.
 *
 * Every game has a `cathode.json` at its root. The Studio writes it, `cathode
 * new` creates it, every example carries one, and the build and ship tooling
 * read it. It is the one place a game's name, screen, controls and store
 * identity live, so none of those has to be guessed from its code.
 *
 * This is plain JavaScript on purpose. The same validator has to load in a
 * browser (the Studio), in Node scripts with no build step (the site build,
 * CI on Node 20, which cannot strip TypeScript), and in the CLI. Types live
 * beside it in index.d.ts.
 *
 * Reference: docs/project-format.md.
 */

/** The format version this code reads and writes. */
export const FORMAT = 1;

/**
 * Screen sizes of the hardware presets.
 *
 * These mirror the `EngineConfig` constructors in crates/core/src/config.rs,
 * and a test fails if the two disagree.
 */
export const PROFILES = Object.freeze({
  nes: Object.freeze({ width: 256, height: 240 }),
  gameboy: Object.freeze({ width: 160, height: 144 }),
  neogeo: Object.freeze({ width: 320, height: 224 }),
  dos: Object.freeze({ width: 320, height: 200 }),
});

export const ORIENTATIONS = Object.freeze(['landscape', 'portrait', 'any']);
export const INPUTS = Object.freeze(['keyboard', 'touch', 'mouse', 'gamepad']);

const FIELDS = new Set([
  'format', 'name', 'title', 'version', 'description', 'id',
  'screen', 'orientation', 'input', 'icon', 'credits',
]);

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Store version strings: numeric MAJOR.MINOR.PATCH. iOS rejects anything else.
const VERSION = /^\d+\.\d+\.\d+$/;
// An ID both stores accept: Android forbids hyphens, iOS forbids underscores,
// and Android requires every segment to start with a letter.
const APP_ID = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/;
const URL_PATTERN = /^https?:\/\/\S+$/;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function checkScreen(screen, errors) {
  if (!isObject(screen)) {
    errors.push('screen is required: either { "profile": "nes" } or { "width": 320, "height": 240 }.');
    return;
  }
  const hasProfile = 'profile' in screen;
  const hasSize = 'width' in screen || 'height' in screen;
  if (hasProfile && hasSize) {
    errors.push('screen takes a profile or a width and height, not both.');
    return;
  }
  if (hasProfile) {
    if (!Object.hasOwn(PROFILES, screen.profile)) {
      errors.push(`screen.profile "${screen.profile}" is not one of: ${Object.keys(PROFILES).join(', ')}.`);
    }
    for (const key of Object.keys(screen)) {
      if (key !== 'profile') errors.push(`screen has an unknown field "${key}".`);
    }
    return;
  }
  for (const axis of ['width', 'height']) {
    const n = screen[axis];
    if (!Number.isInteger(n) || n < 16 || n > 4096) {
      errors.push(`screen.${axis} must be a whole number of pixels from 16 to 4096.`);
    }
  }
  for (const key of Object.keys(screen)) {
    if (key !== 'width' && key !== 'height') errors.push(`screen has an unknown field "${key}".`);
  }
}

function checkCredits(credits, errors) {
  if (!Array.isArray(credits)) {
    errors.push('credits must be a list.');
    return;
  }
  credits.forEach((c, i) => {
    if (!isObject(c)) {
      errors.push(`credits[${i}] must be an object with "what" and "who".`);
      return;
    }
    if (!isText(c.what, 120)) errors.push(`credits[${i}].what is required: what was made, e.g. "Card art".`);
    if (!isText(c.who, 120)) errors.push(`credits[${i}].who is required: who made it.`);
    if (c.license !== undefined && !isText(c.license, 120)) errors.push(`credits[${i}].license must be text.`);
    if (c.url !== undefined && !(typeof c.url === 'string' && URL_PATTERN.test(c.url))) {
      errors.push(`credits[${i}].url must be an http(s) link.`);
    }
    for (const key of Object.keys(c)) {
      if (!['what', 'who', 'license', 'url'].includes(key)) errors.push(`credits[${i}] has an unknown field "${key}".`);
    }
  });
}

/**
 * Every problem with a project, as sentences that name the field.
 *
 * An empty list means the project is valid. Unknown fields are errors rather
 * than ignored, so a misspelt "titel" is caught instead of silently dropped.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function validateProject(value) {
  const errors = [];
  if (!isObject(value)) return ['A project must be a JSON object.'];

  if (value.format === undefined) {
    errors.push(`format is required. Use ${FORMAT}.`);
  } else if (value.format !== FORMAT) {
    errors.push(Number.isInteger(value.format) && value.format > FORMAT
      ? `format ${value.format} is newer than this version of Cathode understands (${FORMAT}).`
      : `format must be ${FORMAT}.`);
  }

  if (typeof value.name !== 'string' || !NAME.test(value.name)) {
    errors.push('name must be lowercase letters, digits and hyphens, starting with a letter or digit, at most 64 characters — e.g. "my-game".');
  }
  if (!isText(value.title, 80)) errors.push('title is required: the name players see, at most 80 characters.');
  if (typeof value.version !== 'string' || !VERSION.test(value.version)) {
    errors.push('version is required as MAJOR.MINOR.PATCH, numbers only — e.g. "1.0.0". The app stores accept nothing else.');
  } else {
    // Android also needs the version as one rising whole number, made as
    // MAJOR * 1,000,000 + MINOR * 1,000 + PATCH, and caps it at 2.1 billion.
    const [major, minor, patch] = value.version.split('.').map(Number);
    if (minor > 999 || patch > 999 || major > 2099) {
      errors.push('version must keep MINOR and PATCH at most 999, and MAJOR at most 2099, so Android can number it.');
    }
  }
  if (value.description !== undefined && !isText(value.description, 500)) {
    errors.push('description must be text of at most 500 characters.');
  }
  if (value.id !== undefined && !(typeof value.id === 'string' && APP_ID.test(value.id))) {
    errors.push('id must work as both an Android application ID and an iOS bundle ID: at least two dot-separated parts of letters and digits, each starting with a letter — e.g. "com.example.mygame".');
  }

  checkScreen(value.screen, errors);

  if (value.orientation !== undefined && !ORIENTATIONS.includes(value.orientation)) {
    errors.push(`orientation must be one of: ${ORIENTATIONS.join(', ')}.`);
  }

  if (!Array.isArray(value.input) || value.input.length === 0) {
    errors.push(`input is required: the controls the game supports, from ${INPUTS.join(', ')}.`);
  } else {
    for (const kind of value.input) {
      if (!INPUTS.includes(kind)) errors.push(`input "${kind}" is not one of: ${INPUTS.join(', ')}.`);
    }
    if (new Set(value.input).size !== value.input.length) errors.push('input lists a control twice.');
  }

  if (value.icon !== undefined) {
    const icon = value.icon;
    const parts = typeof icon === 'string' ? icon.split('/') : [];
    if (typeof icon !== 'string' || !icon.endsWith('.png') || icon.startsWith('/') || parts.includes('..')) {
      errors.push('icon must be a .png path inside the project, e.g. "assets/icon.png".');
    }
  }

  if (value.credits !== undefined) checkCredits(value.credits, errors);

  for (const key of Object.keys(value)) {
    if (!FIELDS.has(key)) errors.push(`Unknown field "${key}".`);
  }
  return errors;
}

/**
 * Parse a cathode.json, filling in defaults.
 *
 * @param {string} text
 * @returns {{ project: import('./index.js').Project | null, errors: string[] }}
 */
export function parseProject(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { project: null, errors: [`Not valid JSON: ${error.message}`] };
  }
  const errors = validateProject(value);
  if (errors.length) return { project: null, errors };
  return { project: { orientation: 'landscape', ...value }, errors: [] };
}

/**
 * The game's screen in pixels, whether it names a preset or its own size.
 *
 * @param {{ screen: { profile?: string, width?: number, height?: number } }} project
 * @returns {{ width: number, height: number }}
 */
export function screenSize(project) {
  const { screen } = project;
  if (screen.profile) return { ...PROFILES[screen.profile] };
  return { width: screen.width, height: screen.height };
}
