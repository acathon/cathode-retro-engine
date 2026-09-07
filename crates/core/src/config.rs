use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum HardwareProfile {
    #[default]
    Nes,
    GameBoy,
    NeoGeo,
    /// VGA mode 13h: 320x200 in 256 colours, the shape of a DOS game.
    ///
    /// This models the *look*, not the machine. Producing a real MS-DOS
    /// executable would mean a 16-bit target Rust does not have and a core
    /// without `std`; what this gives you is the resolution, the refresh rate
    /// and the palette, running wherever the engine already runs.
    Dos,
    Custom,
}

impl HardwareProfile {
    /// Parse a profile from its name; unknown names fall back to `Custom`.
    pub fn from_name(name: &str) -> Self {
        match name
            .to_ascii_lowercase()
            .replace(['-', '_', ' '], "")
            .as_str()
        {
            "nes" => Self::Nes,
            "gameboy" | "gb" | "dmg" => Self::GameBoy,
            "neogeo" => Self::NeoGeo,
            "dos" | "vga" | "mode13h" | "mode13" => Self::Dos,
            _ => Self::Custom,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Nes => "nes",
            Self::GameBoy => "gameboy",
            Self::NeoGeo => "neogeo",
            Self::Dos => "dos",
            Self::Custom => "custom",
        }
    }

    /// The real hardware's screen size, if this profile models one.
    pub fn resolution(self) -> Option<(u32, u32)> {
        match self {
            Self::Nes => Some((256, 240)),
            Self::GameBoy => Some((160, 144)),
            Self::NeoGeo => Some((320, 224)),
            Self::Dos => Some((320, 200)),
            Self::Custom => None,
        }
    }

    /// How many sprites the real hardware could show at once.
    ///
    /// **Advisory.** The engine does not enforce it while you build: a hard
    /// cap that silently drops sprites turns "too many objects" into "the
    /// player character disappeared", which is not a lesson anyone can act
    /// on. Compare it against [`crate::renderer::Renderer::peak_sprites`]
    /// when exporting for a target instead, where the answer is actionable.
    pub fn sprite_budget(self) -> Option<u32> {
        match self {
            Self::Nes => Some(64),
            Self::GameBoy => Some(40),
            Self::NeoGeo => Some(380),
            // VGA had no sprite hardware at all: everything was blitted by
            // the CPU, so the budget was frame time rather than a count.
            Self::Dos => None,
            Self::Custom => None,
        }
    }

    /// Audio channels the real hardware had.
    pub fn audio_channels(self) -> Option<u8> {
        match self {
            Self::Nes => Some(5),
            Self::GameBoy => Some(4),
            Self::NeoGeo => Some(8),
            // AdLib's OPL2, which is what a DOS game with music assumed.
            Self::Dos => Some(9),
            Self::Custom => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineConfig {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub audio_channels: u8,
    /// Hard cap on sprites drawn per frame. **0 means unlimited, which is the
    /// default for every profile**: the look of a machine is worth keeping,
    /// its limits are not something to discover as a vanished player sprite.
    /// Set it only to deliberately reproduce hardware dropout.
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
            sprite_limit: 0,
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
            sprite_limit: 0,
            scanlines: false,
            pixel_perfect: true,
            profile: HardwareProfile::GameBoy,
            title: "GameBoy Retro Game".to_string(),
        }
    }

    /// VGA mode 13h, at its real 70 Hz refresh.
    pub fn dos() -> Self {
        Self {
            width: 320,
            height: 200,
            // Mode 13h ran at 70 Hz, not 60. Games written for it are tuned
            // to that, so it is the honest default; override it if a browser
            // running at 60 makes the difference matter to you.
            fps: 70,
            audio_channels: 9,
            sprite_limit: 0,
            // A CRT running 320x200 stretched to 4:3 had no visible scanline
            // gaps — the doubled lines filled them.
            scanlines: false,
            pixel_perfect: true,
            profile: HardwareProfile::Dos,
            title: "DOS Retro Game".to_string(),
        }
    }

    pub fn neogeo() -> Self {
        Self {
            width: 320,
            height: 224,
            fps: 60,
            audio_channels: 8,
            sprite_limit: 0,
            scanlines: true,
            pixel_perfect: true,
            profile: HardwareProfile::NeoGeo,
            title: "NeoGeo Retro Game".to_string(),
        }
    }
}

#[cfg(test)]
mod dos_tests {
    use super::*;

    #[test]
    fn dos_is_mode_13h() {
        let config = EngineConfig::dos();
        assert_eq!((config.width, config.height), (320, 200));
        assert_eq!(config.profile, HardwareProfile::Dos);
    }

    #[test]
    fn dos_runs_at_seventy_hertz() {
        assert_eq!(EngineConfig::dos().fps, 70);
    }

    #[test]
    fn dos_answers_to_the_names_people_type() {
        for name in ["dos", "DOS", "vga", "mode13h", "mode-13h", "Mode 13"] {
            assert_eq!(
                HardwareProfile::from_name(name),
                HardwareProfile::Dos,
                "{name}"
            );
        }
    }

    #[test]
    fn dos_reports_no_sprite_budget() {
        // VGA blitted in software; there was no sprite count to exceed.
        assert_eq!(HardwareProfile::Dos.sprite_budget(), None);
        assert_eq!(HardwareProfile::Dos.resolution(), Some((320, 200)));
    }

    #[test]
    fn every_profile_round_trips_through_its_name() {
        for profile in [
            HardwareProfile::Nes,
            HardwareProfile::GameBoy,
            HardwareProfile::NeoGeo,
            HardwareProfile::Dos,
            HardwareProfile::Custom,
        ] {
            assert_eq!(HardwareProfile::from_name(profile.name()), profile);
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
        assert_eq!(EngineConfig::gameboy().profile, HardwareProfile::GameBoy);
        assert_eq!(EngineConfig::neogeo().profile, HardwareProfile::NeoGeo);

        // The budgets are advisory, and live on the profile.
        assert_eq!(HardwareProfile::Nes.sprite_budget(), Some(64));
        assert_eq!(HardwareProfile::GameBoy.sprite_budget(), Some(40));
        assert_eq!(HardwareProfile::NeoGeo.sprite_budget(), Some(380));
        assert_eq!(HardwareProfile::Custom.sprite_budget(), None);
    }

    #[test]
    fn no_preset_caps_sprites_at_run_time() {
        // A hard cap turns "too many objects" into "the player disappeared",
        // which is not something a developer can act on. The budget is
        // checked when exporting for a target instead.
        for cfg in [
            EngineConfig::nes(),
            EngineConfig::gameboy(),
            EngineConfig::neogeo(),
            EngineConfig::default(),
        ] {
            assert_eq!(cfg.sprite_limit, 0, "{} should be unlimited", cfg.title);
        }
    }

    #[test]
    fn a_profile_round_trips_through_its_name() {
        for profile in [
            HardwareProfile::Nes,
            HardwareProfile::GameBoy,
            HardwareProfile::NeoGeo,
            HardwareProfile::Custom,
        ] {
            assert_eq!(HardwareProfile::from_name(profile.name()), profile);
        }
        // Spelling variants people actually type.
        assert_eq!(
            HardwareProfile::from_name("Game Boy"),
            HardwareProfile::GameBoy
        );
        assert_eq!(HardwareProfile::from_name("GB"), HardwareProfile::GameBoy);
        assert_eq!(
            HardwareProfile::from_name("neo-geo"),
            HardwareProfile::NeoGeo
        );
        assert_eq!(
            HardwareProfile::from_name("dreamcast"),
            HardwareProfile::Custom
        );
    }

    #[test]
    fn profile_resolutions_match_the_presets_built_from_them() {
        for (profile, cfg) in [
            (HardwareProfile::Nes, EngineConfig::nes()),
            (HardwareProfile::GameBoy, EngineConfig::gameboy()),
            (HardwareProfile::NeoGeo, EngineConfig::neogeo()),
        ] {
            assert_eq!(profile.resolution(), Some((cfg.width, cfg.height)));
            assert_eq!(profile.audio_channels(), Some(cfg.audio_channels));
        }
        assert_eq!(HardwareProfile::Custom.resolution(), None);
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
