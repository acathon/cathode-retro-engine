/* tslint:disable */
/* eslint-disable */

export class WebEngine {
    free(): void;
    [Symbol.dispose](): void;
    add_collider(id: bigint, ox: number, oy: number, w: number, h: number): void;
    audio_fill_mono(buf: Float32Array): void;
    audio_fill_stereo(buf: Float32Array): void;
    audio_play(ch: number, freq: number, waveform: number, vol: number): void;
    audio_set_envelope(ch: number, attack: number, decay: number, sustain: number, release: number): void;
    audio_set_envelope_preset(ch: number, preset: string): void;
    audio_stop(ch: number): void;
    audio_stop_all(): void;
    /**
     * Check what this game has actually used against a target's real limits.
     *
     * Returns JSON: the target's budgets, the peak this run reached, and
     * whether each fits. This is where hardware limits belong — a number you
     * can act on when choosing a platform, rather than a silent cap that
     * deletes sprites while you play.
     */
    check_target(name: string): string;
    clear_gravity(id: bigint): void;
    /**
     * Remove every tilemap.
     *
     * Committing a map pushes a new one, so without this a game that
     * rebuilds its level — a new stage, or returning to a menu — stacked the
     * old one underneath forever, and there was no way to unload a level at
     * all. Handles from before this call are stale.
     */
    clear_tilemaps(): void;
    create_emitter(max_particles: number): number;
    debug_draw_rect(x: number, y: number, w: number, h: number, r: number, g: number, b: number): void;
    destroy_emitter(handle: number): void;
    destroy_entity(id: bigint): void;
    /**
     * VGA mode 13h: 320x200 in 256 colours, at 70 Hz.
     */
    static dos(): WebEngine;
    draw_overlay_rect(r: number, g: number, b: number, a: number): void;
    /**
     * Queue a line of text for this frame.
     *
     * Games call this from their update callback, which runs *before* the
     * world is rendered — and rendering clears the framebuffer. Drawing
     * immediately therefore painted text that was wiped microseconds later,
     * every frame. Queued text is drawn after the world instead, which is
     * also where a HUD belongs.
     */
    draw_text(font_handle: number, text: string, x: number, y: number, scale: number): void;
    emitter_burst(handle: number, x: number, y: number, count: number, config_json: string): void;
    emitter_set_pos(handle: number, x: number, y: number): void;
    entity_count(): number;
    static gameboy(): WebEngine;
    get_camera_pos(): Float32Array;
    get_position(id: bigint): Float32Array;
    /**
     * Read an entity's velocity back. Physics zeroes an axis on impact, so a
     * game driven by the engine's physics needs this to tell whether it is
     * still moving (falling, or stopped against a wall).
     */
    get_velocity(id: bigint): Float32Array;
    load_tilemap(json: string): number;
    measure_text(font_handle: number, text: string, scale: number): number;
    static neogeo(): WebEngine;
    static nes(): WebEngine;
    constructor(config_json: string);
    particle_count(): number;
    /**
     * Most sprites drawn in any one frame so far.
     */
    peak_sprites(): number;
    poll_collisions(): any;
    poll_fired_timers(): Uint32Array;
    profile(): string;
    raycaster_add_billboard(id: number, x: number, y: number, texture: number, scale: number): void;
    /**
     * The raycast map cell at `(col, row)`; out of bounds reads as solid.
     */
    raycaster_cell(col: number, row: number): number;
    /**
     * A* across the current raycast map, from `(sx, sy)` to `(gx, gy)`.
     *
     * Returns the waypoints flattened as `[x0, y0, x1, y1, ...]`, already
     * reduced to corners, or an empty array when there is no route.
     */
    raycaster_find_path(sx: number, sy: number, gx: number, gy: number, diagonal: boolean): Int32Array;
    raycaster_get_pos(): Float32Array;
    /**
     * Fire a shot from `(x, y)` along `angle` and report what it hit.
     *
     * Returned flat so no object crosses the WASM boundary per bullet:
     * `[hitWall, wallDist, wallTile, hitBillboard, billboardId,
     *   billboardDist, endX, endY]`, with the boolean slots as 0 or 1.
     */
    raycaster_hitscan(x: number, y: number, angle: number, max_distance: number, radius: number, ignore: number): Float32Array;
    raycaster_init(map_json: string): void;
    /**
     * True when nothing solid stands between the two points.
     */
    raycaster_line_of_sight(x0: number, y0: number, x1: number, y1: number): boolean;
    raycaster_move(forward: number, strafe: number, turn: number): void;
    raycaster_remove_billboard(id: number): void;
    /**
     * Raise or lower one billboard between the floor and the ceiling.
     */
    raycaster_set_billboard_elevation(id: number, elevation: number): void;
    raycaster_set_ceiling_color(r: number, g: number, b: number): void;
    /**
     * Where the eye sits between floor (0.0) and ceiling (1.0). 0.5 stands.
     */
    raycaster_set_eye_height(height: number): void;
    raycaster_set_floor_color(r: number, g: number, b: number): void;
    raycaster_set_fog(dist: number, r: number, g: number, b: number): void;
    /**
     * Shear the horizon: positive pitch looks down, negative looks up.
     * Measured in framebuffer pixels.
     */
    raycaster_set_pitch(pitch: number): void;
    raycaster_set_pos(x: number, y: number, angle: number): void;
    raycaster_set_texture(wall_type: number, pixels: Uint8Array, size: number): void;
    /**
     * Slide a circular body through the raycast map, stopping at walls.
     * Returns the resolved `[x, y]`.
     */
    raycaster_slide(x: number, y: number, dx: number, dy: number, radius: number): Float32Array;
    raycaster_update_billboard(id: number, x: number, y: number): void;
    register_font(sheet_handle: number, char_w: number, char_h: number, cols: number, first_char: number): number;
    render_to_canvas(canvas: HTMLCanvasElement): void;
    reset_peak_sprites(): void;
    resolution_h(): number;
    resolution_w(): number;
    save_export(slot: number): string;
    save_get(slot: number, key: string): any;
    save_import(slot: number, json: string): void;
    save_remove(slot: number, key: string): void;
    save_set(slot: number, key: string, value_json: string): void;
    sequencer_load_mml(mml: string, bpm: number): void;
    sequencer_pause(): void;
    sequencer_play(): void;
    sequencer_set_bpm(bpm: number): void;
    sequencer_stop(): void;
    set_bg_color(r: number, g: number, b: number): void;
    /**
     * Place the camera's top-left corner directly.
     *
     * This goes through the smoothed camera rather than writing the
     * renderer's copy, which `tick` overwrites from it every frame anyway.
     * Routing it here is what lets `set_camera_bounds` apply to a game that
     * positions its own camera — before this, bounds silently did nothing
     * unless you also used `set_camera_target`.
     */
    set_camera(x: number, y: number): void;
    set_camera_bounds(x: number, y: number, w: number, h: number): void;
    set_camera_dead_zone(x: number, y: number, w: number, h: number): void;
    set_camera_lerp(speed: number): void;
    set_camera_target(x: number, y: number): void;
    set_camera_zoom(zoom: number): void;
    set_flip(id: bigint, flip_x: boolean, flip_y: boolean): void;
    set_frame(id: bigint, frame: number): void;
    /**
     * Opt an entity into gravity. `scale` multiplies the engine's base
     * gravity: 1.0 is a normal fall, 0.35 is floaty, 0.0 disables it.
     * Entities never fall unless this is called.
     */
    set_gravity(id: bigint, scale: number): void;
    set_input(player: number, state_json: string): void;
    set_position(id: bigint, x: number, y: number): void;
    /**
     * Switch the hardware *look* — palette, background and scanlines —
     * without rebuilding the engine. Accepts "nes", "gameboy", "neogeo",
     * "dos" or
     * "custom".
     *
     * The profile is a view setting, not a contract: build once, preview on
     * any of them, and pick a target when you export.
     */
    set_profile(name: string): void;
    set_scanlines(val: boolean): void;
    set_solid(id: bigint, solid: boolean): void;
    /**
     * Declare which tile ids on a layer act as walls, so the physics step
     * resolves bodies against them. Tilemap JSON can carry `solid_tiles`
     * directly; this is for changing it after the map is loaded.
     */
    set_tilemap_solid_tiles(map: number, layer: number, ids: Uint16Array): void;
    set_velocity(id: bigint, vx: number, vy: number): void;
    /**
     * Show or hide a sprite without destroying it.
     *
     * Before this existed, hiding meant moving the entity off-screen,
     * because an entity with a SpriteIndex was drawn unconditionally.
     */
    set_visible(id: bigint, visible: boolean): void;
    shake(intensity: number, duration: number): void;
    spawn_sprite(x: number, y: number, sheet: number, frame: number, layer: number): bigint;
    target_fps(): number;
    tick(timestamp: number): number;
    tick_count(): bigint;
    tilemap_count(): number;
    /**
     * Whether a tile cell is a wall on any layer. Cells outside the map read
     * as open.
     */
    tilemap_solid_at(map: number, col: number, row: number): boolean;
    timer_create(duration_secs: number, repeat: boolean): number;
    timer_progress(handle: number): number;
    timer_reset(handle: number): void;
    timer_start(handle: number): void;
    timer_stop(handle: number): void;
    tween_create(from: number, to: number, duration_secs: number, ease_id: number, repeat: boolean, yoyo: boolean): number;
    tween_destroy(handle: number): void;
    tween_is_complete(handle: number): boolean;
    tween_reset(handle: number): void;
    tween_value(handle: number): number;
    upload_sheet(w: number, h: number, tw: number, th: number, pixels: Uint8Array): number;
}

export function main_js(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_webengine_free: (a: number, b: number) => void;
    readonly webengine_add_collider: (a: number, b: bigint, c: number, d: number, e: number, f: number) => void;
    readonly webengine_audio_fill_mono: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_audio_fill_stereo: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_audio_play: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_audio_set_envelope: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly webengine_audio_set_envelope_preset: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_audio_stop: (a: number, b: number) => void;
    readonly webengine_audio_stop_all: (a: number) => void;
    readonly webengine_check_target: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_clear_gravity: (a: number, b: bigint) => void;
    readonly webengine_clear_tilemaps: (a: number) => void;
    readonly webengine_create_emitter: (a: number, b: number) => number;
    readonly webengine_debug_draw_rect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
    readonly webengine_destroy_emitter: (a: number, b: number) => void;
    readonly webengine_destroy_entity: (a: number, b: bigint) => void;
    readonly webengine_dos: () => number;
    readonly webengine_draw_overlay_rect: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_draw_text: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly webengine_emitter_burst: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly webengine_emitter_set_pos: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_entity_count: (a: number) => number;
    readonly webengine_gameboy: () => number;
    readonly webengine_get_camera_pos: (a: number) => number;
    readonly webengine_get_position: (a: number, b: bigint) => number;
    readonly webengine_get_velocity: (a: number, b: bigint) => number;
    readonly webengine_load_tilemap: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_measure_text: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly webengine_neogeo: () => number;
    readonly webengine_nes: () => number;
    readonly webengine_new: (a: number, b: number) => number;
    readonly webengine_particle_count: (a: number) => number;
    readonly webengine_peak_sprites: (a: number) => number;
    readonly webengine_poll_collisions: (a: number) => number;
    readonly webengine_poll_fired_timers: (a: number, b: number) => void;
    readonly webengine_profile: (a: number, b: number) => void;
    readonly webengine_raycaster_add_billboard: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly webengine_raycaster_cell: (a: number, b: number, c: number) => number;
    readonly webengine_raycaster_find_path: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly webengine_raycaster_get_pos: (a: number) => number;
    readonly webengine_raycaster_hitscan: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly webengine_raycaster_init: (a: number, b: number, c: number) => void;
    readonly webengine_raycaster_line_of_sight: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly webengine_raycaster_move: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_raycaster_remove_billboard: (a: number, b: number) => void;
    readonly webengine_raycaster_set_billboard_elevation: (a: number, b: number, c: number) => void;
    readonly webengine_raycaster_set_ceiling_color: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_raycaster_set_eye_height: (a: number, b: number) => void;
    readonly webengine_raycaster_set_floor_color: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_raycaster_set_fog: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_raycaster_set_pitch: (a: number, b: number) => void;
    readonly webengine_raycaster_set_pos: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_raycaster_set_texture: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_raycaster_slide: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly webengine_raycaster_update_billboard: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_register_font: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly webengine_render_to_canvas: (a: number, b: number, c: number) => void;
    readonly webengine_reset_peak_sprites: (a: number) => void;
    readonly webengine_resolution_h: (a: number) => number;
    readonly webengine_resolution_w: (a: number) => number;
    readonly webengine_save_export: (a: number, b: number, c: number) => void;
    readonly webengine_save_get: (a: number, b: number, c: number, d: number) => number;
    readonly webengine_save_import: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_save_remove: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_save_set: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly webengine_sequencer_load_mml: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_sequencer_pause: (a: number) => void;
    readonly webengine_sequencer_play: (a: number) => void;
    readonly webengine_sequencer_set_bpm: (a: number, b: number) => void;
    readonly webengine_sequencer_stop: (a: number) => void;
    readonly webengine_set_bg_color: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_set_camera: (a: number, b: number, c: number) => void;
    readonly webengine_set_camera_bounds: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_set_camera_dead_zone: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_set_camera_lerp: (a: number, b: number) => void;
    readonly webengine_set_camera_target: (a: number, b: number, c: number) => void;
    readonly webengine_set_camera_zoom: (a: number, b: number) => void;
    readonly webengine_set_flip: (a: number, b: bigint, c: number, d: number) => void;
    readonly webengine_set_frame: (a: number, b: bigint, c: number) => void;
    readonly webengine_set_gravity: (a: number, b: bigint, c: number) => void;
    readonly webengine_set_input: (a: number, b: number, c: number, d: number) => void;
    readonly webengine_set_position: (a: number, b: bigint, c: number, d: number) => void;
    readonly webengine_set_profile: (a: number, b: number, c: number) => void;
    readonly webengine_set_scanlines: (a: number, b: number) => void;
    readonly webengine_set_solid: (a: number, b: bigint, c: number) => void;
    readonly webengine_set_tilemap_solid_tiles: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly webengine_set_velocity: (a: number, b: bigint, c: number, d: number) => void;
    readonly webengine_set_visible: (a: number, b: bigint, c: number) => void;
    readonly webengine_shake: (a: number, b: number, c: number) => void;
    readonly webengine_spawn_sprite: (a: number, b: number, c: number, d: number, e: number, f: number) => bigint;
    readonly webengine_target_fps: (a: number) => number;
    readonly webengine_tick: (a: number, b: number) => number;
    readonly webengine_tick_count: (a: number) => bigint;
    readonly webengine_tilemap_count: (a: number) => number;
    readonly webengine_tilemap_solid_at: (a: number, b: number, c: number, d: number) => number;
    readonly webengine_timer_create: (a: number, b: number, c: number) => number;
    readonly webengine_timer_progress: (a: number, b: number) => number;
    readonly webengine_timer_reset: (a: number, b: number) => void;
    readonly webengine_timer_start: (a: number, b: number) => void;
    readonly webengine_timer_stop: (a: number, b: number) => void;
    readonly webengine_tween_create: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly webengine_tween_destroy: (a: number, b: number) => void;
    readonly webengine_tween_is_complete: (a: number, b: number) => number;
    readonly webengine_tween_reset: (a: number, b: number) => void;
    readonly webengine_tween_value: (a: number, b: number) => number;
    readonly webengine_upload_sheet: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly main_js: () => void;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number) => void;
    readonly __wbindgen_export3: (a: number, b: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
