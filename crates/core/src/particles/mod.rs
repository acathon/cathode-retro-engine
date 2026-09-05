use crate::renderer::FrameBuffer;
use glam::Vec2;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct Particle {
    pub pos: Vec2,
    pub vel: Vec2,
    pub color: [u8; 4],
    pub size: f32,
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
                let orig_size =
                    p.size / (1.0 - ((p.max_life - p.life - dt) / p.max_life).clamp(0.0, 0.99));
                p.size = orig_size * (1.0 - t);
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
