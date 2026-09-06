use crate::renderer::FrameBuffer;
use glam::Vec2;

pub struct RaycastMap {
    pub cols: u32,
    pub rows: u32,
    pub cells: Vec<u8>,
    pub cell_size: f32,
}

impl RaycastMap {
    pub fn new(cols: u32, rows: u32, cells: Vec<u8>) -> Self {
        Self {
            cols,
            rows,
            cells,
            cell_size: 1.0,
        }
    }

    pub fn get(&self, col: i32, row: i32) -> u8 {
        if col < 0 || row < 0 || col >= self.cols as i32 || row >= self.rows as i32 {
            return 1; // out of bounds = wall
        }
        self.cells[(row as u32 * self.cols + col as u32) as usize]
    }
}

pub struct RaycastCamera {
    pub pos: Vec2,
    pub angle: f32,
    pub fov: f32,
    pub move_speed: f32,
    pub turn_speed: f32,
    pub fog_dist: f32,
    /// Horizon offset in pixels; positive looks down.
    ///
    /// A raycaster cannot tilt the projection without becoming a different
    /// renderer, but shearing the horizon reads as looking up and down, which
    /// is exactly what the shooters of the era did.
    pub pitch: f32,
    /// Where the eye sits between floor (0.0) and ceiling (1.0).
    ///
    /// 0.5 is the default standing height. Lower it to crouch, raise it to
    /// jump — the walls grow and shrink around the viewer correctly, because
    /// this shifts the projection rather than the screen.
    pub eye_height: f32,
}

impl Default for RaycastCamera {
    fn default() -> Self {
        Self {
            pos: Vec2::new(2.0, 2.0),
            angle: 0.0,
            fov: std::f32::consts::FRAC_PI_3, // 60 degrees
            move_speed: 3.0,
            turn_speed: 2.5,
            fog_dist: 10.0,
            pitch: 0.0,
            eye_height: 0.5,
        }
    }
}

pub struct WallTexture {
    pub pixels: Vec<u8>, // RGBA8
    pub size: u32,
}

pub struct Billboard {
    pub id: u32,
    pub pos: Vec2,
    pub texture: u32,
    pub scale: f32,
    /// Height of the sprite's centre between floor (0.0) and ceiling (1.0).
    ///
    /// 0.5 is eye level, which is where every billboard sat before this
    /// existed. Drop it to stand something on the floor, raise it to hang a
    /// lamp — or animate it, to bounce a ball.
    pub elevation: f32,
}

pub struct RaycastRenderer {
    pub map: RaycastMap,
    pub camera: RaycastCamera,
    pub textures: Vec<WallTexture>,
    pub floor_color: [u8; 3],
    pub ceiling_color: [u8; 3],
    pub fog_color: [u8; 3],
    pub billboards: Vec<Billboard>,
    zbuffer: Vec<f32>,
}

impl RaycastRenderer {
    pub fn new(map: RaycastMap) -> Self {
        Self {
            map,
            camera: RaycastCamera::default(),
            textures: Vec::new(),
            floor_color: [50, 50, 50],
            ceiling_color: [20, 20, 20],
            fog_color: [0, 0, 0],
            billboards: Vec::new(),
            zbuffer: Vec::new(),
        }
    }

    pub fn render(&mut self, fb: &mut FrameBuffer) {
        let w = fb.width as usize;
        let h = fb.height as usize;

        // Resize zbuffer if needed
        if self.zbuffer.len() != w {
            self.zbuffer = vec![f32::MAX; w];
        } else {
            self.zbuffer.fill(f32::MAX);
        }

        // Everything vertical is measured from the horizon, not the middle of
        // the screen, so pitch shears the whole view consistently.
        let horizon = h as f32 / 2.0 + self.camera.pitch;
        let eye = self.camera.eye_height;

        // Draw ceiling and floor
        for y in 0..h {
            for x in 0..w {
                if (y as f32) < horizon {
                    fb.set_pixel(
                        x as u32,
                        y as u32,
                        self.ceiling_color[0],
                        self.ceiling_color[1],
                        self.ceiling_color[2],
                        255,
                    );
                } else {
                    fb.set_pixel(
                        x as u32,
                        y as u32,
                        self.floor_color[0],
                        self.floor_color[1],
                        self.floor_color[2],
                        255,
                    );
                }
            }
        }

        let dir = Vec2::new(self.camera.angle.cos(), self.camera.angle.sin());
        let plane = Vec2::new(-dir.y, dir.x) * (self.camera.fov / 2.0).tan();

        // Wall casting
        for x in 0..w {
            let cam_x = 2.0 * x as f32 / w as f32 - 1.0;
            let ray_dir = dir + plane * cam_x;

            // DDA
            let map_x = self.camera.pos.x.floor() as i32;
            let map_y = self.camera.pos.y.floor() as i32;
            let mut map_pos = (map_x, map_y);

            let delta_dist_x = if ray_dir.x.abs() < 1e-10 {
                f32::MAX
            } else {
                (1.0 / ray_dir.x).abs()
            };
            let delta_dist_y = if ray_dir.y.abs() < 1e-10 {
                f32::MAX
            } else {
                (1.0 / ray_dir.y).abs()
            };

            let (step_x, mut side_dist_x) = if ray_dir.x < 0.0 {
                (-1, (self.camera.pos.x - map_pos.0 as f32) * delta_dist_x)
            } else {
                (
                    1,
                    (map_pos.0 as f32 + 1.0 - self.camera.pos.x) * delta_dist_x,
                )
            };

            let (step_y, mut side_dist_y) = if ray_dir.y < 0.0 {
                (-1, (self.camera.pos.y - map_pos.1 as f32) * delta_dist_y)
            } else {
                (
                    1,
                    (map_pos.1 as f32 + 1.0 - self.camera.pos.y) * delta_dist_y,
                )
            };

            let mut hit = 0u8;
            let mut side = 0; // 0 = x-side, 1 = y-side
            let max_steps = (self.map.cols.max(self.map.rows) * 2).max(1) as usize;

            for _ in 0..max_steps {
                if side_dist_x < side_dist_y {
                    side_dist_x += delta_dist_x;
                    map_pos.0 += step_x;
                    side = 0;
                } else {
                    side_dist_y += delta_dist_y;
                    map_pos.1 += step_y;
                    side = 1;
                }

                let cell = self.map.get(map_pos.0, map_pos.1);
                if cell > 0 {
                    hit = cell;
                    break;
                }
            }

            if hit == 0 {
                continue;
            }

            let perp_dist = if side == 0 {
                side_dist_x - delta_dist_x
            } else {
                side_dist_y - delta_dist_y
            };

            let perp_dist = perp_dist.max(0.001);
            self.zbuffer[x] = perp_dist;

            let line_height = h as f32 / perp_dist;
            // A wall runs floor to ceiling: the eye splits it by height, so a
            // crouching viewer sees more ceiling and a raised one more floor.
            let wall_top = horizon - line_height * (1.0 - eye);
            let wall_bottom = horizon + line_height * eye;
            let draw_start = (wall_top.ceil() as i32).max(0) as usize;
            let draw_end = (wall_bottom.ceil() as i32).clamp(0, h as i32) as usize;

            // Wall hit position for texture coordinates
            let wall_x = if side == 0 {
                self.camera.pos.y + perp_dist * ray_dir.y
            } else {
                self.camera.pos.x + perp_dist * ray_dir.x
            };
            let wall_x = wall_x - wall_x.floor();

            // Distance fog factor
            let fog_factor = (perp_dist / self.camera.fog_dist).clamp(0.0, 1.0);

            let tex_idx = (hit as usize).wrapping_sub(1);
            let has_texture = tex_idx < self.textures.len()
                && self.textures[tex_idx].size > 0
                && !self.textures[tex_idx].pixels.is_empty();

            for y in draw_start..draw_end {
                let tex_y_f = ((y as f32 - wall_top) / line_height).clamp(0.0, 0.999);

                let (r, g, b) = if has_texture {
                    let tex = &self.textures[tex_idx];
                    let tx = ((wall_x * tex.size as f32) as u32).min(tex.size - 1);
                    let ty = ((tex_y_f * tex.size as f32) as u32).min(tex.size - 1);
                    let idx = ((ty * tex.size + tx) * 4) as usize;
                    if idx + 2 < tex.pixels.len() {
                        (tex.pixels[idx], tex.pixels[idx + 1], tex.pixels[idx + 2])
                    } else {
                        (128, 128, 128)
                    }
                } else {
                    // Solid color based on wall type
                    match hit {
                        1 => (180, 180, 180),
                        2 => (139, 90, 43),
                        3 => (180, 50, 50),
                        4 => (100, 200, 100),
                        _ => (200, 200, 200),
                    }
                };

                // Darken y-side
                let shade = if side == 1 { 0.7 } else { 1.0 };
                let r = (r as f32 * shade) as u8;
                let g = (g as f32 * shade) as u8;
                let b = (b as f32 * shade) as u8;

                // Apply fog
                let fr = lerp_u8(r, self.fog_color[0], fog_factor);
                let fg = lerp_u8(g, self.fog_color[1], fog_factor);
                let fb_c = lerp_u8(b, self.fog_color[2], fog_factor);

                fb.set_pixel(x as u32, y as u32, fr, fg, fb_c, 255);
            }
        }

        // Billboard rendering
        self.render_billboards(fb, w, h);
    }

    fn render_billboards(&self, fb: &mut FrameBuffer, screen_w: usize, screen_h: usize) {
        if self.billboards.is_empty() {
            return;
        }

        let dir = Vec2::new(self.camera.angle.cos(), self.camera.angle.sin());
        let plane = Vec2::new(-dir.y, dir.x) * (self.camera.fov / 2.0).tan();
        let horizon = screen_h as f32 / 2.0 + self.camera.pitch;
        let eye = self.camera.eye_height;

        // Sort billboards by distance (farthest first)
        let mut sorted: Vec<(usize, f32)> = self
            .billboards
            .iter()
            .enumerate()
            .map(|(i, bb)| {
                let dx = bb.pos.x - self.camera.pos.x;
                let dy = bb.pos.y - self.camera.pos.y;
                (i, dx * dx + dy * dy)
            })
            .collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        for (idx, _dist_sq) in &sorted {
            let bb = &self.billboards[*idx];
            let sprite_pos = bb.pos - self.camera.pos;

            let inv_det = 1.0 / (plane.x * dir.y - dir.x * plane.y);
            let transform_x = inv_det * (dir.y * sprite_pos.x - dir.x * sprite_pos.y);
            let transform_y = inv_det * (-plane.y * sprite_pos.x + plane.x * sprite_pos.y);

            if transform_y <= 0.0 {
                continue;
            }

            let sprite_screen_x =
                (screen_w as f32 / 2.0 * (1.0 + transform_x / transform_y)) as i32;
            let sprite_height = ((screen_h as f32 / transform_y) * bb.scale).abs() as i32;
            let sprite_width = sprite_height;

            // One world unit of height is screen_h / distance pixels, so the
            // gap between the eye and the sprite's own elevation decides how
            // far from the horizon it hangs.
            let center_y = horizon + (eye - bb.elevation) * (screen_h as f32 / transform_y);
            let top_y = center_y as i32 - sprite_height / 2;

            let draw_start_y = top_y.max(0);
            let draw_end_y = (top_y + sprite_height).min(screen_h as i32);
            let draw_start_x = (-sprite_width / 2 + sprite_screen_x).max(0);
            let draw_end_x = (sprite_width / 2 + sprite_screen_x).min(screen_w as i32);

            let tex_idx = bb.texture as usize;
            let has_tex = tex_idx < self.textures.len()
                && self.textures[tex_idx].size > 0
                && !self.textures[tex_idx].pixels.is_empty();

            let fog_factor = (transform_y / self.camera.fog_dist).clamp(0.0, 1.0);

            for stripe in draw_start_x..draw_end_x {
                if stripe >= 0
                    && (stripe as usize) < screen_w
                    && transform_y < self.zbuffer[stripe as usize]
                {
                    for y in draw_start_y..draw_end_y {
                        let (r, g, b, a) = if has_tex {
                            let tex = &self.textures[tex_idx];
                            let tx = ((stripe - (-sprite_width / 2 + sprite_screen_x)) as f32
                                / sprite_width as f32
                                * tex.size as f32) as u32;
                            let ty = ((y - top_y) as f32 / sprite_height as f32 * tex.size as f32)
                                as u32;
                            let tx = tx.min(tex.size.saturating_sub(1));
                            let ty = ty.min(tex.size.saturating_sub(1));
                            let pi = ((ty * tex.size + tx) * 4) as usize;
                            if pi + 3 < tex.pixels.len() {
                                (
                                    tex.pixels[pi],
                                    tex.pixels[pi + 1],
                                    tex.pixels[pi + 2],
                                    tex.pixels[pi + 3],
                                )
                            } else {
                                (255, 0, 255, 255)
                            }
                        } else {
                            (255, 0, 255, 255)
                        };

                        if a > 0 {
                            let fr = lerp_u8(r, self.fog_color[0], fog_factor);
                            let fg = lerp_u8(g, self.fog_color[1], fog_factor);
                            let fb_c = lerp_u8(b, self.fog_color[2], fog_factor);
                            fb.set_pixel(stripe as u32, y as u32, fr, fg, fb_c, a);
                        }
                    }
                }
            }
        }
    }

    /// Move by (dx, dy), sliding along whichever axis is blocked.
    ///
    /// Cells are picked with `floor`, matching the DDA in `render`. Casting
    /// straight to i32 truncates toward zero, so a position of -0.3 resolved
    /// to cell 0 and let the player walk out through the map's west and north
    /// edges.
    fn try_move(&mut self, dx: f32, dy: f32) {
        let new_x = self.camera.pos.x + dx;
        let new_y = self.camera.pos.y + dy;
        let row = self.camera.pos.y.floor() as i32;

        if self.map.get(new_x.floor() as i32, row) == 0 {
            self.camera.pos.x = new_x;
        }

        let col = self.camera.pos.x.floor() as i32;
        if self.map.get(col, new_y.floor() as i32) == 0 {
            self.camera.pos.y = new_y;
        }
    }

    /// Distance travelled in one step at the camera's move speed.
    fn step_along(&self, angle: f32, dt: f32) -> (f32, f32) {
        let dist = self.camera.move_speed * dt;
        (angle.cos() * dist, angle.sin() * dist)
    }

    pub fn move_forward(&mut self, dt: f32) {
        let (dx, dy) = self.step_along(self.camera.angle, dt);
        self.try_move(dx, dy);
    }

    pub fn move_backward(&mut self, dt: f32) {
        let (dx, dy) = self.step_along(self.camera.angle, dt);
        self.try_move(-dx, -dy);
    }

    pub fn strafe_left(&mut self, dt: f32) {
        let (dx, dy) = self.step_along(self.camera.angle - std::f32::consts::FRAC_PI_2, dt);
        self.try_move(dx, dy);
    }

    pub fn strafe_right(&mut self, dt: f32) {
        let (dx, dy) = self.step_along(self.camera.angle + std::f32::consts::FRAC_PI_2, dt);
        self.try_move(dx, dy);
    }

    pub fn turn_left(&mut self, dt: f32) {
        self.camera.angle -= self.camera.turn_speed * dt;
    }

    pub fn turn_right(&mut self, dt: f32) {
        self.camera.angle += self.camera.turn_speed * dt;
    }

    pub fn add_billboard(&mut self, id: u32, x: f32, y: f32, texture: u32, scale: f32) {
        self.billboards.push(Billboard {
            id,
            pos: Vec2::new(x, y),
            texture,
            scale,
            elevation: 0.5,
        });
    }

    pub fn remove_billboard(&mut self, id: u32) {
        self.billboards.retain(|b| b.id != id);
    }

    pub fn update_billboard(&mut self, id: u32, x: f32, y: f32) {
        if let Some(bb) = self.billboards.iter_mut().find(|b| b.id == id) {
            bb.pos = Vec2::new(x, y);
        }
    }

    /// Raise or lower a billboard between the floor (0.0) and ceiling (1.0).
    pub fn set_billboard_elevation(&mut self, id: u32, elevation: f32) {
        if let Some(bb) = self.billboards.iter_mut().find(|b| b.id == id) {
            bb.elevation = elevation;
        }
    }
}

/// A wall hit found by [`RaycastRenderer::cast_ray`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WallHit {
    /// Distance from the ray origin, in map cells.
    pub distance: f32,
    /// The non-zero cell value that stopped the ray.
    pub tile: u8,
    /// Grid coordinates of that cell.
    pub cell: (i32, i32),
    /// True when the ray entered through a north/south face.
    pub vertical: bool,
}

/// A billboard struck by [`RaycastRenderer::hitscan`].
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BillboardHit {
    /// Id passed to [`RaycastRenderer::add_billboard`].
    pub id: u32,
    /// Distance from the ray origin, in map cells.
    pub distance: f32,
    /// Where the ray passed closest to the billboard's centre.
    pub point: Vec2,
}

/// The result of firing a shot: what it hit first, and where it stopped.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hitscan {
    /// The wall that bounded the shot, if the ray reached one.
    pub wall: Option<WallHit>,
    /// The nearest billboard in front of that wall, if any.
    pub billboard: Option<BillboardHit>,
    /// Where the shot ends: the billboard if one was struck, else the wall,
    /// else `max_distance` along the ray.
    pub point: Vec2,
}

impl RaycastRenderer {
    /// Walk the DDA from `origin` along `angle` until a solid cell or
    /// `max_distance` is reached.
    ///
    /// This is the same traversal the renderer uses for a screen column, so a
    /// shot can never disagree with what the player sees on screen.
    pub fn cast_ray(&self, origin: Vec2, angle: f32, max_distance: f32) -> Option<WallHit> {
        let ray_dir = Vec2::new(angle.cos(), angle.sin());
        let mut map_pos = (origin.x.floor() as i32, origin.y.floor() as i32);

        // A ray fired from inside a wall has nowhere to travel.
        if self.map.get(map_pos.0, map_pos.1) != 0 {
            return Some(WallHit {
                distance: 0.0,
                tile: self.map.get(map_pos.0, map_pos.1),
                cell: map_pos,
                vertical: false,
            });
        }

        let delta_dist_x = if ray_dir.x.abs() < 1e-10 {
            f32::MAX
        } else {
            (1.0 / ray_dir.x).abs()
        };
        let delta_dist_y = if ray_dir.y.abs() < 1e-10 {
            f32::MAX
        } else {
            (1.0 / ray_dir.y).abs()
        };

        let (step_x, mut side_dist_x) = if ray_dir.x < 0.0 {
            (-1, (origin.x - map_pos.0 as f32) * delta_dist_x)
        } else {
            (1, (map_pos.0 as f32 + 1.0 - origin.x) * delta_dist_x)
        };
        let (step_y, mut side_dist_y) = if ray_dir.y < 0.0 {
            (-1, (origin.y - map_pos.1 as f32) * delta_dist_y)
        } else {
            (1, (map_pos.1 as f32 + 1.0 - origin.y) * delta_dist_y)
        };

        // Two steps per cell crossed, plus slack for a ray starting outside.
        let span = (self.map.cols + self.map.rows) as usize * 2 + 8;

        for _ in 0..span {
            let vertical = side_dist_x < side_dist_y;
            let distance = if vertical { side_dist_x } else { side_dist_y };

            if vertical {
                side_dist_x += delta_dist_x;
                map_pos.0 += step_x;
            } else {
                side_dist_y += delta_dist_y;
                map_pos.1 += step_y;
            }

            if distance > max_distance {
                return None;
            }

            let tile = self.map.get(map_pos.0, map_pos.1);
            if tile != 0 {
                return Some(WallHit {
                    distance,
                    tile,
                    cell: map_pos,
                    vertical,
                });
            }
        }

        None
    }

    /// True when nothing solid stands between `from` and `to`.
    ///
    /// Bots use this to decide whether they can see the player; a shot uses
    /// [`hitscan`](Self::hitscan) instead, which also reports what it struck.
    pub fn line_of_sight(&self, from: Vec2, to: Vec2) -> bool {
        let delta = to - from;
        let distance = delta.length();
        if distance < 1e-6 {
            return true;
        }
        match self.cast_ray(from, delta.y.atan2(delta.x), distance) {
            // A wall further away than the target does not block it.
            Some(hit) => hit.distance >= distance,
            None => true,
        }
    }

    /// Fire a shot and report the first thing it hits.
    ///
    /// Billboards are treated as discs of `radius` cells facing the shooter,
    /// which is how sprite enemies are hit in the raycaster games of the era:
    /// close enough to be fair, cheap enough to run for every bullet.
    /// `ignore` skips one billboard so a shooter cannot hit itself.
    pub fn hitscan(
        &self,
        origin: Vec2,
        angle: f32,
        max_distance: f32,
        radius: f32,
        ignore: Option<u32>,
    ) -> Hitscan {
        let dir = Vec2::new(angle.cos(), angle.sin());
        let wall = self.cast_ray(origin, angle, max_distance);
        let limit = wall.map(|w| w.distance).unwrap_or(max_distance);

        let mut billboard: Option<BillboardHit> = None;
        for bb in &self.billboards {
            if Some(bb.id) == ignore {
                continue;
            }
            let to_bb = bb.pos - origin;
            // Distance along the ray at which we pass the billboard.
            let along = to_bb.dot(dir);
            if along <= 0.0 || along > limit {
                continue;
            }
            if (to_bb - dir * along).length() > radius {
                continue;
            }
            if billboard.is_none_or(|best| along < best.distance) {
                billboard = Some(BillboardHit {
                    id: bb.id,
                    distance: along,
                    point: origin + dir * along,
                });
            }
        }

        let point = match (billboard, wall) {
            (Some(b), _) => b.point,
            (None, Some(w)) => origin + dir * w.distance,
            (None, None) => origin + dir * max_distance,
        };

        Hitscan {
            wall,
            billboard,
            point,
        }
    }

    /// Slide a circle of `radius` from `pos` by `delta`, stopping at walls.
    ///
    /// The camera's own movement keeps a point-sized player, which lets it
    /// graze corners. Anything that shares the map with the player — a bot, a
    /// rolling ball — wants a body with width, so it gets its own resolver.
    pub fn slide_circle(&self, pos: Vec2, delta: Vec2, radius: f32) -> Vec2 {
        let mut out = pos;

        let try_x = out.x + delta.x;
        let edge_x = try_x + radius * delta.x.signum();
        if delta.x != 0.0
            && self
                .map
                .get(edge_x.floor() as i32, (out.y - radius).floor() as i32)
                == 0
            && self
                .map
                .get(edge_x.floor() as i32, (out.y + radius).floor() as i32)
                == 0
        {
            out.x = try_x;
        }

        let try_y = out.y + delta.y;
        let edge_y = try_y + radius * delta.y.signum();
        if delta.y != 0.0
            && self
                .map
                .get((out.x - radius).floor() as i32, edge_y.floor() as i32)
                == 0
            && self
                .map
                .get((out.x + radius).floor() as i32, edge_y.floor() as i32)
                == 0
        {
            out.y = try_y;
        }

        out
    }
}

fn lerp_u8(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 + (b as f32 - a as f32) * t) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 4x4 room: solid border, open interior.
    fn room() -> RaycastMap {
        let mut cells = vec![0u8; 16];
        for i in 0..4 {
            cells[i] = 1; // top row
            cells[12 + i] = 1; // bottom row
            cells[i * 4] = 1; // left column
            cells[i * 4 + 3] = 1; // right column
        }
        RaycastMap::new(4, 4, cells)
    }

    fn renderer_at(x: f32, y: f32, angle: f32) -> RaycastRenderer {
        let mut rc = RaycastRenderer::new(room());
        rc.camera.pos = Vec2::new(x, y);
        rc.camera.angle = angle;
        rc
    }

    #[test]
    fn map_lookups_treat_out_of_bounds_as_wall() {
        let map = room();
        assert_eq!(map.get(1, 1), 0, "interior is open");
        assert_eq!(map.get(0, 0), 1, "border is solid");
        assert_eq!(map.get(-1, 1), 1);
        assert_eq!(map.get(1, -1), 1);
        assert_eq!(map.get(4, 1), 1);
        assert_eq!(map.get(1, 4), 1);
    }

    #[test]
    fn turning_changes_the_camera_angle() {
        let mut rc = renderer_at(1.5, 1.5, 0.0);
        rc.turn_right(1.0);
        assert!((rc.camera.angle - rc.camera.turn_speed).abs() < 1e-4);
        rc.turn_left(1.0);
        assert!(rc.camera.angle.abs() < 1e-4);
    }

    #[test]
    fn moving_through_open_space_advances_the_camera() {
        // Facing +x from the middle of the west interior cell.
        let mut rc = renderer_at(1.5, 1.5, 0.0);
        rc.camera.move_speed = 1.0;
        rc.move_forward(0.5);
        assert!((rc.camera.pos.x - 2.0).abs() < 1e-4);
        assert!((rc.camera.pos.y - 1.5).abs() < 1e-4);
    }

    #[test]
    fn walls_block_forward_movement() {
        // Facing +x, right up against the east wall at column 3.
        let mut rc = renderer_at(2.9, 1.5, 0.0);
        rc.camera.move_speed = 10.0;
        rc.move_forward(1.0);
        assert!(rc.camera.pos.x < 3.0, "should not enter the wall column");
    }

    #[test]
    fn a_blocked_axis_still_slides_along_the_other() {
        // Moving diagonally into the east wall: x is blocked, y is free.
        let mut rc = renderer_at(2.9, 1.5, std::f32::consts::FRAC_PI_4);
        rc.camera.move_speed = 1.0;
        let before_y = rc.camera.pos.y;

        rc.move_forward(0.1);

        assert!(rc.camera.pos.x < 3.0, "x stays out of the wall");
        assert!(rc.camera.pos.y > before_y, "y still slides");
    }

    #[test]
    fn backward_and_strafe_respect_walls_too() {
        let mut rc = renderer_at(1.5, 1.5, 0.0);
        rc.camera.move_speed = 100.0;

        rc.move_backward(1.0);
        rc.strafe_left(1.0);
        rc.strafe_right(1.0);

        // Whatever the combination, the camera never leaves the open interior.
        let col = rc.camera.pos.x.floor() as i32;
        let row = rc.camera.pos.y.floor() as i32;
        assert_eq!(
            rc.map.get(col, row),
            0,
            "ended inside a wall at {col},{row}"
        );
    }

    #[test]
    fn the_player_cannot_clip_through_the_west_or_north_edge() {
        // Regression test: collision cells were selected with `as i32`, which
        // truncates toward zero, so a position of -0.3 resolved to cell 0 and
        // the player escaped into the negative strip outside the map.
        let open = RaycastMap::new(4, 4, vec![0u8; 16]);

        let mut rc = RaycastRenderer::new(open);
        rc.camera.pos = Vec2::new(0.5, 0.5);
        rc.camera.move_speed = 1.0;

        // Walk west (angle = PI) and north for a long while.
        rc.camera.angle = std::f32::consts::PI;
        for _ in 0..60 {
            rc.move_forward(1.0 / 60.0);
        }
        rc.camera.angle = -std::f32::consts::FRAC_PI_2;
        for _ in 0..60 {
            rc.move_forward(1.0 / 60.0);
        }

        assert!(
            rc.camera.pos.x >= 0.0,
            "escaped west to {}",
            rc.camera.pos.x
        );
        assert!(
            rc.camera.pos.y >= 0.0,
            "escaped north to {}",
            rc.camera.pos.y
        );
    }

    #[test]
    fn billboards_can_be_added_moved_and_removed() {
        let mut rc = renderer_at(1.5, 1.5, 0.0);
        rc.add_billboard(1, 2.0, 2.0, 0, 1.0);
        rc.add_billboard(2, 3.0, 3.0, 0, 1.0);
        assert_eq!(rc.billboards.len(), 2);

        rc.update_billboard(1, 2.5, 2.5);
        assert_eq!(rc.billboards[0].pos, Vec2::new(2.5, 2.5));

        // Unknown ids are ignored rather than panicking.
        rc.update_billboard(99, 0.0, 0.0);
        rc.remove_billboard(99);
        assert_eq!(rc.billboards.len(), 2);

        rc.remove_billboard(1);
        assert_eq!(rc.billboards.len(), 1);
        assert_eq!(rc.billboards[0].id, 2);
    }

    #[test]
    fn rendering_fills_the_framebuffer() {
        let mut rc = renderer_at(1.5, 1.5, 0.0);
        rc.floor_color = [10, 20, 30];
        rc.ceiling_color = [40, 50, 60];

        let mut fb = FrameBuffer::new(32, 24);
        rc.render(&mut fb);

        // Every pixel is written: ceiling above, floor below, walls between.
        assert!(fb.pixels.chunks(4).all(|p| p[3] == 255));
        // Some wall colour appears in the middle band.
        let mid = ((12 * fb.width + 16) * 4) as usize;
        assert!(fb.pixels[mid] > 0);
    }

    #[test]
    fn rendering_survives_a_resize_between_frames() {
        let mut rc = renderer_at(1.5, 1.5, 0.0);
        let mut small = FrameBuffer::new(16, 16);
        rc.render(&mut small);

        let mut large = FrameBuffer::new(64, 48);
        rc.render(&mut large);

        let mut small_again = FrameBuffer::new(16, 16);
        rc.render(&mut small_again);
    }

    #[test]
    fn rendering_inside_a_wall_does_not_panic() {
        let mut rc = renderer_at(0.5, 0.5, 0.0); // standing in the border
        let mut fb = FrameBuffer::new(16, 16);
        rc.render(&mut fb);
    }

    #[test]
    fn a_default_camera_faces_east_with_a_60_degree_field_of_view() {
        let cam = RaycastCamera::default();
        assert_eq!(cam.angle, 0.0);
        assert!((cam.fov - std::f32::consts::FRAC_PI_3).abs() < 1e-6);
        assert!(cam.fog_dist > 0.0);
    }

    fn solid_texture(size: u32, rgb: [u8; 3]) -> WallTexture {
        let mut pixels = Vec::with_capacity((size * size * 4) as usize);
        for _ in 0..(size * size) {
            pixels.extend_from_slice(&[rgb[0], rgb[1], rgb[2], 255]);
        }
        WallTexture { pixels, size }
    }

    #[test]
    fn a_billboard_draws_in_front_of_the_camera() {
        // Fully open cells; out-of-bounds still reads as wall type 1, so the
        // room has walls to render against.
        let mut rc = RaycastRenderer::new(RaycastMap::new(8, 8, vec![0u8; 64]));
        rc.camera.pos = Vec2::new(2.5, 2.5);
        rc.camera.angle = 0.0; // facing +x
        rc.camera.fog_dist = 100.0;

        rc.textures.push(solid_texture(8, [90, 90, 90])); // index 0 = wall type 1
        rc.textures.push(solid_texture(8, [255, 0, 0])); // index 1 = the billboard

        let mut without = FrameBuffer::new(64, 48);
        rc.render(&mut without);
        assert!(
            !without
                .pixels
                .chunks(4)
                .any(|p| p[0] > 200 && p[1] < 60 && p[2] < 60),
            "nothing should be red before the billboard exists"
        );

        rc.add_billboard(1, 4.5, 2.5, 1, 1.0);
        let mut with = FrameBuffer::new(64, 48);
        rc.render(&mut with);

        assert_ne!(without.pixels, with.pixels, "the billboard should be drawn");
        assert!(
            with.pixels
                .chunks(4)
                .any(|p| p[0] > 200 && p[1] < 60 && p[2] < 60),
            "the billboard's colour should appear on screen"
        );
    }

    #[test]
    fn a_billboard_behind_the_camera_is_not_drawn() {
        let mut rc = RaycastRenderer::new(RaycastMap::new(8, 8, vec![0u8; 64]));
        rc.camera.pos = Vec2::new(4.5, 2.5);
        rc.camera.angle = 0.0; // facing +x, billboard placed behind
        rc.camera.fog_dist = 100.0;
        rc.textures.push(solid_texture(8, [90, 90, 90]));
        rc.textures.push(solid_texture(8, [255, 0, 0]));

        rc.add_billboard(1, 1.5, 2.5, 1, 1.0);
        let mut fb = FrameBuffer::new(64, 48);
        rc.render(&mut fb);

        assert!(
            !fb.pixels
                .chunks(4)
                .any(|p| p[0] > 200 && p[1] < 60 && p[2] < 60),
            "a billboard behind the camera must not be drawn"
        );
    }

    #[test]
    fn lerp_u8_hits_both_ends() {
        assert_eq!(lerp_u8(0, 255, 0.0), 0);
        assert_eq!(lerp_u8(0, 255, 1.0), 255);
        assert!((126..=128).contains(&lerp_u8(0, 255, 0.5)));
    }

    // --- Hitscan, line of sight, circle sliding --------------------------

    /// A 7x7 hall with a single pillar at (3,3).
    fn hall() -> RaycastRenderer {
        let mut cells = vec![0u8; 49];
        for i in 0..7 {
            cells[i] = 1;
            cells[42 + i] = 1;
            cells[i * 7] = 1;
            cells[i * 7 + 6] = 1;
        }
        cells[3 * 7 + 3] = 2; // pillar, a different wall type
        RaycastRenderer::new(RaycastMap::new(7, 7, cells))
    }

    #[test]
    fn a_ray_stops_at_the_first_wall_and_reports_it() {
        let rc = hall();
        // Fired east down row 1: the border at x=6 is 4.5 cells away.
        let hit = rc.cast_ray(Vec2::new(1.5, 1.5), 0.0, 20.0).unwrap();
        assert_eq!(hit.cell, (6, 1));
        assert_eq!(hit.tile, 1);
        assert!(hit.vertical, "entered through an east/west face");
        assert!((hit.distance - 4.5).abs() < 1e-3, "{}", hit.distance);
    }

    #[test]
    fn a_ray_reports_the_wall_type_it_struck() {
        let rc = hall();
        // Fired east down row 3, straight into the pillar.
        let hit = rc.cast_ray(Vec2::new(1.5, 3.5), 0.0, 20.0).unwrap();
        assert_eq!(hit.cell, (3, 3));
        assert_eq!(hit.tile, 2, "the pillar, not the far border");
    }

    #[test]
    fn a_ray_shorter_than_the_wall_finds_nothing() {
        let rc = hall();
        assert!(rc.cast_ray(Vec2::new(1.5, 1.5), 0.0, 2.0).is_none());
    }

    #[test]
    fn a_ray_fired_from_inside_a_wall_hits_at_zero() {
        let rc = hall();
        let hit = rc.cast_ray(Vec2::new(0.5, 0.5), 0.0, 10.0).unwrap();
        assert_eq!(hit.distance, 0.0);
        assert_eq!(hit.cell, (0, 0));
    }

    #[test]
    fn line_of_sight_is_clear_down_an_open_row() {
        let rc = hall();
        assert!(rc.line_of_sight(Vec2::new(1.5, 1.5), Vec2::new(5.5, 1.5)));
    }

    #[test]
    fn line_of_sight_is_broken_by_the_pillar() {
        let rc = hall();
        assert!(!rc.line_of_sight(Vec2::new(1.5, 3.5), Vec2::new(5.5, 3.5)));
    }

    #[test]
    fn line_of_sight_to_yourself_is_always_clear() {
        let rc = hall();
        let here = Vec2::new(1.5, 1.5);
        assert!(rc.line_of_sight(here, here));
    }

    #[test]
    fn a_shot_hits_the_billboard_standing_in_front_of_the_wall() {
        let mut rc = hall();
        rc.add_billboard(7, 4.5, 1.5, 0, 1.0);
        let shot = rc.hitscan(Vec2::new(1.5, 1.5), 0.0, 20.0, 0.4, None);

        let bb = shot.billboard.expect("should hit the billboard");
        assert_eq!(bb.id, 7);
        assert!((bb.distance - 3.0).abs() < 1e-3, "{}", bb.distance);
        assert!(
            (shot.point.x - 4.5).abs() < 1e-3,
            "shot ends at the target, not the wall"
        );
    }

    #[test]
    fn a_shot_misses_a_billboard_outside_the_hit_radius() {
        let mut rc = hall();
        rc.add_billboard(7, 4.5, 2.4, 0, 1.0); // ~0.9 cells off the ray
        let shot = rc.hitscan(Vec2::new(1.5, 1.5), 0.0, 20.0, 0.4, None);
        assert!(shot.billboard.is_none());
        assert_eq!(shot.wall.map(|w| w.cell), Some((6, 1)));
    }

    #[test]
    fn a_wall_shields_the_billboard_behind_it() {
        let mut rc = hall();
        rc.add_billboard(7, 5.5, 3.5, 0, 1.0); // beyond the pillar at (3,3)
        let shot = rc.hitscan(Vec2::new(1.5, 3.5), 0.0, 20.0, 0.5, None);
        assert!(shot.billboard.is_none(), "the pillar is in the way");
        assert_eq!(shot.wall.map(|w| w.tile), Some(2));
    }

    #[test]
    fn a_shot_picks_the_nearest_of_several_billboards() {
        let mut rc = hall();
        rc.add_billboard(1, 4.5, 1.5, 0, 1.0);
        rc.add_billboard(2, 2.5, 1.5, 0, 1.0);
        let shot = rc.hitscan(Vec2::new(1.5, 1.5), 0.0, 20.0, 0.4, None);
        assert_eq!(shot.billboard.map(|b| b.id), Some(2));
    }

    #[test]
    fn a_shooter_does_not_hit_its_own_billboard() {
        let mut rc = hall();
        rc.add_billboard(1, 1.5, 1.5, 0, 1.0); // standing on the muzzle
        rc.add_billboard(2, 4.5, 1.5, 0, 1.0);
        let shot = rc.hitscan(Vec2::new(1.5, 1.5), 0.0, 20.0, 0.4, Some(1));
        assert_eq!(shot.billboard.map(|b| b.id), Some(2));
    }

    #[test]
    fn a_billboard_behind_the_shooter_is_never_hit() {
        let mut rc = hall();
        rc.add_billboard(1, 1.5, 1.5, 0, 1.0);
        // Fired east from x=2.5, so the billboard sits behind the muzzle.
        let shot = rc.hitscan(Vec2::new(2.5, 1.5), 0.0, 20.0, 0.4, None);
        assert!(shot.billboard.is_none());
    }

    #[test]
    fn a_shot_that_runs_out_of_range_ends_in_mid_air() {
        let rc = hall();
        // The border is 4.5 cells east; the shot only carries 2.
        let shot = rc.hitscan(Vec2::new(1.5, 1.5), 0.0, 2.0, 0.4, None);
        assert!(shot.wall.is_none() && shot.billboard.is_none());
        assert!((shot.point.x - 3.5).abs() < 1e-3, "{:?}", shot.point);
    }

    #[test]
    fn a_circle_stops_before_the_wall_touches_it() {
        let rc = hall();
        // Walking east along row 1 towards the border at x=6.
        let moved = rc.slide_circle(Vec2::new(5.5, 1.5), Vec2::new(0.4, 0.0), 0.3);
        assert_eq!(moved.x, 5.5, "0.3 radius + 0.4 step reaches into the wall");
    }

    #[test]
    fn a_circle_slides_along_a_wall_it_is_pressed_into() {
        let rc = hall();
        // Pushing north-east into the top border: the y move is refused, the
        // x move still happens.
        let moved = rc.slide_circle(Vec2::new(3.5, 1.4), Vec2::new(0.2, -0.3), 0.25);
        assert!((moved.x - 3.7).abs() < 1e-4, "x should slide: {moved:?}");
        assert!(
            (moved.y - 1.4).abs() < 1e-4,
            "y should be blocked: {moved:?}"
        );
    }

    #[test]
    fn a_circle_moves_freely_through_open_space() {
        let rc = hall();
        let moved = rc.slide_circle(Vec2::new(1.5, 1.5), Vec2::new(0.3, 0.4), 0.2);
        assert!((moved - Vec2::new(1.8, 1.9)).length() < 1e-4, "{moved:?}");
    }

    // --- Pitch, eye height, billboard elevation ---------------------------

    /// A room with a textured wall and one red billboard ahead.
    fn scene_with_billboard() -> RaycastRenderer {
        let mut rc = RaycastRenderer::new(RaycastMap::new(8, 8, vec![0u8; 64]));
        rc.camera.pos = Vec2::new(2.5, 2.5);
        rc.camera.angle = 0.0;
        rc.camera.fog_dist = 100.0;
        rc.textures.push(solid_texture(8, [90, 90, 90]));
        rc.textures.push(solid_texture(8, [255, 0, 0]));
        rc.add_billboard(1, 5.5, 2.5, 1, 1.0);
        rc
    }

    /// Mean row of every red pixel, or None when nothing red was drawn.
    fn red_center_row(fb: &FrameBuffer) -> Option<f32> {
        let w = fb.width as usize;
        let mut sum = 0.0;
        let mut n = 0.0;
        for (i, p) in fb.pixels.chunks(4).enumerate() {
            if p[0] > 200 && p[1] < 60 && p[2] < 60 {
                sum += (i / w) as f32;
                n += 1.0;
            }
        }
        if n == 0.0 {
            None
        } else {
            Some(sum / n)
        }
    }

    /// Row where the ceiling colour gives way to the floor colour, down the
    /// centre column — the horizon, wherever the wall does not cover it.
    fn horizon_row(rc: &mut RaycastRenderer) -> usize {
        let mut fb = FrameBuffer::new(64, 48);
        rc.render(&mut fb);
        let x = 32usize;
        let ceiling = rc.ceiling_color;
        for y in 0..fb.height as usize {
            let i = (y * fb.width as usize + x) * 4;
            if fb.pixels[i..i + 3] != ceiling[..] {
                return y;
            }
        }
        fb.height as usize
    }

    #[test]
    fn a_new_camera_looks_straight_ahead_from_standing_height() {
        let cam = RaycastCamera::default();
        assert_eq!(cam.pitch, 0.0);
        assert_eq!(cam.eye_height, 0.5);
    }

    #[test]
    fn pitching_down_moves_the_horizon_down_the_screen() {
        // An empty map so the wall never covers the centre column.
        let mut rc = RaycastRenderer::new(RaycastMap::new(64, 64, vec![0u8; 64 * 64]));
        rc.camera.pos = Vec2::new(32.5, 32.5);
        rc.camera.fog_dist = 100.0;
        rc.ceiling_color = [10, 10, 40];
        rc.floor_color = [40, 10, 10];

        let level = horizon_row(&mut rc);
        rc.camera.pitch = 8.0;
        let down = horizon_row(&mut rc);
        rc.camera.pitch = -8.0;
        let up = horizon_row(&mut rc);

        assert!(down > level, "pitch down: {level} -> {down}");
        assert!(up < level, "pitch up: {level} -> {up}");
        assert_eq!(down - level, level - up, "the shear is symmetric");
    }

    #[test]
    fn pitch_carries_billboards_with_the_view() {
        let mut rc = scene_with_billboard();
        let mut fb = FrameBuffer::new(64, 48);
        rc.render(&mut fb);
        let level = red_center_row(&fb).expect("billboard should be drawn");

        rc.camera.pitch = 10.0;
        let mut tilted = FrameBuffer::new(64, 48);
        rc.render(&mut tilted);
        let moved = red_center_row(&tilted).expect("still drawn");

        assert!(
            moved > level + 5.0,
            "a pitched view must move the sprite too: {level} -> {moved}"
        );
    }

    #[test]
    fn raising_the_eye_pushes_the_floor_wall_seam_down() {
        let mut rc = RaycastRenderer::new(RaycastMap::new(8, 8, vec![0u8; 64]));
        rc.camera.pos = Vec2::new(4.0, 4.0);
        rc.camera.fog_dist = 100.0;
        rc.textures.push(solid_texture(8, [90, 90, 90]));

        // How many rows of wall are drawn below the horizon.
        let below = |rc: &mut RaycastRenderer| {
            let mut fb = FrameBuffer::new(64, 48);
            rc.render(&mut fb);
            let mid = 24usize;
            (mid..48)
                .filter(|y| {
                    let i = (y * 64 + 32) * 4;
                    fb.pixels[i] > 60 && fb.pixels[i] == fb.pixels[i + 1]
                })
                .count()
        };

        let standing = below(&mut rc);
        rc.camera.eye_height = 0.9; // stand on a crate
        let raised = below(&mut rc);

        assert!(
            raised > standing,
            "a higher eye sees more floor-side wall: {standing} -> {raised}"
        );
    }

    #[test]
    fn a_billboard_defaults_to_eye_level() {
        let mut rc = scene_with_billboard();
        assert_eq!(rc.billboards[0].elevation, 0.5);

        let mut fb = FrameBuffer::new(64, 48);
        rc.render(&mut fb);
        let row = red_center_row(&fb).unwrap();
        assert!(
            (row - 24.0).abs() < 2.0,
            "should sit on the horizon, got row {row}"
        );
    }

    #[test]
    fn lowering_a_billboard_drops_it_towards_the_floor() {
        let mut rc = scene_with_billboard();
        let mut fb = FrameBuffer::new(64, 48);
        rc.render(&mut fb);
        let eye_level = red_center_row(&fb).unwrap();

        rc.set_billboard_elevation(1, 0.15);
        let mut low = FrameBuffer::new(64, 48);
        rc.render(&mut low);
        let dropped = red_center_row(&low).unwrap();

        assert!(
            dropped > eye_level,
            "a floor-level sprite draws lower: {eye_level} -> {dropped}"
        );
    }

    #[test]
    fn raising_a_billboard_lifts_it_towards_the_ceiling() {
        let mut rc = scene_with_billboard();
        let mut fb = FrameBuffer::new(64, 48);
        rc.render(&mut fb);
        let eye_level = red_center_row(&fb).unwrap();

        rc.set_billboard_elevation(1, 0.9);
        let mut high = FrameBuffer::new(64, 48);
        rc.render(&mut high);
        let lifted = red_center_row(&high).unwrap();

        assert!(
            lifted < eye_level,
            "a hanging sprite draws higher: {eye_level} -> {lifted}"
        );
    }

    #[test]
    fn setting_the_elevation_of_an_unknown_billboard_is_harmless() {
        let mut rc = scene_with_billboard();
        rc.set_billboard_elevation(99, 0.1);
        assert_eq!(rc.billboards[0].elevation, 0.5);
    }
}
