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
    /// Fraction of the remaining distance still left after 1/60s, so *lower*
    /// is faster: 0.1 closes 90% of the gap each frame, 0.9 crawls, and 0.0
    /// snaps instantly. A value of 1.0 never moves at all.
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
            // The camera centres its target, so it settles at
            // `target - screen/2`. Aiming at the middle of the screen keeps
            // an untouched camera at the world origin; leaving the target at
            // zero made it drift half a screen negative, silently shifting
            // every sprite in a game that never asked for a camera at all.
            target: Vec2::new(screen_w * 0.5, screen_h * 0.5),
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
        self.pos = self.pos
            + (self.target - self.pos - Vec2::new(self.screen_w * 0.5, self.screen_h * 0.5))
                * factor;

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

    pub fn follow(
        &mut self,
        pos: Vec2,
        _entity_w: f32,
        _entity_h: f32,
        screen_w: f32,
        screen_h: f32,
    ) {
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

#[cfg(test)]
mod tests {
    use super::*;

    const W: f32 = 256.0;
    const H: f32 = 240.0;

    fn camera() -> Camera {
        Camera::new(W, H)
    }

    /// Where `pos` ends up once the target is perfectly centred.
    fn centred_on(target: Vec2) -> Vec2 {
        target - Vec2::new(W * 0.5, H * 0.5)
    }

    #[test]
    fn a_new_camera_sits_at_the_origin() {
        let cam = camera();
        assert_eq!(cam.pos, Vec2::ZERO);
        assert_eq!(cam.zoom, 1.0);
        assert!(cam.bounds.is_none());
        assert!(cam.dead_zone.is_none());
    }

    #[test]
    fn an_untouched_camera_stays_at_the_world_origin() {
        // Regression: the default target of (0,0) made the camera converge on
        // -screen/2, so a game that never set a camera found every sprite
        // displaced by half a screen.
        let mut cam = camera();
        for _ in 0..240 {
            cam.update(1.0 / 60.0);
        }
        assert!(
            cam.pos.length() < 0.01,
            "expected to rest at the origin, got {:?}",
            cam.pos
        );
    }

    #[test]
    fn zero_lerp_speed_snaps_the_target_to_centre() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.target = Vec2::new(500.0, 400.0);
        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, centred_on(cam.target));
    }

    #[test]
    fn smoothing_approaches_the_target_without_overshooting() {
        let mut cam = camera();
        cam.lerp_speed = 0.5;
        cam.target = Vec2::new(500.0, 400.0);
        let goal = centred_on(cam.target);

        let mut prev = f32::MAX;
        for _ in 0..200 {
            cam.update(1.0 / 60.0);
            let dist = (cam.pos - goal).length();
            assert!(dist <= prev + 1e-3, "camera moved away from its target");
            prev = dist;
        }
        assert!(prev < 1.0, "should converge, still {prev} away");
    }

    #[test]
    fn follow_sets_the_target_and_screen_size() {
        let mut cam = camera();
        cam.follow(Vec2::new(10.0, 20.0), 8.0, 8.0, 320.0, 224.0);
        assert_eq!(cam.target, Vec2::new(10.0, 20.0));

        cam.lerp_speed = 0.0;
        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, Vec2::new(10.0 - 160.0, 20.0 - 112.0));
    }

    #[test]
    fn a_target_inside_the_dead_zone_does_not_move_the_camera() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.dead_zone = Some(Rect::new(0.0, 0.0, 64.0, 64.0));
        // The camera centre starts at (128, 120); nudge the target slightly.
        cam.target = Vec2::new(140.0, 130.0);

        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, Vec2::ZERO, "small moves stay inside the dead zone");
    }

    #[test]
    fn a_target_outside_the_dead_zone_pulls_the_camera() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.dead_zone = Some(Rect::new(0.0, 0.0, 64.0, 64.0));
        cam.target = Vec2::new(1000.0, 120.0);

        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, centred_on(cam.target));
    }

    #[test]
    fn bounds_clamp_the_camera_inside_the_level() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.bounds = Some(Rect::new(0.0, 0.0, 1024.0, 960.0));

        // Push hard past the top-left corner.
        cam.target = Vec2::new(-500.0, -500.0);
        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, Vec2::ZERO);

        // And past the bottom-right.
        cam.target = Vec2::new(5000.0, 5000.0);
        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, Vec2::new(1024.0 - W, 960.0 - H));
    }

    #[test]
    fn a_level_smaller_than_the_screen_pins_the_camera_to_its_origin() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.bounds = Some(Rect::new(0.0, 0.0, 100.0, 100.0));
        cam.target = Vec2::new(5000.0, 5000.0);
        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, Vec2::ZERO, "must not invert the clamp range");
    }

    #[test]
    fn dead_zone_still_respects_bounds() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.dead_zone = Some(Rect::new(0.0, 0.0, 64.0, 64.0));
        cam.bounds = Some(Rect::new(50.0, 50.0, 1024.0, 960.0));
        cam.target = Vec2::new(140.0, 130.0); // inside the dead zone

        cam.update(1.0 / 60.0);
        assert_eq!(
            cam.pos,
            Vec2::new(50.0, 50.0),
            "bounds apply on the early exit"
        );
    }

    #[test]
    fn a_camera_placed_by_hand_still_obeys_its_bounds() {
        // Regression: the SDK positioned the camera by writing the renderer's
        // copy directly, which skipped this clamp entirely. Bounds looked set
        // and did nothing, so a game following a sprite scrolled past the
        // edge of its own level and showed empty space.
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.bounds = Some(Rect::new(0.0, 0.0, 320.0, 240.0));

        // Aim past the left edge, the way following a sprite near x=20 does.
        cam.target = Vec2::new(20.0, 120.0) + Vec2::new(W * 0.5, H * 0.5);
        cam.pos = Vec2::new(-108.0, 0.0);
        cam.update(0.0);

        assert!(
            cam.pos.x >= 0.0,
            "must not scroll past the level: {:?}",
            cam.pos
        );
        assert!(
            cam.pos.x <= (320.0 - W).max(0.0),
            "must not scroll past the right edge: {:?}",
            cam.pos
        );
    }

    #[test]
    fn a_zero_dt_update_clamps_without_moving_the_camera() {
        // Placing the camera by hand runs one update with dt = 0 so bounds
        // apply immediately; that must not also drag it toward its target.
        let mut cam = camera();
        cam.target = Vec2::new(5000.0, 5000.0);
        cam.pos = Vec2::new(40.0, 30.0);
        cam.update(0.0);
        assert_eq!(cam.pos, Vec2::new(40.0, 30.0));
    }

    #[test]
    fn world_and_screen_coordinates_round_trip() {
        let mut cam = camera();
        cam.pos = Vec2::new(100.0, 50.0);
        cam.zoom = 2.0;

        let world = Vec2::new(160.0, 90.0);
        let screen = cam.world_to_screen(world);
        assert_eq!(screen, Vec2::new(120.0, 80.0));
        assert_eq!(cam.screen_to_world(screen), world);
    }

    #[test]
    fn set_screen_size_changes_where_the_target_centres() {
        let mut cam = camera();
        cam.lerp_speed = 0.0;
        cam.set_screen_size(100.0, 100.0);
        cam.target = Vec2::new(200.0, 200.0);
        cam.update(1.0 / 60.0);
        assert_eq!(cam.pos, Vec2::new(150.0, 150.0));
    }

    #[test]
    fn smoothing_is_frame_rate_independent() {
        // One 1/30s step should land close to two 1/60s steps.
        let target = Vec2::new(600.0, 400.0);

        let mut coarse = camera();
        coarse.lerp_speed = 0.5;
        coarse.target = target;
        coarse.update(1.0 / 30.0);

        let mut fine = camera();
        fine.lerp_speed = 0.5;
        fine.target = target;
        fine.update(1.0 / 60.0);
        fine.update(1.0 / 60.0);

        assert!(
            (coarse.pos - fine.pos).length() < 1.0,
            "{:?} vs {:?}",
            coarse.pos,
            fine.pos
        );
    }
}
