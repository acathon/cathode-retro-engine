use crate::renderer::FrameBuffer;
use glam::Vec2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct Particle {
    pub pos: Vec2,
    pub vel: Vec2,
    pub color: [u8; 4],
    pub size: f32,
    /// The size the particle spawned at, kept so `shrink` can scale from a
    /// fixed origin instead of reconstructing it from the current size.
    pub size_start: f32,
    pub life: f32,
    pub max_life: f32,
    pub gravity: f32,
    pub fade: bool,
    pub shrink: bool,
    pub color_start: [u8; 4],
    pub color_end: [u8; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmitConfig {
    pub angle: f32,
    pub spread: f32,
    pub speed_min: f32,
    pub speed_max: f32,
    pub life_min: f32,
    pub life_max: f32,
    pub size_min: f32,
    pub size_max: f32,
    pub gravity: f32,
    pub color_start: [u8; 4],
    pub color_end: [u8; 4],
    pub fade: bool,
    pub shrink: bool,
}

impl Default for EmitConfig {
    fn default() -> Self {
        Self {
            angle: 0.0,
            spread: std::f32::consts::TAU,
            speed_min: 20.0,
            speed_max: 80.0,
            life_min: 0.5,
            life_max: 1.5,
            size_min: 1.0,
            size_max: 3.0,
            gravity: 0.0,
            color_start: [255, 255, 255, 255],
            color_end: [255, 255, 255, 0],
            fade: true,
            shrink: false,
        }
    }
}

pub struct ParticleEmitter {
    pub pos: Vec2,
    pub particles: Vec<Particle>,
    pub max_particles: usize,
    accum: f32,
    seed: u32,
}

impl ParticleEmitter {
    pub fn new(max: usize) -> Self {
        Self {
            pos: Vec2::ZERO,
            particles: Vec::with_capacity(max),
            max_particles: max,
            accum: 0.0,
            seed: 12345,
        }
    }

    fn next_random(&mut self) -> f32 {
        self.seed = self.seed.wrapping_mul(1103515245).wrapping_add(12345);
        ((self.seed >> 16) & 0x7FFF) as f32 / 32767.0
    }

    fn spawn_particle(&mut self, pos: Vec2, config: &EmitConfig) {
        if self.particles.len() >= self.max_particles {
            return;
        }

        let rand_angle = config.angle + (self.next_random() - 0.5) * config.spread;
        let speed = config.speed_min + self.next_random() * (config.speed_max - config.speed_min);
        let life = config.life_min + self.next_random() * (config.life_max - config.life_min);
        let size = config.size_min + self.next_random() * (config.size_max - config.size_min);

        let vel = Vec2::new(rand_angle.cos() * speed, rand_angle.sin() * speed);

        self.particles.push(Particle {
            pos,
            vel,
            color: config.color_start,
            size,
            size_start: size,
            life,
            max_life: life,
            gravity: config.gravity,
            fade: config.fade,
            shrink: config.shrink,
            color_start: config.color_start,
            color_end: config.color_end,
        });
    }

    pub fn burst(&mut self, pos: Vec2, count: u32, config: &EmitConfig) {
        for _ in 0..count {
            self.spawn_particle(pos, config);
        }
    }

    pub fn emit(&mut self, pos: Vec2, rate: f32, dt: f32, config: &EmitConfig) {
        self.accum += rate * dt;
        while self.accum >= 1.0 {
            self.accum -= 1.0;
            self.spawn_particle(pos, config);
        }
    }

    pub fn update(&mut self, dt: f32) -> u32 {
        let mut removed = 0u32;
        self.particles.retain_mut(|p| {
            p.life -= dt;
            if p.life <= 0.0 {
                removed += 1;
                return false;
            }
            p.vel.y += p.gravity * dt;
            p.pos += p.vel * dt;

            let t = 1.0 - (p.life / p.max_life);

            // Color lerp
            for i in 0..4 {
                p.color[i] = (p.color_start[i] as f32
                    + (p.color_end[i] as f32 - p.color_start[i] as f32) * t)
                    as u8;
            }

            if p.fade {
                p.color[3] = ((1.0 - t) * p.color_start[3] as f32) as u8;
            }

            if p.shrink {
                // Scale from the spawn size. This used to divide the current
                // size by last frame's shrink factor to recover the original,
                // which only held for a perfectly constant dt.
                p.size = p.size_start * (1.0 - t);
            }

            true
        });
        removed
    }

    pub fn render(&self, fb: &mut FrameBuffer, camera: Vec2) {
        for p in &self.particles {
            let sx = (p.pos.x - camera.x) as i32;
            let sy = (p.pos.y - camera.y) as i32;
            let half = (p.size * 0.5) as i32;

            for dy in -half..=half {
                for dx in -half..=half {
                    let px = sx + dx;
                    let py = sy + dy;
                    if px >= 0 && py >= 0 {
                        fb.set_pixel(
                            px as u32, py as u32, p.color[0], p.color[1], p.color[2], p.color[3],
                        );
                    }
                }
            }
        }
    }

    pub fn particle_count(&self) -> usize {
        self.particles.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn steady_config() -> EmitConfig {
        // No spread or speed variance, so positions are exactly predictable.
        EmitConfig {
            angle: 0.0,
            spread: 0.0,
            speed_min: 10.0,
            speed_max: 10.0,
            life_min: 1.0,
            life_max: 1.0,
            size_min: 4.0,
            size_max: 4.0,
            gravity: 0.0,
            color_start: [255, 255, 255, 255],
            color_end: [255, 255, 255, 0],
            fade: false,
            shrink: false,
        }
    }

    #[test]
    fn burst_spawns_the_requested_count() {
        let mut em = ParticleEmitter::new(100);
        assert_eq!(em.particle_count(), 0);
        em.burst(Vec2::ZERO, 10, &steady_config());
        assert_eq!(em.particle_count(), 10);
    }

    #[test]
    fn burst_is_capped_at_max_particles() {
        let mut em = ParticleEmitter::new(5);
        em.burst(Vec2::ZERO, 50, &steady_config());
        assert_eq!(em.particle_count(), 5);
    }

    #[test]
    fn emit_accumulates_fractional_spawns_over_time() {
        let mut em = ParticleEmitter::new(100);
        let cfg = steady_config();
        // 10 per second for a tenth of a second is one particle.
        em.emit(Vec2::ZERO, 10.0, 0.05, &cfg);
        assert_eq!(em.particle_count(), 0, "half a particle is not a particle");
        em.emit(Vec2::ZERO, 10.0, 0.05, &cfg);
        assert_eq!(em.particle_count(), 1);
    }

    #[test]
    fn particles_move_by_their_velocity() {
        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::new(50.0, 50.0), 1, &steady_config());
        em.update(0.5);
        // angle 0 with speed 10 travels +x.
        assert!((em.particles[0].pos.x - 55.0).abs() < 1e-3);
        assert!((em.particles[0].pos.y - 50.0).abs() < 1e-3);
    }

    #[test]
    fn gravity_pulls_particles_down() {
        let mut cfg = steady_config();
        cfg.gravity = 100.0;
        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::ZERO, 1, &cfg);
        em.update(0.5);
        assert!(em.particles[0].vel.y > 0.0);
        assert!(em.particles[0].pos.y > 0.0);
    }

    #[test]
    fn expired_particles_are_removed_and_counted() {
        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::ZERO, 3, &steady_config());
        assert_eq!(em.update(0.5), 0, "still alive at half their lifetime");
        assert_eq!(em.particle_count(), 3);

        let removed = em.update(1.0);
        assert_eq!(removed, 3);
        assert_eq!(em.particle_count(), 0);
    }

    #[test]
    fn fade_ramps_alpha_down_over_the_lifetime() {
        let mut cfg = steady_config();
        cfg.fade = true;
        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::ZERO, 1, &cfg);

        em.update(0.25);
        let quarter = em.particles[0].color[3];
        em.update(0.5);
        let later = em.particles[0].color[3];

        assert!(
            quarter > later,
            "alpha should decrease: {quarter} -> {later}"
        );
    }

    #[test]
    fn shrink_scales_from_the_spawn_size_regardless_of_step_size() {
        let mut cfg = steady_config();
        cfg.shrink = true;

        // One big step.
        let mut coarse = ParticleEmitter::new(10);
        coarse.burst(Vec2::ZERO, 1, &cfg);
        coarse.update(0.5);

        // The same elapsed time in uneven steps. The old implementation
        // reconstructed the spawn size from the previous frame's factor and
        // drifted whenever dt varied.
        let mut fine = ParticleEmitter::new(10);
        fine.burst(Vec2::ZERO, 1, &cfg);
        fine.update(0.1);
        fine.update(0.3);
        fine.update(0.1);

        let (a, b) = (coarse.particles[0].size, fine.particles[0].size);
        assert!((a - b).abs() < 1e-3, "sizes diverged: {a} vs {b}");
        assert!((a - 2.0).abs() < 1e-3, "half a 4px particle should be 2px");
    }

    #[test]
    fn color_lerps_from_start_to_end() {
        let mut cfg = steady_config();
        cfg.color_start = [0, 0, 0, 255];
        cfg.color_end = [255, 255, 255, 255];
        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::ZERO, 1, &cfg);

        em.update(0.5);
        let mid = em.particles[0].color;
        assert!((120..=135).contains(&mid[0]), "got {}", mid[0]);
    }

    #[test]
    fn spread_keeps_particles_within_the_configured_arc() {
        let mut cfg = steady_config();
        cfg.angle = 0.0;
        cfg.spread = std::f32::consts::FRAC_PI_2; // +/- 45 degrees
        let mut em = ParticleEmitter::new(200);
        em.burst(Vec2::ZERO, 200, &cfg);

        for p in &em.particles {
            let angle = p.vel.y.atan2(p.vel.x);
            assert!(
                angle.abs() <= std::f32::consts::FRAC_PI_4 + 1e-3,
                "angle {angle} outside the spread"
            );
        }
    }

    #[test]
    fn rendering_offscreen_particles_does_not_panic() {
        use crate::renderer::FrameBuffer;
        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::new(-100.0, -100.0), 1, &steady_config());
        em.burst(Vec2::new(10_000.0, 10_000.0), 1, &steady_config());

        let mut fb = FrameBuffer::new(32, 32);
        em.render(&mut fb, Vec2::ZERO);
    }

    #[test]
    fn render_draws_a_particle_into_the_framebuffer() {
        use crate::renderer::FrameBuffer;
        let mut cfg = steady_config();
        cfg.size_min = 1.0;
        cfg.size_max = 1.0;
        cfg.color_start = [255, 0, 0, 255];

        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::new(8.0, 8.0), 1, &cfg);

        let mut fb = FrameBuffer::new(32, 32);
        fb.clear(0, 0, 0);
        em.render(&mut fb, Vec2::ZERO);

        let idx = ((8 * fb.width + 8) * 4) as usize;
        assert_eq!(fb.pixels[idx], 255, "particle should be drawn at (8,8)");
    }

    #[test]
    fn camera_offset_shifts_rendered_particles() {
        use crate::renderer::FrameBuffer;
        let mut cfg = steady_config();
        cfg.size_min = 1.0;
        cfg.size_max = 1.0;
        cfg.color_start = [0, 255, 0, 255];

        let mut em = ParticleEmitter::new(10);
        em.burst(Vec2::new(20.0, 20.0), 1, &cfg);

        let mut fb = FrameBuffer::new(32, 32);
        fb.clear(0, 0, 0);
        em.render(&mut fb, Vec2::new(16.0, 16.0));

        let idx = ((4 * fb.width + 4) * 4) as usize;
        assert_eq!(fb.pixels[idx + 1], 255, "should land at (4,4) after camera");
    }
}
