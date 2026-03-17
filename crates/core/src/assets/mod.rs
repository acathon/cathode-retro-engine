use crate::renderer::Palette;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpriteSheet {
    pub width: u32,
    pub height: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub pixels: Vec<u8>, // RGBA8
}

impl SpriteSheet {
    pub fn from_rgba(
        width: u32,
        height: u32,
        tile_width: u32,
        tile_height: u32,
        pixels: Vec<u8>,
    ) -> Self {
        assert_eq!(
            pixels.len(),
            (width * height * 4) as usize,
            "Pixel array must match width * height * 4"
        );
        Self {
            width,
            height,
            tile_width,
            tile_height,
            pixels,
        }
    }
}

pub struct AssetStore {
    pub sprite_sheets: Vec<SpriteSheet>,
    pub palettes: Vec<Palette>,
    pub audio_samples: Vec<Vec<f32>>,
}

impl Default for AssetStore {
    fn default() -> Self {
        Self::new()
    }
}

impl AssetStore {
    pub fn new() -> Self {
        Self {
            sprite_sheets: Vec::new(),
            palettes: Vec::new(),
            audio_samples: Vec::new(),
        }
    }

    pub fn add_sheet(&mut self, sheet: SpriteSheet) -> u32 {
        let handle = self.sprite_sheets.len() as u32;
        self.sprite_sheets.push(sheet);
        handle
    }

    pub fn add_palette(&mut self, palette: Palette) -> u32 {
        let handle = self.palettes.len() as u32;
        self.palettes.push(palette);
        handle
    }

    pub fn add_audio(&mut self, sample: Vec<f32>) -> u32 {
        let handle = self.audio_samples.len() as u32;
        self.audio_samples.push(sample);
        handle
    }
}
