pub mod assets;
pub mod audio;
pub mod camera;
pub mod collision;
pub mod config;
pub mod ecs;
pub mod input;
pub mod particles;
pub mod physics;
pub mod raycaster;
pub mod renderer;
pub mod save;
pub mod scene;
pub mod text;
pub mod timer;
pub mod tween;

pub use config::{EngineConfig, HardwareProfile};
pub use hecs::World;

use assets::AssetStore;
use audio::sequencer::Sequencer;
use audio::AudioMixer;
use camera::Camera;
use collision::CollisionQueue;
use input::InputState;
use particles::ParticleEmitter;
use renderer::{FrameBuffer, Renderer};
use save::SaveManager;
use scene::SceneManager;
use text::FontRegistry;
use timer::TimerPool;
use tween::TweenPool;

pub struct Engine {
    pub config: EngineConfig,
    pub world: World,
    pub renderer: Renderer,
    pub audio: AudioMixer,
    pub input: InputState,
    pub assets: AssetStore,
    pub scenes: SceneManager,
    pub tick: u64,
    pub delta_secs: f32,
    pub collisions: CollisionQueue,
    pub camera: Camera,
    pub emitters: Vec<ParticleEmitter>,
    pub tweens: TweenPool,
    pub fonts: FontRegistry,
    pub timers: TimerPool,
    pub sequencer: Sequencer,
    pub raycaster: Option<raycaster::RaycastRenderer>,
    pub saves: SaveManager,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new(EngineConfig::default())
    }
}

impl Engine {
    pub fn new(config: EngineConfig) -> Self {
        let renderer = Renderer::new(
            config.width,
            config.height,
            config.sprite_limit,
            config.scanlines,
            config.profile,
        );
        let audio = AudioMixer::new(config.audio_channels);
        let camera = Camera::new(config.width as f32, config.height as f32);

        Self {
            config,
            world: World::new(),
            renderer,
            audio,
            input: InputState::default(),
            assets: AssetStore::new(),
            scenes: SceneManager::new(),
            tick: 0,
            delta_secs: 0.0,
            collisions: CollisionQueue::new(),
            camera,
            emitters: Vec::new(),
            tweens: TweenPool::new(),
            fonts: FontRegistry::new(),
            timers: TimerPool::new(),
            sequencer: Sequencer::new(),
            raycaster: None,
            saves: SaveManager::new(),
        }
    }

    pub fn update(&mut self, delta_secs: f32) {
        self.delta_secs = delta_secs.clamp(0.0001, 0.05);

        physics::step(&mut self.world, self.delta_secs);
        collision::detect_collisions(&self.world, &mut self.collisions);
        self.scenes.update(&mut self.world, &self.input);
        self.input.end_frame();

        // Update camera
        self.camera.update(self.delta_secs);
        self.renderer.camera = self.camera.pos;

        // Update particles
        for emitter in &mut self.emitters {
            emitter.update(self.delta_secs);
        }

        // Update tweens
        self.tweens.update_all(self.delta_secs);

        // Update timers
        self.timers.update_all(self.delta_secs);

        // Update sequencer
        let seq_events = self.sequencer.update(self.delta_secs);
        for evt in seq_events {
            if evt.note > 0.0 {
                let wf = match evt.waveform {
                    0 => audio::Waveform::Pulse25,
                    1 => audio::Waveform::Pulse50,
                    2 => audio::Waveform::Triangle,
                    3 => audio::Waveform::Sawtooth,
                    4 => audio::Waveform::Noise,
                    _ => audio::Waveform::Sine,
                };
                self.audio.play(evt.channel as usize, evt.note, wf, evt.volume);
            } else {
                self.audio.stop(evt.channel as usize);
            }
        }

        self.tick += 1;
    }

    pub fn render(&mut self) -> &FrameBuffer {
        self.scenes.draw(&mut self.renderer, &self.world);

        // Render raycaster first if present
        if let Some(rc) = &mut self.raycaster {
            rc.render(&mut self.renderer.framebuffer);
            self.renderer.skip_clear = true;
        }

        self.renderer.render(&self.world, &self.assets);

        // Render particles on top
        let cam = self.renderer.camera;
        for emitter in &self.emitters {
            emitter.render(&mut self.renderer.framebuffer, cam);
        }

        &self.renderer.framebuffer
    }

    pub fn tick(&self) -> u64 {
        self.tick
    }

    pub fn delta(&self) -> f32 {
        self.delta_secs
    }

    pub fn entity_count(&self) -> u32 {
        self.world.len()
    }

    pub fn shake(&mut self, intensity: f32, duration: f32) {
        self.renderer.shake(intensity, duration);
    }

    pub fn particle_count(&self) -> usize {
        self.emitters.iter().map(|e| e.particle_count()).sum()
    }

    /// Draw an overlay rect (used for transitions, flash effects, etc.)
    pub fn draw_overlay_rect(&mut self, r: u8, g: u8, b: u8, a: u8) {
        let w = self.renderer.framebuffer.width;
        let h = self.renderer.framebuffer.height;
        for y in 0..h {
            for x in 0..w {
                self.renderer.framebuffer.set_pixel(x, y, r, g, b, a);
            }
        }
    }

    /// Draw a debug rect outline
    pub fn debug_draw_rect(&mut self, x: i32, y: i32, w: i32, h: i32, r: u8, g: u8, b: u8) {
        let cam_x = self.renderer.camera.x as i32;
        let cam_y = self.renderer.camera.y as i32;
        let sx = x - cam_x;
        let sy = y - cam_y;

        // Top and bottom
        for dx in 0..w {
            let px = sx + dx;
            if px >= 0 {
                self.renderer.framebuffer.set_pixel(px as u32, sy.max(0) as u32, r, g, b, 255);
                self.renderer.framebuffer.set_pixel(px as u32, (sy + h - 1).max(0) as u32, r, g, b, 255);
            }
        }
        // Left and right
        for dy in 0..h {
            let py = sy + dy;
            if py >= 0 {
                self.renderer.framebuffer.set_pixel(sx.max(0) as u32, py as u32, r, g, b, 255);
                self.renderer.framebuffer.set_pixel((sx + w - 1).max(0) as u32, py as u32, r, g, b, 255);
            }
        }
    }
}
