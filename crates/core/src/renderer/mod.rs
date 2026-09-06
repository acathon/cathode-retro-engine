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
        for px in self.pixels.as_chunks_mut::<4>().0 {
            *px = [r, g, b, 255];
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
            for px in self.pixels[row_start..row_end].as_chunks_mut::<4>().0 {
                px[0] = (px[0] as f32 * inv) as u8;
                px[1] = (px[1] as f32 * inv) as u8;
                px[2] = (px[2] as f32 * inv) as u8;
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

        for px in self.pixels.as_chunks_mut::<4>().0 {
            let mut best = colors[0];
            let mut best_dist = f32::MAX;

            for color in &colors {
                let dr = px[0] as f32 - color.0 as f32;
                let dg = px[1] as f32 - color.1 as f32;
                let db = px[2] as f32 - color.2 as f32;
                // Weighted by how much each channel contributes to perceived
                // brightness. Plain RGB distance is dominated by green, which
                // sends mid-brightness colours to the wrong end of a short
                // palette: magenta (255,0,255) landed on the Game Boy's
                // *lightest* shade, so a magenta sprite came out the same
                // colour as the sky and vanished.
                let dist = 0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db;
                if dist < best_dist {
                    best_dist = dist;
                    best = *color;
                }
            }

            *px = [best.0, best.1, best.2, 255];
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
    /// 0 means unlimited, which is the default. See [`crate::config::EngineConfig`].
    pub sprite_limit: u32,
    /// Most sprites drawn in any single frame so far.
    ///
    /// This is what makes hardware budgets checkable at export time instead
    /// of enforced at run time: compare it against
    /// [`crate::config::HardwareProfile::sprite_budget`].
    pub peak_sprites: usize,
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
            peak_sprites: 0,
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

    /// Switch the *look* of the engine at run time: palette, background and
    /// scanlines.
    ///
    /// The hardware profile is a view setting, not a contract. Being able to
    /// author in full colour and flip to Game Boy to check how it reads is
    /// worth more than locking the choice in at construction.
    pub fn set_profile(&mut self, profile: HardwareProfile) {
        self.palette = match profile {
            HardwareProfile::GameBoy => Some(Palette::gameboy()),
            _ => None,
        };
        self.bg_color = self
            .palette
            .as_ref()
            .map(|palette| palette.get(1))
            .unwrap_or(Color::BLACK);
        self.scanlines = matches!(profile, HardwareProfile::Nes | HardwareProfile::NeoGeo);
    }

    /// Forget the peak sprite count, e.g. when starting a new level.
    pub fn reset_peak_sprites(&mut self) {
        self.peak_sprites = 0;
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

        self.peak_sprites = self.peak_sprites.max(sprite_data.len());

        // A limit of 0 draws everything, which is the default: the presets
        // model how a machine *looked*, not how few objects it could hold.
        // When a limit is deliberately set, keep the sprites nearest the
        // front. Taking the first N of a back-to-front sort dropped the
        // topmost layers, so exceeding the budget made the player vanish
        // while background scenery survived.
        let drawn_sprites: &[_] = if self.sprite_limit == 0 {
            &sprite_data
        } else {
            let limit = self.sprite_limit as usize;
            let start = sprite_data.len().saturating_sub(limit);
            &sprite_data[start..]
        };

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::SpriteSheet;
    use crate::ecs::{Position, SpriteIndex};

    fn pixel(fb: &FrameBuffer, x: u32, y: u32) -> [u8; 4] {
        let i = ((y * fb.width + x) * 4) as usize;
        [
            fb.pixels[i],
            fb.pixels[i + 1],
            fb.pixels[i + 2],
            fb.pixels[i + 3],
        ]
    }

    #[test]
    fn framebuffer_clear_fills_every_pixel_opaque() {
        let mut fb = FrameBuffer::new(4, 3);
        assert_eq!(fb.len(), 4 * 3 * 4);
        fb.clear(10, 20, 30);
        for y in 0..3 {
            for x in 0..4 {
                assert_eq!(pixel(&fb, x, y), [10, 20, 30, 255]);
            }
        }
    }

    #[test]
    fn set_pixel_ignores_out_of_bounds_writes() {
        let mut fb = FrameBuffer::new(2, 2);
        fb.set_pixel(2, 0, 255, 0, 0, 255);
        fb.set_pixel(0, 2, 255, 0, 0, 255);
        fb.set_pixel(999, 999, 255, 0, 0, 255);
        assert!(fb.pixels.iter().all(|&p| p == 0));
    }

    #[test]
    fn set_pixel_blends_partial_alpha_over_background() {
        let mut fb = FrameBuffer::new(1, 1);
        fb.clear(0, 0, 0);
        fb.set_pixel(0, 0, 255, 255, 255, 128);
        let p = pixel(&fb, 0, 0);
        assert!((126..=129).contains(&p[0]), "got {}", p[0]);
        assert_eq!(p[3], 255);

        // Zero alpha leaves the pixel untouched.
        let before = pixel(&fb, 0, 0);
        fb.set_pixel(0, 0, 0, 255, 0, 0);
        assert_eq!(pixel(&fb, 0, 0), before);
    }

    #[test]
    fn scanlines_darken_only_odd_rows() {
        let mut fb = FrameBuffer::new(2, 4);
        fb.clear(100, 100, 100);
        fb.apply_scanlines(0.5);
        assert_eq!(pixel(&fb, 0, 0)[0], 100);
        assert_eq!(pixel(&fb, 0, 1)[0], 50);
        assert_eq!(pixel(&fb, 0, 2)[0], 100);
        assert_eq!(pixel(&fb, 0, 3)[0], 50);
    }

    #[test]
    fn a_mid_brightness_colour_does_not_snap_to_the_lightest_shade() {
        // Regression: plain RGB distance is dominated by the green channel,
        // so magenta's nearest Game Boy colour came out as #e0f8cf — the same
        // shade the screen is cleared to. A magenta sprite drew itself in the
        // background colour and disappeared, which is exactly what happened
        // to the hero in examples/demo-game.
        let mut fb = FrameBuffer::new(1, 1);
        fb.clear(255, 0, 255);
        fb.apply_palette(&Palette::gameboy());

        let lightest = Palette::gameboy().get(1);
        assert_ne!(
            pixel(&fb, 0, 0),
            [lightest.0, lightest.1, lightest.2, 255],
            "magenta must not land on the background shade"
        );
    }

    #[test]
    fn palette_matching_still_separates_light_from_dark() {
        let palette = Palette::gameboy();
        for (input, expect_light) in [((250, 250, 250), true), ((5, 5, 5), false)] {
            let mut fb = FrameBuffer::new(1, 1);
            fb.clear(input.0, input.1, input.2);
            fb.apply_palette(&palette);
            let px = pixel(&fb, 0, 0);
            let luma = 0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32;
            assert_eq!(luma > 128.0, expect_light, "{input:?} mapped to {px:?}");
        }
    }

    #[test]
    fn every_gameboy_shade_is_reachable() {
        // A palette that only ever emits two of its four shades is not really
        // a four-shade palette.
        let palette = Palette::gameboy();
        let mut seen = std::collections::HashSet::new();
        for v in 0..=255u8 {
            let mut fb = FrameBuffer::new(1, 1);
            fb.clear(v, v, v);
            fb.apply_palette(&palette);
            seen.insert(pixel(&fb, 0, 0));
        }
        assert_eq!(seen.len(), 4, "grey ramp should reach all four shades");
    }

    #[test]
    fn apply_palette_snaps_to_nearest_opaque_color() {
        let mut fb = FrameBuffer::new(1, 1);
        fb.clear(100, 100, 100);
        let mut palette = Palette::new("test".to_string());
        palette.set(1, Color::BLACK);
        palette.set(2, Color::WHITE);
        fb.apply_palette(&palette);
        // (100,100,100) is nearer to black than white; the transparent
        // index 0 must not participate in matching.
        assert_eq!(pixel(&fb, 0, 0), [0, 0, 0, 255]);
    }

    #[test]
    fn apply_palette_with_no_opaque_colors_is_a_no_op() {
        let mut fb = FrameBuffer::new(1, 1);
        fb.clear(42, 42, 42);
        let palette = Palette::new("empty".to_string()); // only transparent
        fb.apply_palette(&palette);
        assert_eq!(pixel(&fb, 0, 0), [42, 42, 42, 255]);
    }

    fn test_renderer(w: u32, h: u32) -> Renderer {
        Renderer::new(w, h, 64, false, HardwareProfile::Custom)
    }

    fn solid_sheet(w: u32, h: u32, tw: u32, th: u32, rgba: [u8; 4]) -> SpriteSheet {
        let mut pixels = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..(w * h) {
            pixels.extend_from_slice(&rgba);
        }
        SpriteSheet::from_rgba(w, h, tw, th, pixels)
    }

    fn sprite_world(x: f32, y: f32, sheet: u32, layer: u8) -> World {
        let mut world = World::new();
        world.spawn((
            Position(Vec2::new(x, y)),
            SpriteIndex {
                sheet,
                frame: 0,
                flip_x: false,
                flip_y: false,
                layer,
            },
        ));
        world
    }

    #[test]
    fn render_draws_a_sprite_at_its_world_position() {
        let mut renderer = test_renderer(8, 8);
        let mut assets = AssetStore::new();
        assets.add_sheet(solid_sheet(1, 1, 1, 1, [255, 0, 0, 255]));

        let world = sprite_world(3.0, 2.0, 0, 0);
        renderer.render(&world, &assets);

        assert_eq!(pixel(&renderer.framebuffer, 3, 2), [255, 0, 0, 255]);
        assert_eq!(pixel(&renderer.framebuffer, 0, 0), [0, 0, 0, 255]);
    }

    #[test]
    fn render_applies_camera_offset() {
        let mut renderer = test_renderer(8, 8);
        renderer.camera = Vec2::new(2.0, 1.0);
        let mut assets = AssetStore::new();
        assets.add_sheet(solid_sheet(1, 1, 1, 1, [0, 255, 0, 255]));

        let world = sprite_world(3.0, 2.0, 0, 0);
        renderer.render(&world, &assets);

        assert_eq!(pixel(&renderer.framebuffer, 1, 1), [0, 255, 0, 255]);
    }

    #[test]
    fn render_clips_sprites_that_hang_off_screen_edges() {
        let mut renderer = test_renderer(4, 4);
        let mut assets = AssetStore::new();
        assets.add_sheet(solid_sheet(2, 2, 2, 2, [255, 0, 0, 255]));

        let world = sprite_world(-1.0, -1.0, 0, 0);
        renderer.render(&world, &assets);

        // Only the bottom-right pixel of the 2x2 sprite is on screen.
        assert_eq!(pixel(&renderer.framebuffer, 0, 0), [255, 0, 0, 255]);
        assert_eq!(pixel(&renderer.framebuffer, 1, 0), [0, 0, 0, 255]);
        assert_eq!(pixel(&renderer.framebuffer, 0, 1), [0, 0, 0, 255]);
    }

    #[test]
    fn render_ignores_missing_sheets() {
        let mut renderer = test_renderer(4, 4);
        let assets = AssetStore::new();
        let world = sprite_world(0.0, 0.0, 99, 0);
        renderer.render(&world, &assets); // must not panic
        assert_eq!(pixel(&renderer.framebuffer, 0, 0), [0, 0, 0, 255]);
    }

    #[test]
    fn render_orders_sprites_by_layer() {
        let mut renderer = test_renderer(4, 4);
        let mut assets = AssetStore::new();
        let red = assets.add_sheet(solid_sheet(1, 1, 1, 1, [255, 0, 0, 255]));
        let blue = assets.add_sheet(solid_sheet(1, 1, 1, 1, [0, 0, 255, 255]));

        let mut world = World::new();
        // Spawn the high layer first to prove ordering comes from `layer`,
        // not spawn order.
        world.spawn((
            Position(Vec2::new(1.0, 1.0)),
            SpriteIndex {
                sheet: blue,
                frame: 0,
                flip_x: false,
                flip_y: false,
                layer: 5,
            },
        ));
        world.spawn((
            Position(Vec2::new(1.0, 1.0)),
            SpriteIndex {
                sheet: red,
                frame: 0,
                flip_x: false,
                flip_y: false,
                layer: 0,
            },
        ));

        renderer.render(&world, &assets);
        assert_eq!(pixel(&renderer.framebuffer, 1, 1), [0, 0, 255, 255]);
    }

    #[test]
    fn a_sprite_limit_keeps_the_front_layers_not_the_back() {
        // Regression: sprites were sorted back-to-front and then truncated
        // from the front, so exceeding the budget dropped the topmost layers
        // — the player — while background scenery survived.
        let mut renderer = Renderer::new(4, 4, 1, false, HardwareProfile::Custom);
        let mut assets = AssetStore::new();
        let back = assets.add_sheet(solid_sheet(1, 1, 1, 1, [0, 0, 255, 255]));
        let front = assets.add_sheet(solid_sheet(1, 1, 1, 1, [255, 0, 0, 255]));

        let mut world = World::new();
        for (x, sheet, layer) in [(0u32, back, 0u8), (1, front, 10)] {
            world.spawn((
                Position(Vec2::new(x as f32, 0.0)),
                SpriteIndex {
                    sheet,
                    frame: 0,
                    flip_x: false,
                    flip_y: false,
                    layer,
                },
            ));
        }

        renderer.render(&world, &assets);
        assert_eq!(
            pixel(&renderer.framebuffer, 1, 0),
            [255, 0, 0, 255],
            "the front layer must survive the cap"
        );
        assert_ne!(
            pixel(&renderer.framebuffer, 0, 0),
            [0, 0, 255, 255],
            "the back layer is the one to drop"
        );
    }

    #[test]
    fn a_zero_limit_draws_every_sprite() {
        let mut renderer = Renderer::new(8, 4, 0, false, HardwareProfile::Custom);
        let mut assets = AssetStore::new();
        let sheet = assets.add_sheet(solid_sheet(1, 1, 1, 1, [255, 0, 0, 255]));

        let mut world = World::new();
        for x in 0..8 {
            world.spawn((
                Position(Vec2::new(x as f32, 0.0)),
                SpriteIndex {
                    sheet,
                    frame: 0,
                    flip_x: false,
                    flip_y: false,
                    layer: 0,
                },
            ));
        }

        renderer.render(&world, &assets);
        let drawn = (0..8)
            .filter(|&x| pixel(&renderer.framebuffer, x, 0) == [255, 0, 0, 255])
            .count();
        assert_eq!(drawn, 8, "0 means unlimited, not none");
    }

    #[test]
    fn the_peak_sprite_count_is_what_export_checks_against() {
        let mut renderer = Renderer::new(8, 4, 0, false, HardwareProfile::Custom);
        let mut assets = AssetStore::new();
        let sheet = assets.add_sheet(solid_sheet(1, 1, 1, 1, [255, 0, 0, 255]));
        assert_eq!(renderer.peak_sprites, 0);

        let mut world = World::new();
        for x in 0..5 {
            world.spawn((
                Position(Vec2::new(x as f32, 0.0)),
                SpriteIndex {
                    sheet,
                    frame: 0,
                    flip_x: false,
                    flip_y: false,
                    layer: 0,
                },
            ));
        }
        renderer.render(&world, &assets);
        assert_eq!(renderer.peak_sprites, 5);

        // A quieter frame must not lower the peak: the busiest moment is the
        // one a hardware budget has to survive.
        renderer.render(&World::new(), &assets);
        assert_eq!(renderer.peak_sprites, 5);

        renderer.reset_peak_sprites();
        assert_eq!(renderer.peak_sprites, 0);
    }

    #[test]
    fn switching_profile_swaps_the_look_without_rebuilding() {
        let mut renderer = Renderer::new(4, 4, 0, false, HardwareProfile::Custom);
        assert!(renderer.palette.is_none());

        renderer.set_profile(HardwareProfile::GameBoy);
        assert!(renderer.palette.is_some(), "Game Boy has a palette");
        assert_eq!(renderer.bg_color, Palette::gameboy().get(1));
        assert!(!renderer.scanlines, "a DMG has no scanlines");

        renderer.set_profile(HardwareProfile::Nes);
        assert!(
            renderer.palette.is_none(),
            "the NES is not palette-clamped here"
        );
        assert!(renderer.scanlines);

        renderer.set_profile(HardwareProfile::Custom);
        assert!(renderer.palette.is_none());
        assert!(!renderer.scanlines);
    }

    #[test]
    fn render_respects_the_sprite_limit() {
        let mut renderer = Renderer::new(4, 4, 1, false, HardwareProfile::Custom);
        let mut assets = AssetStore::new();
        let sheet = assets.add_sheet(solid_sheet(1, 1, 1, 1, [255, 0, 0, 255]));

        let mut world = World::new();
        for x in 0..3 {
            world.spawn((
                Position(Vec2::new(x as f32, 0.0)),
                SpriteIndex {
                    sheet,
                    frame: 0,
                    flip_x: false,
                    flip_y: false,
                    layer: 0,
                },
            ));
        }

        renderer.render(&world, &assets);
        let drawn = (0..3)
            .filter(|&x| pixel(&renderer.framebuffer, x, 0) == [255, 0, 0, 255])
            .count();
        assert_eq!(drawn, 1);
    }

    #[test]
    fn render_draws_tilemap_tiles_one_based() {
        let mut renderer = test_renderer(4, 4);
        let mut assets = AssetStore::new();
        let sheet = assets.add_sheet(solid_sheet(2, 2, 2, 2, [0, 255, 0, 255]));

        let mut map = TileMap::new("map".to_string(), 2, 2, 2, 2);
        let layer = map.add_layer("bg".to_string(), sheet, false);
        // Tile id 0 = empty, id 1 = first tile in the sheet.
        map.set_tile(layer, 1, 1, 1);
        renderer.tilemaps.push(map);

        let world = World::new();
        renderer.render(&world, &assets);

        assert_eq!(pixel(&renderer.framebuffer, 0, 0), [0, 0, 0, 255]);
        assert_eq!(pixel(&renderer.framebuffer, 2, 2), [0, 255, 0, 255]);
        assert_eq!(pixel(&renderer.framebuffer, 3, 3), [0, 255, 0, 255]);
    }

    #[test]
    fn gameboy_profile_installs_its_palette() {
        let renderer = Renderer::new(8, 8, 40, false, HardwareProfile::GameBoy);
        assert!(renderer.palette.is_some());
        assert_eq!(renderer.bg_color, Palette::gameboy().get(1));

        let plain = test_renderer(8, 8);
        assert!(plain.palette.is_none());
        assert_eq!(plain.bg_color, Color::BLACK);
    }

    #[test]
    fn shake_offsets_decay_back_to_zero() {
        let mut renderer = test_renderer(8, 8);
        renderer.shake(5.0, 0.1);
        let world = World::new();
        let assets = AssetStore::new();
        // Render enough frames (at the internal 60fps step) to outlast the
        // shake duration.
        for _ in 0..20 {
            renderer.render(&world, &assets);
        }
        assert!(renderer.shake_timer <= 0.0);
    }
}
