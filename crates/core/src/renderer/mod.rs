pub mod palette;
pub mod sprite;
pub mod tilemap;

use crate::config::HardwareProfile;
use glam::Vec2;
use hecs::World;

use crate::assets::AssetStore;
use crate::ecs::{Position, SpriteIndex};
use crate::renderer::palette::Color;
pub use crate::renderer::palette::Palette;
pub use crate::renderer::sprite::{AnimatedSprite, Sprite, SpriteFlags};
pub use crate::renderer::tilemap::{TileLayer, TileMap};

pub struct FrameBuffer {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

impl FrameBuffer {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            pixels: vec![0; (width * height * 4) as usize],
        }
    }

    pub fn clear(&mut self, r: u8, g: u8, b: u8) {
        for chunk in self.pixels.chunks_exact_mut(4) {
            chunk[0] = r;
            chunk[1] = g;
            chunk[2] = b;
            chunk[3] = 255;
        }
    }

    pub fn set_pixel(&mut self, x: u32, y: u32, r: u8, g: u8, b: u8, a: u8) {
        if x < self.width && y < self.height {
            let idx = ((y * self.width + x) * 4) as usize;
            // simple alpha blending or direct set
            if a == 255 {
                self.pixels[idx] = r;
                self.pixels[idx + 1] = g;
                self.pixels[idx + 2] = b;
                self.pixels[idx + 3] = a;
            } else if a > 0 {
                let alpha = a as f32 / 255.0;
                let inv = 1.0 - alpha;
                self.pixels[idx] = (self.pixels[idx] as f32 * inv + r as f32 * alpha) as u8;
                self.pixels[idx + 1] = (self.pixels[idx + 1] as f32 * inv + g as f32 * alpha) as u8;
                self.pixels[idx + 2] = (self.pixels[idx + 2] as f32 * inv + b as f32 * alpha) as u8;
                self.pixels[idx + 3] = 255;
            }
        }
    }

    pub fn apply_scanlines(&mut self, intensity: f32) {
        let inv = 1.0 - intensity.clamp(0.0, 1.0);
        for y in (1..self.height).step_by(2) {
            let row_start = (y * self.width * 4) as usize;
            let row_end = row_start + (self.width * 4) as usize;
            for chunk in self.pixels[row_start..row_end].chunks_exact_mut(4) {
                chunk[0] = (chunk[0] as f32 * inv) as u8;
                chunk[1] = (chunk[1] as f32 * inv) as u8;
                chunk[2] = (chunk[2] as f32 * inv) as u8;
            }
        }
    }

    pub fn apply_palette(&mut self, palette: &Palette) {
        let colors: Vec<Color> = palette
            .colors
            .iter()
            .copied()
            .filter(|color| color.3 > 0)
            .collect();

        if colors.is_empty() {
            return;
        }

        for chunk in self.pixels.chunks_exact_mut(4) {
            let mut best = colors[0];
            let mut best_dist = u32::MAX;

            for color in &colors {
                let dr = chunk[0] as i32 - color.0 as i32;
                let dg = chunk[1] as i32 - color.1 as i32;
                let db = chunk[2] as i32 - color.2 as i32;
                let dist = (dr * dr + dg * dg + db * db) as u32;
                if dist < best_dist {
                    best_dist = dist;
                    best = *color;
                }
            }

            chunk[0] = best.0;
            chunk[1] = best.1;
            chunk[2] = best.2;
            chunk[3] = 255;
        }
    }

    pub fn as_ptr(&self) -> *const u8 {
        self.pixels.as_ptr()
    }

    pub fn len(&self) -> usize {
        self.pixels.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pixels.is_empty()
    }
}

pub struct Renderer {
    pub resolution: (u32, u32),
    pub sprite_limit: u32,
    pub camera: Vec2,
    pub bg_color: Color,
    pub scanlines: bool,
    pub palette: Option<Palette>,
    pub framebuffer: FrameBuffer,
    pub tilemaps: Vec<TileMap>,
    // Screen shake
    pub shake_intensity: f32,
    pub shake_duration: f32,
    shake_timer: f32,
    /// When true, skip clearing the framebuffer (e.g. raycaster already drew)
    pub skip_clear: bool,
}

impl Renderer {
    pub fn new(
        width: u32,
        height: u32,
        sprite_limit: u32,
        scanlines: bool,
        profile: HardwareProfile,
    ) -> Self {
        let palette = match profile {
            HardwareProfile::GameBoy => Some(Palette::gameboy()),
            _ => None,
        };
        let bg_color = palette
            .as_ref()
            .map(|palette| palette.get(1))
            .unwrap_or(Color::BLACK);

        Self {
            resolution: (width, height),
            sprite_limit,
            camera: Vec2::ZERO,
            bg_color,
            scanlines,
            palette,
            framebuffer: FrameBuffer::new(width, height),
            tilemaps: Vec::new(),
            shake_intensity: 0.0,
            shake_duration: 0.0,
            shake_timer: 0.0,
            skip_clear: false,
        }
    }

    /// Trigger a screen shake effect.
    pub fn shake(&mut self, intensity: f32, duration: f32) {
        self.shake_intensity = intensity;
        self.shake_duration = duration;
        self.shake_timer = duration;
    }

    /// Advance shake timer by dt. Returns the shake offset to apply.
    fn update_shake(&mut self, dt: f32) -> Vec2 {
        if self.shake_timer <= 0.0 {
            return Vec2::ZERO;
        }
        self.shake_timer -= dt;
        let progress = (self.shake_timer / self.shake_duration).clamp(0.0, 1.0);
        let mag = self.shake_intensity * progress;
        // Simple deterministic pseudo-random based on timer
        let seed = (self.shake_timer * 1000.0) as u32;
        let sx =
            ((seed.wrapping_mul(1103515245).wrapping_add(12345) >> 16) % 200) as f32 / 100.0 - 1.0;
        let sy =
            ((seed.wrapping_mul(214013).wrapping_add(2531011) >> 16) % 200) as f32 / 100.0 - 1.0;
        Vec2::new(sx * mag, sy * mag)
    }

    pub fn render(&mut self, world: &World, assets: &AssetStore) -> &FrameBuffer {
        if !self.skip_clear {
            self.framebuffer
                .clear(self.bg_color.0, self.bg_color.1, self.bg_color.2);
        }
        self.skip_clear = false;

        // Compute shake offset and add to camera
        let shake_off = self.update_shake(1.0 / 60.0);
        let cam = self.camera + shake_off;

        // draw tilemaps
        for map in &self.tilemaps {
            for layer in &map.layers {
                if let Some(sheet) = assets.sprite_sheets.get(layer.sheet_handle as usize) {
                    let tw = map.tile_width as i32;
                    let th = map.tile_height as i32;
                    let cols_in_sheet = sheet.width / map.tile_width;

                    let (offset_x, offset_y) = if layer.fixed {
                        (0, 0)
                    } else {
                        (cam.x as i32, cam.y as i32)
                    };

                    for row in 0..map.rows {
                        for col in 0..map.cols {
                            let tile_id = layer.tiles[(row * map.cols + col) as usize];
                            if tile_id == 0 {
                                continue;
                            }
                            let tile_index = tile_id - 1; // 1-based to 0-based

                            let src_x = (tile_index as u32 % cols_in_sheet) * map.tile_width;
                            let src_y = (tile_index as u32 / cols_in_sheet) * map.tile_height;

                            let dest_x = (col as i32 * tw) - offset_x;
                            let dest_y = (row as i32 * th) - offset_y;

                            Self::blit_sheet(
                                &mut self.framebuffer,
                                sheet,
                                src_x,
                                src_y,
                                map.tile_width,
                                map.tile_height,
                                dest_x,
                                dest_y,
                                false,
                                false,
                            );
                        }
                    }
                }
            }
        }

        // draw ECS sprites
        let mut sprite_data: Vec<_> = world
            .query::<(&Position, &SpriteIndex)>()
            .iter()
            .map(|(_, (pos, index))| (pos.0, *index))
            .collect();

        // sort by layer back to front
        sprite_data.sort_by_key(|(_, idx)| idx.layer);

        let limit = self.sprite_limit as usize;
        let drawn_sprites = sprite_data.iter().take(limit);

        for (pos, idx) in drawn_sprites {
            if let Some(sheet) = assets.sprite_sheets.get(idx.sheet as usize) {
                let tw = sheet.tile_width;
                let th = sheet.tile_height;
                let cols_in_sheet = sheet.width / tw;

                let src_x = (idx.frame as u32 % cols_in_sheet) * tw;
                let src_y = (idx.frame as u32 / cols_in_sheet) * th;

                let dest_x = pos.x as i32 - cam.x as i32;
                let dest_y = pos.y as i32 - cam.y as i32;

                Self::blit_sheet(
                    &mut self.framebuffer,
                    sheet,
                    src_x,
                    src_y,
                    tw,
                    th,
                    dest_x,
                    dest_y,
                    idx.flip_x,
                    idx.flip_y,
                );
            }
        }

        // scanlines post-process
        if self.scanlines {
            self.framebuffer.apply_scanlines(0.25);
        }

        if let Some(palette) = &self.palette {
            self.framebuffer.apply_palette(palette);
        }

        &self.framebuffer
    }

    #[allow(clippy::too_many_arguments)]
    fn blit_sheet(
        framebuffer: &mut FrameBuffer,
        sheet: &crate::assets::SpriteSheet,
        src_x: u32,
        src_y: u32,
        tw: u32,
        th: u32,
        dest_x: i32,
        dest_y: i32,
        flip_x: bool,
        flip_y: bool,
    ) {
        let (min_x, max_x) = if dest_x < 0 {
            (-dest_x as u32, tw)
        } else if dest_x + tw as i32 > framebuffer.width as i32 {
            (0, framebuffer.width.saturating_sub(dest_x as u32))
        } else {
            (0, tw)
        };

        let (min_y, max_y) = if dest_y < 0 {
            (-dest_y as u32, th)
        } else if dest_y + th as i32 > framebuffer.height as i32 {
            (0, framebuffer.height.saturating_sub(dest_y as u32))
        } else {
            (0, th)
        };

        for py in min_y..max_y {
            for px in min_x..max_x {
                let sx = if flip_x { tw - 1 - px } else { px } + src_x;
                let sy = if flip_y { th - 1 - py } else { py } + src_y;

                if sx < sheet.width && sy < sheet.height {
                    let s_idx = ((sy * sheet.width + sx) * 4) as usize;
                    let r = sheet.pixels[s_idx];
                    let g = sheet.pixels[s_idx + 1];
                    let b = sheet.pixels[s_idx + 2];
                    let a = sheet.pixels[s_idx + 3];

                    if a > 0 {
                        // Simple alpha test
                        let dx = (dest_x + px as i32) as u32;
                        let dy = (dest_y + py as i32) as u32;
                        framebuffer.set_pixel(dx, dy, r, g, b, a);
                    }
                }
            }
        }
    }
}
