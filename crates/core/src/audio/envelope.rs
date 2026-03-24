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
        }
    }

    pub fn note_on(&mut self) {
        self.phase = EnvPhase::Attack;
        self.elapsed = 0.0;
    }

    pub fn note_off(&mut self) {
        if self.phase != EnvPhase::Idle && self.phase != EnvPhase::Done {
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
                    let start_level = self.sustain;
                    let t = (self.elapsed / self.release).min(1.0);
                    self.level = start_level * (1.0 - t);
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
