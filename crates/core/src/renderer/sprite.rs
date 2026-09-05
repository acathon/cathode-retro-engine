#[derive(Debug, Clone, Copy)]
pub struct SpriteFlags;

impl SpriteFlags {
    pub const NONE: u8 = 0;
    pub const FLIP_H: u8 = 1;
    pub const FLIP_V: u8 = 2;
    pub const PRIORITY: u8 = 4;
}

#[derive(Debug, Clone)]
pub struct Sprite {
    pub x: i32,
    pub y: i32,
    pub pixels: [u8; 64],
    pub palette_id: usize,
    pub flags: u8,
    pub visible: bool,
    pub z: i16,
}

impl Sprite {
    pub fn new(x: i32, y: i32, pixels: [u8; 64]) -> Self {
        Self {
            x,
            y,
            pixels,
            palette_id: 0,
            flags: SpriteFlags::NONE,
            visible: true,
            z: 0,
        }
    }

    pub fn flip_h(mut self) -> Self {
        self.flags ^= SpriteFlags::FLIP_H;
        self
    }

    pub fn flip_v(mut self) -> Self {
        self.flags ^= SpriteFlags::FLIP_V;
        self
    }

    pub fn bounds(&self) -> (i32, i32, i32, i32) {
        (self.x, self.y, 8, 8)
    }

    pub fn overlaps(&self, other: &Self) -> bool {
        let (x1, y1, w1, h1) = self.bounds();
        let (x2, y2, w2, h2) = other.bounds();
        x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2
    }
}

#[derive(Debug, Clone)]
pub struct AnimatedSprite {
    pub sprite: Sprite,
    pub frames: Vec<[u8; 64]>,
    pub frame_duration: u32, // ticks per frame
    pub current_frame: usize,
    timer: u16, // LFSR state or simple frame timer
    pub looping: bool,
    pub playing: bool,
}

impl AnimatedSprite {
    pub fn new(x: i32, y: i32, frames: Vec<[u8; 64]>, frame_duration: u32) -> Self {
        let sprite = Sprite::new(x, y, frames.first().copied().unwrap_or([0; 64]));
        Self {
            sprite,
            frames,
            frame_duration,
            current_frame: 0,
            timer: 1, // initialize LFSR or simple timer >= 1
            looping: true,
            playing: true,
        }
    }

    pub fn update(&mut self) {
        if !self.playing || self.frames.is_empty() {
            return;
        }

        // Simple tick timer (LFSR optional, using regular decrement for simplicity)
        if self.timer <= 1 {
            self.timer = self.frame_duration as u16;
            if self.current_frame + 1 >= self.frames.len() {
                if self.looping {
                    self.current_frame = 0;
                } else {
                    self.playing = false;
                }
            } else {
                self.current_frame += 1;
            }
            self.sprite.pixels = self.frames[self.current_frame];
        } else {
            self.timer -= 1;
        }
    }

    pub fn play(&mut self) {
        self.playing = true;
    }

    pub fn stop(&mut self) {
        self.playing = false;
    }

    pub fn reset(&mut self) {
        self.current_frame = 0;
        self.timer = self.frame_duration as u16;
        if !self.frames.is_empty() {
            self.sprite.pixels = self.frames[0];
        }
    }

    pub fn current_frame(&self) -> usize {
        self.current_frame
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(fill: u8) -> [u8; 64] {
        [fill; 64]
    }

    #[test]
    fn a_new_sprite_is_visible_and_unflipped() {
        let s = Sprite::new(10, 20, frame(1));
        assert_eq!(s.bounds(), (10, 20, 8, 8));
        assert!(s.visible);
        assert_eq!(s.flags, SpriteFlags::NONE);
        assert_eq!(s.z, 0);
    }

    #[test]
    fn flip_builders_toggle_their_flags() {
        let s = Sprite::new(0, 0, frame(1)).flip_h();
        assert_eq!(s.flags & SpriteFlags::FLIP_H, SpriteFlags::FLIP_H);

        let s = s.flip_v();
        assert_eq!(s.flags & SpriteFlags::FLIP_V, SpriteFlags::FLIP_V);

        // Toggling twice returns to the original.
        let s = s.flip_h();
        assert_eq!(s.flags & SpriteFlags::FLIP_H, 0);
    }

    #[test]
    fn overlap_uses_8x8_bounds() {
        let a = Sprite::new(0, 0, frame(1));
        assert!(a.overlaps(&Sprite::new(4, 4, frame(2))));
        assert!(
            !a.overlaps(&Sprite::new(8, 0, frame(2))),
            "edges only touch"
        );
        assert!(!a.overlaps(&Sprite::new(100, 100, frame(2))));
        assert!(a.overlaps(&a.clone()), "a sprite overlaps itself");
    }

    #[test]
    fn an_animation_starts_on_its_first_frame() {
        let anim = AnimatedSprite::new(0, 0, vec![frame(1), frame(2)], 4);
        assert_eq!(anim.current_frame(), 0);
        assert_eq!(anim.sprite.pixels[0], 1);
        assert!(anim.playing);
        assert!(anim.looping);
    }

    #[test]
    fn frames_advance_after_their_duration() {
        let mut anim = AnimatedSprite::new(0, 0, vec![frame(1), frame(2), frame(3)], 3);

        anim.update();
        assert_eq!(anim.current_frame(), 1);
        assert_eq!(anim.sprite.pixels[0], 2, "pixels follow the frame");

        // The next advance waits out the frame duration.
        anim.update();
        anim.update();
        assert_eq!(anim.current_frame(), 1);
        anim.update();
        assert_eq!(anim.current_frame(), 2);
    }

    #[test]
    fn a_looping_animation_wraps_to_the_start() {
        let mut anim = AnimatedSprite::new(0, 0, vec![frame(1), frame(2)], 1);
        anim.update();
        assert_eq!(anim.current_frame(), 1);
        anim.update();
        assert_eq!(anim.current_frame(), 0, "should wrap");
        assert!(anim.playing);
    }

    #[test]
    fn a_non_looping_animation_stops_on_its_last_frame() {
        let mut anim = AnimatedSprite::new(0, 0, vec![frame(1), frame(2)], 1);
        anim.looping = false;

        anim.update();
        assert_eq!(anim.current_frame(), 1);
        anim.update();
        assert!(!anim.playing, "should stop rather than wrap");
        assert_eq!(anim.current_frame(), 1);
    }

    #[test]
    fn a_stopped_animation_does_not_advance() {
        let mut anim = AnimatedSprite::new(0, 0, vec![frame(1), frame(2)], 1);
        anim.stop();
        anim.update();
        assert_eq!(anim.current_frame(), 0);

        anim.play();
        anim.update();
        assert_eq!(anim.current_frame(), 1);
    }

    #[test]
    fn reset_returns_to_the_first_frame() {
        let mut anim = AnimatedSprite::new(0, 0, vec![frame(1), frame(2)], 1);
        anim.update();
        assert_eq!(anim.current_frame(), 1);

        anim.reset();
        assert_eq!(anim.current_frame(), 0);
        assert_eq!(anim.sprite.pixels[0], 1);
    }

    #[test]
    fn an_empty_animation_is_inert() {
        let mut anim = AnimatedSprite::new(0, 0, Vec::new(), 4);
        anim.update();
        anim.reset();
        assert_eq!(anim.current_frame(), 0);
    }
}
