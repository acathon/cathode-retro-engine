use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct AppState {
    pub project_path: Option<String>,
    pub project_name: Option<String>,
    pub recent_projects: Vec<String>,
    pub preview_pid: Option<u32>,
}

pub struct AppStateWrapper(pub Mutex<AppState>);

impl AppStateWrapper {
    pub fn new() -> Self {
        Self(Mutex::new(AppState::default()))
    }
}
