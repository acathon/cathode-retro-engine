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
