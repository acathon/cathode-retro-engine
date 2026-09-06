#[derive(Debug, Clone, Copy, PartialEq)]
enum EnvPhase {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
    Done,
}

pub struct Envelope {
    pub attack: f32,
    pub decay: f32,
    pub sustain: f32,
    pub release: f32,
    phase: EnvPhase,
    elapsed: f32,
    level: f32,
    release_start: f32,
}

impl Envelope {
    pub fn new(a: f32, d: f32, s: f32, r: f32) -> Self {
        Self {
            attack: a,
            decay: d,
            sustain: s.clamp(0.0, 1.0),
            release: r,
            phase: EnvPhase::Idle,
            elapsed: 0.0,
            level: 0.0,
            release_start: 0.0,
        }
    }

    pub fn note_on(&mut self) {
        self.phase = EnvPhase::Attack;
        self.elapsed = 0.0;
    }

    pub fn note_off(&mut self) {
        if self.phase != EnvPhase::Idle && self.phase != EnvPhase::Done {
            // Release ramps down from wherever the envelope currently is, so a
            // note released mid-attack or mid-decay doesn't jump to the sustain
            // level first.
            self.release_start = self.level;
            self.phase = EnvPhase::Release;
            self.elapsed = 0.0;
        }
    }

    pub fn tick(&mut self, dt: f32) -> f32 {
        match self.phase {
            EnvPhase::Idle => {
                self.level = 0.0;
            }
            EnvPhase::Attack => {
                self.elapsed += dt;
                if self.attack <= 0.0 {
                    self.level = 1.0;
                    self.phase = EnvPhase::Decay;
                    self.elapsed = 0.0;
                } else {
                    self.level = (self.elapsed / self.attack).min(1.0);
                    if self.elapsed >= self.attack {
                        self.level = 1.0;
                        self.phase = EnvPhase::Decay;
                        self.elapsed = 0.0;
                    }
                }
            }
            EnvPhase::Decay => {
                self.elapsed += dt;
                if self.decay <= 0.0 {
                    self.level = self.sustain;
                    self.phase = EnvPhase::Sustain;
                    self.elapsed = 0.0;
                } else {
                    let t = (self.elapsed / self.decay).min(1.0);
                    self.level = 1.0 + (self.sustain - 1.0) * t;
                    if self.elapsed >= self.decay {
                        self.level = self.sustain;
                        self.phase = EnvPhase::Sustain;
                        self.elapsed = 0.0;
                    }
                }
            }
            EnvPhase::Sustain => {
                self.level = self.sustain;
            }
            EnvPhase::Release => {
                self.elapsed += dt;
                if self.release <= 0.0 {
                    self.level = 0.0;
                    self.phase = EnvPhase::Done;
                } else {
                    let t = (self.elapsed / self.release).min(1.0);
                    self.level = self.release_start * (1.0 - t);
                    if self.elapsed >= self.release {
                        self.level = 0.0;
                        self.phase = EnvPhase::Done;
                    }
                }
            }
            EnvPhase::Done => {
                self.level = 0.0;
            }
        }

        self.level
    }

    pub fn is_done(&self) -> bool {
        self.phase == EnvPhase::Done || self.phase == EnvPhase::Idle
    }

    pub fn pluck() -> Self {
        Self::new(0.005, 0.15, 0.0, 0.1)
    }

    pub fn pad() -> Self {
        Self::new(0.5, 0.3, 0.7, 1.0)
    }

    pub fn snare() -> Self {
        Self::new(0.001, 0.08, 0.0, 0.05)
    }

    pub fn bass() -> Self {
        Self::new(0.01, 0.2, 0.6, 0.3)
    }

    pub fn default_envelope() -> Self {
        Self::new(0.01, 0.05, 0.8, 0.1)
    }

    pub fn from_preset(name: &str) -> Self {
        match name {
            "pluck" => Self::pluck(),
            "pad" => Self::pad(),
            "snare" => Self::snare(),
            "bass" => Self::bass(),
            _ => Self::default_envelope(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn envelope_is_silent_until_note_on() {
        let mut env = Envelope::new(0.1, 0.1, 0.5, 0.1);
        assert!(env.is_done());
        assert_eq!(env.tick(1.0), 0.0);
    }

    #[test]
    fn full_adsr_cycle_reaches_expected_levels() {
        let mut env = Envelope::new(1.0, 1.0, 0.5, 1.0);
        env.note_on();
        assert!(!env.is_done());

        // Attack ramps linearly to 1.
        assert!((env.tick(0.5) - 0.5).abs() < 1e-4);
        assert!((env.tick(0.5) - 1.0).abs() < 1e-4);

        // Decay ramps from 1 down to sustain.
        assert!((env.tick(0.5) - 0.75).abs() < 1e-4);
        assert!((env.tick(0.5) - 0.5).abs() < 1e-4);

        // Sustain holds indefinitely.
        assert!((env.tick(5.0) - 0.5).abs() < 1e-4);

        // Release ramps from sustain to 0 and finishes.
        env.note_off();
        assert!((env.tick(0.5) - 0.25).abs() < 1e-4);
        assert_eq!(env.tick(0.5), 0.0);
        assert!(env.is_done());
    }

    #[test]
    fn instant_attack_and_decay_snap_to_sustain() {
        let mut env = Envelope::new(0.0, 0.0, 0.7, 0.1);
        env.note_on();
        env.tick(0.001); // attack -> decay
        let level = env.tick(0.001); // decay -> sustain
        assert!((level - 0.7).abs() < 1e-4);
    }

    #[test]
    fn instant_release_goes_straight_to_done() {
        let mut env = Envelope::new(0.0, 0.0, 0.7, 0.0);
        env.note_on();
        env.tick(0.001);
        env.tick(0.001);
        env.note_off();
        assert_eq!(env.tick(0.001), 0.0);
        assert!(env.is_done());
    }

    #[test]
    fn release_starts_from_current_level_not_sustain() {
        // Regression test: releasing mid-attack used to jump the level up to
        // the sustain value before ramping down.
        let mut env = Envelope::new(1.0, 0.1, 0.8, 1.0);
        env.note_on();
        let mid_attack = env.tick(0.25);
        assert!((mid_attack - 0.25).abs() < 1e-4);

        env.note_off();
        let after_release_start = env.tick(0.5);
        assert!(
            after_release_start <= mid_attack + 1e-4,
            "release must ramp down from {mid_attack}, got {after_release_start}"
        );
        assert!((after_release_start - 0.125).abs() < 1e-4);
    }

    #[test]
    fn note_off_before_note_on_is_a_no_op() {
        let mut env = Envelope::new(0.1, 0.1, 0.5, 0.1);
        env.note_off();
        assert!(env.is_done());
        assert_eq!(env.tick(1.0), 0.0);
    }

    #[test]
    fn presets_resolve_by_name_with_fallback() {
        assert_eq!(Envelope::from_preset("pluck").sustain, 0.0);
        assert_eq!(Envelope::from_preset("pad").sustain, 0.7);
        let fallback = Envelope::from_preset("no-such-preset");
        assert_eq!(fallback.sustain, Envelope::default_envelope().sustain);
    }

    #[test]
    fn sustain_is_clamped_to_valid_range() {
        assert_eq!(Envelope::new(0.1, 0.1, 5.0, 0.1).sustain, 1.0);
        assert_eq!(Envelope::new(0.1, 0.1, -1.0, 0.1).sustain, 0.0);
    }
}
