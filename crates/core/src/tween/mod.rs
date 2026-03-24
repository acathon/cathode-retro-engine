#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EaseFn {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    BounceOut,
    ElasticOut,
    BackOut,
}

impl EaseFn {
    pub fn from_id(id: u8) -> Self {
        match id {
            0 => Self::Linear,
            1 => Self::EaseIn,
            2 => Self::EaseOut,
            3 => Self::EaseInOut,
            4 => Self::BounceOut,
            5 => Self::ElasticOut,
            6 => Self::BackOut,
            _ => Self::Linear,
        }
    }
}

pub struct Tween {
    pub from: f32,
    pub to: f32,
    pub duration: f32,
    pub elapsed: f32,
    pub ease: EaseFn,
    pub repeat: bool,
    pub yoyo: bool,
    complete: bool,
    forward: bool,
}

impl Tween {
    pub fn new(from: f32, to: f32, duration: f32, ease: EaseFn) -> Self {
        Self {
            from,
            to,
            duration,
            elapsed: 0.0,
            ease,
            repeat: false,
            yoyo: false,
            complete: false,
            forward: true,
        }
    }

    pub fn update(&mut self, dt: f32) -> f32 {
        if self.complete {
            return self.value();
        }

        self.elapsed += dt;

        if self.elapsed >= self.duration {
            if self.repeat {
                if self.yoyo {
                    self.forward = !self.forward;
                }
                self.elapsed -= self.duration;
            } else {
                self.elapsed = self.duration;
                self.complete = true;
            }
        }

        self.value()
    }

    pub fn value(&self) -> f32 {
        let t = if self.duration > 0.0 {
            (self.elapsed / self.duration).clamp(0.0, 1.0)
        } else {
            1.0
        };

        let eased = if self.forward {
            apply_ease(t, &self.ease)
        } else {
            apply_ease(1.0 - t, &self.ease)
        };

        self.from + (self.to - self.from) * eased
    }

    pub fn is_complete(&self) -> bool {
        self.complete
    }

    pub fn reset(&mut self) {
        self.elapsed = 0.0;
        self.complete = false;
        self.forward = true;
    }
}

pub fn apply_ease(t: f32, ease: &EaseFn) -> f32 {
    match ease {
        EaseFn::Linear => t,
        EaseFn::EaseIn => t * t * t,
        EaseFn::EaseOut => 1.0 - (1.0 - t).powi(3),
        EaseFn::EaseInOut => {
            if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            }
        }
        EaseFn::BounceOut => {
            let n1 = 7.5625;
            let d1 = 2.75;
            let mut t = t;
            if t < 1.0 / d1 {
                n1 * t * t
            } else if t < 2.0 / d1 {
                t -= 1.5 / d1;
                n1 * t * t + 0.75
            } else if t < 2.5 / d1 {
                t -= 2.25 / d1;
                n1 * t * t + 0.9375
            } else {
                t -= 2.625 / d1;
                n1 * t * t + 0.984375
            }
        }
        EaseFn::ElasticOut => {
            if t <= 0.0 {
                0.0
            } else if t >= 1.0 {
                1.0
            } else {
                let c4 = std::f32::consts::TAU / 3.0;
                2.0_f32.powf(-10.0 * t) * ((t * 10.0 - 0.75) * c4).sin() + 1.0
            }
        }
        EaseFn::BackOut => {
            let c1: f32 = 1.70158;
            let c3 = c1 + 1.0;
            let tm1 = t - 1.0;
            1.0 + c3 * tm1 * tm1 * tm1 + c1 * tm1 * tm1
        }
    }
}

pub struct TweenPool {
    tweens: Vec<Option<Tween>>,
}

impl Default for TweenPool {
    fn default() -> Self {
        Self::new()
    }
}

impl TweenPool {
    pub fn new() -> Self {
        Self { tweens: Vec::new() }
    }

    pub fn create(
        &mut self,
        from: f32,
        to: f32,
        duration: f32,
        ease: EaseFn,
        repeat: bool,
        yoyo: bool,
    ) -> u32 {
        let mut tween = Tween::new(from, to, duration, ease);
        tween.repeat = repeat;
        tween.yoyo = yoyo;

        for (i, slot) in self.tweens.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(tween);
                return i as u32;
            }
        }

        self.tweens.push(Some(tween));
        (self.tweens.len() - 1) as u32
    }

    pub fn update_all(&mut self, dt: f32) {
        for slot in &mut self.tweens {
            if let Some(tween) = slot {
                tween.update(dt);
            }
        }
    }

    pub fn value(&self, handle: u32) -> f32 {
        self.tweens
            .get(handle as usize)
            .and_then(|s| s.as_ref())
            .map(|t| t.value())
            .unwrap_or(0.0)
    }

    pub fn is_complete(&self, handle: u32) -> bool {
        self.tweens
            .get(handle as usize)
            .and_then(|s| s.as_ref())
            .map(|t| t.is_complete())
            .unwrap_or(true)
    }

    pub fn reset(&mut self, handle: u32) {
        if let Some(Some(tween)) = self.tweens.get_mut(handle as usize) {
            tween.reset();
        }
    }

    pub fn destroy(&mut self, handle: u32) {
        if let Some(slot) = self.tweens.get_mut(handle as usize) {
            *slot = None;
        }
    }
}
