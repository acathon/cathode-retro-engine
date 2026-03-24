use glam::Vec2;
use hecs::Entity;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CollisionSide {
    Top,
    Bottom,
    Left,
    Right,
}

#[derive(Debug, Clone, Copy)]
pub struct CollisionEvent {
    pub entity_a: Entity,
    pub entity_b: Entity,
    pub side: CollisionSide,
    pub overlap: Vec2,
}

pub struct CollisionQueue {
    events: Vec<CollisionEvent>,
}

impl Default for CollisionQueue {
    fn default() -> Self {
        Self::new()
    }
}

impl CollisionQueue {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn push(&mut self, event: CollisionEvent) {
        self.events.push(event);
    }

    pub fn drain(&mut self) -> impl Iterator<Item = CollisionEvent> + '_ {
        self.events.drain(..)
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn clear(&mut self) {
        self.events.clear();
    }

    pub fn iter(&self) -> impl Iterator<Item = &CollisionEvent> {
        self.events.iter()
    }
}

/// After the physics step, detect overlaps and populate the collision queue.
pub fn detect_collisions(world: &hecs::World, queue: &mut CollisionQueue) {
    use crate::ecs::{Collider, Position, Solid};

    queue.clear();

    let mut solids: Vec<(Entity, Vec2, Vec2)> = Vec::new();
    let mut dynamics: Vec<(Entity, Vec2, Vec2)> = Vec::new();

    for (e, (pos, col, _)) in world.query::<(&Position, &Collider, &Solid)>().iter() {
        let origin = Vec2::new(pos.0.x + col.offset.x, pos.0.y + col.offset.y);
        solids.push((e, origin, col.size));
    }

    for (e, (pos, col)) in world
        .query::<(&Position, &Collider)>()
        .without::<&Solid>()
        .iter()
    {
        let origin = Vec2::new(pos.0.x + col.offset.x, pos.0.y + col.offset.y);
        dynamics.push((e, origin, col.size));
    }

    for &(dyn_e, dyn_pos, dyn_size) in &dynamics {
        for &(sol_e, sol_pos, sol_size) in &solids {
            if dyn_pos.x < sol_pos.x + sol_size.x
                && dyn_pos.x + dyn_size.x > sol_pos.x
                && dyn_pos.y < sol_pos.y + sol_size.y
                && dyn_pos.y + dyn_size.y > sol_pos.y
            {
                let dyn_center = dyn_pos + dyn_size * 0.5;
                let sol_center = sol_pos + sol_size * 0.5;

                let pen_x = (dyn_size.x * 0.5 + sol_size.x * 0.5)
                    - (dyn_center.x - sol_center.x).abs();
                let pen_y = (dyn_size.y * 0.5 + sol_size.y * 0.5)
                    - (dyn_center.y - sol_center.y).abs();

                let side = if pen_x < pen_y {
                    if dyn_center.x < sol_center.x {
                        CollisionSide::Right
                    } else {
                        CollisionSide::Left
                    }
                } else if dyn_center.y < sol_center.y {
                    CollisionSide::Bottom
                } else {
                    CollisionSide::Top
                };

                queue.push(CollisionEvent {
                    entity_a: dyn_e,
                    entity_b: sol_e,
                    side,
                    overlap: Vec2::new(pen_x, pen_y),
                });
            }
        }
    }
}
