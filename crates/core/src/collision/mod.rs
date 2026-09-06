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

                let pen_x =
                    (dyn_size.x * 0.5 + sol_size.x * 0.5) - (dyn_center.x - sol_center.x).abs();
                let pen_y =
                    (dyn_size.y * 0.5 + sol_size.y * 0.5) - (dyn_center.y - sol_center.y).abs();

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ecs::{Collider, Position, Solid};
    use hecs::World;

    fn collider(w: f32, h: f32) -> Collider {
        Collider {
            offset: Vec2::ZERO,
            size: Vec2::new(w, h),
        }
    }

    /// A dynamic body at `dyn_pos` and a solid at `sol_pos`, both 8x8.
    fn detect_pair(dyn_pos: Vec2, sol_pos: Vec2) -> Vec<CollisionEvent> {
        let mut world = World::new();
        world.spawn((Position(dyn_pos), collider(8.0, 8.0)));
        world.spawn((Position(sol_pos), collider(8.0, 8.0), Solid));

        let mut queue = CollisionQueue::new();
        detect_collisions(&world, &mut queue);
        queue.iter().copied().collect()
    }

    #[test]
    fn queue_starts_empty_and_reports_its_length() {
        let queue = CollisionQueue::new();
        assert!(queue.is_empty());
        assert_eq!(queue.len(), 0);
    }

    #[test]
    fn drain_yields_events_and_empties_the_queue() {
        let mut world = World::new();
        world.spawn((Position(Vec2::ZERO), collider(8.0, 8.0)));
        world.spawn((Position(Vec2::new(4.0, 0.0)), collider(8.0, 8.0), Solid));

        let mut queue = CollisionQueue::new();
        detect_collisions(&world, &mut queue);
        assert_eq!(queue.len(), 1);

        let drained: Vec<_> = queue.drain().collect();
        assert_eq!(drained.len(), 1);
        assert!(queue.is_empty(), "drain must empty the queue");
    }

    #[test]
    fn detection_clears_stale_events_from_the_previous_frame() {
        let mut queue = CollisionQueue::new();
        let world = World::new();

        // Seed the queue with a bogus event, then detect on an empty world.
        let mut seed = World::new();
        let a = seed.spawn(());
        let b = seed.spawn(());
        queue.push(CollisionEvent {
            entity_a: a,
            entity_b: b,
            side: CollisionSide::Top,
            overlap: Vec2::ZERO,
        });

        detect_collisions(&world, &mut queue);
        assert!(queue.is_empty());
    }

    #[test]
    fn separated_boxes_do_not_collide() {
        assert!(detect_pair(Vec2::ZERO, Vec2::new(100.0, 100.0)).is_empty());
    }

    #[test]
    fn exactly_touching_edges_do_not_count_as_overlap() {
        // An 8-wide box at x=0 spans [0,8); a solid starting at x=8 just touches.
        assert!(detect_pair(Vec2::ZERO, Vec2::new(8.0, 0.0)).is_empty());
    }

    #[test]
    fn overlapping_boxes_report_penetration_depth() {
        let events = detect_pair(Vec2::ZERO, Vec2::new(6.0, 0.0));
        assert_eq!(events.len(), 1);
        // 2px of horizontal overlap, full 8px vertical.
        assert!((events[0].overlap.x - 2.0).abs() < 1e-4);
        assert!((events[0].overlap.y - 8.0).abs() < 1e-4);
    }

    #[test]
    fn side_is_reported_from_the_dynamic_body_perspective() {
        // Solid to the right of the body: the body hit its own right side.
        assert_eq!(
            detect_pair(Vec2::ZERO, Vec2::new(6.0, 0.0))[0].side,
            CollisionSide::Right
        );
        // Solid to the left.
        assert_eq!(
            detect_pair(Vec2::ZERO, Vec2::new(-6.0, 0.0))[0].side,
            CollisionSide::Left
        );
        // Solid below: landing on it, so the body's bottom is involved.
        assert_eq!(
            detect_pair(Vec2::ZERO, Vec2::new(0.0, 6.0))[0].side,
            CollisionSide::Bottom
        );
        // Solid above: bonking the body's top.
        assert_eq!(
            detect_pair(Vec2::ZERO, Vec2::new(0.0, -6.0))[0].side,
            CollisionSide::Top
        );
    }

    #[test]
    fn shallowest_axis_decides_the_side() {
        // Deep vertical overlap, shallow horizontal -> horizontal wins.
        let events = detect_pair(Vec2::ZERO, Vec2::new(7.0, 1.0));
        assert_eq!(events[0].side, CollisionSide::Right);
    }

    #[test]
    fn collider_offsets_shift_the_tested_bounds() {
        let mut world = World::new();
        world.spawn((
            Position(Vec2::ZERO),
            Collider {
                offset: Vec2::new(100.0, 0.0),
                size: Vec2::new(8.0, 8.0),
            },
        ));
        world.spawn((Position(Vec2::new(102.0, 0.0)), collider(8.0, 8.0), Solid));

        let mut queue = CollisionQueue::new();
        detect_collisions(&world, &mut queue);
        assert_eq!(queue.len(), 1, "offset should move the body into the solid");
    }

    #[test]
    fn dynamic_bodies_do_not_collide_with_each_other() {
        let mut world = World::new();
        world.spawn((Position(Vec2::ZERO), collider(8.0, 8.0)));
        world.spawn((Position(Vec2::new(2.0, 0.0)), collider(8.0, 8.0)));

        let mut queue = CollisionQueue::new();
        detect_collisions(&world, &mut queue);
        assert!(queue.is_empty(), "only dynamic-vs-solid pairs are reported");
    }

    #[test]
    fn one_body_against_many_solids_reports_each_hit() {
        let mut world = World::new();
        let body = world.spawn((Position(Vec2::ZERO), collider(8.0, 8.0)));
        world.spawn((Position(Vec2::new(6.0, 0.0)), collider(8.0, 8.0), Solid));
        world.spawn((Position(Vec2::new(0.0, 6.0)), collider(8.0, 8.0), Solid));

        let mut queue = CollisionQueue::new();
        detect_collisions(&world, &mut queue);

        assert_eq!(queue.len(), 2);
        assert!(queue.iter().all(|e| e.entity_a == body));
    }

    #[test]
    fn clear_discards_pending_events() {
        let mut world = World::new();
        world.spawn((Position(Vec2::ZERO), collider(8.0, 8.0)));
        world.spawn((Position(Vec2::new(4.0, 0.0)), collider(8.0, 8.0), Solid));

        let mut queue = CollisionQueue::new();
        detect_collisions(&world, &mut queue);
        assert!(!queue.is_empty());
        queue.clear();
        assert!(queue.is_empty());
    }
}
