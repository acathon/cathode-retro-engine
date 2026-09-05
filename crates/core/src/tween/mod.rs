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
        for tween in self.tweens.iter_mut().flatten() {
            tween.update(dt);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_tween_interpolates_and_completes() {
        let mut tw = Tween::new(0.0, 10.0, 1.0, EaseFn::Linear);
        assert_eq!(tw.value(), 0.0);
        assert!((tw.update(0.5) - 5.0).abs() < 1e-4);
        assert!(!tw.is_complete());
        assert!((tw.update(0.6) - 10.0).abs() < 1e-4);
        assert!(tw.is_complete());
        // Further updates stay clamped at the end value.
        assert!((tw.update(1.0) - 10.0).abs() < 1e-4);
    }

    #[test]
    fn zero_duration_tween_jumps_to_end() {
        let mut tw = Tween::new(2.0, 8.0, 0.0, EaseFn::Linear);
        assert_eq!(tw.value(), 8.0);
        tw.update(0.016);
        assert!(tw.is_complete());
        assert_eq!(tw.value(), 8.0);
    }

    #[test]
    fn all_ease_functions_hit_both_endpoints() {
        let eases = [
            EaseFn::Linear,
            EaseFn::EaseIn,
            EaseFn::EaseOut,
            EaseFn::EaseInOut,
            EaseFn::BounceOut,
            EaseFn::ElasticOut,
            EaseFn::BackOut,
        ];
        for ease in eases {
            assert!(
                apply_ease(0.0, &ease).abs() < 1e-4,
                "{ease:?} should start at 0"
            );
            assert!(
                (apply_ease(1.0, &ease) - 1.0).abs() < 1e-3,
                "{ease:?} should end at 1"
            );
        }
    }

    #[test]
    fn ease_from_id_maps_known_and_unknown_ids() {
        assert_eq!(EaseFn::from_id(0), EaseFn::Linear);
        assert_eq!(EaseFn::from_id(4), EaseFn::BounceOut);
        assert_eq!(EaseFn::from_id(200), EaseFn::Linear);
    }

    #[test]
    fn repeating_tween_wraps_instead_of_completing() {
        let mut tw = Tween::new(0.0, 1.0, 1.0, EaseFn::Linear);
        tw.repeat = true;
        tw.update(1.25);
        assert!(!tw.is_complete());
        assert!((tw.value() - 0.25).abs() < 1e-4);
    }

    #[test]
    fn yoyo_tween_reverses_direction_on_each_wrap() {
        let mut tw = Tween::new(0.0, 10.0, 1.0, EaseFn::Linear);
        tw.repeat = true;
        tw.yoyo = true;
        // Forward half.
        assert!((tw.update(0.5) - 5.0).abs() < 1e-4);
        // Wrap: now moving backward, half way back down.
        tw.update(0.5);
        assert!((tw.update(0.5) - 5.0).abs() < 1e-4);
        // Second wrap: forward again from the start.
        tw.update(0.5);
        assert!((tw.update(0.25) - 2.5).abs() < 1e-4);
    }

    #[test]
    fn reset_restarts_a_completed_tween() {
        let mut tw = Tween::new(0.0, 10.0, 1.0, EaseFn::Linear);
        tw.update(2.0);
        assert!(tw.is_complete());
        tw.reset();
        assert!(!tw.is_complete());
        assert_eq!(tw.value(), 0.0);
    }

    #[test]
    fn pool_reuses_destroyed_slots_and_keeps_handles_stable() {
        let mut pool = TweenPool::new();
        let a = pool.create(0.0, 1.0, 1.0, EaseFn::Linear, false, false);
        let b = pool.create(5.0, 6.0, 1.0, EaseFn::Linear, false, false);
        assert_eq!((a, b), (0, 1));

        pool.destroy(a);
        // b keeps its handle and value even after a is destroyed.
        assert_eq!(pool.value(b), 5.0);
        let c = pool.create(9.0, 9.0, 1.0, EaseFn::Linear, false, false);
        assert_eq!(c, a, "destroyed slot should be reused");
    }

    #[test]
    fn pool_handles_out_of_range_lookups() {
        let pool = TweenPool::new();
        assert_eq!(pool.value(42), 0.0);
        assert!(pool.is_complete(42));
    }

    #[test]
    fn pool_update_advances_every_live_tween() {
        let mut pool = TweenPool::new();
        let a = pool.create(0.0, 10.0, 1.0, EaseFn::Linear, false, false);
        let b = pool.create(0.0, 20.0, 1.0, EaseFn::Linear, false, false);
        pool.update_all(0.5);
        assert!((pool.value(a) - 5.0).abs() < 1e-4);
        assert!((pool.value(b) - 10.0).abs() < 1e-4);
    }
}
