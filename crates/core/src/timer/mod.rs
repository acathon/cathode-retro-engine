pub struct GameTimer {
    pub duration: f32,
    pub elapsed: f32,
    pub repeat: bool,
    pub active: bool,
    fired: bool,
}

impl GameTimer {
    pub fn new(duration: f32, repeat: bool) -> Self {
        Self {
            duration,
            elapsed: 0.0,
            repeat,
            active: false,
            fired: false,
        }
    }

    pub fn update(&mut self, dt: f32) -> bool {
        if !self.active {
            return false;
        }

        self.fired = false;
        self.elapsed += dt;

        if self.elapsed >= self.duration {
            self.fired = true;
            if self.repeat {
                self.elapsed -= self.duration;
            } else {
                self.active = false;
                self.elapsed = self.duration;
            }
        }

        self.fired
    }

    pub fn reset(&mut self) {
        self.elapsed = 0.0;
        self.fired = false;
    }

    pub fn stop(&mut self) {
        self.active = false;
    }

    pub fn start(&mut self) {
        self.active = true;
    }

    pub fn progress(&self) -> f32 {
        if self.duration <= 0.0 {
            return 1.0;
        }
        (self.elapsed / self.duration).clamp(0.0, 1.0)
    }

    pub fn remaining(&self) -> f32 {
        (self.duration - self.elapsed).max(0.0)
    }
}

pub struct TimerPool {
    timers: Vec<Option<GameTimer>>,
    pub fired_handles: Vec<u32>,
}

impl Default for TimerPool {
    fn default() -> Self {
        Self::new()
    }
}

impl TimerPool {
    pub fn new() -> Self {
        Self {
            timers: Vec::new(),
            fired_handles: Vec::new(),
        }
    }

    pub fn create(&mut self, duration: f32, repeat: bool) -> u32 {
        let timer = GameTimer::new(duration, repeat);
        for (i, slot) in self.timers.iter_mut().enumerate() {
            if slot.is_none() {
                *slot = Some(timer);
                return i as u32;
            }
        }
        self.timers.push(Some(timer));
        (self.timers.len() - 1) as u32
    }

    pub fn start(&mut self, handle: u32) {
        if let Some(Some(timer)) = self.timers.get_mut(handle as usize) {
            timer.start();
        }
    }

    pub fn stop(&mut self, handle: u32) {
        if let Some(Some(timer)) = self.timers.get_mut(handle as usize) {
            timer.stop();
        }
    }

    pub fn reset(&mut self, handle: u32) {
        if let Some(Some(timer)) = self.timers.get_mut(handle as usize) {
            timer.reset();
        }
    }

    pub fn progress(&self, handle: u32) -> f32 {
        self.timers
            .get(handle as usize)
            .and_then(|s| s.as_ref())
            .map(|t| t.progress())
            .unwrap_or(1.0)
    }

    pub fn destroy(&mut self, handle: u32) {
        if let Some(slot) = self.timers.get_mut(handle as usize) {
            *slot = None;
        }
    }

    pub fn update_all(&mut self, dt: f32) {
        self.fired_handles.clear();
        for (i, slot) in self.timers.iter_mut().enumerate() {
            if let Some(timer) = slot {
                if timer.update(dt) {
                    self.fired_handles.push(i as u32);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timer_does_not_run_until_started() {
        let mut t = GameTimer::new(1.0, false);
        assert!(!t.update(10.0));
        assert_eq!(t.elapsed, 0.0);
        assert_eq!(t.progress(), 0.0);
    }

    #[test]
    fn one_shot_timer_fires_once_then_deactivates() {
        let mut t = GameTimer::new(1.0, false);
        t.start();
        assert!(!t.update(0.5));
        assert!(t.update(0.6));
        assert!(!t.active);
        assert_eq!(t.progress(), 1.0);
        assert_eq!(t.remaining(), 0.0);
        // A finished one-shot stays quiet.
        assert!(!t.update(1.0));
    }

    #[test]
    fn repeating_timer_keeps_firing_and_carries_remainder() {
        let mut t = GameTimer::new(1.0, true);
        t.start();
        assert!(t.update(1.25));
        assert!(t.active);
        assert!(
            (t.elapsed - 0.25).abs() < 1e-4,
            "remainder should carry over"
        );
        assert!(t.update(0.75));
    }

    #[test]
    fn progress_and_remaining_track_elapsed_time() {
        let mut t = GameTimer::new(2.0, false);
        t.start();
        t.update(0.5);
        assert!((t.progress() - 0.25).abs() < 1e-4);
        assert!((t.remaining() - 1.5).abs() < 1e-4);
    }

    #[test]
    fn zero_duration_timer_reports_full_progress() {
        let t = GameTimer::new(0.0, false);
        assert_eq!(t.progress(), 1.0);
    }

    #[test]
    fn pool_reports_fired_handles_per_update() {
        let mut pool = TimerPool::new();
        let fast = pool.create(0.5, false);
        let slow = pool.create(5.0, false);
        pool.start(fast);
        pool.start(slow);

        pool.update_all(1.0);
        assert_eq!(pool.fired_handles, vec![fast]);

        // Fired handles are cleared on the next update.
        pool.update_all(0.1);
        assert!(pool.fired_handles.is_empty());
        assert!(pool.progress(slow) > 0.0);
    }

    #[test]
    fn pool_reuses_destroyed_slots_and_ignores_bad_handles() {
        let mut pool = TimerPool::new();
        let a = pool.create(1.0, false);
        let b = pool.create(1.0, false);
        pool.destroy(a);
        let c = pool.create(2.0, false);
        assert_eq!(c, a, "destroyed slot should be reused");
        assert_ne!(b, c);

        // Operations on unknown handles are no-ops, not panics.
        pool.start(99);
        pool.stop(99);
        pool.reset(99);
        assert_eq!(pool.progress(99), 1.0);
    }

    #[test]
    fn stopped_timer_can_be_reset_and_restarted() {
        let mut pool = TimerPool::new();
        let h = pool.create(1.0, false);
        pool.start(h);
        pool.update_all(1.0);
        assert_eq!(pool.fired_handles, vec![h]);

        pool.reset(h);
        pool.start(h);
        pool.update_all(0.25);
        assert!((pool.progress(h) - 0.25).abs() < 1e-4);
    }
}
