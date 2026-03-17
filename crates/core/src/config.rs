use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum HardwareProfile {
    #[default]
    Nes,
    GameBoy,
    NeoGeo,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub audio_channels: u8,
    pub sprite_limit: u32,
    pub scanlines: bool,
    pub pixel_perfect: bool,
    pub profile: HardwareProfile,
    pub title: String,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self::nes()
    }
}

impl EngineConfig {
    pub fn nes() -> Self {
        Self {
            width: 256,
            height: 240,
            fps: 60,
            audio_channels: 5,
            sprite_limit: 64,
            scanlines: true,
            pixel_perfect: true,
            profile: HardwareProfile::Nes,
            title: "NES Retro Game".to_string(),
        }
    }

    pub fn gameboy() -> Self {
        Self {
            width: 160,
            height: 144,
            fps: 60,
            audio_channels: 4,
            sprite_limit: 40,
            scanlines: false,
            pixel_perfect: true,
            profile: HardwareProfile::GameBoy,
            title: "GameBoy Retro Game".to_string(),
        }
    }

    pub fn neogeo() -> Self {
        Self {
            width: 320,
            height: 224,
            fps: 60,
            audio_channels: 8,
            sprite_limit: 380,
            scanlines: true,
            pixel_perfect: true,
            profile: HardwareProfile::NeoGeo,
            title: "NeoGeo Retro Game".to_string(),
        }
    }
}
