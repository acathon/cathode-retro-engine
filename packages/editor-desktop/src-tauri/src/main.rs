#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod commands;
mod state;

use state::AppStateWrapper;

fn main() {
    tauri::Builder::default()
        .manage(AppStateWrapper::new())
        .invoke_handler(tauri::generate_handler![
            // File system
            commands::fs::open_project,
            commands::fs::save_project,
            commands::fs::new_project,
            commands::fs::read_scene,
            commands::fs::write_scene,
            commands::fs::list_assets,
            commands::fs::read_script,
            commands::fs::write_script,
            commands::fs::copy_file,
            // Build
            commands::build::build_wasm,
            commands::build::build_bundle,
            // Preview
            commands::preview::preview_game,
            // Export
            commands::export::export_web,
            commands::export::export_desktop,
            commands::export::export_rom_ready,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
