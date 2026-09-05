use crate::assets::AssetStore;
use crate::renderer::FrameBuffer;

pub struct BitmapFont {
    pub sheet_handle: u32,
    pub char_width: u32,
    pub char_height: u32,
    pub cols: u32,
    pub first_char: u8,
}

impl BitmapFont {
    pub fn new(sheet_handle: u32, char_w: u32, char_h: u32, cols: u32, first_char: u8) -> Self {
        Self {
            sheet_handle,
            char_width: char_w,
            char_height: char_h,
            cols,
            first_char,
        }
    }

    pub fn draw_text(
        &self,
        fb: &mut FrameBuffer,
        assets: &AssetStore,
        text: &str,
        x: i32,
        y: i32,
        scale: u32,
    ) {
        let sheet = match assets.sprite_sheets.get(self.sheet_handle as usize) {
            Some(s) => s,
            None => return,
        };

        let cw = self.char_width;
        let ch = self.char_height;
        let scaled_w = cw * scale;
        let scaled_h = ch * scale;
        let mut cx = x;
        let mut cy = y;

        for byte in text.bytes() {
            if byte == b'\n' {
                cy += scaled_h as i32;
                cx = x;
                continue;
            }

            if byte < self.first_char {
                cx += scaled_w as i32;
                continue;
            }

            let tile_index = (byte - self.first_char) as u32;
            let src_col = tile_index % self.cols;
            let src_row = tile_index / self.cols;
            let src_x = src_col * cw;
            let src_y = src_row * ch;

            for py in 0..ch {
                for px in 0..cw {
                    let sx = src_x + px;
                    let sy = src_y + py;

                    if sx >= sheet.width || sy >= sheet.height {
                        continue;
                    }

                    let s_idx = ((sy * sheet.width + sx) * 4) as usize;
                    if s_idx + 3 >= sheet.pixels.len() {
                        continue;
                    }

                    let a = sheet.pixels[s_idx + 3];
                    if a == 0 {
                        continue;
                    }

                    let r = sheet.pixels[s_idx];
                    let g = sheet.pixels[s_idx + 1];
                    let b = sheet.pixels[s_idx + 2];

                    for sy_scale in 0..scale {
                        for sx_scale in 0..scale {
                            let dx = cx + (px * scale + sx_scale) as i32;
                            let dy = cy + (py * scale + sy_scale) as i32;
                            if dx >= 0 && dy >= 0 {
                                fb.set_pixel(dx as u32, dy as u32, r, g, b, a);
                            }
                        }
                    }
                }
            }

            cx += scaled_w as i32;
        }
    }

    pub fn measure(&self, text: &str, scale: u32) -> u32 {
        let mut max_w = 0u32;
        let mut current_w = 0u32;
        let scaled_w = self.char_width * scale;

        for byte in text.bytes() {
            if byte == b'\n' {
                if current_w > max_w {
                    max_w = current_w;
                }
                current_w = 0;
            } else {
                current_w += scaled_w;
            }
        }

        if current_w > max_w {
            max_w = current_w;
        }
        max_w
    }
}

pub struct FontRegistry {
    fonts: Vec<BitmapFont>,
}

impl Default for FontRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl FontRegistry {
    pub fn new() -> Self {
        Self { fonts: Vec::new() }
    }

    pub fn register(
        &mut self,
        sheet_handle: u32,
        char_w: u32,
        char_h: u32,
        cols: u32,
        first_char: u8,
    ) -> u32 {
        let handle = self.fonts.len() as u32;
        self.fonts.push(BitmapFont::new(
            sheet_handle,
            char_w,
            char_h,
            cols,
            first_char,
        ));
        handle
    }

    pub fn get(&self, handle: u32) -> Option<&BitmapFont> {
        self.fonts.get(handle as usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::SpriteSheet;

    /// A 4x1 grid of 8x8 white glyphs starting at 'A'.
    fn font_sheet() -> SpriteSheet {
        let (w, h) = (32u32, 8u32);
        SpriteSheet::from_rgba(w, h, 8, 8, vec![255; (w * h * 4) as usize])
    }

    fn font_assets() -> (AssetStore, BitmapFont) {
        let mut assets = AssetStore::new();
        let handle = assets.add_sheet(font_sheet());
        (assets, BitmapFont::new(handle, 8, 8, 4, b'A'))
    }

    fn pixel(fb: &FrameBuffer, x: u32, y: u32) -> u8 {
        fb.pixels[((y * fb.width + x) * 4) as usize]
    }

    #[test]
    fn measure_counts_one_cell_per_character() {
        let (_, font) = font_assets();
        assert_eq!(font.measure("", 1), 0);
        assert_eq!(font.measure("ABC", 1), 24);
        assert_eq!(font.measure("ABC", 2), 48, "scale multiplies the width");
    }

    #[test]
    fn measure_returns_the_widest_line() {
        let (_, font) = font_assets();
        assert_eq!(font.measure("AB\nABCD\nA", 1), 32);
        assert_eq!(
            font.measure("AB\n", 1),
            16,
            "a trailing newline adds nothing"
        );
    }

    #[test]
    fn drawing_puts_glyph_pixels_on_screen() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(64, 32);
        fb.clear(0, 0, 0);

        font.draw_text(&mut fb, &assets, "A", 0, 0, 1);

        assert_eq!(pixel(&fb, 0, 0), 255);
        assert_eq!(pixel(&fb, 7, 7), 255);
        assert_eq!(pixel(&fb, 8, 0), 0, "only one glyph wide");
    }

    #[test]
    fn characters_advance_horizontally() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(64, 32);
        fb.clear(0, 0, 0);

        font.draw_text(&mut fb, &assets, "AB", 0, 0, 1);

        assert_eq!(pixel(&fb, 0, 0), 255);
        assert_eq!(pixel(&fb, 8, 0), 255, "second glyph starts at x=8");
        assert_eq!(pixel(&fb, 16, 0), 0);
    }

    #[test]
    fn newlines_move_down_a_row_and_reset_x() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(64, 32);
        fb.clear(0, 0, 0);

        font.draw_text(&mut fb, &assets, "A\nA", 0, 0, 1);

        assert_eq!(pixel(&fb, 0, 0), 255);
        assert_eq!(pixel(&fb, 0, 8), 255, "second line sits one row down");
    }

    #[test]
    fn scale_enlarges_each_glyph() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(64, 32);
        fb.clear(0, 0, 0);

        font.draw_text(&mut fb, &assets, "A", 0, 0, 2);

        assert_eq!(pixel(&fb, 15, 15), 255, "a 2x glyph covers 16x16");
        assert_eq!(pixel(&fb, 16, 0), 0);
    }

    #[test]
    fn characters_below_the_first_advance_without_drawing() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(64, 32);
        fb.clear(0, 0, 0);

        // Space (0x20) is below 'A', so it leaves a gap.
        font.draw_text(&mut fb, &assets, " A", 0, 0, 1);

        assert_eq!(pixel(&fb, 0, 0), 0, "the space draws nothing");
        assert_eq!(pixel(&fb, 8, 0), 255, "but still advances the cursor");
    }

    #[test]
    fn glyphs_outside_the_sheet_are_skipped() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(64, 32);
        fb.clear(0, 0, 0);

        // 'Z' is far past the 4 glyphs the sheet actually holds.
        font.draw_text(&mut fb, &assets, "Z", 0, 0, 1);
        assert_eq!(pixel(&fb, 0, 0), 0);
    }

    #[test]
    fn drawing_offscreen_or_with_a_missing_sheet_is_safe() {
        let (assets, font) = font_assets();
        let mut fb = FrameBuffer::new(16, 16);
        font.draw_text(&mut fb, &assets, "AAAA", -100, -100, 1);
        font.draw_text(&mut fb, &assets, "AAAA", 1000, 1000, 1);

        let orphan = BitmapFont::new(99, 8, 8, 4, b'A');
        orphan.draw_text(&mut fb, &assets, "A", 0, 0, 1);
    }

    #[test]
    fn the_registry_hands_out_sequential_handles() {
        let mut registry = FontRegistry::new();
        assert!(registry.get(0).is_none());

        let a = registry.register(0, 8, 8, 16, b' ');
        let b = registry.register(1, 6, 6, 16, b'A');
        assert_eq!((a, b), (0, 1));

        assert_eq!(registry.get(a).unwrap().char_width, 8);
        assert_eq!(registry.get(b).unwrap().first_char, b'A');
        assert!(registry.get(99).is_none());
    }
}
