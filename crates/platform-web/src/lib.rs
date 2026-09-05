use retro_core::config::EngineConfig;
use retro_core::ecs::{Collider, GamepadState, Position, SpriteIndex, Velocity};
use retro_core::renderer::tilemap::TileMap;
use retro_core::Engine;
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
        let sheet = retro_core::assets::SpriteSheet::from_rgba(w, h, tw, th, pixels);
        self.engine.assets.add_sheet(sheet)
    }

    #[wasm_bindgen]
    pub fn load_tilemap(&mut self, json: &str) -> Result<u32, JsValue> {
        let map: TileMap =
            serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.engine.renderer.tilemaps.push(map);
        Ok((self.engine.renderer.tilemaps.len() - 1) as u32)
    }

    #[wasm_bindgen]
    pub fn set_camera(&mut self, x: f32, y: f32) {
        self.engine.renderer.camera.x = x;
        self.engine.renderer.camera.y = y;
    }

    #[wasm_bindgen]
    pub fn set_scanlines(&mut self, val: bool) {
        self.engine.renderer.scanlines = val;
    }

    #[wasm_bindgen]
    pub fn set_bg_color(&mut self, r: u8, g: u8, b: u8) {
        self.engine.renderer.bg_color = retro_core::renderer::palette::Color::rgb(r, g, b);
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
            0 => retro_core::audio::Waveform::Pulse25,
            1 => retro_core::audio::Waveform::Pulse50,
            2 => retro_core::audio::Waveform::Triangle,
            3 => retro_core::audio::Waveform::Sawtooth,
            4 => retro_core::audio::Waveform::Noise,
            _ => retro_core::audio::Waveform::Sine,
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
                retro_core::audio::envelope::Envelope::new(attack, decay, sustain, release);
        }
    }

    #[wasm_bindgen]
    pub fn audio_set_envelope_preset(&mut self, ch: usize, preset: &str) {
        if let Some(channel) = self.engine.audio.channels.get_mut(ch) {
            channel.envelope = retro_core::audio::envelope::Envelope::from_preset(preset);
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
                        retro_core::collision::CollisionSide::Top => "top",
                        retro_core::collision::CollisionSide::Bottom => "bottom",
                        retro_core::collision::CollisionSide::Left => "left",
                        retro_core::collision::CollisionSide::Right => "right",
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
        self.engine.camera.bounds = Some(retro_core::camera::Rect::new(x, y, w, h));
    }

    #[wasm_bindgen]
    pub fn set_camera_dead_zone(&mut self, x: f32, y: f32, w: f32, h: f32) {
        self.engine.camera.dead_zone = Some(retro_core::camera::Rect::new(x, y, w, h));
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
        let emitter = retro_core::particles::ParticleEmitter::new(max_particles as usize);
        self.engine.emitters.push(emitter);
        (self.engine.emitters.len() - 1) as u32
    }

    #[wasm_bindgen]
    pub fn emitter_burst(&mut self, handle: u32, x: f32, y: f32, count: u32, config_json: &str) {
        if let Some(emitter) = self.engine.emitters.get_mut(handle as usize) {
            let config: retro_core::particles::EmitConfig =
                serde_json::from_str(config_json).unwrap_or_default();
            emitter.burst(glam::Vec2::new(x, y), count, &config);
        }
    }

    #[wasm_bindgen]
    pub fn emitter_set_pos(&mut self, handle: u32, x: f32, y: f32) {
        if let Some(emitter) = self.engine.emitters.get_mut(handle as usize) {
            emitter.pos = glam::Vec2::new(x, y);
        }
    }

    #[wasm_bindgen]
    pub fn destroy_emitter(&mut self, handle: u32) {
        if (handle as usize) < self.engine.emitters.len() {
            self.engine.emitters.remove(handle as usize);
        }
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
        let ease = retro_core::tween::EaseFn::from_id(ease_id);
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

    #[wasm_bindgen]
    pub fn draw_text(&mut self, font_handle: u32, text: &str, x: i32, y: i32, scale: u32) {
        if let Some(font) = self.engine.fonts.get(font_handle) {
            font.draw_text(
                &mut self.engine.renderer.framebuffer,
                &self.engine.assets,
                text,
                x,
                y,
                scale,
            );
        }
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
        let pattern = retro_core::audio::sequencer::Sequencer::parse_mml(mml, bpm);
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
            let map = retro_core::raycaster::RaycastMap::new(cols, rows, cells);
            self.engine.raycaster = Some(retro_core::raycaster::RaycastRenderer::new(map));
        }
    }

    #[wasm_bindgen]
    pub fn raycaster_set_texture(&mut self, wall_type: u8, pixels: Vec<u8>, size: u32) {
        if let Some(rc) = &mut self.engine.raycaster {
            let tex = retro_core::raycaster::WallTexture { pixels, size };
            let idx = (wall_type as usize).saturating_sub(1);
            while rc.textures.len() <= idx {
                rc.textures.push(retro_core::raycaster::WallTexture {
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

    #[wasm_bindgen]
    pub fn set_solid(&mut self, id: u64, solid: bool) {
        if let Some(e) = self.find_entity(id) {
            if solid {
                let _ = self.engine.world.insert_one(e, retro_core::ecs::Solid);
            } else {
                let _ = self.engine.world.remove_one::<retro_core::ecs::Solid>(e);
            }
        }
    }
}
