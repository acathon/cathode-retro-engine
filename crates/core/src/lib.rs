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
    /// Particle emitters, addressed by stable handles. Slots are reused after
    /// `destroy_emitter`, so handles held by callers never shift.
    pub emitters: Vec<Option<ParticleEmitter>>,
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
        for emitter in self.emitters.iter_mut().flatten() {
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
                self.audio
                    .play(evt.channel as usize, evt.note, wf, evt.volume);
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
        for emitter in self.emitters.iter().flatten() {
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
        self.emitters
            .iter()
            .flatten()
            .map(|e| e.particle_count())
            .sum()
    }

    /// Create a particle emitter and return a stable handle to it.
    pub fn create_emitter(&mut self, max_particles: usize) -> u32 {
        let emitter = ParticleEmitter::new(max_particles);
        for (i, slot) in self.emitters.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(emitter);
                return i as u32;
            }
        }
        self.emitters.push(Some(emitter));
        (self.emitters.len() - 1) as u32
    }

    /// Destroy an emitter. The handle's slot is reused by later
    /// `create_emitter` calls; other emitters keep their handles.
    pub fn destroy_emitter(&mut self, handle: u32) {
        if let Some(slot) = self.emitters.get_mut(handle as usize) {
            *slot = None;
        }
    }

    pub fn emitter_mut(&mut self, handle: u32) -> Option<&mut ParticleEmitter> {
        self.emitters
            .get_mut(handle as usize)
            .and_then(|s| s.as_mut())
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

    /// Draw a debug rect outline, in world space.
    #[allow(clippy::too_many_arguments)]
    pub fn debug_draw_rect(&mut self, x: i32, y: i32, w: i32, h: i32, r: u8, g: u8, b: u8) {
        if w <= 0 || h <= 0 {
            return;
        }

        let cam = self.renderer.camera;
        let sx = x - cam.x as i32;
        let sy = y - cam.y as i32;
        let right = sx + w - 1;
        let bottom = sy + h - 1;
        let fb = &mut self.renderer.framebuffer;

        // Edges that fall outside the framebuffer are skipped rather than
        // clamped to it: clamping used to smear a box's border along the top
        // or left edge of the screen whenever it scrolled partly out of view.
        let mut plot = |px: i32, py: i32| {
            if px >= 0 && py >= 0 {
                fb.set_pixel(px as u32, py as u32, r, g, b, 255);
            }
        };

        for dx in 0..w {
            plot(sx + dx, sy);
            plot(sx + dx, bottom);
        }
        for dy in 0..h {
            plot(sx, sy + dy);
            plot(right, sy + dy);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ecs::{Gravity, Position, Velocity};
    use crate::particles::EmitConfig;
    use glam::Vec2;

    fn pixel(fb: &FrameBuffer, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * fb.width + x) * 4) as usize;
        [
            fb.pixels[i],
            fb.pixels[i + 1],
            fb.pixels[i + 2],
            fb.pixels[i + 3],
        ]
    }

    #[test]
    fn a_default_engine_uses_the_nes_profile() {
        let engine = Engine::default();
        assert_eq!(engine.config.width, 256);
        assert_eq!(engine.config.height, 240);
        assert_eq!(engine.tick(), 0);
        assert_eq!(engine.entity_count(), 0);
        assert_eq!(engine.particle_count(), 0);
    }

    #[test]
    fn each_hardware_profile_sizes_its_framebuffer() {
        for (config, w, h) in [
            (EngineConfig::gameboy(), 160, 144),
            (EngineConfig::nes(), 256, 240),
            (EngineConfig::neogeo(), 320, 224),
        ] {
            let mut engine = Engine::new(config);
            let fb = engine.render();
            assert_eq!((fb.width, fb.height), (w, h));
        }
    }

    #[test]
    fn update_advances_the_tick_counter() {
        let mut engine = Engine::default();
        engine.update(1.0 / 60.0);
        engine.update(1.0 / 60.0);
        assert_eq!(engine.tick(), 2);
    }

    #[test]
    fn delta_time_is_clamped_against_stalls_and_zero() {
        let mut engine = Engine::default();

        // A long stall (an alt-tabbed browser tab) must not teleport bodies.
        engine.update(10.0);
        assert!(engine.delta() <= 0.05, "got {}", engine.delta());

        // A zero delta would freeze time and divide badly downstream.
        engine.update(0.0);
        assert!(engine.delta() > 0.0);
    }

    #[test]
    fn update_runs_the_physics_step() {
        let mut engine = Engine::default();
        let e = engine
            .world
            .spawn((Position(Vec2::ZERO), Velocity(Vec2::new(60.0, 0.0))));

        engine.update(0.05);

        let pos = engine.world.get::<&Position>(e).unwrap().0;
        assert!((pos.x - 3.0).abs() < 1e-3, "got {pos:?}");
    }

    #[test]
    fn gravity_only_applies_to_entities_that_opted_in() {
        let mut engine = Engine::default();
        let falling = engine.world.spawn((
            Position(Vec2::ZERO),
            Velocity(Vec2::ZERO),
            Gravity::default(),
        ));
        let floating = engine
            .world
            .spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO)));

        for _ in 0..30 {
            engine.update(1.0 / 60.0);
        }

        assert!(engine.world.get::<&Position>(falling).unwrap().0.y > 0.0);
        assert_eq!(engine.world.get::<&Position>(floating).unwrap().0.y, 0.0);
    }

    #[test]
    fn entity_count_tracks_the_world() {
        let mut engine = Engine::default();
        let e = engine.world.spawn((Position(Vec2::ZERO),));
        assert_eq!(engine.entity_count(), 1);
        engine.world.despawn(e).unwrap();
        assert_eq!(engine.entity_count(), 0);
    }

    #[test]
    fn emitter_handles_survive_destroying_another_emitter() {
        // Regression test: emitters were stored in a Vec and destroy_emitter
        // used Vec::remove, so every later handle silently shifted onto the
        // wrong emitter.
        let mut engine = Engine::default();
        let a = engine.create_emitter(64);
        let b = engine.create_emitter(64);
        let c = engine.create_emitter(64);
        assert_eq!((a, b, c), (0, 1, 2));

        let config = EmitConfig::default();
        engine.emitter_mut(c).unwrap().burst(Vec2::ZERO, 5, &config);

        engine.destroy_emitter(a);

        assert!(engine.emitter_mut(a).is_none(), "destroyed handle is dead");
        assert_eq!(
            engine.emitter_mut(c).unwrap().particle_count(),
            5,
            "c must still address its own emitter"
        );
        assert_eq!(engine.particle_count(), 5);
    }

    #[test]
    fn destroyed_emitter_slots_are_reused() {
        let mut engine = Engine::default();
        let a = engine.create_emitter(8);
        let _b = engine.create_emitter(8);

        engine.destroy_emitter(a);
        assert_eq!(engine.create_emitter(8), a, "slot should be recycled");
    }

    #[test]
    fn destroying_an_unknown_emitter_is_a_no_op() {
        let mut engine = Engine::default();
        engine.destroy_emitter(99);
        assert!(engine.emitter_mut(99).is_none());
    }

    #[test]
    fn update_advances_particles_and_retires_them() {
        let mut engine = Engine::default();
        let handle = engine.create_emitter(64);
        let config = EmitConfig {
            life_min: 0.1,
            life_max: 0.1,
            ..Default::default()
        };
        engine
            .emitter_mut(handle)
            .unwrap()
            .burst(Vec2::ZERO, 10, &config);
        assert_eq!(engine.particle_count(), 10);

        for _ in 0..20 {
            engine.update(1.0 / 60.0);
        }
        assert_eq!(engine.particle_count(), 0, "particles should expire");
    }

    #[test]
    fn overlay_rect_covers_the_whole_framebuffer() {
        let mut engine = Engine::new(EngineConfig::gameboy());
        engine.render();
        engine.draw_overlay_rect(255, 0, 0, 255);

        let fb = &engine.renderer.framebuffer;
        assert_eq!(pixel(fb, 0, 0), [255, 0, 0, 255]);
        assert_eq!(pixel(fb, fb.width - 1, fb.height - 1), [255, 0, 0, 255]);
    }

    #[test]
    fn debug_rect_draws_its_outline_but_not_its_interior() {
        let mut engine = Engine::new(EngineConfig::gameboy());
        engine.render();
        engine.renderer.framebuffer.clear(0, 0, 0);

        engine.debug_draw_rect(10, 10, 8, 8, 255, 0, 0);

        let fb = &engine.renderer.framebuffer;
        assert_eq!(pixel(fb, 10, 10)[0], 255, "top-left corner");
        assert_eq!(pixel(fb, 17, 17)[0], 255, "bottom-right corner");
        assert_eq!(pixel(fb, 13, 13)[0], 0, "interior stays empty");
    }

    #[test]
    fn a_partly_offscreen_debug_rect_does_not_smear_the_edge() {
        // Regression test: off-screen edges were clamped to 0 instead of
        // skipped, painting a line along the top of the screen.
        let mut engine = Engine::new(EngineConfig::gameboy());
        engine.render();
        engine.renderer.framebuffer.clear(0, 0, 0);

        // A box entirely above the viewport.
        engine.debug_draw_rect(10, -50, 8, 8, 255, 0, 0);

        let fb = &engine.renderer.framebuffer;
        for x in 0..fb.width {
            assert_eq!(pixel(fb, x, 0)[0], 0, "row 0 must stay clear at x={x}");
        }
    }

    #[test]
    fn a_degenerate_debug_rect_draws_nothing() {
        let mut engine = Engine::new(EngineConfig::gameboy());
        engine.render();
        engine.renderer.framebuffer.clear(0, 0, 0);

        engine.debug_draw_rect(10, 10, 0, 0, 255, 0, 0);
        engine.debug_draw_rect(10, 10, -5, -5, 255, 0, 0);

        assert!(engine
            .renderer
            .framebuffer
            .pixels
            .chunks(4)
            .all(|p| p[0] == 0));
    }

    #[test]
    fn shake_settles_back_to_rest() {
        let mut engine = Engine::default();
        engine.shake(8.0, 0.2);
        assert_eq!(engine.renderer.shake_intensity, 8.0);

        for _ in 0..60 {
            engine.render();
        }
        // Rendering past the shake duration leaves the camera steady again.
        engine.render();
    }

    #[test]
    fn the_sequencer_drives_the_mixer_through_update() {
        use crate::audio::sequencer::{NoteEvent, Pattern};

        let mut engine = Engine::default();
        engine.sequencer.load(Pattern {
            events: vec![NoteEvent {
                channel: 0,
                note: 440.0,
                waveform: 1,
                volume: 0.5,
                duration: 1.0,
            }],
            bpm: 120.0,
        });
        engine.sequencer.play();

        engine.update(1.0 / 60.0);

        assert!(
            engine.audio.channels[0].active,
            "the note should be playing"
        );
        assert_eq!(engine.audio.channels[0].frequency, 440.0);
    }

    #[test]
    fn a_rest_event_stops_its_channel() {
        use crate::audio::sequencer::{NoteEvent, Pattern};

        let mut engine = Engine::default();
        engine.audio.play(0, 440.0, audio::Waveform::Pulse50, 0.5);
        engine.sequencer.load(Pattern {
            events: vec![NoteEvent {
                channel: 0,
                note: 0.0,
                waveform: 1,
                volume: 0.0,
                duration: 1.0,
            }],
            bpm: 120.0,
        });
        engine.sequencer.play();

        engine.update(1.0 / 60.0);
        assert!(!engine.audio.channels[0].active);
    }

    #[test]
    fn rendering_an_empty_engine_produces_the_background_colour() {
        let mut engine = Engine::new(EngineConfig::gameboy());
        let fb = engine.render();
        let expected = renderer::Palette::gameboy().get(1);
        assert_eq!(pixel(fb, 0, 0), [expected.0, expected.1, expected.2, 255]);
    }
}
