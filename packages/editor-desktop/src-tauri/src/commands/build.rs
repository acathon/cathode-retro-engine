use std::path::Path;
use tauri::Window;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[tauri::command]
pub async fn build_wasm(project_dir: String, release: bool, window: Window) -> Result<(), String> {
    let mut args = vec![
        "build".to_string(),
        "-p".to_string(),
        "cathode-platform-web".to_string(),
        "--target".to_string(),
        "wasm32-unknown-unknown".to_string(),
    ];
    if release {
        args.push("--release".to_string());
    }

    let _ = window.emit("build-log", "Starting WASM build...");

    let mut child = Command::new("cargo")
        .args(&args)
        .current_dir(&project_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start cargo: {}", e))?;

    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = window.emit("build-log", &line);
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Build process error: {}", e))?;

    if !status.success() {
        let _ = window.emit("build-log", "WASM build FAILED");
        return Err("WASM build failed".to_string());
    }

    let _ = window.emit("build-log", "WASM build complete!");
    Ok(())
}

#[tauri::command]
pub async fn build_bundle(project_dir: String, window: Window) -> Result<(), String> {
    let _ = window.emit("build-log", "Running Vite build...");

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
        .args(["x", "vite", "build"])
        .current_dir(&project_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start vite: {}", e))?;

    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = window.emit("build-log", &line);
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Vite process error: {}", e))?;

    if !status.success() {
        let _ = window.emit("build-log", "Vite build FAILED");
        return Err("Vite build failed".to_string());
    }

    let _ = window.emit("build-log", "Bundle build complete!");
    Ok(())
}
