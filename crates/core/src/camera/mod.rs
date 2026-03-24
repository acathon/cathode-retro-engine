use glam::Vec2;

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    pub fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }
}

pub struct Camera {
    pub pos: Vec2,
    pub target: Vec2,
    pub lerp_speed: f32,
    pub dead_zone: Option<Rect>,
    pub bounds: Option<Rect>,
    pub zoom: f32,
    screen_w: f32,
    screen_h: f32,
}

impl Camera {
    pub fn new(screen_w: f32, screen_h: f32) -> Self {
        Self {
            pos: Vec2::ZERO,
            target: Vec2::ZERO,
            lerp_speed: 0.1,
            dead_zone: None,
            bounds: None,
            zoom: 1.0,
            screen_w,
            screen_h,
        }
    }

    pub fn update(&mut self, dt: f32) {
        if let Some(dz) = &self.dead_zone {
            let screen_center = self.pos + Vec2::new(self.screen_w * 0.5, self.screen_h * 0.5);
            let rel = self.target - screen_center;
            let half_w = dz.w * 0.5;
            let half_h = dz.h * 0.5;

            if rel.x.abs() <= half_w && rel.y.abs() <= half_h {
                self.clamp_bounds();
                return;
            }
        }

        let factor = 1.0 - self.lerp_speed.powf(dt * 60.0);
        self.pos = self.pos + (self.target - self.pos - Vec2::new(self.screen_w * 0.5, self.screen_h * 0.5)) * factor;

        // When lerp_speed is 0, snap instantly
        if self.lerp_speed <= 0.0001 {
            self.pos = self.target - Vec2::new(self.screen_w * 0.5, self.screen_h * 0.5);
        }

        self.clamp_bounds();
    }

    fn clamp_bounds(&mut self) {
        if let Some(b) = &self.bounds {
            self.pos.x = self.pos.x.clamp(b.x, (b.x + b.w - self.screen_w).max(b.x));
            self.pos.y = self.pos.y.clamp(b.y, (b.y + b.h - self.screen_h).max(b.y));
        }
    }

    pub fn follow(&mut self, pos: Vec2, _entity_w: f32, _entity_h: f32, screen_w: f32, screen_h: f32) {
        self.screen_w = screen_w;
        self.screen_h = screen_h;
        self.target = pos;
    }

    pub fn set_screen_size(&mut self, w: f32, h: f32) {
        self.screen_w = w;
        self.screen_h = h;
    }

    pub fn world_to_screen(&self, world: Vec2) -> Vec2 {
        (world - self.pos) * self.zoom
    }

    pub fn screen_to_world(&self, screen: Vec2) -> Vec2 {
        screen / self.zoom + self.pos
    }
}
