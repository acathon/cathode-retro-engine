use crate::ecs::{Collider, Gravity, Position, Solid, Velocity};
use crate::renderer::TileMap;
use hecs::World;

/// Downward acceleration in pixels per second squared, scaled per entity by
/// its [`Gravity`] component.
pub const GRAVITY: f32 = 980.0;

/// Keeps a body whose edge sits exactly on a tile boundary from being counted
/// as overlapping the next tile along.
const EDGE_EPSILON: f32 = 0.001;

/// Resolve a body against a tilemap's solid tiles, one axis at a time.
///
/// Axis separation matters here: resolving a tile grid by "shallowest
/// overlap", the way entity-vs-entity resolution does, makes a body running
/// along a flat floor catch on the seams between tiles, because each tile is
/// a separate box whose shallowest axis flips as the body crosses it.
fn resolve_tiles(
    pos: &mut Position,
    vel: &mut Velocity,
    col: &Collider,
    maps: &[TileMap],
    horizontal: bool,
) {
    for map in maps {
        if !map.has_solid_tiles() {
            continue;
        }

        let (tw, th) = (map.tile_width as f32, map.tile_height as f32);
        if tw <= 0.0 || th <= 0.0 || col.size.x <= 0.0 || col.size.y <= 0.0 {
            continue;
        }

        let bx = pos.0.x + col.offset.x;
        let by = pos.0.y + col.offset.y;
        let (bw, bh) = (col.size.x, col.size.y);

        let first_col = (bx / tw).floor() as i32;
        let last_col = ((bx + bw - EDGE_EPSILON) / tw).floor() as i32;
        let first_row = (by / th).floor() as i32;
        let last_row = ((by + bh - EDGE_EPSILON) / th).floor() as i32;

        'search: for row in first_row..=last_row {
            for tile_col in first_col..=last_col {
                if !map.solid_at(tile_col, row) {
                    continue;
                }

                // Snap to the face the body was moving toward. A body with no
                // speed on this axis is left alone rather than teleported,
                // so spawning inside geometry doesn't fling it somewhere.
                if horizontal {
                    if vel.0.x > 0.0 {
                        pos.0.x = tile_col as f32 * tw - col.offset.x - bw;
                    } else if vel.0.x < 0.0 {
                        pos.0.x = (tile_col + 1) as f32 * tw - col.offset.x;
                    } else {
                        continue;
                    }
                    vel.0.x = 0.0;
                } else {
                    if vel.0.y > 0.0 {
                        pos.0.y = row as f32 * th - col.offset.y - bh;
                    } else if vel.0.y < 0.0 {
                        pos.0.y = (row + 1) as f32 * th - col.offset.y;
                    } else {
                        continue;
                    }
                    vel.0.y = 0.0;
                }
                break 'search;
            }
        }
    }
}

pub fn step(world: &mut World, tilemaps: &[TileMap], dt: f32) {
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

    let tiles_collide = tilemaps.iter().any(|m| m.has_solid_tiles());

    // Integrate and resolve
    for (e, mut pos, mut vel, col) in bodies {
        match col {
            // A body with a collider moves one axis at a time when there are
            // walls to hit, so tile resolution can snap it to the face it
            // actually ran into.
            Some(c) if tiles_collide => {
                pos.0.x += vel.0.x * dt;
                resolve_tiles(&mut pos, &mut vel, &c, tilemaps, true);
                pos.0.y += vel.0.y * dt;
                resolve_tiles(&mut pos, &mut vel, &c, tilemaps, false);
            }
            _ => pos.0 += vel.0 * dt,
        }

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

        step(&mut world, &[], 0.5);

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

        step(&mut world, &[], 1.0);

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
            step(&mut world, &[], 1.0 / 60.0);
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

        step(&mut world, &[], 1.0);

        assert!((vel_of(&world, e).y - GRAVITY).abs() < 1e-2);
        assert!(pos_of(&world, e).y > 0.0);
    }

    #[test]
    fn gravity_scale_is_applied() {
        let mut world = World::new();
        let full = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO), Gravity(1.0)));
        let half = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO), Gravity(0.5)));
        let none = world.spawn((Position(Vec2::ZERO), Velocity(Vec2::ZERO), Gravity(0.0)));

        step(&mut world, &[], 1.0);

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

        step(&mut world, &[], 1.0);

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
            step(&mut world, &[], 1.0 / 60.0);
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
            step(&mut world, &[], 1.0 / 60.0);
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
            step(&mut world, &[], 1.0 / 60.0);
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
            step(&mut world, &[], 1.0 / 60.0);
        }

        assert!(pos_of(&world, e).y > 100.0);
    }

    #[test]
    fn stepping_an_empty_world_is_harmless() {
        let mut world = World::new();
        step(&mut world, &[], 1.0 / 60.0);
        assert_eq!(world.len(), 0);
    }

    // --- Tilemap collision ---

    /// An 8x6 map of 8px tiles: solid floor along the bottom row, open above.
    fn floor_map() -> TileMap {
        let mut map = TileMap::new("level".to_string(), 8, 6, 8, 8);
        let layer = map.add_layer("ground".to_string(), 0, false);
        for c in 0..8 {
            map.set_tile(layer, c, 5, 1);
        }
        map.set_solid_tiles(layer, &[1]);
        map
    }

    #[test]
    fn a_map_without_solid_tiles_does_not_collide() {
        let mut map = floor_map();
        map.set_solid_tiles(0, &[]);
        assert!(!map.has_solid_tiles());

        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(0.0, 0.0)),
            Velocity(Vec2::ZERO),
            collider(8.0, 8.0),
            Gravity::default(),
        ));

        for _ in 0..120 {
            step(&mut world, &[map.clone()], 1.0 / 60.0);
        }

        assert!(pos_of(&world, e).y > 100.0, "should fall straight through");
    }

    #[test]
    fn a_falling_body_lands_on_solid_tiles() {
        let maps = [floor_map()];
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(16.0, 0.0)),
            Velocity(Vec2::ZERO),
            collider(8.0, 8.0),
            Gravity::default(),
        ));

        for _ in 0..120 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        // Floor row 5 starts at y=40, so an 8px body rests at y=32.
        assert!(
            (pos_of(&world, e).y - 32.0).abs() < 0.01,
            "expected to rest at y=32, got {}",
            pos_of(&world, e).y
        );
        assert_eq!(vel_of(&world, e).y, 0.0, "landing zeroes fall speed");
    }

    #[test]
    fn a_body_does_not_snag_on_seams_between_floor_tiles() {
        // The reason tile resolution is axis-separated: resolving each tile by
        // shallowest overlap would stop a body dead at a tile boundary.
        let maps = [floor_map()];
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(4.0, 32.0)),
            Velocity(Vec2::new(40.0, 0.0)),
            collider(8.0, 8.0),
            Gravity::default(),
        ));

        for _ in 0..60 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        let p = pos_of(&world, e);
        assert!(
            p.x > 30.0,
            "should have run across several tiles, got {p:?}"
        );
        assert!(
            (p.y - 32.0).abs() < 0.01,
            "should stay on the floor, got {p:?}"
        );
    }

    #[test]
    fn a_wall_of_tiles_stops_horizontal_movement() {
        let mut map = TileMap::new("level".to_string(), 8, 6, 8, 8);
        let layer = map.add_layer("ground".to_string(), 0, false);
        for r in 0..6 {
            map.set_tile(layer, 4, r, 1); // wall at column 4 (x=32)
        }
        map.set_solid_tiles(layer, &[1]);
        let maps = [map];

        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(0.0, 8.0)),
            Velocity(Vec2::new(200.0, 0.0)),
            collider(8.0, 8.0),
        ));

        for _ in 0..60 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        assert!(
            (pos_of(&world, e).x - 24.0).abs() < 0.01,
            "expected to stop at x=24, got {}",
            pos_of(&world, e).x
        );
        assert_eq!(vel_of(&world, e).x, 0.0);
    }

    #[test]
    fn moving_left_snaps_to_the_right_face_of_a_tile() {
        let mut map = TileMap::new("level".to_string(), 8, 6, 8, 8);
        let layer = map.add_layer("ground".to_string(), 0, false);
        for r in 0..6 {
            map.set_tile(layer, 1, r, 1); // wall at column 1 spans x=8..16
        }
        map.set_solid_tiles(layer, &[1]);
        let maps = [map];

        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(40.0, 8.0)),
            Velocity(Vec2::new(-200.0, 0.0)),
            collider(8.0, 8.0),
        ));

        for _ in 0..60 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        assert!(
            (pos_of(&world, e).x - 16.0).abs() < 0.01,
            "expected to stop at x=16, got {}",
            pos_of(&world, e).x
        );
    }

    #[test]
    fn jumping_into_a_ceiling_stops_upward_motion() {
        let mut map = TileMap::new("level".to_string(), 8, 6, 8, 8);
        let layer = map.add_layer("ground".to_string(), 0, false);
        for c in 0..8 {
            map.set_tile(layer, c, 1, 1); // ceiling row 1 spans y=8..16
        }
        map.set_solid_tiles(layer, &[1]);
        let maps = [map];

        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(16.0, 24.0)),
            Velocity(Vec2::new(0.0, -200.0)),
            collider(8.0, 8.0),
        ));

        for _ in 0..60 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        // Ceiling row 1 ends at y=16, so the body's top stops there.
        assert!(
            (pos_of(&world, e).y - 16.0).abs() < 0.01,
            "expected to stop at y=16, got {}",
            pos_of(&world, e).y
        );
        assert_eq!(vel_of(&world, e).y, 0.0);
    }

    #[test]
    fn a_body_without_a_collider_ignores_tiles() {
        let maps = [floor_map()];
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(16.0, 0.0)),
            Velocity(Vec2::ZERO),
            Gravity::default(),
        ));

        for _ in 0..120 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        assert!(pos_of(&world, e).y > 100.0, "no collider, no collision");
    }

    #[test]
    fn collider_offsets_are_respected_against_tiles() {
        let maps = [floor_map()];
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(16.0, 0.0)),
            Velocity(Vec2::ZERO),
            Collider {
                offset: Vec2::new(0.0, 4.0),
                size: Vec2::new(8.0, 8.0),
            },
            Gravity::default(),
        ));

        for _ in 0..120 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        // The box sits 4px below the origin, so the origin rests 4px higher.
        assert!(
            (pos_of(&world, e).y - 28.0).abs() < 0.01,
            "expected to rest at y=28, got {}",
            pos_of(&world, e).y
        );
    }

    #[test]
    fn tiles_outside_the_map_are_open() {
        let maps = [floor_map()];
        let mut world = World::new();
        // Walking left, off the western edge of the map.
        let e = world.spawn((
            Position(Vec2::new(4.0, 8.0)),
            Velocity(Vec2::new(-100.0, 0.0)),
            collider(8.0, 8.0),
        ));

        for _ in 0..60 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        assert!(pos_of(&world, e).x < 0.0, "should walk off the edge");
    }

    #[test]
    fn tile_and_entity_solids_both_apply() {
        let maps = [floor_map()];
        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(0.0, 32.0)),
            Velocity(Vec2::new(100.0, 0.0)),
            collider(8.0, 8.0),
            Gravity::default(),
        ));
        // A crate sitting on the tile floor at x=24.
        world.spawn((Position(Vec2::new(24.0, 32.0)), collider(8.0, 8.0), Solid));

        for _ in 0..60 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        let p = pos_of(&world, e);
        assert!(
            (p.y - 32.0).abs() < 0.5,
            "tile floor still holds it up: {p:?}"
        );
        assert!(p.x < 24.0, "entity solid still blocks it: {p:?}");
    }

    #[test]
    fn only_declared_tile_ids_are_solid() {
        let mut map = TileMap::new("level".to_string(), 8, 6, 8, 8);
        let layer = map.add_layer("ground".to_string(), 0, false);
        for c in 0..8 {
            map.set_tile(layer, c, 5, 2); // decorative id 2
        }
        map.set_solid_tiles(layer, &[1]); // only id 1 is a wall
        let maps = [map];

        let mut world = World::new();
        let e = world.spawn((
            Position(Vec2::new(16.0, 0.0)),
            Velocity(Vec2::ZERO),
            collider(8.0, 8.0),
            Gravity::default(),
        ));

        for _ in 0..120 {
            step(&mut world, &maps, 1.0 / 60.0);
        }

        assert!(pos_of(&world, e).y > 100.0, "id 2 is not a wall");
    }
}
