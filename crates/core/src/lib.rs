pub mod assets;
pub mod audio;
pub mod config;
pub mod ecs;
pub mod input;
pub mod physics;
pub mod renderer;
pub mod scene;

pub use config::{EngineConfig, HardwareProfile};
pub use hecs::World;

use assets::AssetStore;
use audio::AudioMixer;
use input::InputState;
use renderer::{FrameBuffer, Renderer};
use scene::SceneManager;

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
        );
        let audio = AudioMixer::new(config.audio_channels);

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
        }
    }

    pub fn update(&mut self, delta_secs: f32) {
        self.delta_secs = delta_secs.clamp(0.0001, 0.05); // cap delta to 20fps equivalent max

        physics::step(&mut self.world, self.delta_secs);
        self.scenes.update(&mut self.world, &self.input);
        self.input.end_frame();

        self.tick += 1;
    }

    pub fn render(&mut self) -> &FrameBuffer {
        self.scenes.draw(&mut self.renderer, &self.world);
        self.renderer.render(&self.world, &self.assets)
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
}
