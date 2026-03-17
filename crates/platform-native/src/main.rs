use pixels::{Pixels, SurfaceTexture};
use retro_core::config::EngineConfig;
use retro_core::ecs::GamepadState;
use retro_core::renderer::tilemap::TileMap;
use retro_core::Engine;
use std::env;
use std::time::Instant;
use winit::dpi::LogicalSize;
use winit::event::{ElementState, Event, VirtualKeyCode, WindowEvent};
use winit::event_loop::{ControlFlow, EventLoop};
use winit::window::WindowBuilder;

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut config = EngineConfig::default();

    if let Some(preset) = args.get(1) {
        match preset.as_str() {
            "--preset=gameboy" => config = EngineConfig::gameboy(),
            "--preset=nes" => config = EngineConfig::nes(),
            "--preset=neogeo" => config = EngineConfig::neogeo(),
            _ => println!("Unknown preset, defaulting to NES"),
        }
    }

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title(&config.title)
        .with_inner_size(LogicalSize::new(
            config.width as f64 * 4.0,
            config.height as f64 * 4.0,
        ))
        .build(&event_loop)
        .expect("Failed to build window");

    let mut pixels = {
        let window_size = window.inner_size();
        let surface_texture = SurfaceTexture::new(window_size.width, window_size.height, &window);
        Pixels::new(config.width, config.height, surface_texture)
            .expect("Failed to create pixel buffer")
    };

    let mut engine = Engine::new(config.clone());

    // Demo scene setup
    let mut pixels_data = vec![0u8; 64 * 4];
    for i in 0..64 {
        let (r, g, b, a) = if (i % 8 + i / 8) % 2 == 0 {
            (255, 0, 255, 255) // Magenta
        } else {
            (0, 0, 0, 255) // Black
        };
        pixels_data[i * 4] = r;
        pixels_data[i * 4 + 1] = g;
        pixels_data[i * 4 + 2] = b;
        pixels_data[i * 4 + 3] = a;
    }

    let sheet = retro_core::assets::SpriteSheet::from_rgba(8, 8, 8, 8, pixels_data);
    let sheet_handle = engine.assets.add_sheet(sheet);

    let mut map = TileMap::new("Demo".to_string(), 10, 10, 8, 8);
    let layer = map.add_layer("Background".to_string(), sheet_handle, false);
    for row in 0..10 {
        for col in 0..10 {
            map.set_tile(layer, col, row, 1);
        }
    }
    engine.renderer.tilemaps.push(map);

    let mut last_update = Instant::now();
    let mut gamepad = GamepadState::default();

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;

        match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => *control_flow = ControlFlow::Exit,
                WindowEvent::KeyboardInput { input, .. } => {
                    if let Some(keycode) = input.virtual_keycode {
                        let is_pressed = input.state == ElementState::Pressed;
                        match keycode {
                            VirtualKeyCode::Up => gamepad.up = is_pressed,
                            VirtualKeyCode::Down => gamepad.down = is_pressed,
                            VirtualKeyCode::Left => gamepad.left = is_pressed,
                            VirtualKeyCode::Right => gamepad.right = is_pressed,
                            VirtualKeyCode::Z => gamepad.a = is_pressed,
                            VirtualKeyCode::X => gamepad.b = is_pressed,
                            VirtualKeyCode::A => gamepad.y = is_pressed,
                            VirtualKeyCode::S => gamepad.x = is_pressed,
                            VirtualKeyCode::Q => gamepad.l = is_pressed,
                            VirtualKeyCode::W => gamepad.r = is_pressed,
                            VirtualKeyCode::Return => gamepad.start = is_pressed,
                            VirtualKeyCode::RShift => gamepad.select = is_pressed,
                            _ => {}
                        }
                    }
                }
                WindowEvent::Resized(size) => {
                    if let Err(err) = pixels.resize_surface(size.width, size.height) {
                        println!("pixels.resize_surface error: {}", err);
                        *control_flow = ControlFlow::Exit;
                    }
                }
                _ => {}
            },
            Event::MainEventsCleared => {
                let now = Instant::now();
                let dt = now.duration_since(last_update).as_secs_f32();
                last_update = now;

                engine.input.set_state(0, gamepad);
                engine.update(dt);
                window.request_redraw();
            }
            Event::RedrawRequested(_) => {
                let frame = pixels.frame_mut();
                let engine_fb = engine.render();
                frame.copy_from_slice(&engine_fb.pixels);

                if let Err(err) = pixels.render() {
                    println!("pixels.render error: {}", err);
                    *control_flow = ControlFlow::Exit;
                }
            }
            _ => {}
        }
    });
}
