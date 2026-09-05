use crate::ecs::{Collider, Gravity, Position, Solid, Velocity};
use hecs::World;

/// Downward acceleration in pixels per second squared, scaled per entity by
/// its [`Gravity`] component.
pub const GRAVITY: f32 = 980.0;

pub fn step(world: &mut World, dt: f32) {
    // Gravity is opt-in. Most retro genres (top-down, puzzle, shmup) want no
    // downward pull at all, so only entities carrying a Gravity component
    // accelerate.
    for (_id, (vel, gravity)) in world
        .query_mut::<(&mut Velocity, &Gravity)>()
        .without::<&Solid>()
    {
        vel.0.y += GRAVITY * gravity.0 * dt;
    }

    let mut bodies = Vec::new();
    let mut solids = Vec::new();

    // Collect all solids
    for (e, (pos, col, _)) in world.query_mut::<(&Position, &Collider, &Solid)>() {
        solids.push((e, *pos, *col));
    }

    // Collect all dynamic bodies. A collider is optional: without one the body
    // still integrates, it just doesn't collide with solids. Requiring a
    // collider here used to mean a plain Position+Velocity entity never moved.
    for (e, (pos, vel, col)) in world
        .query_mut::<(&Position, &mut Velocity, Option<&Collider>)>()
        .without::<&Solid>()
    {
        bodies.push((e, *pos, *vel, col.copied()));
    }

    // Integrate and resolve
    for (e, mut pos, mut vel, col) in bodies {
        pos.0 += vel.0 * dt;

        if let Some(col) = col {
            for (_se, spos, scol) in &solids {
                let bounds = (
                    pos.0.x + col.offset.x,
                    pos.0.y + col.offset.y,
                    col.size.x,
                    col.size.y,
                );
                let sb = (
                    spos.0.x + scol.offset.x,
                    spos.0.y + scol.offset.y,
                    scol.size.x,
                    scol.size.y,
                );

                if bounds.0 < sb.0 + sb.2
                    && bounds.0 + bounds.2 > sb.0
                    && bounds.1 < sb.1 + sb.3
                    && bounds.1 + bounds.3 > sb.1
                {
                    // Simple AABB push out finding shallowest axis
                    let overlap_x = ((bounds.0 + bounds.2 / 2.0) - (sb.0 + sb.2 / 2.0)).abs();
                    let overlap_y = ((bounds.1 + bounds.3 / 2.0) - (sb.1 + sb.3 / 2.0)).abs();

                    let pen_x = (bounds.2 / 2.0 + sb.2 / 2.0) - overlap_x;
                    let pen_y = (bounds.3 / 2.0 + sb.3 / 2.0) - overlap_y;

                    if pen_x < pen_y {
                        if bounds.0 < sb.0 {
                            pos.0.x -= pen_x;
                        } else {
                            pos.0.x += pen_x;
                        }
                        vel.0.x = 0.0;
                    } else {
                        if bounds.1 < sb.1 {
                            pos.0.y -= pen_y;
                        } else {
                            pos.0.y += pen_y;
                        }
                        vel.0.y = 0.0;
                    }
                }
            }
        }

        // The entity was alive when it was collected a moment ago, so this
        // cannot fail; a panic in the frame loop would be worse than a no-op.
        let _ = world.insert(e, (pos, vel));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Vec2;

    fn collider(w: f32, h: f32) -> Collider {
        Collider {
            offset: Vec2::ZERO,
            size: Vec2::new(w, h),
        }
    }

    fn pos_of(world: &World, e: hecs::Entity) -> Vec2 {
        world.get::<&Position>(e).unwrap().0
    }

    fn vel_of(world: &World, e: hecs::Entity) -> Vec2 {
        world.get::<&Velocity>(e).unwrap().0
    }

    #[test]
    fn velocity_moves_a_body_without_a_collider() {
        // Regression test: dynamic bodies used to require a Collider to
        // integrate, so a plain sprite with a velocity never moved.
        let mut world = World::new();
        let e = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::new(60.0, 0.0))));

        step(&mut world, 0.5);

        assert!((pos_of(&world, e).x - 30.0).abs() < 1e-3);
        assert_eq!(pos_of(&world, e).y, 0.0);
    }

    #[test]
    fn velocity_moves_a_body_with_a_collider() {
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::ZERO),
            Velocity(Vec2::new(10.0, 20.0)),
            collider(8.0, 8.0),
        ));

        step(&mut world, 1.0);

        let p = pos_of(&world, e);
        assert!((p.x - 10.0).abs() < 1e-3);
        assert!((p.y - 20.0).abs() < 1e-3);
    }

    #[test]
    fn entities_do_not_fall_without_a_gravity_component() {
        // Regression test: gravity used to be applied to every dynamic body,
        // which is wrong for top-down and puzzle games.
        let mut world = World::new();
        let e = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO)));

        for _ in 0..60 {
            step(&mut world, 1.0 / 60.0);
        }

        assert_eq!(vel_of(&world, e).y, 0.0);
        assert_eq!(pos_of(&world, e).y, 0.0);
    }

    #[test]
    fn gravity_component_accelerates_downward() {
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::ZERO),
            Velocity(Vec2::ZERO),
            Gravity::default(),
        ));

        step(&mut world, 1.0);

        assert!((vel_of(&world, e).y - GRAVITY).abs() < 1e-2);
        assert!(pos_of(&world, e).y > 0.0);
    }

    #[test]
    fn gravity_scale_is_applied() {
        let mut world = World::new();
        let full = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO), Gravity(1.0)));
        let half = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO), Gravity(0.5)));
        let none = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO), Gravity(0.0)));

        step(&mut world, 1.0);

        assert!((vel_of(&world, full).y - GRAVITY).abs() < 1e-2);
        assert!((vel_of(&world, half).y - GRAVITY * 0.5).abs() < 1e-2);
        assert_eq!(vel_of(&world, none).y, 0.0);
    }

    #[test]
    fn solid_bodies_are_static() {
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::ZERO),
            Velocity(Vec2::new(100.0, 100.0)),
            collider(8.0, 8.0),
            Solid,
            Gravity::default(),
        ));

        step(&mut world, 1.0);

        assert_eq!(pos_of(&world, e), Vec2::ZERO);
        assert_eq!(vel_of(&world, e).y, 100.0, "solids ignore gravity");
    }

    #[test]
    fn falling_body_lands_on_a_solid_floor() {
        let mut world = World::new();
        let player = world.spawn((
            Position(Vec2::new(0.0, 0.0)),
            Velocity(Vec2::ZERO),
            collider(8.0, 8.0),
            Gravity::default(),
        ));
        world.spawn((Position(Vec2::new(0.0, 32.0)), collider(64.0, 8.0), Solid));

        for _ in 0..120 {
            step(&mut world, 1.0 / 60.0);
        }

        // Resting on top of the floor: the player's 8px box sits at y=24.
        assert!(
            (pos_of(&world, player).y - 24.0).abs() < 0.5,
            "expected to rest at y=24, got {}",
            pos_of(&world, player).y
        );
        assert_eq!(vel_of(&world, player).y, 0.0, "landing zeroes fall speed");
    }

    #[test]
    fn horizontal_motion_is_stopped_by_a_wall() {
        let mut world = World::new();
        let player = world.spawn((
            Position(Vec2::new(0.0, 0.0)),
            Velocity(Vec2::new(200.0, 0.0)),
            collider(8.0, 8.0),
        ));
        world.spawn((Position(Vec2::new(32.0, 0.0)), collider(8.0, 32.0), Solid));

        for _ in 0..120 {
            step(&mut world, 1.0 / 60.0);
        }

        assert!(
            (pos_of(&world, player).x - 24.0).abs() < 0.5,
            "expected to stop at x=24, got {}",
            pos_of(&world, player).x
        );
        assert_eq!(vel_of(&world, player).x, 0.0);
    }

    #[test]
    fn collider_offset_shifts_the_resolved_body() {
        let mut world = World::new();
        let player = world.spawn((
            Position(Vec2::new(0.0, 0.0)),
            Velocity(Vec2::new(0.0, 100.0)),
            Collider {
                offset: Vec2::new(0.0, 4.0),
                size: Vec2::new(8.0, 8.0),
            },
        ));
        world.spawn((Position(Vec2::new(0.0, 32.0)), collider(64.0, 8.0), Solid));

        for _ in 0..120 {
            step(&mut world, 1.0 / 60.0);
        }

        // The collider sits 4px below the origin, so the origin rests 4px higher.
        assert!(
            (pos_of(&world, player).y - 20.0).abs() < 0.5,
            "expected to rest at y=20, got {}",
            pos_of(&world, player).y
        );
    }

    #[test]
    fn a_body_with_no_solids_falls_freely() {
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::ZERO),
            Velocity(Vec2::ZERO),
            collider(8.0, 8.0),
            Gravity::default(),
        ));

        for _ in 0..60 {
            step(&mut world, 1.0 / 60.0);
        }

        assert!(pos_of(&world, e).y > 100.0);
    }

    #[test]
    fn stepping_an_empty_world_is_harmless() {
        let mut world = World::new();
        step(&mut world, 1.0 / 60.0);
        assert_eq!(world.len(), 0);
    }
}
