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
}

impl Default for RaycastCamera {
    fn default() -> Self {
        Self {
            pos: Vec2::new(2.0, 2.0),
            angle: 0.0,
            fov: 1.0472, // 60 degrees
            move_speed: 3.0,
            turn_speed: 2.5,
            fog_dist: 10.0,
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

        let half_h = h as f32 / 2.0;

        // Draw ceiling and floor
        for y in 0..h {
            for x in 0..w {
                if (y as f32) < half_h {
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

            let line_height = (h as f32 / perp_dist) as i32;
            let draw_start = (-line_height / 2 + h as i32 / 2).max(0) as usize;
            let draw_end = (line_height / 2 + h as i32 / 2).min(h as i32) as usize;

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
                let d = y as f32 - h as f32 / 2.0 + line_height as f32 / 2.0;
                let tex_y_f = d / line_height as f32;

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

            let draw_start_y = (-sprite_height / 2 + screen_h as i32 / 2).max(0);
            let draw_end_y = (sprite_height / 2 + screen_h as i32 / 2).min(screen_h as i32);
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
                            let ty = ((y - (-sprite_height / 2 + screen_h as i32 / 2)) as f32
                                / sprite_height as f32
                                * tex.size as f32) as u32;
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

    pub fn move_forward(&mut self, dt: f32) {
        let dx = self.camera.angle.cos() * self.camera.move_speed * dt;
        let dy = self.camera.angle.sin() * self.camera.move_speed * dt;
        let new_x = self.camera.pos.x + dx;
        let new_y = self.camera.pos.y + dy;
        if self.map.get(new_x as i32, self.camera.pos.y as i32) == 0 {
            self.camera.pos.x = new_x;
        }
        if self.map.get(self.camera.pos.x as i32, new_y as i32) == 0 {
            self.camera.pos.y = new_y;
        }
    }

    pub fn move_backward(&mut self, dt: f32) {
        let dx = self.camera.angle.cos() * self.camera.move_speed * dt;
        let dy = self.camera.angle.sin() * self.camera.move_speed * dt;
        let new_x = self.camera.pos.x - dx;
        let new_y = self.camera.pos.y - dy;
        if self.map.get(new_x as i32, self.camera.pos.y as i32) == 0 {
            self.camera.pos.x = new_x;
        }
        if self.map.get(self.camera.pos.x as i32, new_y as i32) == 0 {
            self.camera.pos.y = new_y;
        }
    }

    pub fn strafe_left(&mut self, dt: f32) {
        let strafe_angle = self.camera.angle - std::f32::consts::FRAC_PI_2;
        let dx = strafe_angle.cos() * self.camera.move_speed * dt;
        let dy = strafe_angle.sin() * self.camera.move_speed * dt;
        let new_x = self.camera.pos.x + dx;
        let new_y = self.camera.pos.y + dy;
        if self.map.get(new_x as i32, self.camera.pos.y as i32) == 0 {
            self.camera.pos.x = new_x;
        }
        if self.map.get(self.camera.pos.x as i32, new_y as i32) == 0 {
            self.camera.pos.y = new_y;
        }
    }

    pub fn strafe_right(&mut self, dt: f32) {
        let strafe_angle = self.camera.angle + std::f32::consts::FRAC_PI_2;
        let dx = strafe_angle.cos() * self.camera.move_speed * dt;
        let dy = strafe_angle.sin() * self.camera.move_speed * dt;
        let new_x = self.camera.pos.x + dx;
        let new_y = self.camera.pos.y + dy;
        if self.map.get(new_x as i32, self.camera.pos.y as i32) == 0 {
            self.camera.pos.x = new_x;
        }
        if self.map.get(self.camera.pos.x as i32, new_y as i32) == 0 {
            self.camera.pos.y = new_y;
        }
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
}

fn lerp_u8(a: u8, b: u8, t: f32) -> u8 {
    (a as f32 + (b as f32 - a as f32) * t) as u8
}
