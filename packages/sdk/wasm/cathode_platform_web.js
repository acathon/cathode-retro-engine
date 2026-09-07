/* @ts-self-types="./cathode_platform_web.d.ts" */

export class WebEngine {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WebEngine.prototype);
        obj.__wbg_ptr = ptr;
        WebEngineFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebEngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webengine_free(ptr, 0);
    }
    /**
     * @param {bigint} id
     * @param {number} ox
     * @param {number} oy
     * @param {number} w
     * @param {number} h
     */
    add_collider(id, ox, oy, w, h) {
        wasm.webengine_add_collider(this.__wbg_ptr, id, ox, oy, w, h);
    }
    /**
     * @param {Float32Array} buf
     */
    audio_fill_mono(buf) {
        var ptr0 = passArrayF32ToWasm0(buf, wasm.__wbindgen_export3);
        var len0 = WASM_VECTOR_LEN;
        wasm.webengine_audio_fill_mono(this.__wbg_ptr, ptr0, len0, addHeapObject(buf));
    }
    /**
     * @param {Float32Array} buf
     */
    audio_fill_stereo(buf) {
        var ptr0 = passArrayF32ToWasm0(buf, wasm.__wbindgen_export3);
        var len0 = WASM_VECTOR_LEN;
        wasm.webengine_audio_fill_stereo(this.__wbg_ptr, ptr0, len0, addHeapObject(buf));
    }
    /**
     * @param {number} ch
     * @param {number} freq
     * @param {number} waveform
     * @param {number} vol
     */
    audio_play(ch, freq, waveform, vol) {
        wasm.webengine_audio_play(this.__wbg_ptr, ch, freq, waveform, vol);
    }
    /**
     * @param {number} ch
     * @param {number} attack
     * @param {number} decay
     * @param {number} sustain
     * @param {number} release
     */
    audio_set_envelope(ch, attack, decay, sustain, release) {
        wasm.webengine_audio_set_envelope(this.__wbg_ptr, ch, attack, decay, sustain, release);
    }
    /**
     * @param {number} ch
     * @param {string} preset
     */
    audio_set_envelope_preset(ch, preset) {
        const ptr0 = passStringToWasm0(preset, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_audio_set_envelope_preset(this.__wbg_ptr, ch, ptr0, len0);
    }
    /**
     * @param {number} ch
     */
    audio_stop(ch) {
        wasm.webengine_audio_stop(this.__wbg_ptr, ch);
    }
    audio_stop_all() {
        wasm.webengine_audio_stop_all(this.__wbg_ptr);
    }
    /**
     * Check what this game has actually used against a target's real limits.
     *
     * Returns JSON: the target's budgets, the peak this run reached, and
     * whether each fits. This is where hardware limits belong — a number you
     * can act on when choosing a platform, rather than a silent cap that
     * deletes sprites while you play.
     * @param {string} name
     * @returns {string}
     */
    check_target(name) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(name, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
            const len0 = WASM_VECTOR_LEN;
            wasm.webengine_check_target(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @param {bigint} id
     */
    clear_gravity(id) {
        wasm.webengine_clear_gravity(this.__wbg_ptr, id);
    }
    /**
     * Remove every tilemap.
     *
     * Committing a map pushes a new one, so without this a game that
     * rebuilds its level — a new stage, or returning to a menu — stacked the
     * old one underneath forever, and there was no way to unload a level at
     * all. Handles from before this call are stale.
     */
    clear_tilemaps() {
        wasm.webengine_clear_tilemaps(this.__wbg_ptr);
    }
    /**
     * @param {number} max_particles
     * @returns {number}
     */
    create_emitter(max_particles) {
        const ret = wasm.webengine_create_emitter(this.__wbg_ptr, max_particles);
        return ret >>> 0;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    debug_draw_rect(x, y, w, h, r, g, b) {
        wasm.webengine_debug_draw_rect(this.__wbg_ptr, x, y, w, h, r, g, b);
    }
    /**
     * @param {number} handle
     */
    destroy_emitter(handle) {
        wasm.webengine_destroy_emitter(this.__wbg_ptr, handle);
    }
    /**
     * @param {bigint} id
     */
    destroy_entity(id) {
        wasm.webengine_destroy_entity(this.__wbg_ptr, id);
    }
    /**
     * VGA mode 13h: 320x200 in 256 colours, at 70 Hz.
     * @returns {WebEngine}
     */
    static dos() {
        const ret = wasm.webengine_dos();
        return WebEngine.__wrap(ret);
    }
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     * @param {number} a
     */
    draw_overlay_rect(r, g, b, a) {
        wasm.webengine_draw_overlay_rect(this.__wbg_ptr, r, g, b, a);
    }
    /**
     * Queue a line of text for this frame.
     *
     * Games call this from their update callback, which runs *before* the
     * world is rendered — and rendering clears the framebuffer. Drawing
     * immediately therefore painted text that was wiped microseconds later,
     * every frame. Queued text is drawn after the world instead, which is
     * also where a HUD belongs.
     * @param {number} font_handle
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {number} scale
     */
    draw_text(font_handle, text, x, y, scale) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_draw_text(this.__wbg_ptr, font_handle, ptr0, len0, x, y, scale);
    }
    /**
     * @param {number} handle
     * @param {number} x
     * @param {number} y
     * @param {number} count
     * @param {string} config_json
     */
    emitter_burst(handle, x, y, count, config_json) {
        const ptr0 = passStringToWasm0(config_json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_emitter_burst(this.__wbg_ptr, handle, x, y, count, ptr0, len0);
    }
    /**
     * @param {number} handle
     * @param {number} x
     * @param {number} y
     */
    emitter_set_pos(handle, x, y) {
        wasm.webengine_emitter_set_pos(this.__wbg_ptr, handle, x, y);
    }
    /**
     * @returns {number}
     */
    entity_count() {
        const ret = wasm.webengine_entity_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {WebEngine}
     */
    static gameboy() {
        const ret = wasm.webengine_gameboy();
        return WebEngine.__wrap(ret);
    }
    /**
     * @returns {Float32Array}
     */
    get_camera_pos() {
        const ret = wasm.webengine_get_camera_pos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {bigint} id
     * @returns {Float32Array}
     */
    get_position(id) {
        const ret = wasm.webengine_get_position(this.__wbg_ptr, id);
        return takeObject(ret);
    }
    /**
     * Read an entity's velocity back. Physics zeroes an axis on impact, so a
     * game driven by the engine's physics needs this to tell whether it is
     * still moving (falling, or stopped against a wall).
     * @param {bigint} id
     * @returns {Float32Array}
     */
    get_velocity(id) {
        const ret = wasm.webengine_get_velocity(this.__wbg_ptr, id);
        return takeObject(ret);
    }
    /**
     * @param {string} json
     * @returns {number}
     */
    load_tilemap(json) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
            const len0 = WASM_VECTOR_LEN;
            wasm.webengine_load_tilemap(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {number} font_handle
     * @param {string} text
     * @param {number} scale
     * @returns {number}
     */
    measure_text(font_handle, text, scale) {
        const ptr0 = passStringToWasm0(text, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webengine_measure_text(this.__wbg_ptr, font_handle, ptr0, len0, scale);
        return ret >>> 0;
    }
    /**
     * @returns {WebEngine}
     */
    static neogeo() {
        const ret = wasm.webengine_neogeo();
        return WebEngine.__wrap(ret);
    }
    /**
     * @returns {WebEngine}
     */
    static nes() {
        const ret = wasm.webengine_nes();
        return WebEngine.__wrap(ret);
    }
    /**
     * @param {string} config_json
     */
    constructor(config_json) {
        const ptr0 = passStringToWasm0(config_json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webengine_new(ptr0, len0);
        this.__wbg_ptr = ret >>> 0;
        WebEngineFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    particle_count() {
        const ret = wasm.webengine_particle_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Most sprites drawn in any one frame so far.
     * @returns {number}
     */
    peak_sprites() {
        const ret = wasm.webengine_peak_sprites(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {any}
     */
    poll_collisions() {
        const ret = wasm.webengine_poll_collisions(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Uint32Array}
     */
    poll_fired_timers() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.webengine_poll_fired_timers(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {string}
     */
    profile() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.webengine_profile(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @param {number} texture
     * @param {number} scale
     */
    raycaster_add_billboard(id, x, y, texture, scale) {
        wasm.webengine_raycaster_add_billboard(this.__wbg_ptr, id, x, y, texture, scale);
    }
    /**
     * The raycast map cell at `(col, row)`; out of bounds reads as solid.
     * @param {number} col
     * @param {number} row
     * @returns {number}
     */
    raycaster_cell(col, row) {
        const ret = wasm.webengine_raycaster_cell(this.__wbg_ptr, col, row);
        return ret;
    }
    /**
     * A* across the current raycast map, from `(sx, sy)` to `(gx, gy)`.
     *
     * Returns the waypoints flattened as `[x0, y0, x1, y1, ...]`, already
     * reduced to corners, or an empty array when there is no route.
     * @param {number} sx
     * @param {number} sy
     * @param {number} gx
     * @param {number} gy
     * @param {boolean} diagonal
     * @returns {Int32Array}
     */
    raycaster_find_path(sx, sy, gx, gy, diagonal) {
        const ret = wasm.webengine_raycaster_find_path(this.__wbg_ptr, sx, sy, gx, gy, diagonal);
        return takeObject(ret);
    }
    /**
     * @returns {Float32Array}
     */
    raycaster_get_pos() {
        const ret = wasm.webengine_raycaster_get_pos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Fire a shot from `(x, y)` along `angle` and report what it hit.
     *
     * Returned flat so no object crosses the WASM boundary per bullet:
     * `[hitWall, wallDist, wallTile, hitBillboard, billboardId,
     *   billboardDist, endX, endY]`, with the boolean slots as 0 or 1.
     * @param {number} x
     * @param {number} y
     * @param {number} angle
     * @param {number} max_distance
     * @param {number} radius
     * @param {number} ignore
     * @returns {Float32Array}
     */
    raycaster_hitscan(x, y, angle, max_distance, radius, ignore) {
        const ret = wasm.webengine_raycaster_hitscan(this.__wbg_ptr, x, y, angle, max_distance, radius, ignore);
        return takeObject(ret);
    }
    /**
     * @param {string} map_json
     */
    raycaster_init(map_json) {
        const ptr0 = passStringToWasm0(map_json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_raycaster_init(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * True when nothing solid stands between the two points.
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @returns {boolean}
     */
    raycaster_line_of_sight(x0, y0, x1, y1) {
        const ret = wasm.webengine_raycaster_line_of_sight(this.__wbg_ptr, x0, y0, x1, y1);
        return ret !== 0;
    }
    /**
     * @param {number} forward
     * @param {number} strafe
     * @param {number} turn
     */
    raycaster_move(forward, strafe, turn) {
        wasm.webengine_raycaster_move(this.__wbg_ptr, forward, strafe, turn);
    }
    /**
     * @param {number} id
     */
    raycaster_remove_billboard(id) {
        wasm.webengine_raycaster_remove_billboard(this.__wbg_ptr, id);
    }
    /**
     * Raise or lower one billboard between the floor and the ceiling.
     * @param {number} id
     * @param {number} elevation
     */
    raycaster_set_billboard_elevation(id, elevation) {
        wasm.webengine_raycaster_set_billboard_elevation(this.__wbg_ptr, id, elevation);
    }
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    raycaster_set_ceiling_color(r, g, b) {
        wasm.webengine_raycaster_set_ceiling_color(this.__wbg_ptr, r, g, b);
    }
    /**
     * Where the eye sits between floor (0.0) and ceiling (1.0). 0.5 stands.
     * @param {number} height
     */
    raycaster_set_eye_height(height) {
        wasm.webengine_raycaster_set_eye_height(this.__wbg_ptr, height);
    }
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    raycaster_set_floor_color(r, g, b) {
        wasm.webengine_raycaster_set_floor_color(this.__wbg_ptr, r, g, b);
    }
    /**
     * @param {number} dist
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    raycaster_set_fog(dist, r, g, b) {
        wasm.webengine_raycaster_set_fog(this.__wbg_ptr, dist, r, g, b);
    }
    /**
     * Shear the horizon: positive pitch looks down, negative looks up.
     * Measured in framebuffer pixels.
     * @param {number} pitch
     */
    raycaster_set_pitch(pitch) {
        wasm.webengine_raycaster_set_pitch(this.__wbg_ptr, pitch);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} angle
     */
    raycaster_set_pos(x, y, angle) {
        wasm.webengine_raycaster_set_pos(this.__wbg_ptr, x, y, angle);
    }
    /**
     * @param {number} wall_type
     * @param {Uint8Array} pixels
     * @param {number} size
     */
    raycaster_set_texture(wall_type, pixels, size) {
        const ptr0 = passArray8ToWasm0(pixels, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_raycaster_set_texture(this.__wbg_ptr, wall_type, ptr0, len0, size);
    }
    /**
     * Slide a circular body through the raycast map, stopping at walls.
     * Returns the resolved `[x, y]`.
     * @param {number} x
     * @param {number} y
     * @param {number} dx
     * @param {number} dy
     * @param {number} radius
     * @returns {Float32Array}
     */
    raycaster_slide(x, y, dx, dy, radius) {
        const ret = wasm.webengine_raycaster_slide(this.__wbg_ptr, x, y, dx, dy, radius);
        return takeObject(ret);
    }
    /**
     * @param {number} id
     * @param {number} x
     * @param {number} y
     */
    raycaster_update_billboard(id, x, y) {
        wasm.webengine_raycaster_update_billboard(this.__wbg_ptr, id, x, y);
    }
    /**
     * @param {number} sheet_handle
     * @param {number} char_w
     * @param {number} char_h
     * @param {number} cols
     * @param {number} first_char
     * @returns {number}
     */
    register_font(sheet_handle, char_w, char_h, cols, first_char) {
        const ret = wasm.webengine_register_font(this.__wbg_ptr, sheet_handle, char_w, char_h, cols, first_char);
        return ret >>> 0;
    }
    /**
     * @param {HTMLCanvasElement} canvas
     */
    render_to_canvas(canvas) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.webengine_render_to_canvas(retptr, this.__wbg_ptr, addBorrowedObject(canvas));
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            heap[stack_pointer++] = undefined;
        }
    }
    reset_peak_sprites() {
        wasm.webengine_reset_peak_sprites(this.__wbg_ptr);
    }
    /**
     * @returns {number}
     */
    resolution_h() {
        const ret = wasm.webengine_resolution_h(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    resolution_w() {
        const ret = wasm.webengine_resolution_w(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} slot
     * @returns {string}
     */
    save_export(slot) {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.webengine_save_export(retptr, this.__wbg_ptr, slot);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} slot
     * @param {string} key
     * @returns {any}
     */
    save_get(slot, key) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webengine_save_get(this.__wbg_ptr, slot, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {number} slot
     * @param {string} json
     */
    save_import(slot, json) {
        const ptr0 = passStringToWasm0(json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_save_import(this.__wbg_ptr, slot, ptr0, len0);
    }
    /**
     * @param {number} slot
     * @param {string} key
     */
    save_remove(slot, key) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_save_remove(this.__wbg_ptr, slot, ptr0, len0);
    }
    /**
     * @param {number} slot
     * @param {string} key
     * @param {string} value_json
     */
    save_set(slot, key, value_json) {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(value_json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len1 = WASM_VECTOR_LEN;
        wasm.webengine_save_set(this.__wbg_ptr, slot, ptr0, len0, ptr1, len1);
    }
    /**
     * @param {string} mml
     * @param {number} bpm
     */
    sequencer_load_mml(mml, bpm) {
        const ptr0 = passStringToWasm0(mml, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_sequencer_load_mml(this.__wbg_ptr, ptr0, len0, bpm);
    }
    sequencer_pause() {
        wasm.webengine_sequencer_pause(this.__wbg_ptr);
    }
    sequencer_play() {
        wasm.webengine_sequencer_play(this.__wbg_ptr);
    }
    /**
     * @param {number} bpm
     */
    sequencer_set_bpm(bpm) {
        wasm.webengine_sequencer_set_bpm(this.__wbg_ptr, bpm);
    }
    sequencer_stop() {
        wasm.webengine_sequencer_stop(this.__wbg_ptr);
    }
    /**
     * @param {number} r
     * @param {number} g
     * @param {number} b
     */
    set_bg_color(r, g, b) {
        wasm.webengine_set_bg_color(this.__wbg_ptr, r, g, b);
    }
    /**
     * Place the camera's top-left corner directly.
     *
     * This goes through the smoothed camera rather than writing the
     * renderer's copy, which `tick` overwrites from it every frame anyway.
     * Routing it here is what lets `set_camera_bounds` apply to a game that
     * positions its own camera — before this, bounds silently did nothing
     * unless you also used `set_camera_target`.
     * @param {number} x
     * @param {number} y
     */
    set_camera(x, y) {
        wasm.webengine_set_camera(this.__wbg_ptr, x, y);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    set_camera_bounds(x, y, w, h) {
        wasm.webengine_set_camera_bounds(this.__wbg_ptr, x, y, w, h);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    set_camera_dead_zone(x, y, w, h) {
        wasm.webengine_set_camera_dead_zone(this.__wbg_ptr, x, y, w, h);
    }
    /**
     * @param {number} speed
     */
    set_camera_lerp(speed) {
        wasm.webengine_set_camera_lerp(this.__wbg_ptr, speed);
    }
    /**
     * @param {number} x
     * @param {number} y
     */
    set_camera_target(x, y) {
        wasm.webengine_set_camera_target(this.__wbg_ptr, x, y);
    }
    /**
     * @param {number} zoom
     */
    set_camera_zoom(zoom) {
        wasm.webengine_set_camera_zoom(this.__wbg_ptr, zoom);
    }
    /**
     * @param {bigint} id
     * @param {boolean} flip_x
     * @param {boolean} flip_y
     */
    set_flip(id, flip_x, flip_y) {
        wasm.webengine_set_flip(this.__wbg_ptr, id, flip_x, flip_y);
    }
    /**
     * @param {bigint} id
     * @param {number} frame
     */
    set_frame(id, frame) {
        wasm.webengine_set_frame(this.__wbg_ptr, id, frame);
    }
    /**
     * Opt an entity into gravity. `scale` multiplies the engine's base
     * gravity: 1.0 is a normal fall, 0.35 is floaty, 0.0 disables it.
     * Entities never fall unless this is called.
     * @param {bigint} id
     * @param {number} scale
     */
    set_gravity(id, scale) {
        wasm.webengine_set_gravity(this.__wbg_ptr, id, scale);
    }
    /**
     * @param {number} player
     * @param {string} state_json
     */
    set_input(player, state_json) {
        const ptr0 = passStringToWasm0(state_json, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_set_input(this.__wbg_ptr, player, ptr0, len0);
    }
    /**
     * @param {bigint} id
     * @param {number} x
     * @param {number} y
     */
    set_position(id, x, y) {
        wasm.webengine_set_position(this.__wbg_ptr, id, x, y);
    }
    /**
     * Switch the hardware *look* — palette, background and scanlines —
     * without rebuilding the engine. Accepts "nes", "gameboy", "neogeo",
     * "dos" or
     * "custom".
     *
     * The profile is a view setting, not a contract: build once, preview on
     * any of them, and pick a target when you export.
     * @param {string} name
     */
    set_profile(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_set_profile(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {boolean} val
     */
    set_scanlines(val) {
        wasm.webengine_set_scanlines(this.__wbg_ptr, val);
    }
    /**
     * @param {bigint} id
     * @param {boolean} solid
     */
    set_solid(id, solid) {
        wasm.webengine_set_solid(this.__wbg_ptr, id, solid);
    }
    /**
     * Declare which tile ids on a layer act as walls, so the physics step
     * resolves bodies against them. Tilemap JSON can carry `solid_tiles`
     * directly; this is for changing it after the map is loaded.
     * @param {number} map
     * @param {number} layer
     * @param {Uint16Array} ids
     */
    set_tilemap_solid_tiles(map, layer, ids) {
        const ptr0 = passArray16ToWasm0(ids, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.webengine_set_tilemap_solid_tiles(this.__wbg_ptr, map, layer, ptr0, len0);
    }
    /**
     * @param {bigint} id
     * @param {number} vx
     * @param {number} vy
     */
    set_velocity(id, vx, vy) {
        wasm.webengine_set_velocity(this.__wbg_ptr, id, vx, vy);
    }
    /**
     * Show or hide a sprite without destroying it.
     *
     * Before this existed, hiding meant moving the entity off-screen,
     * because an entity with a SpriteIndex was drawn unconditionally.
     * @param {bigint} id
     * @param {boolean} visible
     */
    set_visible(id, visible) {
        wasm.webengine_set_visible(this.__wbg_ptr, id, visible);
    }
    /**
     * @param {number} intensity
     * @param {number} duration
     */
    shake(intensity, duration) {
        wasm.webengine_shake(this.__wbg_ptr, intensity, duration);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} sheet
     * @param {number} frame
     * @param {number} layer
     * @returns {bigint}
     */
    spawn_sprite(x, y, sheet, frame, layer) {
        const ret = wasm.webengine_spawn_sprite(this.__wbg_ptr, x, y, sheet, frame, layer);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    target_fps() {
        const ret = wasm.webengine_target_fps(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} timestamp
     * @returns {number}
     */
    tick(timestamp) {
        const ret = wasm.webengine_tick(this.__wbg_ptr, timestamp);
        return ret;
    }
    /**
     * @returns {bigint}
     */
    tick_count() {
        const ret = wasm.webengine_tick_count(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    tilemap_count() {
        const ret = wasm.webengine_tilemap_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether a tile cell is a wall on any layer. Cells outside the map read
     * as open.
     * @param {number} map
     * @param {number} col
     * @param {number} row
     * @returns {boolean}
     */
    tilemap_solid_at(map, col, row) {
        const ret = wasm.webengine_tilemap_solid_at(this.__wbg_ptr, map, col, row);
        return ret !== 0;
    }
    /**
     * @param {number} duration_secs
     * @param {boolean} repeat
     * @returns {number}
     */
    timer_create(duration_secs, repeat) {
        const ret = wasm.webengine_timer_create(this.__wbg_ptr, duration_secs, repeat);
        return ret >>> 0;
    }
    /**
     * @param {number} handle
     * @returns {number}
     */
    timer_progress(handle) {
        const ret = wasm.webengine_timer_progress(this.__wbg_ptr, handle);
        return ret;
    }
    /**
     * @param {number} handle
     */
    timer_reset(handle) {
        wasm.webengine_timer_reset(this.__wbg_ptr, handle);
    }
    /**
     * @param {number} handle
     */
    timer_start(handle) {
        wasm.webengine_timer_start(this.__wbg_ptr, handle);
    }
    /**
     * @param {number} handle
     */
    timer_stop(handle) {
        wasm.webengine_timer_stop(this.__wbg_ptr, handle);
    }
    /**
     * @param {number} from
     * @param {number} to
     * @param {number} duration_secs
     * @param {number} ease_id
     * @param {boolean} repeat
     * @param {boolean} yoyo
     * @returns {number}
     */
    tween_create(from, to, duration_secs, ease_id, repeat, yoyo) {
        const ret = wasm.webengine_tween_create(this.__wbg_ptr, from, to, duration_secs, ease_id, repeat, yoyo);
        return ret >>> 0;
    }
    /**
     * @param {number} handle
     */
    tween_destroy(handle) {
        wasm.webengine_tween_destroy(this.__wbg_ptr, handle);
    }
    /**
     * @param {number} handle
     * @returns {boolean}
     */
    tween_is_complete(handle) {
        const ret = wasm.webengine_tween_is_complete(this.__wbg_ptr, handle);
        return ret !== 0;
    }
    /**
     * @param {number} handle
     */
    tween_reset(handle) {
        wasm.webengine_tween_reset(this.__wbg_ptr, handle);
    }
    /**
     * @param {number} handle
     * @returns {number}
     */
    tween_value(handle) {
        const ret = wasm.webengine_tween_value(this.__wbg_ptr, handle);
        return ret;
    }
    /**
     * @param {number} w
     * @param {number} h
     * @param {number} tw
     * @param {number} th
     * @param {Uint8Array} pixels
     * @returns {number}
     */
    upload_sheet(w, h, tw, th, pixels) {
        const ptr0 = passArray8ToWasm0(pixels, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webengine_upload_sheet(this.__wbg_ptr, w, h, tw, th, ptr0, len0);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WebEngine.prototype[Symbol.dispose] = WebEngine.prototype.free;

export function main_js() {
    wasm.main_js();
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_83742b46f01ce22d: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg___wbindgen_copy_to_typed_array_d2f20acdab8e0740: function(arg0, arg1, arg2) {
            new Uint8Array(getObject(arg2).buffer, getObject(arg2).byteOffset, getObject(arg2).byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_is_string_7ef6b97b02428fae: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'string';
            return ret;
        },
        __wbg___wbindgen_throw_6ddd609b62940d55: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_export(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getContext_24426d8c38c5768a: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_height_db0f5a997e950d0b: function(arg0) {
            const ret = getObject(arg0).height;
            return ret;
        },
        __wbg_instanceof_CanvasRenderingContext2d_1ebf021e2db9624c: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof CanvasRenderingContext2D;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_length_259ee9d041e381ad: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_76eefdd571f24b00: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return addHeapObject(ret);
        },
        __wbg_new_49d5571bd3f0c4d4: function() {
            const ret = new Map();
            return addHeapObject(ret);
        },
        __wbg_new_a70fbab9066b301f: function() {
            const ret = new Array();
            return addHeapObject(ret);
        },
        __wbg_new_ab79df5bd7c26067: function() {
            const ret = new Object();
            return addHeapObject(ret);
        },
        __wbg_new_with_length_81c1c31d4432cb9f: function(arg0) {
            const ret = new Float32Array(arg0 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_length_a6dc736798f9d14e: function(arg0) {
            const ret = new Int32Array(arg0 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_u8_clamped_array_and_sh_126ff06810f68c98: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = new ImageData(getClampedArrayU8FromWasm0(arg0, arg1), arg2 >>> 0, arg3 >>> 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_putImageData_e63d9aa7a44fd37d: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            getObject(arg0).putImageData(getObject(arg1), arg2, arg3);
        }, arguments); },
        __wbg_set_282384002438957f: function(arg0, arg1, arg2) {
            getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
        },
        __wbg_set_361bc2460da3016f: function(arg0, arg1, arg2) {
            getObject(arg0).set(getArrayF32FromWasm0(arg1, arg2));
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
        },
        __wbg_set_79587606a1f70bf0: function(arg0, arg1, arg2) {
            getObject(arg0).set(getArrayI32FromWasm0(arg1, arg2));
        },
        __wbg_set_bf7251625df30a02: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).set(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_set_height_fd216dfebfffa20c: function(arg0, arg1) {
            getObject(arg0).height = arg1 >>> 0;
        },
        __wbg_set_width_ef87472e074e959b: function(arg0, arg1) {
            getObject(arg0).width = arg1 >>> 0;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = getObject(arg1).stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export3, wasm.__wbindgen_export4);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_width_cee172923bea0e12: function(arg0) {
            const ret = getObject(arg0).width;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000002: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000004: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./cathode_platform_web_bg.js": import0,
    };
}

const WebEngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webengine_free(ptr >>> 0, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function addBorrowedObject(obj) {
    if (stack_pointer == 1) throw new Error('out of js stack');
    heap[--stack_pointer] = obj;
    return stack_pointer;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getClampedArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ClampedArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

let cachedUint8ClampedArrayMemory0 = null;
function getUint8ClampedArrayMemory0() {
    if (cachedUint8ClampedArrayMemory0 === null || cachedUint8ClampedArrayMemory0.byteLength === 0) {
        cachedUint8ClampedArrayMemory0 = new Uint8ClampedArray(wasm.memory.buffer);
    }
    return cachedUint8ClampedArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export2(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let stack_pointer = 1024;

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    cachedUint8ClampedArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('cathode_platform_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
