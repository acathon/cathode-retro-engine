use retro_core::config::EngineConfig;
use retro_core::ecs::{GamepadState, Position, SpriteIndex, Velocity};
use retro_core::renderer::tilemap::TileMap;
use retro_core::Engine;
use wasm_bindgen::prelude::*;
use wasm_bindgen::Clamped;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, ImageData};

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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
    pub fn shake(&mut self, intensity: f32, duration: f32) {
        self.engine.shake(intensity, duration);
    }
}
