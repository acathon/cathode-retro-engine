use cathode_core::config::EngineConfig;
use cathode_core::ecs::{Collider, GamepadState, Position, SpriteIndex, Velocity};
use cathode_core::renderer::tilemap::TileMap;
use cathode_core::Engine;
use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

#[wasm_bindgen(start)]
pub fn main_js() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub struct WebEngine {
    engine: Engine,
    last_ts: f64,
}

#[wasm_bindgen]
impl WebEngine {
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Self {
        let config: EngineConfig = serde_json::from_str(config_json).unwrap_or_default();
        Self {
            engine: Engine::new(config),
            last_ts: 0.0,
        }
    }

    #[wasm_bindgen]
    pub fn gameboy() -> Self {
        Self {
            engine: Engine::new(EngineConfig::gameboy()),
            last_ts: 0.0,
        }
    }

    #[wasm_bindgen]
    pub fn nes() -> Self {
        Self {
            engine: Engine::new(EngineConfig::nes()),
            last_ts: 0.0,
        }
    }

    #[wasm_bindgen]
    pub fn neogeo() -> Self {
        Self {
            engine: Engine::new(EngineConfig::neogeo()),
            last_ts: 0.0,
        }
    }

    #[wasm_bindgen]
    pub fn tick(&mut self, timestamp: f64) -> f32 {
        let delta = if self.last_ts == 0.0 {
            0.016
        } else {
            ((timestamp - self.last_ts) / 1000.0) as f32
        };
        self.last_ts = timestamp;

        self.engine.update(delta);
        self.engine.delta()
    }

    #[wasm_bindgen]
    pub fn render_to_canvas(&mut self, canvas: &HtmlCanvasElement) -> Result<(), JsValue> {
        let ctx = canvas
            .get_context("2d")?
            .unwrap()
            .dyn_into::<CanvasRenderingContext2d>()?;

        let fb = self.engine.render();

        if canvas.width() != fb.width {
            canvas.set_width(fb.width);
        }
        if canvas.height() != fb.height {
            canvas.set_height(fb.height);
        }

        let clamped = Clamped(fb.pixels.as_slice());
        let image_data = ImageData::new_with_u8_clamped_array_and_sh(clamped, fb.width, fb.height)?;
        ctx.put_image_data(&image_data, 0.0, 0.0)?;

        Ok(())
    }

    #[wasm_bindgen]
    pub fn set_input(&mut self, player: usize, state_json: &str) {
        if let Ok(state) = serde_json::from_str::<GamepadState>(state_json) {
            self.engine.input.set_state(player, state);
        }
    }

    #[wasm_bindgen]
    pub fn upload_sheet(&mut self, w: u32, h: u32, tw: u32, th: u32, pixels: Vec<u8>) -> u32 {
        let sheet = cathode_core::assets::SpriteSheet::from_rgba(w, h, tw, th, pixels);
        self.engine.assets.add_sheet(sheet)
    }

    /// Remove every tilemap.
    ///
    /// Committing a map pushes a new one, so without this a game that
    /// rebuilds its level — a new stage, or returning to a menu — stacked the
    /// old one underneath forever, and there was no way to unload a level at
    /// all. Handles from before this call are stale.
    #[wasm_bindgen]
    pub fn clear_tilemaps(&mut self) {
        self.engine.renderer.tilemaps.clear();
    }

    #[wasm_bindgen]
    pub fn tilemap_count(&self) -> u32 {
        self.engine.renderer.tilemaps.len() as u32
    }

    #[wasm_bindgen]
    pub fn load_tilemap(&mut self, json: &str) -> Result<u32, JsValue> {
        let map: TileMap =
            serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.engine.renderer.tilemaps.push(map);
        Ok((self.engine.renderer.tilemaps.len() - 1) as u32)
    }

    /// Declare which tile ids on a layer act as walls, so the physics step
    /// resolves bodies against them. Tilemap JSON can carry `solid_tiles`
    /// directly; this is for changing it after the map is loaded.
    #[wasm_bindgen]
    pub fn set_tilemap_solid_tiles(&mut self, map: u32, layer: u32, ids: Vec<u16>) {
        if let Some(m) = self.engine.renderer.tilemaps.get_mut(map as usize) {
            m.set_solid_tiles(layer as usize, &ids);
        }
    }

    /// Whether a tile cell is a wall on any layer. Cells outside the map read
    /// as open.
    #[wasm_bindgen]
    pub fn tilemap_solid_at(&self, map: u32, col: i32, row: i32) -> bool {
        self.engine
            .renderer
            .tilemaps
            .get(map as usize)
            .map(|m| m.solid_at(col, row))
            .unwrap_or(false)
    }

    /// Place the camera's top-left corner directly.
    ///
    /// This goes through the smoothed camera rather than writing the
    /// renderer's copy, which `tick` overwrites from it every frame anyway.
    /// Routing it here is what lets `set_camera_bounds` apply to a game that
    /// positions its own camera — before this, bounds silently did nothing
    /// unless you also used `set_camera_target`.
    #[wasm_bindgen]
    pub fn set_camera(&mut self, x: f32, y: f32) {
        let half = glam::Vec2::new(
            self.engine.config.width as f32 * 0.5,
            self.engine.config.height as f32 * 0.5,
        );
        self.engine.camera.pos = glam::Vec2::new(x, y);
        // Keep the target consistent, or the next update lerps straight back
        // to wherever the camera was last aimed.
        self.engine.camera.target = glam::Vec2::new(x, y) + half;
        self.engine.camera.update(0.0);
        self.engine.renderer.camera = self.engine.camera.pos;
    }

    /// Switch the hardware *look* — palette, background and scanlines —
    /// without rebuilding the engine. Accepts "nes", "gameboy", "neogeo" or
    /// "custom".
    ///
    /// The profile is a view setting, not a contract: build once, preview on
    /// any of them, and pick a target when you export.
    #[wasm_bindgen]
    pub fn set_profile(&mut self, name: &str) {
        let profile = cathode_core::HardwareProfile::from_name(name);
        self.engine.renderer.set_profile(profile);
        self.engine.config.profile = profile;
    }

    #[wasm_bindgen]
    pub fn profile(&self) -> String {
        self.engine.config.profile.name().to_string()
    }

    /// Most sprites drawn in any one frame so far.
    #[wasm_bindgen]
    pub fn peak_sprites(&self) -> u32 {
        self.engine.renderer.peak_sprites as u32
    }

    #[wasm_bindgen]
    pub fn reset_peak_sprites(&mut self) {
        self.engine.renderer.reset_peak_sprites();
    }

    /// Check what this game has actually used against a target's real limits.
    ///
    /// Returns JSON: the target's budgets, the peak this run reached, and
    /// whether each fits. This is where hardware limits belong — a number you
    /// can act on when choosing a platform, rather than a silent cap that
    /// deletes sprites while you play.
    #[wasm_bindgen]
    pub fn check_target(&self, name: &str) -> String {
        let profile = cathode_core::HardwareProfile::from_name(name);
        let peak = self.engine.renderer.peak_sprites as u32;
        let (w, h) = self.engine.renderer.resolution;

        let sprite_budget = profile.sprite_budget();
        let resolution = profile.resolution();
        let channels = profile.audio_channels();

        let report = serde_json::json!({
            "target": profile.name(),
            "sprites": {
                "peak": peak,
                "budget": sprite_budget,
                "fits": sprite_budget.map(|b| peak <= b),
            },
            "resolution": {
                "current": [w, h],
                "target": resolution.map(|(tw, th)| vec![tw, th]),
                "fits": resolution.map(|(tw, th)| w <= tw && h <= th),
            },
            "audio": {
                "channels": self.engine.config.audio_channels,
                "budget": channels,
                "fits": channels.map(|c| self.engine.config.audio_channels <= c),
            },
        });
        report.to_string()
    }

    /// Show or hide a sprite without destroying it.
    ///
    /// Before this existed, hiding meant moving the entity off-screen,
    /// because an entity with a SpriteIndex was drawn unconditionally.
    #[wasm_bindgen]
    pub fn set_visible(&mut self, id: u64, visible: bool) {
        if let Some(e) = self.find_entity(id) {
            if let Ok(mut index) = self
                .engine
                .world
                .get::<&mut cathode_core::ecs::SpriteIndex>(e)
            {
                index.visible = visible;
            }
        }
    }

    #[wasm_bindgen]
    pub fn set_scanlines(&mut self, val: bool) {
        self.engine.renderer.scanlines = val;
    }

    #[wasm_bindgen]
    pub fn set_bg_color(&mut self, r: u8, g: u8, b: u8) {
        self.engine.renderer.bg_color = cathode_core::renderer::palette::Color::rgb(r, g, b);
    }

    #[wasm_bindgen]
    pub fn spawn_sprite(&mut self, x: f32, y: f32, sheet: u32, frame: u16, layer: u8) -> u64 {
        let ent = self.engine.world.spawn((
            Position(glam::Vec2::new(x, y)),
            Velocity(glam::Vec2::ZERO),
            SpriteIndex {
                sheet,
                frame,
                flip_x: false,
                flip_y: false,
                layer,
                visible: true,
            },
        ));
        ent.to_bits().into()
    }

    fn find_entity(&self, id: u64) -> Option<hecs::Entity> {
        let ent = hecs::Entity::from_bits(id)?;
        if self.engine.world.contains(ent) {
            Some(ent)
        } else {
            None
        }
    }

    #[wasm_bindgen]
    pub fn set_velocity(&mut self, id: u64, vx: f32, vy: f32) {
        if let Some(e) = self.find_entity(id) {
            if let Ok(vel) = self.engine.world.query_one_mut::<&mut Velocity>(e) {
                vel.0.x = vx;
                vel.0.y = vy;
            }
        }
    }

    #[wasm_bindgen]
    pub fn set_position(&mut self, id: u64, x: f32, y: f32) {
        if let Some(e) = self.find_entity(id) {
            if let Ok(pos) = self.engine.world.query_one_mut::<&mut Position>(e) {
                pos.0.x = x;
                pos.0.y = y;
            }
        }
    }

    #[wasm_bindgen]
    pub fn get_position(&self, id: u64) -> js_sys::Float32Array {
        let arr = js_sys::Float32Array::new_with_length(2);
        if let Some(e) = self.find_entity(id) {
            if let Ok(pos) = self.engine.world.get::<&Position>(e) {
                arr.copy_from(&[pos.0.x, pos.0.y]);
            }
        }
        arr
    }

    /// Read an entity's velocity back. Physics zeroes an axis on impact, so a
    /// game driven by the engine's physics needs this to tell whether it is
    /// still moving (falling, or stopped against a wall).
    #[wasm_bindgen]
    pub fn get_velocity(&self, id: u64) -> js_sys::Float32Array {
        let arr = js_sys::Float32Array::new_with_length(2);
        if let Some(e) = self.find_entity(id) {
            if let Ok(vel) = self.engine.world.get::<&Velocity>(e) {
                arr.copy_from(&[vel.0.x, vel.0.y]);
            }
        }
        arr
    }

    #[wasm_bindgen]
    pub fn set_frame(&mut self, id: u64, frame: u16) {
        if let Some(e) = self.find_entity(id) {
            if let Ok(sprite) = self.engine.world.query_one_mut::<&mut SpriteIndex>(e) {
                sprite.frame = frame;
            }
        }
    }

    #[wasm_bindgen]
    pub fn set_flip(&mut self, id: u64, flip_x: bool, flip_y: bool) {
        if let Some(e) = self.find_entity(id) {
            if let Ok(sprite) = self.engine.world.query_one_mut::<&mut SpriteIndex>(e) {
                sprite.flip_x = flip_x;
                sprite.flip_y = flip_y;
            }
        }
    }

    #[wasm_bindgen]
    pub fn destroy_entity(&mut self, id: u64) {
        if let Some(e) = self.find_entity(id) {
            let _ = self.engine.world.despawn(e);
        }
    }

    // --- Audio ---

    #[wasm_bindgen]
    pub fn audio_play(&mut self, ch: usize, freq: f32, waveform: u8, vol: f32) {
        let wf = match waveform {
            0 => cathode_core::audio::Waveform::Pulse25,
            1 => cathode_core::audio::Waveform::Pulse50,
            2 => cathode_core::audio::Waveform::Triangle,
            3 => cathode_core::audio::Waveform::Sawtooth,
            4 => cathode_core::audio::Waveform::Noise,
            _ => cathode_core::audio::Waveform::Sine,
        };
        self.engine.audio.play(ch, freq, wf, vol);
    }

    #[wasm_bindgen]
    pub fn audio_stop(&mut self, ch: usize) {
        self.engine.audio.stop(ch);
    }

    #[wasm_bindgen]
    pub fn audio_stop_all(&mut self) {
        self.engine.audio.stop_all();
    }

    #[wasm_bindgen]
    pub fn audio_fill_mono(&mut self, buf: &mut [f32]) {
        self.engine.audio.fill_mono(buf);
    }

    #[wasm_bindgen]
    pub fn audio_fill_stereo(&mut self, buf: &mut [f32]) {
        self.engine.audio.fill_stereo(buf);
    }

    #[wasm_bindgen]
    pub fn audio_set_envelope(
        &mut self,
        ch: usize,
        attack: f32,
        decay: f32,
        sustain: f32,
        release: f32,
    ) {
        if let Some(channel) = self.engine.audio.channels.get_mut(ch) {
            channel.envelope =
                cathode_core::audio::envelope::Envelope::new(attack, decay, sustain, release);
        }
    }

    #[wasm_bindgen]
    pub fn audio_set_envelope_preset(&mut self, ch: usize, preset: &str) {
        if let Some(channel) = self.engine.audio.channels.get_mut(ch) {
            channel.envelope = cathode_core::audio::envelope::Envelope::from_preset(preset);
        }
    }

    // --- Engine info ---

    #[wasm_bindgen]
    pub fn resolution_w(&self) -> u32 {
        self.engine.config.width
    }

    #[wasm_bindgen]
    pub fn resolution_h(&self) -> u32 {
        self.engine.config.height
    }

    #[wasm_bindgen]
    pub fn target_fps(&self) -> u32 {
        self.engine.config.fps
    }

    #[wasm_bindgen]
    pub fn tick_count(&self) -> u64 {
        self.engine.tick()
    }

    #[wasm_bindgen]
    pub fn entity_count(&self) -> u32 {
        self.engine.entity_count()
    }

    #[wasm_bindgen]
    pub fn particle_count(&self) -> u32 {
        self.engine.particle_count() as u32
    }

    #[wasm_bindgen]
    pub fn shake(&mut self, intensity: f32, duration: f32) {
        self.engine.shake(intensity, duration);
    }

    // --- Collision Events ---

    #[wasm_bindgen]
    pub fn poll_collisions(&mut self) -> JsValue {
        let events: Vec<serde_json::Value> = self
            .engine
            .collisions
            .drain()
            .map(|e| {
                serde_json::json!({
                    "entity_a": e.entity_a.to_bits().get(),
                    "entity_b": e.entity_b.to_bits().get(),
                    "side": match e.side {
                        cathode_core::collision::CollisionSide::Top => "top",
                        cathode_core::collision::CollisionSide::Bottom => "bottom",
                        cathode_core::collision::CollisionSide::Left => "left",
                        cathode_core::collision::CollisionSide::Right => "right",
                    },
                    "overlap_x": e.overlap.x,
                    "overlap_y": e.overlap.y,
                })
            })
            .collect();
        serde_wasm_bindgen::to_value(&events).unwrap_or(JsValue::NULL)
    }

    // --- Camera ---

    #[wasm_bindgen]
    pub fn set_camera_target(&mut self, x: f32, y: f32) {
        self.engine.camera.target = glam::Vec2::new(x, y);
    }

    #[wasm_bindgen]
    pub fn set_camera_lerp(&mut self, speed: f32) {
        self.engine.camera.lerp_speed = speed;
    }

    #[wasm_bindgen]
    pub fn set_camera_bounds(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.engine.camera.bounds = Some(cathode_core::camera::Rect::new(x, y, w, h));
    }

    #[wasm_bindgen]
    pub fn set_camera_dead_zone(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.engine.camera.dead_zone = Some(cathode_core::camera::Rect::new(x, y, w, h));
    }

    #[wasm_bindgen]
    pub fn set_camera_zoom(&mut self, zoom: f32) {
        self.engine.camera.zoom = zoom;
    }

    #[wasm_bindgen]
    pub fn get_camera_pos(&self) -> js_sys::Float32Array {
        let arr = js_sys::Float32Array::new_with_length(2);
        arr.copy_from(&[self.engine.camera.pos.x, self.engine.camera.pos.y]);
        arr
    }

    // --- Particles ---

    #[wasm_bindgen]
    pub fn create_emitter(&mut self, max_particles: u32) -> u32 {
        self.engine.create_emitter(max_particles as usize)
    }

    #[wasm_bindgen]
    pub fn emitter_burst(&mut self, handle: u32, x: f32, y: f32, count: u32, config_json: &str) {
        if let Some(emitter) = self.engine.emitter_mut(handle) {
            let config: cathode_core::particles::EmitConfig =
                serde_json::from_str(config_json).unwrap_or_default();
            emitter.burst(glam::Vec2::new(x, y), count, &config);
        }
    }

    #[wasm_bindgen]
    pub fn emitter_set_pos(&mut self, handle: u32, x: f32, y: f32) {
        if let Some(emitter) = self.engine.emitter_mut(handle) {
            emitter.pos = glam::Vec2::new(x, y);
        }
    }

    #[wasm_bindgen]
    pub fn destroy_emitter(&mut self, handle: u32) {
        self.engine.destroy_emitter(handle);
    }

    // --- Tweens ---

    #[wasm_bindgen]
    pub fn tween_create(
        &mut self,
        from: f32,
        to: f32,
        duration_secs: f32,
        ease_id: u8,
        repeat: bool,
        yoyo: bool,
    ) -> u32 {
        let ease = cathode_core::tween::EaseFn::from_id(ease_id);
        self.engine
            .tweens
            .create(from, to, duration_secs, ease, repeat, yoyo)
    }

    #[wasm_bindgen]
    pub fn tween_value(&self, handle: u32) -> f32 {
        self.engine.tweens.value(handle)
    }

    #[wasm_bindgen]
    pub fn tween_is_complete(&self, handle: u32) -> bool {
        self.engine.tweens.is_complete(handle)
    }

    #[wasm_bindgen]
    pub fn tween_reset(&mut self, handle: u32) {
        self.engine.tweens.reset(handle);
    }

    #[wasm_bindgen]
    pub fn tween_destroy(&mut self, handle: u32) {
        self.engine.tweens.destroy(handle);
    }

    // --- Text ---

    #[wasm_bindgen]
    pub fn register_font(
        &mut self,
        sheet_handle: u32,
        char_w: u32,
        char_h: u32,
        cols: u32,
        first_char: u8,
    ) -> u32 {
        self.engine
            .fonts
            .register(sheet_handle, char_w, char_h, cols, first_char)
    }

    /// Queue a line of text for this frame.
    ///
    /// Games call this from their update callback, which runs *before* the
    /// world is rendered — and rendering clears the framebuffer. Drawing
    /// immediately therefore painted text that was wiped microseconds later,
    /// every frame. Queued text is drawn after the world instead, which is
    /// also where a HUD belongs.
    #[wasm_bindgen]
    pub fn draw_text(&mut self, font_handle: u32, text: &str, x: i32, y: i32, scale: u32) {
        self.engine.queue_text(font_handle, text, x, y, scale);
    }

    #[wasm_bindgen]
    pub fn measure_text(&self, font_handle: u32, text: &str, scale: u32) -> u32 {
        self.engine
            .fonts
            .get(font_handle)
            .map(|f| f.measure(text, scale))
            .unwrap_or(0)
    }

    // --- Timers ---

    #[wasm_bindgen]
    pub fn timer_create(&mut self, duration_secs: f32, repeat: bool) -> u32 {
        self.engine.timers.create(duration_secs, repeat)
    }

    #[wasm_bindgen]
    pub fn timer_start(&mut self, handle: u32) {
        self.engine.timers.start(handle);
    }

    #[wasm_bindgen]
    pub fn timer_stop(&mut self, handle: u32) {
        self.engine.timers.stop(handle);
    }

    #[wasm_bindgen]
    pub fn timer_reset(&mut self, handle: u32) {
        self.engine.timers.reset(handle);
    }

    #[wasm_bindgen]
    pub fn timer_progress(&self, handle: u32) -> f32 {
        self.engine.timers.progress(handle)
    }

    #[wasm_bindgen]
    pub fn poll_fired_timers(&self) -> Vec<u32> {
        self.engine.timers.fired_handles.clone()
    }

    // --- Sequencer ---

    #[wasm_bindgen]
    pub fn sequencer_load_mml(&mut self, mml: &str, bpm: f32) {
        let pattern = cathode_core::audio::sequencer::Sequencer::parse_mml(mml, bpm);
        self.engine.sequencer.load(pattern);
    }

    #[wasm_bindgen]
    pub fn sequencer_play(&mut self) {
        self.engine.sequencer.play();
    }

    #[wasm_bindgen]
    pub fn sequencer_stop(&mut self) {
        self.engine.sequencer.stop();
    }

    #[wasm_bindgen]
    pub fn sequencer_pause(&mut self) {
        self.engine.sequencer.pause();
    }

    #[wasm_bindgen]
    pub fn sequencer_set_bpm(&mut self, bpm: f32) {
        self.engine.sequencer.set_bpm(bpm);
    }

    // --- Raycaster ---

    #[wasm_bindgen]
    pub fn raycaster_init(&mut self, map_json: &str) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(map_json) {
            let cols = val["cols"].as_u64().unwrap_or(8) as u32;
            let rows = val["rows"].as_u64().unwrap_or(8) as u32;
            let cells: Vec<u8> = val["cells"]
                .as_array()
                .map(|arr| arr.iter().map(|v| v.as_u64().unwrap_or(0) as u8).collect())
                .unwrap_or_else(|| vec![0; (cols * rows) as usize]);
            let map = cathode_core::raycaster::RaycastMap::new(cols, rows, cells);
            self.engine.raycaster = Some(cathode_core::raycaster::RaycastRenderer::new(map));
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_set_texture(&mut self, wall_type: u8, pixels: Vec<u8>, size: u32) {
        if let Some(rc) = &mut self.engine.raycaster {
            let tex = cathode_core::raycaster::WallTexture { pixels, size };
            let idx = (wall_type as usize).saturating_sub(1);
            while rc.textures.len() <= idx {
                rc.textures.push(cathode_core::raycaster::WallTexture {
                    pixels: Vec::new(),
                    size: 0,
                });
            }
            rc.textures[idx] = tex;
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_move(&mut self, forward: f32, strafe: f32, turn: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            let dt = self.engine.delta_secs;
            if forward > 0.0 {
                rc.move_forward(forward * dt);
            } else if forward < 0.0 {
                rc.move_backward(-forward * dt);
            }
            if strafe > 0.0 {
                rc.strafe_right(strafe * dt);
            } else if strafe < 0.0 {
                rc.strafe_left(-strafe * dt);
            }
            if turn > 0.0 {
                rc.turn_right(turn * dt);
            } else if turn < 0.0 {
                rc.turn_left(-turn * dt);
            }
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_set_pos(&mut self, x: f32, y: f32, angle: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.camera.pos = glam::Vec2::new(x, y);
            rc.camera.angle = angle;
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_get_pos(&self) -> js_sys::Float32Array {
        let arr = js_sys::Float32Array::new_with_length(3);
        if let Some(rc) = &self.engine.raycaster {
            arr.copy_from(&[rc.camera.pos.x, rc.camera.pos.y, rc.camera.angle]);
        }
        arr
    }

    #[wasm_bindgen]
    pub fn raycaster_add_billboard(&mut self, id: u32, x: f32, y: f32, texture: u32, scale: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.add_billboard(id, x, y, texture, scale);
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_remove_billboard(&mut self, id: u32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.remove_billboard(id);
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_update_billboard(&mut self, id: u32, x: f32, y: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.update_billboard(id, x, y);
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_set_fog(&mut self, dist: f32, r: u8, g: u8, b: u8) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.camera.fog_dist = dist;
            rc.fog_color = [r, g, b];
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_set_floor_color(&mut self, r: u8, g: u8, b: u8) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.floor_color = [r, g, b];
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_set_ceiling_color(&mut self, r: u8, g: u8, b: u8) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.ceiling_color = [r, g, b];
        }
    }

    /// Shear the horizon: positive pitch looks down, negative looks up.
    /// Measured in framebuffer pixels.
    #[wasm_bindgen]
    pub fn raycaster_set_pitch(&mut self, pitch: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.camera.pitch = pitch;
        }
    }

    /// Where the eye sits between floor (0.0) and ceiling (1.0). 0.5 stands.
    #[wasm_bindgen]
    pub fn raycaster_set_eye_height(&mut self, height: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.camera.eye_height = height;
        }
    }

    /// Raise or lower one billboard between the floor and the ceiling.
    #[wasm_bindgen]
    pub fn raycaster_set_billboard_elevation(&mut self, id: u32, elevation: f32) {
        if let Some(rc) = &mut self.engine.raycaster {
            rc.set_billboard_elevation(id, elevation);
        }
    }

    /// Fire a shot from `(x, y)` along `angle` and report what it hit.
    ///
    /// Returned flat so no object crosses the WASM boundary per bullet:
    /// `[hitWall, wallDist, wallTile, hitBillboard, billboardId,
    ///   billboardDist, endX, endY]`, with the boolean slots as 0 or 1.
    #[wasm_bindgen]
    pub fn raycaster_hitscan(
        &self,
        x: f32,
        y: f32,
        angle: f32,
        max_distance: f32,
        radius: f32,
        ignore: i32,
    ) -> js_sys::Float32Array {
        let arr = js_sys::Float32Array::new_with_length(8);
        let Some(rc) = &self.engine.raycaster else {
            return arr;
        };
        let shot = rc.hitscan(
            glam::Vec2::new(x, y),
            angle,
            max_distance,
            radius,
            // A negative id means "ignore nothing"; ids themselves are u32.
            if ignore < 0 {
                None
            } else {
                Some(ignore as u32)
            },
        );
        let wall = shot.wall;
        let bb = shot.billboard;
        arr.copy_from(&[
            wall.is_some() as u8 as f32,
            wall.map(|w| w.distance).unwrap_or(-1.0),
            wall.map(|w| w.tile as f32).unwrap_or(0.0),
            bb.is_some() as u8 as f32,
            bb.map(|b| b.id as f32).unwrap_or(-1.0),
            bb.map(|b| b.distance).unwrap_or(-1.0),
            shot.point.x,
            shot.point.y,
        ]);
        arr
    }

    /// True when nothing solid stands between the two points.
    #[wasm_bindgen]
    pub fn raycaster_line_of_sight(&self, x0: f32, y0: f32, x1: f32, y1: f32) -> bool {
        self.engine
            .raycaster
            .as_ref()
            .is_some_and(|rc| rc.line_of_sight(glam::Vec2::new(x0, y0), glam::Vec2::new(x1, y1)))
    }

    /// Slide a circular body through the raycast map, stopping at walls.
    /// Returns the resolved `[x, y]`.
    #[wasm_bindgen]
    pub fn raycaster_slide(
        &self,
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        radius: f32,
    ) -> js_sys::Float32Array {
        let arr = js_sys::Float32Array::new_with_length(2);
        match &self.engine.raycaster {
            Some(rc) => {
                let p = rc.slide_circle(glam::Vec2::new(x, y), glam::Vec2::new(dx, dy), radius);
                arr.copy_from(&[p.x, p.y]);
            }
            None => arr.copy_from(&[x, y]),
        }
        arr
    }

    /// The raycast map cell at `(col, row)`; out of bounds reads as solid.
    #[wasm_bindgen]
    pub fn raycaster_cell(&self, col: i32, row: i32) -> u8 {
        self.engine
            .raycaster
            .as_ref()
            .map_or(1, |rc| rc.map.get(col, row))
    }

    // --- Pathfinding ---

    /// A* across the current raycast map, from `(sx, sy)` to `(gx, gy)`.
    ///
    /// Returns the waypoints flattened as `[x0, y0, x1, y1, ...]`, already
    /// reduced to corners, or an empty array when there is no route.
    #[wasm_bindgen]
    pub fn raycaster_find_path(
        &self,
        sx: i32,
        sy: i32,
        gx: i32,
        gy: i32,
        diagonal: bool,
    ) -> js_sys::Int32Array {
        use cathode_core::pathfinding::{find_path, simplify, Grid, Movement};

        let Some(rc) = &self.engine.raycaster else {
            return js_sys::Int32Array::new_with_length(0);
        };
        let grid = Grid::from_cells(rc.map.cols, rc.map.rows, &rc.map.cells, |c| *c != 0);
        let movement = if diagonal {
            Movement::EightWay
        } else {
            Movement::FourWay
        };

        let path = match find_path(&grid, (sx, sy), (gx, gy), movement) {
            Some(p) => simplify(&p),
            None => return js_sys::Int32Array::new_with_length(0),
        };

        let flat: Vec<i32> = path.iter().flat_map(|&(x, y)| [x, y]).collect();
        let arr = js_sys::Int32Array::new_with_length(flat.len() as u32);
        arr.copy_from(&flat);
        arr
    }

    // --- Save/Load ---

    #[wasm_bindgen]
    pub fn save_set(&mut self, slot: u8, key: &str, value_json: &str) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(value_json) {
            let _ = self.engine.saves.slot_mut(slot).set(key, val);
        }
    }

    #[wasm_bindgen]
    pub fn save_get(&self, slot: u8, key: &str) -> JsValue {
        match self.engine.saves.slot(slot).get::<serde_json::Value>(key) {
            Some(val) => serde_wasm_bindgen::to_value(&val).unwrap_or(JsValue::NULL),
            None => JsValue::NULL,
        }
    }

    #[wasm_bindgen]
    pub fn save_remove(&mut self, slot: u8, key: &str) {
        self.engine.saves.slot_mut(slot).remove(key);
    }

    #[wasm_bindgen]
    pub fn save_export(&self, slot: u8) -> String {
        self.engine.saves.save(slot)
    }

    #[wasm_bindgen]
    pub fn save_import(&mut self, slot: u8, json: &str) {
        let _ = self.engine.saves.load(slot, json);
    }

    // --- Overlay / Debug drawing ---

    #[wasm_bindgen]
    pub fn draw_overlay_rect(&mut self, r: u8, g: u8, b: u8, a: u8) {
        self.engine.draw_overlay_rect(r, g, b, a);
    }

    #[wasm_bindgen]
    #[allow(clippy::too_many_arguments)]
    pub fn debug_draw_rect(&mut self, x: i32, y: i32, w: i32, h: i32, r: u8, g: u8, b: u8) {
        self.engine.debug_draw_rect(x, y, w, h, r, g, b);
    }

    // --- Collider management ---

    #[wasm_bindgen]
    pub fn add_collider(&mut self, id: u64, ox: f32, oy: f32, w: f32, h: f32) {
        if let Some(e) = self.find_entity(id) {
            let _ = self.engine.world.insert_one(
                e,
                Collider {
                    offset: glam::Vec2::new(ox, oy),
                    size: glam::Vec2::new(w, h),
                },
            );
        }
    }

    /// Opt an entity into gravity. `scale` multiplies the engine's base
    /// gravity: 1.0 is a normal fall, 0.35 is floaty, 0.0 disables it.
    /// Entities never fall unless this is called.
    #[wasm_bindgen]
    pub fn set_gravity(&mut self, id: u64, scale: f32) {
        if let Some(e) = self.find_entity(id) {
            let _ = self
                .engine
                .world
                .insert_one(e, cathode_core::ecs::Gravity(scale));
        }
    }

    #[wasm_bindgen]
    pub fn clear_gravity(&mut self, id: u64) {
        if let Some(e) = self.find_entity(id) {
            let _ = self
                .engine
                .world
                .remove_one::<cathode_core::ecs::Gravity>(e);
        }
    }

    #[wasm_bindgen]
    pub fn set_solid(&mut self, id: u64, solid: bool) {
        if let Some(e) = self.find_entity(id) {
            if solid {
                let _ = self.engine.world.insert_one(e, cathode_core::ecs::Solid);
            } else {
                let _ = self.engine.world.remove_one::<cathode_core::ecs::Solid>(e);
            }
        }
    }
}
