//! CATHODE BRICKS — the game the desktop runtime runs.
//!
//! Rules only. Nothing here draws, opens a window, or reads a keyboard: the
//! caller hands it a directional input and a time step, and gets back a
//! position to draw and a list of noises to make.
//!
//! That is the same split the TypeScript examples use, and it buys the same
//! thing — a game you can test without a display, which matters more here
//! because a native binary has no headless mode of its own.

use cathode_core::ecs::GamepadState;

pub const SCREEN_W: f32 = 256.0;
pub const SCREEN_H: f32 = 240.0;

pub const PADDLE_W: f32 = 36.0;
pub const PADDLE_H: f32 = 6.0;
pub const PADDLE_Y: f32 = 214.0;
pub const PADDLE_SPEED: f32 = 170.0;

pub const BALL: f32 = 4.0;
pub const BALL_SPEED: f32 = 132.0;
/// How much faster the ball gets each time it clears a row's worth of bricks.
const SPEED_UP: f32 = 1.035;

pub const COLS: usize = 10;
pub const ROWS: usize = 6;
pub const BRICK_W: f32 = 22.0;
pub const BRICK_H: f32 = 10.0;
pub const BRICK_PITCH_X: f32 = 24.0;
pub const BRICK_PITCH_Y: f32 = 12.0;
pub const FIELD_X: f32 = 8.0;
pub const FIELD_TOP: f32 = 44.0;
/// The playfield's left and right walls.
pub const WALL_L: f32 = 4.0;
pub const WALL_R: f32 = SCREEN_W - 4.0;
pub const CEILING: f32 = 26.0;

pub const STARTING_LIVES: u32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    /// Ball resting on the paddle, waiting for a serve.
    Serving,
    Playing,
    /// Out of lives.
    GameOver,
    Cleared,
}

/// Something worth a noise, produced by `update` and consumed by the caller.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sound {
    Paddle,
    Brick,
    Wall,
    LostBall,
    Cleared,
}

pub struct Game {
    pub paddle_x: f32,
    pub ball_x: f32,
    pub ball_y: f32,
    pub vel_x: f32,
    pub vel_y: f32,
    /// 0 is a cleared cell; anything else is the brick's colour, one-based.
    pub bricks: [[u8; COLS]; ROWS],
    pub score: u32,
    pub lives: u32,
    pub phase: Phase,
    /// Noises from the last `update`. Cleared at the start of the next one.
    pub sounds: Vec<Sound>,
    served: bool,
}

impl Default for Game {
    fn default() -> Self {
        Self::new()
    }
}

impl Game {
    pub fn new() -> Self {
        let mut game = Self {
            paddle_x: (SCREEN_W - PADDLE_W) / 2.0,
            ball_x: 0.0,
            ball_y: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            bricks: [[0; COLS]; ROWS],
            score: 0,
            lives: STARTING_LIVES,
            phase: Phase::Serving,
            sounds: Vec::new(),
            served: false,
        };
        game.rack();
        game.rest_ball();
        game
    }

    /// Refill the brick field. Row index becomes the colour, so the wall reads
    /// as bands the way the arcade original did.
    fn rack(&mut self) {
        for (row, cells) in self.bricks.iter_mut().enumerate() {
            for cell in cells.iter_mut() {
                *cell = row as u8 + 1;
            }
        }
    }

    fn rest_ball(&mut self) {
        self.ball_x = self.paddle_x + PADDLE_W / 2.0 - BALL / 2.0;
        self.ball_y = PADDLE_Y - BALL - 1.0;
        self.vel_x = 0.0;
        self.vel_y = 0.0;
        self.phase = Phase::Serving;
        self.served = false;
    }

    pub fn bricks_left(&self) -> usize {
        self.bricks.iter().flatten().filter(|&&b| b != 0).count()
    }

    /// Top-left corner of a brick cell, whether or not it is still there.
    pub fn brick_pos(row: usize, col: usize) -> (f32, f32) {
        (
            FIELD_X + col as f32 * BRICK_PITCH_X,
            FIELD_TOP + row as f32 * BRICK_PITCH_Y,
        )
    }

    /// Start again from the title state, keeping nothing.
    pub fn restart(&mut self) {
        *self = Self::new();
    }

    pub fn update(&mut self, dt: f32, input: &GamepadState) {
        self.sounds.clear();

        if matches!(self.phase, Phase::GameOver | Phase::Cleared) {
            if input.start || input.a {
                self.restart();
            }
            return;
        }

        // --- Paddle ---
        let mut dir = 0.0;
        if input.left {
            dir -= 1.0;
        }
        if input.right {
            dir += 1.0;
        }
        self.paddle_x += dir * PADDLE_SPEED * dt;
        self.paddle_x = self.paddle_x.clamp(WALL_L, WALL_R - PADDLE_W);

        if self.phase == Phase::Serving {
            self.ball_x = self.paddle_x + PADDLE_W / 2.0 - BALL / 2.0;
            self.ball_y = PADDLE_Y - BALL - 1.0;
            if input.a || input.start {
                // Serve at an angle, away from whichever wall is closer, so a
                // serve from the corner is not immediately a wall bounce.
                let toward_middle = if self.paddle_x < SCREEN_W / 2.0 {
                    1.0
                } else {
                    -1.0
                };
                self.vel_x = BALL_SPEED * 0.6 * toward_middle;
                self.vel_y = -BALL_SPEED;
                self.phase = Phase::Playing;
                self.served = true;
                self.sounds.push(Sound::Paddle);
            }
            return;
        }

        // --- Ball ---
        self.ball_x += self.vel_x * dt;
        self.ball_y += self.vel_y * dt;

        if self.ball_x <= WALL_L {
            self.ball_x = WALL_L;
            self.vel_x = self.vel_x.abs();
            self.sounds.push(Sound::Wall);
        } else if self.ball_x + BALL >= WALL_R {
            self.ball_x = WALL_R - BALL;
            self.vel_x = -self.vel_x.abs();
            self.sounds.push(Sound::Wall);
        }

        if self.ball_y <= CEILING {
            self.ball_y = CEILING;
            self.vel_y = self.vel_y.abs();
            self.sounds.push(Sound::Wall);
        }

        self.bounce_off_paddle();
        self.break_a_brick();

        if self.ball_y > SCREEN_H {
            self.lives = self.lives.saturating_sub(1);
            self.sounds.push(Sound::LostBall);
            if self.lives == 0 {
                self.phase = Phase::GameOver;
            } else {
                self.rest_ball();
            }
        }
    }

    fn bounce_off_paddle(&mut self) {
        if self.vel_y <= 0.0 {
            return;
        }
        let hits = self.ball_y + BALL >= PADDLE_Y
            && self.ball_y <= PADDLE_Y + PADDLE_H
            && self.ball_x + BALL >= self.paddle_x
            && self.ball_x <= self.paddle_x + PADDLE_W;
        if !hits {
            return;
        }

        self.ball_y = PADDLE_Y - BALL;
        // Where on the paddle it landed sets the angle: this is the whole of
        // the player's control over the ball, so it has to be the paddle's
        // geometry rather than a fixed reflection.
        let offset =
            (self.ball_x + BALL / 2.0 - (self.paddle_x + PADDLE_W / 2.0)) / (PADDLE_W / 2.0);
        let speed = (self.vel_x * self.vel_x + self.vel_y * self.vel_y).sqrt();
        let angle = offset.clamp(-1.0, 1.0) * 1.05;
        self.vel_x = speed * angle.sin();
        self.vel_y = -speed * angle.cos();
        self.sounds.push(Sound::Paddle);
    }

    fn break_a_brick(&mut self) {
        for row in 0..ROWS {
            for col in 0..COLS {
                if self.bricks[row][col] == 0 {
                    continue;
                }
                let (bx, by) = Self::brick_pos(row, col);
                let overlaps = self.ball_x + BALL > bx
                    && self.ball_x < bx + BRICK_W
                    && self.ball_y + BALL > by
                    && self.ball_y < by + BRICK_H;
                if !overlaps {
                    continue;
                }

                self.bricks[row][col] = 0;
                // Rows are worth more the higher up they are.
                self.score += (ROWS - row) as u32 * 10;
                self.sounds.push(Sound::Brick);

                // Bounce off the shallower axis of overlap, so a ball arriving
                // from the side is turned sideways rather than sent back down.
                let from_side = (self.ball_x + BALL / 2.0 - (bx + BRICK_W / 2.0)).abs()
                    / (BRICK_W / 2.0)
                    > (self.ball_y + BALL / 2.0 - (by + BRICK_H / 2.0)).abs() / (BRICK_H / 2.0);
                if from_side {
                    self.vel_x = -self.vel_x;
                } else {
                    self.vel_y = -self.vel_y;
                }

                self.vel_x *= SPEED_UP;
                self.vel_y *= SPEED_UP;

                if self.bricks_left() == 0 {
                    self.phase = Phase::Cleared;
                    self.sounds.push(Sound::Cleared);
                }
                return;
            }
        }
    }

    /// True once the player has served at least one ball this game.
    pub fn in_play(&self) -> bool {
        self.served
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn press(f: impl Fn(&mut GamepadState)) -> GamepadState {
        let mut pad = GamepadState::default();
        f(&mut pad);
        pad
    }

    /// Serve, then step until `stop` says so or the step budget runs out.
    fn play(game: &mut Game, steps: usize, stop: impl Fn(&Game) -> bool) -> usize {
        game.update(1.0 / 60.0, &press(|p| p.a = true));
        for step in 0..steps {
            if stop(game) {
                return step;
            }
            game.update(1.0 / 60.0, &GamepadState::default());
        }
        steps
    }

    #[test]
    fn a_new_game_is_a_full_wall_and_three_lives() {
        let game = Game::new();
        assert_eq!(game.bricks_left(), ROWS * COLS);
        assert_eq!(game.lives, STARTING_LIVES);
        assert_eq!(game.score, 0);
        assert_eq!(game.phase, Phase::Serving);
    }

    #[test]
    fn the_ball_rests_on_the_paddle_until_served() {
        let mut game = Game::new();
        for _ in 0..30 {
            game.update(1.0 / 60.0, &press(|p| p.right = true));
        }
        assert_eq!(game.phase, Phase::Serving);
        // It tracked the paddle rather than staying where it started.
        assert!((game.ball_x - (game.paddle_x + PADDLE_W / 2.0 - BALL / 2.0)).abs() < 0.01);
        assert!(!game.in_play());
    }

    #[test]
    fn pressing_a_serves() {
        let mut game = Game::new();
        game.update(1.0 / 60.0, &press(|p| p.a = true));
        assert_eq!(game.phase, Phase::Playing);
        assert!(game.vel_y < 0.0, "the ball should be going up");
        assert!(game.in_play());
    }

    #[test]
    fn the_paddle_stops_at_the_walls() {
        let mut game = Game::new();
        for _ in 0..600 {
            game.update(1.0 / 60.0, &press(|p| p.left = true));
        }
        assert!(
            (game.paddle_x - WALL_L).abs() < 0.01,
            "left wall: {}",
            game.paddle_x
        );

        for _ in 0..1200 {
            game.update(1.0 / 60.0, &press(|p| p.right = true));
        }
        assert!(
            (game.paddle_x - (WALL_R - PADDLE_W)).abs() < 0.01,
            "right wall: {}",
            game.paddle_x
        );
    }

    #[test]
    fn the_ball_bounces_off_the_ceiling_rather_than_leaving() {
        let mut game = Game::new();
        game.bricks = [[0; COLS]; ROWS]; // clear the wall so nothing intercepts
        game.phase = Phase::Playing;
        game.ball_x = 120.0;
        game.ball_y = CEILING + 1.0;
        game.vel_x = 0.0;
        game.vel_y = -BALL_SPEED;
        game.update(1.0 / 60.0, &GamepadState::default());
        assert!(game.ball_y >= CEILING);
        assert!(game.vel_y > 0.0, "should be heading back down");
        assert!(game.sounds.contains(&Sound::Wall));
    }

    #[test]
    fn the_ball_bounces_off_both_side_walls() {
        for (start_x, vel, name) in [
            (WALL_L + 1.0, -BALL_SPEED, "left"),
            (WALL_R - BALL - 1.0, BALL_SPEED, "right"),
        ] {
            let mut game = Game::new();
            game.bricks = [[0; COLS]; ROWS];
            game.phase = Phase::Playing;
            game.ball_x = start_x;
            game.ball_y = 120.0;
            game.vel_x = vel;
            game.vel_y = 0.0;
            game.update(1.0 / 60.0, &GamepadState::default());
            assert_eq!(game.vel_x.signum(), -vel.signum(), "{name} wall");
            assert!(
                game.ball_x >= WALL_L && game.ball_x + BALL <= WALL_R,
                "{name} wall"
            );
        }
    }

    #[test]
    fn the_paddle_sends_the_ball_back_up() {
        let mut game = Game::new();
        game.phase = Phase::Playing;
        game.paddle_x = 100.0;
        game.ball_x = 100.0 + PADDLE_W / 2.0;
        game.ball_y = PADDLE_Y - BALL;
        game.vel_x = 0.0;
        game.vel_y = BALL_SPEED;
        game.update(1.0 / 60.0, &GamepadState::default());
        assert!(game.vel_y < 0.0);
        assert!(game.sounds.contains(&Sound::Paddle));
    }

    #[test]
    fn where_it_lands_on_the_paddle_decides_the_angle() {
        // `offset` is measured from the paddle's centre to the ball's centre,
        // which is what the bounce reads — placing the ball's left edge there
        // instead is off by half a ball and makes a "centred" hit angled.
        let angle_from = |offset: f32| {
            let mut game = Game::new();
            game.phase = Phase::Playing;
            game.paddle_x = 100.0;
            game.ball_x = 100.0 + PADDLE_W / 2.0 - BALL / 2.0 + offset;
            game.ball_y = PADDLE_Y - BALL;
            game.vel_x = 0.0;
            game.vel_y = BALL_SPEED;
            game.update(1.0 / 60.0, &GamepadState::default());
            game.vel_x
        };

        let left = angle_from(-PADDLE_W / 2.0);
        let right = angle_from(PADDLE_W / 2.0);
        let centre = angle_from(0.0);

        // The whole of the player's control over the ball.
        assert!(left < -1.0, "left edge should send it left, got {left}");
        assert!(right > 1.0, "right edge should send it right, got {right}");
        assert!(
            centre.abs() < 1.0,
            "centre should go straight back, got {centre}"
        );
        assert!(
            left < centre && centre < right,
            "the angle should vary across the paddle"
        );
    }

    #[test]
    fn hitting_a_brick_removes_it_and_scores() {
        let mut game = Game::new();
        game.phase = Phase::Playing;
        let (bx, by) = Game::brick_pos(0, 0);
        game.ball_x = bx + 2.0;
        game.ball_y = by + 2.0;
        game.vel_x = 0.0;
        game.vel_y = -BALL_SPEED;
        game.update(1.0 / 60.0, &GamepadState::default());

        assert_eq!(game.bricks[0][0], 0);
        assert_eq!(game.bricks_left(), ROWS * COLS - 1);
        assert!(game.score > 0);
        assert!(game.sounds.contains(&Sound::Brick));
    }

    #[test]
    fn the_top_rows_are_worth_more() {
        let score_for = |row: usize| {
            let mut game = Game::new();
            game.phase = Phase::Playing;
            let (bx, by) = Game::brick_pos(row, 0);
            game.ball_x = bx + 2.0;
            game.ball_y = by + 2.0;
            game.vel_y = -BALL_SPEED;
            game.update(1.0 / 60.0, &GamepadState::default());
            game.score
        };
        assert!(score_for(0) > score_for(ROWS - 1));
    }

    #[test]
    fn only_one_brick_goes_per_step() {
        // Two bricks overlapping one ball position must not both vanish: the
        // bounce would cancel itself out and the ball would tunnel through.
        let mut game = Game::new();
        game.phase = Phase::Playing;
        let (bx, by) = Game::brick_pos(0, 0);
        game.ball_x = bx + BRICK_W - 1.0;
        game.ball_y = by + 2.0;
        game.vel_y = -BALL_SPEED;
        let before = game.bricks_left();
        game.update(1.0 / 60.0, &GamepadState::default());
        assert_eq!(before - game.bricks_left(), 1);
    }

    #[test]
    fn losing_the_ball_costs_a_life_and_re_serves() {
        let mut game = Game::new();
        game.phase = Phase::Playing;
        game.ball_y = SCREEN_H + 1.0;
        game.vel_y = BALL_SPEED;
        game.update(1.0 / 60.0, &GamepadState::default());

        assert_eq!(game.lives, STARTING_LIVES - 1);
        assert_eq!(game.phase, Phase::Serving);
        assert!(game.sounds.contains(&Sound::LostBall));
    }

    #[test]
    fn running_out_of_lives_ends_the_game() {
        let mut game = Game::new();
        game.lives = 1;
        game.phase = Phase::Playing;
        game.ball_y = SCREEN_H + 1.0;
        game.update(1.0 / 60.0, &GamepadState::default());
        assert_eq!(game.phase, Phase::GameOver);
        assert_eq!(game.lives, 0);
    }

    #[test]
    fn clearing_the_wall_wins() {
        let mut game = Game::new();
        game.bricks = [[0; COLS]; ROWS];
        game.bricks[0][0] = 1;
        game.phase = Phase::Playing;
        let (bx, by) = Game::brick_pos(0, 0);
        game.ball_x = bx + 2.0;
        game.ball_y = by + 2.0;
        game.vel_y = -BALL_SPEED;
        game.update(1.0 / 60.0, &GamepadState::default());

        assert_eq!(game.phase, Phase::Cleared);
        assert!(game.sounds.contains(&Sound::Cleared));
    }

    #[test]
    fn start_plays_again_after_a_loss() {
        let mut game = Game::new();
        game.phase = Phase::GameOver;
        game.score = 999;
        game.update(1.0 / 60.0, &press(|p| p.start = true));
        assert_eq!(game.phase, Phase::Serving);
        assert_eq!(game.score, 0);
        assert_eq!(game.bricks_left(), ROWS * COLS);
    }

    #[test]
    fn a_served_ball_stays_on_the_field() {
        // Two thousand steps with no input: the ball may be lost and re-served,
        // but it must never end up outside the playfield.
        let mut game = Game::new();
        play(&mut game, 2000, |g| {
            g.phase == Phase::GameOver || g.phase == Phase::Cleared
        });

        assert!(game.ball_x >= WALL_L - 1.0, "left: {}", game.ball_x);
        assert!(game.ball_x + BALL <= WALL_R + 1.0, "right: {}", game.ball_x);
        assert!(game.ball_y >= CEILING - 1.0, "ceiling: {}", game.ball_y);
    }

    #[test]
    fn the_ball_never_stalls_horizontally() {
        // A purely vertical ball is unwinnable: it can only ever hit the same
        // column. The serve angle is what prevents it.
        let mut game = Game::new();
        game.update(1.0 / 60.0, &press(|p| p.a = true));
        for _ in 0..600 {
            game.update(1.0 / 60.0, &GamepadState::default());
            if game.phase == Phase::Playing {
                assert!(game.vel_x.abs() > 0.5, "vel_x stalled at {}", game.vel_x);
            }
        }
    }

    #[test]
    fn the_ball_speeds_up_as_the_wall_comes_down() {
        let mut game = Game::new();
        game.update(1.0 / 60.0, &press(|p| p.a = true));
        let opening = (game.vel_x * game.vel_x + game.vel_y * game.vel_y).sqrt();

        for _ in 0..1500 {
            game.update(1.0 / 60.0, &GamepadState::default());
            if game.phase != Phase::Playing {
                game.update(1.0 / 60.0, &press(|p| p.a = true));
            }
        }
        let later = (game.vel_x * game.vel_x + game.vel_y * game.vel_y).sqrt();
        assert!(game.bricks_left() < ROWS * COLS, "no bricks were hit");
        assert!(later > opening, "{later} should exceed {opening}");
    }
}
