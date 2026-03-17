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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Solid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct CameraTarget;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ScriptHandle(pub u32);
