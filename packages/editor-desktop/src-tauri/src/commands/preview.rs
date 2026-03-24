use crate::state::AppStateWrapper;
use std::path::Path;
use std::process::Stdio;
use tauri::Window;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

fn kill_preview_process(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .output();
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

#[tauri::command]
pub async fn preview_game(
    project_dir: String,
    window: Window,
    state: tauri::State<'_, AppStateWrapper>,
) -> Result<String, String> {
    {
        let mut app_state = state.0.lock().map_err(|_| "Failed to lock app state".to_string())?;
        if let Some(pid) = app_state.preview_pid.take() {
            kill_preview_process(pid);
        }
    }

    let _ = window.emit("build-log", "Starting preview server...");

    if !Path::new(&project_dir).join("node_modules").exists() {
        let _ = window.emit("build-log", "Installing project dependencies with Bun...");
        let status = Command::new("bun")
            .arg("install")
            .current_dir(&project_dir)
            .status()
            .await
            .map_err(|e| format!("Failed to install dependencies: {}", e))?;

        if !status.success() {
            return Err("bun install failed".to_string());
        }
    }

    let mut child = Command::new("bun")
        .args(["x", "vite", "--host", "127.0.0.1", "--port", "4173"])
        .current_dir(&project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start preview: {}", e))?;

    let pid = child.id().unwrap_or_default();
    {
        let mut app_state = state.0.lock().map_err(|_| "Failed to lock app state".to_string())?;
        app_state.preview_pid = Some(pid);
    }

    if let Some(stdout) = child.stdout.take() {
        let window_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = window_clone.emit("build-log", &line);
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let window_clone = window.clone();
        tauri::async_runtime::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = window_clone.emit("build-log", &line);
            }
        });
    }

    tauri::async_runtime::spawn(async move {
        let _ = child.wait().await;
    });

    let url = "http://127.0.0.1:4173".to_string();
    let _ = window.emit("preview-ready", &url);
    Ok(url)
}
