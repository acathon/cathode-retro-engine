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
