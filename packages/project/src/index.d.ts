/** Types for the Cathode project format. See index.js and docs/project-format.md. */

export declare const FORMAT: 1;

export type ProfileName = 'nes' | 'gameboy' | 'neogeo' | 'dos';
export type Orientation = 'landscape' | 'portrait' | 'any';
export type InputKind = 'keyboard' | 'touch' | 'mouse' | 'gamepad';

export interface ScreenSize {
  width: number;
  height: number;
}

/** A hardware preset, or a size of the game's own choosing. */
export type Screen = { profile: ProfileName } | ScreenSize;

export interface Credit {
  /** What was made, e.g. "Card art". */
  what: string;
  /** Who made it. */
  who: string;
  license?: string;
  url?: string;
}

/** The contents of a cathode.json. */
export interface Project {
  format: 1;
  /** Folder and package name: lowercase letters, digits and hyphens. */
  name: string;
  /** The name players see. */
  title: string;
  /** MAJOR.MINOR.PATCH, numbers only — the form both app stores require. */
  version: string;
  description?: string;
  /** Store identity, valid as an Android application ID and an iOS bundle ID. */
  id?: string;
  screen: Screen;
  /** Defaults to "landscape" when parsed. */
  orientation?: Orientation;
  /** The controls the game actually supports. */
  input: InputKind[];
  /** A .png inside the project. */
  icon?: string;
  credits?: Credit[];
}

export declare const PROFILES: Readonly<Record<ProfileName, Readonly<ScreenSize>>>;
export declare const ORIENTATIONS: readonly Orientation[];
export declare const INPUTS: readonly InputKind[];

/** Every problem with a project, as sentences naming the field. Empty means valid. */
export declare function validateProject(value: unknown): string[];

/** Parse a cathode.json, filling in defaults. */
export declare function parseProject(
  text: string,
): { project: Project & { orientation: Orientation }; errors: [] } | { project: null; errors: string[] };

/** The game's screen in pixels. */
export declare function screenSize(project: Pick<Project, 'screen'>): ScreenSize;
