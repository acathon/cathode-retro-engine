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
            Self::check_btn(&self.players[idx], btn) && !Self::check_btn(&self.prev_players[idx], btn)
        } else {
            false
        }
    }

    pub fn just_released(&self, idx: usize, btn: Button) -> bool {
        if idx < 2 {
            !Self::check_btn(&self.players[idx], btn) && Self::check_btn(&self.prev_players[idx], btn)
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
