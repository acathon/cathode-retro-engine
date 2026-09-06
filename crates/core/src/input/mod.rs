use crate::ecs::GamepadState;

#[derive(Debug, Clone, Copy)]
pub enum Button {
    Up,
    Down,
    Left,
    Right,
    A,
    B,
    X,
    Y,
    Start,
    Select,
    L,
    R,
}

#[derive(Default, Debug, Clone)]
pub struct InputState {
    pub players: [GamepadState; 2],
    pub prev_players: [GamepadState; 2],
}

impl InputState {
    pub fn set_state(&mut self, idx: usize, state: GamepadState) {
        if idx < 2 {
            self.players[idx] = state;
        }
    }

    fn check_btn(state: &GamepadState, btn: Button) -> bool {
        match btn {
            Button::Up => state.up,
            Button::Down => state.down,
            Button::Left => state.left,
            Button::Right => state.right,
            Button::A => state.a,
            Button::B => state.b,
            Button::X => state.x,
            Button::Y => state.y,
            Button::Start => state.start,
            Button::Select => state.select,
            Button::L => state.l,
            Button::R => state.r,
        }
    }

    pub fn just_pressed(&self, idx: usize, btn: Button) -> bool {
        if idx < 2 {
            Self::check_btn(&self.players[idx], btn)
                && !Self::check_btn(&self.prev_players[idx], btn)
        } else {
            false
        }
    }

    pub fn just_released(&self, idx: usize, btn: Button) -> bool {
        if idx < 2 {
            !Self::check_btn(&self.players[idx], btn)
                && Self::check_btn(&self.prev_players[idx], btn)
        } else {
            false
        }
    }

    pub fn held(&self, idx: usize, btn: Button) -> bool {
        if idx < 2 {
            Self::check_btn(&self.players[idx], btn)
        } else {
            false
        }
    }

    pub fn end_frame(&mut self) {
        self.prev_players = self.players;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pressing_a() -> GamepadState {
        GamepadState {
            a: true,
            ..Default::default()
        }
    }

    #[test]
    fn nothing_is_pressed_on_a_fresh_input_state() {
        let input = InputState::default();
        assert!(!input.held(0, Button::A));
        assert!(!input.just_pressed(0, Button::A));
        assert!(!input.just_released(0, Button::A));
    }

    #[test]
    fn a_button_press_is_edge_triggered_for_exactly_one_frame() {
        let mut input = InputState::default();

        // Frame 1: the button goes down.
        input.set_state(0, pressing_a());
        assert!(input.held(0, Button::A));
        assert!(input.just_pressed(0, Button::A));
        assert!(!input.just_released(0, Button::A));

        // Frame 2: still held, but no longer a fresh press.
        input.end_frame();
        assert!(input.held(0, Button::A));
        assert!(!input.just_pressed(0, Button::A), "press must not repeat");
    }

    #[test]
    fn a_button_release_is_edge_triggered_too() {
        let mut input = InputState::default();
        input.set_state(0, pressing_a());
        input.end_frame();

        input.set_state(0, GamepadState::default());
        assert!(!input.held(0, Button::A));
        assert!(input.just_released(0, Button::A));

        input.end_frame();
        assert!(
            !input.just_released(0, Button::A),
            "release must not repeat"
        );
    }

    #[test]
    fn players_have_independent_state() {
        let mut input = InputState::default();
        input.set_state(1, pressing_a());

        assert!(!input.held(0, Button::A));
        assert!(input.held(1, Button::A));
        assert!(input.just_pressed(1, Button::A));
    }

    #[test]
    fn out_of_range_players_read_false_and_ignore_writes() {
        let mut input = InputState::default();
        input.set_state(9, pressing_a()); // ignored, must not panic
        assert!(!input.held(9, Button::A));
        assert!(!input.just_pressed(9, Button::A));
        assert!(!input.just_released(9, Button::A));
    }

    #[test]
    fn every_button_maps_to_its_own_field() {
        /// A button paired with the setter for the field it should drive.
        type ButtonCase = (Button, fn(&mut GamepadState));

        let cases: [ButtonCase; 12] = [
            (Button::Up, |s| s.up = true),
            (Button::Down, |s| s.down = true),
            (Button::Left, |s| s.left = true),
            (Button::Right, |s| s.right = true),
            (Button::A, |s| s.a = true),
            (Button::B, |s| s.b = true),
            (Button::X, |s| s.x = true),
            (Button::Y, |s| s.y = true),
            (Button::Start, |s| s.start = true),
            (Button::Select, |s| s.select = true),
            (Button::L, |s| s.l = true),
            (Button::R, |s| s.r = true),
        ];

        for (button, set) in cases {
            let mut state = GamepadState::default();
            set(&mut state);

            let mut input = InputState::default();
            input.set_state(0, state);
            assert!(input.held(0, button), "{button:?} did not register");
        }
    }
}
