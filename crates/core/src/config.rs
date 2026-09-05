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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_match_their_real_hardware_resolutions() {
        assert_eq!(
            (EngineConfig::nes().width, EngineConfig::nes().height),
            (256, 240)
        );
        let gb = EngineConfig::gameboy();
        assert_eq!((gb.width, gb.height), (160, 144));
        let ng = EngineConfig::neogeo();
        assert_eq!((ng.width, ng.height), (320, 224));
    }

    #[test]
    fn presets_carry_their_own_profile_and_sprite_budget() {
        assert_eq!(EngineConfig::nes().profile, HardwareProfile::Nes);
        assert_eq!(EngineConfig::nes().sprite_limit, 64);

        assert_eq!(EngineConfig::gameboy().profile, HardwareProfile::GameBoy);
        assert_eq!(EngineConfig::gameboy().sprite_limit, 40);

        assert_eq!(EngineConfig::neogeo().profile, HardwareProfile::NeoGeo);
        assert_eq!(EngineConfig::neogeo().sprite_limit, 380);
    }

    #[test]
    fn the_default_config_is_the_nes_preset() {
        let d = EngineConfig::default();
        assert_eq!(d.profile, HardwareProfile::Nes);
        assert_eq!(d.width, EngineConfig::nes().width);
        assert_eq!(HardwareProfile::default(), HardwareProfile::Nes);
    }

    #[test]
    fn every_preset_targets_60fps() {
        for cfg in [
            EngineConfig::nes(),
            EngineConfig::gameboy(),
            EngineConfig::neogeo(),
        ] {
            assert_eq!(cfg.fps, 60);
            assert!(cfg.pixel_perfect);
            assert!(cfg.audio_channels > 0);
        }
    }

    #[test]
    fn a_config_survives_a_json_round_trip() {
        // The web bindings build every engine from a JSON config string.
        let original = EngineConfig::gameboy();
        let restored: EngineConfig =
            serde_json::from_str(&serde_json::to_string(&original).unwrap()).unwrap();

        assert_eq!(restored.width, original.width);
        assert_eq!(restored.profile, original.profile);
        assert_eq!(restored.title, original.title);
    }

    #[test]
    fn an_empty_json_object_falls_back_to_the_default() {
        // WebEngine::new uses unwrap_or_default when a game passes `{}`.
        let parsed: EngineConfig = serde_json::from_str("{}").unwrap_or_default();
        assert_eq!(parsed.profile, HardwareProfile::Nes);
    }
}
