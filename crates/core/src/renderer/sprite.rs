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
