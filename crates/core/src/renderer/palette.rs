#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Color(pub u8, pub u8, pub u8, pub u8);

impl Color {
    pub const BLACK: Color = Color(0, 0, 0, 255);
    pub const WHITE: Color = Color(255, 255, 255, 255);
    pub const TRANSPARENT: Color = Color(0, 0, 0, 0);
    pub const RED: Color = Color(255, 0, 0, 255);
    pub const GREEN: Color = Color(0, 255, 0, 255);
    pub const BLUE: Color = Color(0, 0, 255, 255);

    pub fn rgb(r: u8, g: u8, b: u8) -> Self {
        Self(r, g, b, 255)
    }

    pub fn rgba(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self(r, g, b, a)
    }

    pub fn from_hex(s: &str) -> Option<Self> {
        let s = s.trim_start_matches('#');
        let len = s.len();
        if len != 6 && len != 8 {
            return None;
        }

        let r = u8::from_str_radix(&s[0..2], 16).ok()?;
        let g = u8::from_str_radix(&s[2..4], 16).ok()?;
        let b = u8::from_str_radix(&s[4..6], 16).ok()?;
        let a = if len == 8 {
            u8::from_str_radix(&s[6..8], 16).ok()?
        } else {
            255
        };

        Some(Self(r, g, b, a))
    }

    pub fn to_hex(&self) -> String {
        format!("#{:02X}{:02X}{:02X}{:02X}", self.0, self.1, self.2, self.3)
    }

    pub fn to_rgba(&self) -> [u8; 4] {
        [self.0, self.1, self.2, self.3]
    }

    pub fn lerp(&self, other: &Self, t: f32) -> Self {
        let t = t.clamp(0.0, 1.0);
        let r = (self.0 as f32 + (other.0 as f32 - self.0 as f32) * t) as u8;
        let g = (self.1 as f32 + (other.1 as f32 - self.1 as f32) * t) as u8;
        let b = (self.2 as f32 + (other.2 as f32 - self.2 as f32) * t) as u8;
        let a = (self.3 as f32 + (other.3 as f32 - self.3 as f32) * t) as u8;
        Self(r, g, b, a)
    }
}

#[derive(Debug, Clone)]
pub struct Palette {
    pub colors: Vec<Color>,
    pub name: String,
}

impl Palette {
    pub fn new(name: String) -> Self {
        Self {
            colors: vec![Color::TRANSPARENT],
            name,
        }
    }

    pub fn set(&mut self, idx: usize, color: Color) {
        if idx < self.colors.len() {
            self.colors[idx] = color;
        } else if idx == self.colors.len() {
            self.colors.push(color);
        } else {
            self.colors.resize(idx + 1, Color::BLACK);
            self.colors[idx] = color;
        }
    }

    pub fn get(&self, idx: usize) -> Color {
        self.colors.get(idx).copied().unwrap_or(Color::TRANSPARENT)
    }

    pub fn len(&self) -> usize {
        self.colors.len()
    }

    pub fn is_empty(&self) -> bool {
        self.colors.is_empty()
    }

    pub fn gameboy() -> Self {
        Self {
            colors: vec![
                Color::TRANSPARENT,
                Color::from_hex("#e0f8cf").unwrap(),
                Color::from_hex("#86c06c").unwrap(),
                Color::from_hex("#306850").unwrap(),
                Color::from_hex("#071821").unwrap(),
            ],
            name: "GameBoy".to_string(),
        }
    }

    /// The default VGA 256-colour palette, as DOS games found it at boot.
    ///
    /// Three blocks, in the order the BIOS wrote them: the sixteen EGA
    /// colours, sixteen greys, and then 216 colours as nine hue groups of
    /// twenty-four. That last block is why DOS art has its particular look —
    /// it is a coarse HSV cube, not a smooth ramp, so gradients band in a way
    /// that is recognisable at a glance.
    ///
    /// Index 0 is transparent here rather than black, because the renderer
    /// treats slot 0 as "leave this pixel alone"; VGA's own index 0 (black)
    /// is kept at the end of the EGA block.
    pub fn vga() -> Self {
        let mut colors = vec![Color::TRANSPARENT];

        // The sixteen EGA colours: 0-7 at two-thirds intensity, 8-15 full.
        for i in 0..16u8 {
            let bright = i >= 8;
            let bit = |n: u8| -> u8 {
                let set = (i >> n) & 1 == 1;
                match (set, bright) {
                    (true, true) => 255,
                    (true, false) => 170,
                    // Dark yellow is the one exception the IBM palette makes:
                    // brown, not olive, so it does not read as sickly green.
                    (false, true) => 85,
                    (false, false) => 0,
                }
            };
            let (r, g, b) = (bit(2), bit(1), bit(0));
            let (r, g, b) = if i == 6 { (170, 85, 0) } else { (r, g, b) };
            colors.push(Color::rgb(r, g, b));
        }

        // Sixteen greys, black to white.
        for i in 0..16u8 {
            let v = (i as u32 * 255 / 15) as u8;
            colors.push(Color::rgb(v, v, v));
        }

        // 216 colours: nine hues, each in three value bands and eight steps.
        for value in [255u32, 114, 65] {
            for saturation in [0u32, 1, 2] {
                for hue in 0..24u32 {
                    let (r, g, b) = hsv(
                        hue as f32 * 15.0,
                        1.0 - saturation as f32 * 0.35,
                        value as f32 / 255.0,
                    );
                    colors.push(Color::rgb(r, g, b));
                }
            }
        }

        // Indices 248-255 are unused and left black by the BIOS. Keeping them
        // means an index in code means the same colour it meant in 1991.
        for _ in 0..8 {
            colors.push(Color::rgb(0, 0, 0));
        }

        Self {
            colors,
            name: "VGA".to_string(),
        }
    }

    pub fn nes() -> Self {
        // NES 54-color palette
        let mut p = Self::new("NES".to_string());
        let hex_colors = [
            "#7C7C7C", "#0000FC", "#0000BC", "#4428BC", "#940084", "#A80020", "#A81000", "#881400",
            "#503000", "#007800", "#006800", "#005800", "#004058", "#000000", "#000000", "#000000",
            "#BCBCBC", "#0078F8", "#0058F8", "#6844FC", "#D800CC", "#E40058", "#F83800", "#E45C10",
            "#AC7C00", "#00B800", "#00A800", "#00A844", "#008888", "#000000", "#000000", "#000000",
            "#F8F8F8", "#3CBCFC", "#6888FC", "#9878F8", "#F878F8", "#F85898", "#F87858", "#FCA044",
            "#F8B800", "#B8F818", "#58D854", "#58F898", "#00E8D8", "#787878", "#000000", "#000000",
            "#FCFCFC", "#A4E4FC", "#B8B8F8", "#D8B8F8", "#F8B8F8", "#F8A4C0", "#F0D0B0", "#FCE0A8",
            "#F8D878", "#D8F878", "#B8F8B8", "#B8F8D8", "#00FCFC", "#F8D8F8", "#000000", "#000000",
        ];
        for c in hex_colors {
            p.colors.push(Color::from_hex(c).unwrap());
        }
        p
    }
}

impl Default for Palette {
    fn default() -> Self {
        // PICO-8 inspired
        Self {
            colors: vec![
                Color::TRANSPARENT,
                Color::from_hex("#000000").unwrap(),
                Color::from_hex("#1D2B53").unwrap(),
                Color::from_hex("#7E2553").unwrap(),
                Color::from_hex("#008751").unwrap(),
                Color::from_hex("#AB5236").unwrap(),
                Color::from_hex("#5F574F").unwrap(),
                Color::from_hex("#C2C3C7").unwrap(),
                Color::from_hex("#FFF1E8").unwrap(),
                Color::from_hex("#FF004D").unwrap(),
                Color::from_hex("#FFA300").unwrap(),
                Color::from_hex("#FFEC27").unwrap(),
                Color::from_hex("#00E436").unwrap(),
                Color::from_hex("#29ADFF").unwrap(),
                Color::from_hex("#83769C").unwrap(),
                Color::from_hex("#FF77A8").unwrap(),
                Color::from_hex("#FFCCAA").unwrap(),
            ],
            name: "Default (PICO-8)".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_hex_parses_rgb_and_rgba_with_optional_hash() {
        assert_eq!(Color::from_hex("#FF8000"), Some(Color(255, 128, 0, 255)));
        assert_eq!(Color::from_hex("FF8000"), Some(Color(255, 128, 0, 255)));
        assert_eq!(Color::from_hex("#FF800080"), Some(Color(255, 128, 0, 128)));
    }

    #[test]
    fn from_hex_rejects_malformed_input() {
        assert_eq!(Color::from_hex("#FFF"), None);
        assert_eq!(Color::from_hex("#GGGGGG"), None);
        assert_eq!(Color::from_hex(""), None);
        assert_eq!(Color::from_hex("#FF80001"), None);
    }

    #[test]
    fn to_hex_round_trips_through_from_hex() {
        let c = Color(18, 52, 86, 240);
        assert_eq!(Color::from_hex(&c.to_hex()), Some(c));
        assert_eq!(Color::BLACK.to_hex(), "#000000FF");
    }

    #[test]
    fn lerp_hits_endpoints_and_midpoint() {
        let a = Color::BLACK;
        let b = Color::WHITE;
        assert_eq!(a.lerp(&b, 0.0), a);
        assert_eq!(a.lerp(&b, 1.0), b);
        let mid = a.lerp(&b, 0.5);
        assert!((126..=128).contains(&mid.0));
        // t is clamped.
        assert_eq!(a.lerp(&b, 5.0), b);
        assert_eq!(a.lerp(&b, -5.0), a);
    }

    #[test]
    fn palette_set_extends_and_get_defaults_to_transparent() {
        let mut p = Palette::new("test".to_string());
        assert_eq!(p.len(), 1);

        // Appending at exactly len().
        p.set(1, Color::RED);
        assert_eq!(p.get(1), Color::RED);

        // Setting past the end pads with black.
        p.set(4, Color::GREEN);
        assert_eq!(p.len(), 5);
        assert_eq!(p.get(2), Color::BLACK);
        assert_eq!(p.get(4), Color::GREEN);

        // Overwriting in place.
        p.set(1, Color::BLUE);
        assert_eq!(p.get(1), Color::BLUE);

        // Out-of-range reads are transparent, not panics.
        assert_eq!(p.get(100), Color::TRANSPARENT);
    }

    #[test]
    fn builtin_palettes_have_expected_shapes() {
        assert_eq!(Palette::gameboy().colors.len(), 5);
        assert_eq!(Palette::nes().colors.len(), 65);
        assert_eq!(Palette::default().colors.len(), 17);
        // Index 0 is reserved for transparency in all of them.
        assert_eq!(Palette::gameboy().get(0), Color::TRANSPARENT);
        assert_eq!(Palette::nes().get(0), Color::TRANSPARENT);
        assert_eq!(Palette::default().get(0), Color::TRANSPARENT);
    }
}

/// HSV to RGB, for the VGA palette's 216-colour block.
fn hsv(hue_degrees: f32, saturation: f32, value: f32) -> (u8, u8, u8) {
    let h = (hue_degrees % 360.0) / 60.0;
    let c = value * saturation;
    let x = c * (1.0 - ((h % 2.0) - 1.0).abs());
    let m = value - c;
    let (r, g, b) = match h as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    (
        ((r + m) * 255.0).round() as u8,
        ((g + m) * 255.0).round() as u8,
        ((b + m) * 255.0).round() as u8,
    )
}

#[cfg(test)]
mod vga_tests {
    use super::*;

    #[test]
    fn vga_has_256_colours_plus_the_transparent_slot() {
        // 16 EGA + 16 greys + 216 hues + 8 unused, and slot 0 for transparent.
        assert_eq!(Palette::vga().len(), 1 + 16 + 16 + 216 + 8);
    }

    #[test]
    fn the_unused_tail_is_black() {
        let p = Palette::vga();
        for i in (p.len() - 8)..p.len() {
            assert_eq!(p.get(i), Color::rgb(0, 0, 0), "index {i}");
        }
    }

    #[test]
    fn the_ega_block_starts_with_black_and_ends_with_white() {
        let p = Palette::vga();
        assert_eq!(p.get(1), Color::rgb(0, 0, 0));
        assert_eq!(p.get(16), Color::rgb(255, 255, 255));
    }

    #[test]
    fn dark_yellow_is_brown_the_way_ibm_made_it() {
        // Index 6 in EGA is the one colour that is not a plain bit pattern.
        assert_eq!(Palette::vga().get(7), Color::rgb(170, 85, 0));
    }

    #[test]
    fn the_grey_ramp_runs_black_to_white() {
        let p = Palette::vga();
        assert_eq!(p.get(17), Color::rgb(0, 0, 0));
        assert_eq!(p.get(32), Color::rgb(255, 255, 255));
    }

    #[test]
    fn every_colour_is_opaque_except_the_first() {
        let p = Palette::vga();
        assert_eq!(p.get(0), Color::TRANSPARENT);
        for i in 1..p.len() {
            assert_eq!(p.get(i).to_rgba()[3], 255, "colour {i} is not opaque");
        }
    }

    #[test]
    fn the_hue_block_actually_varies_in_hue() {
        // If the HSV conversion were wrong these would all be the same grey.
        let p = Palette::vga();
        let sample: Vec<_> = (33..57).map(|i| p.get(i)).collect();
        let distinct: std::collections::HashSet<_> = sample.iter().map(|c| c.to_hex()).collect();
        assert!(distinct.len() > 16, "only {} distinct hues", distinct.len());
    }
}
