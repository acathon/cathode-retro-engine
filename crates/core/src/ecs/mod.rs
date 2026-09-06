use glam::Vec2;
use serde::{Deserialize, Serialize};

pub use hecs::{Entity, Query, World};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Position(pub Vec2);

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Velocity(pub Vec2);

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SpriteIndex {
    pub sheet: u32,
    pub frame: u16,
    pub flip_x: bool,
    pub flip_y: bool,
    pub layer: u8,
    /// Whether the renderer draws this sprite.
    ///
    /// Without it, "hide this" had no engine-side meaning: an entity kept its
    /// SpriteIndex and so kept drawing at whatever position it last held.
    /// Every game worked around that by parking sprites at -9999, which is a
    /// workaround the engine should not require.
    #[serde(default = "default_visible")]
    pub visible: bool,
}

fn default_visible() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Collider {
    pub offset: Vec2,
    pub size: Vec2,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct GamepadState {
    pub up: bool,
    pub down: bool,
    pub left: bool,
    pub right: bool,
    pub a: bool,
    pub b: bool,
    pub x: bool,
    pub y: bool,
    pub start: bool,
    pub select: bool,
    pub l: bool,
    pub r: bool,
}

/// Opt-in downward acceleration. The inner value scales
/// [`crate::physics::GRAVITY`], so `Gravity(1.0)` falls at the default rate,
/// `Gravity(0.35)` is floaty, and a negative value floats upward. Entities
/// without this component are never pulled down, which is what top-down
/// genres want.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Gravity(pub f32);

impl Default for Gravity {
    fn default() -> Self {
        Self(1.0)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Solid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CameraTarget;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ScriptHandle(pub u32);
