use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RetroProject {
    pub name: String,
    pub version: String,
    pub preset: String,
    pub resolution: Resolution,
    #[serde(rename = "targetFps")]
    pub target_fps: u32,
    #[serde(rename = "audioChannels")]
    pub audio_channels: u32,
    #[serde(rename = "spriteLimit")]
    pub sprite_limit: u32,
    pub scanlines: bool,
    #[serde(rename = "entryScene")]
    pub entry_scene: String,
    #[serde(rename = "exportTargets", default)]
    pub export_targets: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetInfo {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub asset_type: String,
    pub size: u64,
}

fn preset_project(name: &str, preset: &str) -> RetroProject {
    let (w, h) = match preset {
        "gameboy" => (160, 144),
        "nes" => (256, 240),
        "neogeo" => (320, 224),
        _ => (256, 240),
    };
    RetroProject {
        name: name.to_string(),
        version: "0.1.0".to_string(),
        preset: preset.to_string(),
        resolution: Resolution {
            width: w,
            height: h,
        },
        target_fps: 60,
        audio_channels: 4,
        sprite_limit: 64,
        scanlines: false,
        entry_scene: "scenes/main.scene.json".to_string(),
        export_targets: vec!["web".to_string()],
    }
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn sdk_dependency_path() -> String {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let sdk_path = manifest_dir
        .join("../../..")
        .join("packages")
        .join("sdk")
        .canonicalize()
        .unwrap_or_else(|_| manifest_dir.join("../../..").join("packages").join("sdk"));
    format!("file:{}", normalize_path(&sdk_path))
}

fn starter_main_ts(preset: &str, project_name: &str) -> String {
    let ctor = match preset {
        "gameboy" => "gameboy",
        "neogeo" => "neogeo",
        _ => "nes",
    };

    format!(
        "import {{ BitmapFont, RetroEngine, Scene, Sprite }} from '@retro-engine/sdk';\n\nconst canvas = document.getElementById('game') as HTMLCanvasElement;\n\nfunction hash(text: string): number {{\n  let value = 0;\n  for (let i = 0; i < text.length; i += 1) {{\n    value = (value * 31 + text.charCodeAt(i)) >>> 0;\n  }}\n  return value;\n}}\n\nfunction createPreviewSheet(engine: RetroEngine): number {{\n  const tileSize = 8;\n  const cols = 4;\n  const rows = 4;\n  const sheetCanvas = document.createElement('canvas');\n  sheetCanvas.width = cols * tileSize;\n  sheetCanvas.height = rows * tileSize;\n\n  const ctx = sheetCanvas.getContext('2d')!;\n  const colors = [\n    '#9bbc0f', '#8bac0f', '#306230', '#0f380f',\n    '#7c3aed', '#f97316', '#22c55e', '#eab308',\n    '#38bdf8', '#ef4444', '#f472b6', '#a855f7',\n    '#14b8a6', '#84cc16', '#f59e0b', '#64748b',\n  ];\n\n  colors.forEach((color, index) => {{\n    const x = (index % cols) * tileSize;\n    const y = Math.floor(index / cols) * tileSize;\n    ctx.fillStyle = color;\n    ctx.fillRect(x, y, tileSize, tileSize);\n    ctx.fillStyle = 'rgba(255,255,255,0.28)';\n    ctx.fillRect(x + 1, y + 1, tileSize - 2, 2);\n    ctx.fillStyle = 'rgba(0,0,0,0.28)';\n    ctx.fillRect(x + 1, y + tileSize - 3, tileSize - 2, 2);\n  }});\n\n  return engine.loadSheetFromCanvas(sheetCanvas, tileSize, tileSize);\n}}\n\ntype SceneFile = {{\n  name: string;\n  entities: Array<{{\n    id: string;\n    name: string;\n    x: number;\n    y: number;\n    frame?: number;\n    layer?: number;\n    visible?: boolean;\n    collider?: {{ offsetX: number; offsetY: number; w: number; h: number }};\n  }}>;\n  camera: {{ x: number; y: number; lerp: number }};\n  bgColor: [number, number, number];\n}};\n\nasync function bootstrap() {{\n  const engine = await RetroEngine.{ctor}(canvas, 3);\n  const runtimeScene = new Scene(engine);\n  const font = BitmapFont.builtin(engine);\n  const sheet = createPreviewSheet(engine);\n  const sprites = new Map<string, Sprite>();\n  let sceneData: SceneFile | null = null;\n  let lastSceneSignature = '';\n  let timeSinceSync = 0;\n\n  async function loadScene() {{\n    const project = await fetch(`/retro.project.json?t=${{Date.now()}}`).then((res) => res.json());\n    const nextScene = await fetch(`/${{project.entryScene}}?t=${{Date.now()}}`).then((res) => res.json()) as SceneFile;\n    const signature = JSON.stringify(nextScene);\n    if (signature === lastSceneSignature) return;\n    lastSceneSignature = signature;\n    sceneData = nextScene;\n\n    const liveIds = new Set(nextScene.entities.filter((entity) => entity.visible !== false).map((entity) => entity.id));\n    for (const [id, sprite] of sprites) {{\n      if (!liveIds.has(id)) {{\n        sprite.destroy();\n        sprites.delete(id);\n      }}\n    }}\n\n    for (const entity of nextScene.entities) {{\n      if (entity.visible === false) continue;\n      const frame = typeof entity.frame === 'number' ? Math.abs(entity.frame) % 16 : hash(entity.name) % 16;\n      const layer = entity.layer ?? 0;\n      const existing = sprites.get(entity.id);\n      if (!existing) {{\n        sprites.set(entity.id, new Sprite(runtimeScene, {{\n          x: entity.x,\n          y: entity.y,\n          sheet,\n          frame,\n          layer,\n        }}));\n        continue;\n      }}\n\n      existing.x = entity.x;\n      existing.y = entity.y;\n      existing.frame = frame;\n    }}\n\n    engine.setBgColor(nextScene.bgColor[0], nextScene.bgColor[1], nextScene.bgColor[2]);\n    engine.setCamera(nextScene.camera.x, nextScene.camera.y);\n  }}\n\n  await loadScene();\n\n  engine.loop((dt) => {{\n    timeSinceSync += dt;\n    if (timeSinceSync >= 0.5) {{\n      timeSinceSync = 0;\n      void loadScene();\n    }}\n\n    runtimeScene.update(dt);\n\n    if (sceneData) {{\n      font.draw(sceneData.name || '{project_name}', 4, 4, 1);\n      font.draw(`ENTITIES ${{sceneData.entities.filter((entity) => entity.visible !== false).length}}`, 4, 14, 1);\n      font.draw('LIVE PREVIEW', 4, engine.height - 12, 1);\n    }} else {{\n      font.draw('{project_name}', 4, 4, 1);\n      font.draw('LOADING SCENE...', 4, 14, 1);\n    }}\n  }});\n}}\n\nbootstrap();\n"
    )
}

#[tauri::command]
pub async fn open_project(path: String) -> Result<RetroProject, String> {
    let project_file = Path::new(&path).join("retro.project.json");
    let content = std::fs::read_to_string(&project_file)
        .map_err(|e| format!("Failed to read project file: {}", e))?;
    let project: RetroProject =
        serde_json::from_str(&content).map_err(|e| format!("Invalid project JSON: {}", e))?;
    Ok(project)
}

#[tauri::command]
pub async fn save_project(path: String, project: RetroProject) -> Result<(), String> {
    let project_file = Path::new(&path).join("retro.project.json");
    let content =
        serde_json::to_string_pretty(&project).map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(&project_file, content)
        .map_err(|e| format!("Failed to write project file: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn new_project(
    path: String,
    name: String,
    preset: String,
) -> Result<RetroProject, String> {
    let project_dir = Path::new(&path);
    std::fs::create_dir_all(project_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Create subdirectories
    for sub in &[
        "src",
        "assets/sprites",
        "assets/maps",
        "assets/audio",
        "scenes",
        "scripts",
        "music",
    ] {
        std::fs::create_dir_all(project_dir.join(sub))
            .map_err(|e| format!("Failed to create {}: {}", sub, e))?;
    }

    let project = preset_project(&name, &preset);

    // Write project file
    let content =
        serde_json::to_string_pretty(&project).map_err(|e| format!("Serialize error: {}", e))?;
    std::fs::write(project_dir.join("retro.project.json"), content)
        .map_err(|e| format!("Write error: {}", e))?;

    let package_json = serde_json::json!({
        "name": name,
        "private": true,
        "version": "0.1.0",
        "type": "module",
        "scripts": {
            "dev": "vite",
            "build": "vite build",
            "preview": "vite preview"
        },
        "dependencies": {
            "@retro-engine/sdk": sdk_dependency_path()
        },
        "devDependencies": {
            "typescript": "^5.5.0",
            "vite": "^5.3.0"
        }
    });
    std::fs::write(
        project_dir.join("package.json"),
        serde_json::to_string_pretty(&package_json)
            .map_err(|e| format!("Package serialize error: {}", e))?,
    )
    .map_err(|e| format!("Write package.json error: {}", e))?;

    std::fs::write(
        project_dir.join("tsconfig.json"),
        r#"{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
"#,
    )
    .map_err(|e| format!("Write tsconfig error: {}", e))?;

    std::fs::write(
        project_dir.join("vite.config.ts"),
        r#"import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
});
"#,
    )
    .map_err(|e| format!("Write vite config error: {}", e))?;

    std::fs::write(
        project_dir.join("index.html"),
        format!(
            "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>{}</title>\n    <style>\n      body {{\n        margin: 0;\n        min-height: 100vh;\n        display: grid;\n        place-items: center;\n        background: #111;\n      }}\n\n      canvas {{\n        image-rendering: pixelated;\n        image-rendering: crisp-edges;\n      }}\n    </style>\n  </head>\n  <body>\n    <canvas id=\"game\"></canvas>\n    <script type=\"module\" src=\"/src/main.ts\"></script>\n  </body>\n</html>\n",
            name
        ),
    )
    .map_err(|e| format!("Write index.html error: {}", e))?;

    std::fs::write(
        project_dir.join("src/main.ts"),
        starter_main_ts(&preset, &name),
    )
    .map_err(|e| format!("Write src/main.ts error: {}", e))?;

    std::fs::write(
        project_dir.join("scripts/player.ts"),
        "export function updatePlayer() {\n  // Attach gameplay logic here.\n}\n",
    )
    .map_err(|e| format!("Write player script error: {}", e))?;

    std::fs::write(
        project_dir.join("music/theme.mml"),
        "C4:8 E4:8 G4:8 C5:8 | G4:8 E4:8 C4:4",
    )
    .map_err(|e| format!("Write music file error: {}", e))?;

    std::fs::write(
        project_dir.join(".gitignore"),
        "node_modules\ndist\n.vite\n",
    )
    .map_err(|e| format!("Write .gitignore error: {}", e))?;

    // Write default scene
    let scene = serde_json::json!({
        "name": "Main Scene",
        "entities": [],
        "tileMaps": [],
        "camera": { "x": 0, "y": 0, "lerp": 0.1 },
        "bgColor": [0, 0, 0]
    });
    std::fs::write(
        project_dir.join("scenes/main.scene.json"),
        serde_json::to_string_pretty(&scene).unwrap(),
    )
    .map_err(|e| format!("Write scene error: {}", e))?;

    Ok(project)
}

#[tauri::command]
pub async fn read_scene(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read scene: {}", e))
}

#[tauri::command]
pub async fn write_scene(path: String, json: String) -> Result<(), String> {
    // Validate JSON before writing
    let _: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    std::fs::write(&path, &json).map_err(|e| format!("Failed to write scene: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn list_assets(project_dir: String) -> Result<Vec<AssetInfo>, String> {
    let project_root = Path::new(&project_dir);
    let assets_dir = project_root.join("assets");
    let mut results = Vec::new();

    if assets_dir.exists() {
        collect_assets(&assets_dir, project_root, &mut results)?;
    }

    // Also list scripts
    let scripts_dir = project_root.join("scripts");
    if scripts_dir.exists() {
        collect_assets(&scripts_dir, project_root, &mut results)?;
    }

    // Also list scenes
    let scenes_dir = project_root.join("scenes");
    if scenes_dir.exists() {
        collect_assets(&scenes_dir, project_root, &mut results)?;
    }

    let music_dir = project_root.join("music");
    if music_dir.exists() {
        collect_assets(&music_dir, project_root, &mut results)?;
    }

    Ok(results)
}

fn collect_assets(
    dir: &Path,
    project_root: &Path,
    results: &mut Vec<AssetInfo>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read dir {}: {}", dir.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
        let ft = entry
            .file_type()
            .map_err(|e| format!("File type error: {}", e))?;
        let path = entry.path();

        if ft.is_dir() {
            collect_assets(&path, project_root, results)?;
        } else if ft.is_file() {
            let rel = path.strip_prefix(project_root).unwrap_or(&path);
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let asset_type = match ext {
                "png" | "jpg" | "jpeg" | "bmp" => "sprite",
                "json" if rel.to_string_lossy().contains("scene") => "scene",
                "json" => "map",
                "ts" | "js" => "script",
                "mml" => "music",
                "wav" | "mp3" | "ogg" => "audio",
                _ => "other",
            };

            let metadata =
                std::fs::metadata(&path).map_err(|e| format!("Metadata error: {}", e))?;

            results.push(AssetInfo {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                path: rel.to_string_lossy().to_string(),
                asset_type: asset_type.to_string(),
                size: metadata.len(),
            });
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn read_script(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read script: {}", e))
}

#[tauri::command]
pub async fn write_script(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("Failed to write script: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn copy_file(src: String, dest: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&dest).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    std::fs::copy(&src, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(())
}
