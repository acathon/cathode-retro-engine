//! The desktop app: engine, scene and game, with no window attached.
//!
//! Keeping the window out of this type is what lets the same app run two ways
//! — in a winit window, and headless into a PNG. The second matters more than
//! it sounds: a native binary has no equivalent of opening a browser and
//! looking, so without it there is no way to check that a build still draws
//! the right thing.

use cathode_core::assets::SpriteSheet;
use cathode_core::audio::Waveform;
use cathode_core::config::EngineConfig;
use cathode_core::ecs::{GamepadState, Position, SpriteIndex};
use cathode_core::renderer::FrameBuffer;
use cathode_core::text::glyphs;
use cathode_core::Engine;
use hecs::{Entity, World};

use crate::breakout::{self, Game, Phase, Sound};

pub struct App {
    pub engine: Engine,
    pub game: Game,
    font: u32,
    paddle: Entity,
    ball: Entity,
    bricks: Vec<Entity>,
    /// Frames of sound left to play, so a blip is audible but not held.
    sound_frames: u32,
}

impl App {
    pub fn new(config: EngineConfig) -> Self {
        let mut engine = Engine::new(config);

        // Sheets are generated rather than loaded: a desktop binary that needs
        // no files beside it is easier to hand somebody than one that does.
        let (fw, fh, font_pixels) = glyphs::builtin_sheet();
        let font_sheet = engine
            .assets
            .add_sheet(SpriteSheet::from_rgba(fw, fh, 8, 8, font_pixels));
        let font = engine.fonts.register(font_sheet, 8, 8, 16, 32);

        let paddle_sheet = engine.assets.add_sheet(SpriteSheet::from_rgba(
            breakout::PADDLE_W as u32,
            breakout::PADDLE_H as u32,
            breakout::PADDLE_W as u32,
            breakout::PADDLE_H as u32,
            solid(
                breakout::PADDLE_W as u32,
                breakout::PADDLE_H as u32,
                [228, 232, 240],
            ),
        ));
        let ball_sheet = engine.assets.add_sheet(SpriteSheet::from_rgba(
            breakout::BALL as u32,
            breakout::BALL as u32,
            breakout::BALL as u32,
            breakout::BALL as u32,
            solid(
                breakout::BALL as u32,
                breakout::BALL as u32,
                [252, 232, 140],
            ),
        ));
        let brick_sheet = engine.assets.add_sheet(SpriteSheet::from_rgba(
            breakout::BRICK_W as u32 * breakout::ROWS as u32,
            breakout::BRICK_H as u32,
            breakout::BRICK_W as u32,
            breakout::BRICK_H as u32,
            brick_strip(),
        ));

        // One entity per brick, plus the paddle and the ball. Spawned once and
        // repositioned every frame; a cleared brick is hidden rather than
        // despawned, so nothing allocates while the game is running.
        let paddle = spawn(&mut engine.world, paddle_sheet, 0, 20);
        let ball = spawn(&mut engine.world, ball_sheet, 0, 30);
        let mut bricks = Vec::with_capacity(breakout::ROWS * breakout::COLS);
        for row in 0..breakout::ROWS {
            for _ in 0..breakout::COLS {
                bricks.push(spawn(&mut engine.world, brick_sheet, row as u16, 10));
            }
        }

        Self {
            engine,
            game: Game::new(),
            font,
            paddle,
            ball,
            bricks,
            sound_frames: 0,
        }
    }

    /// Advance the game and bring the scene in line with it.
    pub fn step(&mut self, dt: f32, input: &GamepadState) {
        self.engine.input.set_state(0, *input);
        self.game.update(dt, input);

        // Sound effects are events the game reports, not calls it makes: the
        // rules module has no idea an audio device exists.
        for sound in &self.game.sounds {
            let (freq, wave, vol) = match sound {
                Sound::Paddle => (520.0, Waveform::Pulse50, 0.20),
                Sound::Brick => (760.0, Waveform::Pulse25, 0.18),
                Sound::Wall => (330.0, Waveform::Pulse50, 0.14),
                Sound::LostBall => (120.0, Waveform::Noise, 0.24),
                Sound::Cleared => (880.0, Waveform::Triangle, 0.30),
            };
            self.engine.audio.play(0, freq, wave, vol);
            self.sound_frames = 5;
        }
        if self.sound_frames > 0 {
            self.sound_frames -= 1;
            if self.sound_frames == 0 {
                self.engine.audio.stop(0);
            }
        }

        place(
            &mut self.engine.world,
            self.paddle,
            self.game.paddle_x,
            breakout::PADDLE_Y,
            true,
        );
        place(
            &mut self.engine.world,
            self.ball,
            self.game.ball_x,
            self.game.ball_y,
            true,
        );
        for (i, entity) in self.bricks.iter().enumerate() {
            let (row, col) = (i / breakout::COLS, i % breakout::COLS);
            let (x, y) = Game::brick_pos(row, col);
            place(
                &mut self.engine.world,
                *entity,
                x,
                y,
                self.game.bricks[row][col] != 0,
            );
        }

        self.draw_hud();
        self.engine.update(dt);
    }

    pub fn render(&mut self) -> &FrameBuffer {
        self.engine.render()
    }

    /// Score, lives and whatever the game wants to say, drawn over the world.
    fn draw_hud(&mut self) {
        let score = format!("SCORE {:05}", self.game.score);
        let balls = format!("BALLS {}", self.game.lives);
        self.engine.queue_text(self.font, &score, 8, 8, 1);
        self.engine.queue_text(self.font, &balls, 176, 8, 1);

        let banner = match self.game.phase {
            Phase::Serving if self.game.in_play() => Some("PRESS Z TO SERVE"),
            Phase::Serving => Some("Z SERVES   ARROWS MOVE"),
            Phase::GameOver => Some("GAME OVER - ENTER TO PLAY AGAIN"),
            Phase::Cleared => Some("WALL CLEARED - ENTER TO PLAY AGAIN"),
            Phase::Playing => None,
        };
        if let Some(text) = banner {
            // The built-in font is eight pixels to a character, so centring is
            // arithmetic rather than a measurement.
            let x = (breakout::SCREEN_W as i32 - text.len() as i32 * 8) / 2;
            self.engine.queue_text(self.font, text, x.max(2), 180, 1);
        }
    }

    /// Input for attract mode: chase the ball, and serve when asked to.
    pub fn demo_input(&self) -> GamepadState {
        let mut pad = GamepadState::default();
        if self.game.phase == Phase::Serving {
            pad.a = true;
            return pad;
        }
        let paddle_centre = self.game.paddle_x + breakout::PADDLE_W / 2.0;
        let ball_centre = self.game.ball_x + breakout::BALL / 2.0;
        if ball_centre < paddle_centre - 2.0 {
            pad.left = true;
        } else if ball_centre > paddle_centre + 2.0 {
            pad.right = true;
        }
        pad
    }
}

// --- Scene helpers -----------------------------------------------------------

/// A single-colour RGBA block, for sprites that are just a rectangle.
fn solid(w: u32, h: u32, colour: [u8; 3]) -> Vec<u8> {
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    for px in pixels.as_chunks_mut::<4>().0 {
        px[0] = colour[0];
        px[1] = colour[1];
        px[2] = colour[2];
        px[3] = 255;
    }
    pixels
}

/// One frame per brick row, in the arcade's descending bands.
fn brick_strip() -> Vec<u8> {
    const BANDS: [[u8; 3]; breakout::ROWS] = [
        [214, 66, 66],
        [214, 132, 56],
        [206, 190, 62],
        [92, 186, 92],
        [72, 148, 214],
        [148, 104, 200],
    ];
    let w = breakout::BRICK_W as u32 * breakout::ROWS as u32;
    let h = breakout::BRICK_H as u32;
    let mut pixels = vec![0u8; (w * h * 4) as usize];

    for (row, colour) in BANDS.iter().enumerate() {
        let ox = row as u32 * breakout::BRICK_W as u32;
        for y in 0..h {
            for x in 0..breakout::BRICK_W as u32 {
                // A lit top edge and a dark bottom one, so the wall has relief
                // rather than reading as flat bars.
                let shade: f32 = if y == 0 {
                    1.28
                } else if y >= h - 2 {
                    0.72
                } else {
                    1.0
                };
                let o = (((y * w) + ox + x) * 4) as usize;
                for c in 0..3 {
                    pixels[o + c] = (colour[c] as f32 * shade).min(255.0) as u8;
                }
                pixels[o + 3] = 255;
            }
        }
    }
    pixels
}

fn spawn(world: &mut World, sheet: u32, frame: u16, layer: u8) -> Entity {
    world.spawn((
        Position(glam::Vec2::ZERO),
        SpriteIndex {
            sheet,
            frame,
            flip_x: false,
            flip_y: false,
            layer,
            visible: true,
        },
    ))
}

/// Move an entity and set whether it is drawn at all.
fn place(world: &mut World, entity: Entity, x: f32, y: f32, visible: bool) {
    if let Ok(mut position) = world.get::<&mut Position>(entity) {
        position.0 = glam::Vec2::new(x.round(), y.round());
    }
    if let Ok(mut sprite) = world.get::<&mut SpriteIndex>(entity) {
        sprite.visible = visible;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_app_builds_a_full_scene() {
        let app = App::new(EngineConfig::nes());
        // Paddle, ball and one entity per brick.
        assert_eq!(app.bricks.len(), breakout::ROWS * breakout::COLS);
        assert_eq!(app.engine.world.len() as usize, 2 + app.bricks.len());
    }

    #[test]
    fn stepping_draws_something() {
        let mut app = App::new(EngineConfig::nes());
        for _ in 0..8 {
            let input = app.demo_input();
            app.step(1.0 / 60.0, &input);
        }
        let frame = app.render();
        let background = frame.pixels[0..3].to_vec();
        let lit = frame
            .pixels
            .as_chunks::<4>()
            .0
            .iter()
            .filter(|px| px[0..3] != background[..])
            .count();
        assert!(lit > 2000, "only {lit} pixels differ from the background");
    }

    #[test]
    fn attract_mode_keeps_the_ball_alive() {
        // The paddle AI is what makes a headless screenshot show a game rather
        // than a lost ball, so it has to actually work.
        let mut app = App::new(EngineConfig::nes());
        for _ in 0..1200 {
            let input = app.demo_input();
            app.step(1.0 / 60.0, &input);
        }
        assert!(
            app.game.bricks_left() < breakout::ROWS * breakout::COLS,
            "attract mode broke no bricks"
        );
        assert_eq!(
            app.game.lives,
            breakout::STARTING_LIVES,
            "it dropped a ball"
        );
    }

    #[test]
    fn a_frame_does_not_draw_on_top_of_the_last_one() {
        // Stepping without rendering leaves queued HUD text in the engine, and
        // the next render draws all of it at once. A caller that steps many
        // times per render got a score made of solid blocks.
        let mut app = App::new(EngineConfig::nes());
        let input = GamepadState::default();

        app.step(1.0 / 60.0, &input);
        let once = app.render().pixels.clone();

        // Same state, stepped and rendered again: the frame must be identical.
        app.step(1.0 / 60.0, &input);
        let twice = app.render().pixels.clone();
        assert_eq!(once, twice, "the second frame differs from the first");

        // And stepping twice before rendering must not double the ink.
        let mut piled = App::new(EngineConfig::nes());
        piled.step(1.0 / 60.0, &input);
        piled.step(1.0 / 60.0, &input);
        let ink = |px: &[u8]| px.as_chunks::<4>().0.iter().filter(|p| p[0] > 40).count();
        assert!(
            ink(&piled.render().pixels) <= ink(&once),
            "queued text accumulated across steps"
        );
    }

    #[test]
    fn a_cleared_brick_stops_being_drawn() {
        let mut app = App::new(EngineConfig::nes());
        app.game.bricks[0][0] = 0;
        let input = GamepadState::default();
        app.step(1.0 / 60.0, &input);
        let visible = app
            .engine
            .world
            .get::<&SpriteIndex>(app.bricks[0])
            .map(|s| s.visible)
            .unwrap_or(true);
        assert!(!visible);
    }
}
