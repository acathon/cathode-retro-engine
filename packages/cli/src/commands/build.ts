import exportCommand from './export.js';

/** `cathode build`: the web build, the same as `cathode export web`. */
export default async function buildCommand() {
  await exportCommand('web');
}
