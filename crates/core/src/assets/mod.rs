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

#[cfg(test)]
mod tests {
    use super::*;

    fn sheet(w: u32, h: u32) -> SpriteSheet {
        SpriteSheet::from_rgba(w, h, 8, 8, vec![0; (w * h * 4) as usize])
    }

    #[test]
    fn a_sheet_keeps_its_dimensions() {
        let s = sheet(16, 16);
        assert_eq!((s.width, s.height), (16, 16));
        assert_eq!((s.tile_width, s.tile_height), (8, 8));
        assert_eq!(s.pixels.len(), 16 * 16 * 4);
    }

    #[test]
    #[should_panic(expected = "Pixel array must match")]
    fn a_mismatched_pixel_buffer_is_rejected() {
        SpriteSheet::from_rgba(8, 8, 8, 8, vec![0; 10]);
    }

    #[test]
    fn stores_hand_out_sequential_handles_per_kind() {
        let mut store = AssetStore::new();

        assert_eq!(store.add_sheet(sheet(8, 8)), 0);
        assert_eq!(store.add_sheet(sheet(8, 8)), 1);
        // Each kind has its own handle space.
        assert_eq!(store.add_palette(Palette::gameboy()), 0);
        assert_eq!(store.add_audio(vec![0.0; 4]), 0);

        assert_eq!(store.sprite_sheets.len(), 2);
        assert_eq!(store.palettes.len(), 1);
        assert_eq!(store.audio_samples.len(), 1);
    }

    #[test]
    fn a_new_store_is_empty() {
        let store = AssetStore::default();
        assert!(store.sprite_sheets.is_empty());
        assert!(store.palettes.is_empty());
        assert!(store.audio_samples.is_empty());
    }

    #[test]
    fn a_sheet_survives_a_json_round_trip() {
        let original = SpriteSheet::from_rgba(2, 2, 1, 1, vec![7; 16]);
        let json = serde_json::to_string(&original).unwrap();
        let restored: SpriteSheet = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.width, 2);
        assert_eq!(restored.pixels, original.pixels);
    }
}
