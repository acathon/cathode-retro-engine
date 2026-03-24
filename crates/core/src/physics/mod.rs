use crate::ecs::{Collider, Position, Solid, Velocity};
use hecs::World;

pub const GRAVITY: f32 = 980.0;

pub fn step(world: &mut World, dt: f32) {
    // Apply gravity to non-solid dynamic bodies
    for (_id, (vel, _)) in world
        .query_mut::<(&mut Velocity, &Position)>()
        .without::<&Solid>()
    {
        vel.0.y += GRAVITY * dt;
    }

    let mut bodies = Vec::new();
    let mut solids = Vec::new();

    // Collect all solids
    for (e, (pos, col, _)) in world.query_mut::<(&Position, &Collider, &Solid)>() {
        solids.push((e, *pos, *col));
    }

    // Collect all dynamic bodies
    for (e, (pos, vel, col)) in world
        .query_mut::<(&Position, &mut Velocity, &Collider)>()
        .without::<&Solid>()
    {
        bodies.push((e, *pos, *vel, *col));
    }

    // Integrate and resolve
    for (e, mut pos, mut vel, col) in bodies {
        pos.0 += vel.0 * dt;

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

        world.insert_one(e, pos).unwrap();
        world.insert_one(e, vel).unwrap();
    }
}
