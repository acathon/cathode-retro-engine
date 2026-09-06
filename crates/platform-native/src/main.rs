use cathode_core::config::EngineConfig;
use cathode_core::ecs::GamepadState;
use cathode_core::renderer::tilemap::TileMap;
use cathode_core::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use gilrs::{Button, Event as GilrsEvent, Gilrs};
use pixels::{Pixels, SurfaceTexture};
use std::env;
use std::sync::{Arc, Mutex};
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

    let engine = Arc::new(Mutex::new(Engine::new(config.clone())));

    // Demo scene setup
    {
        let mut eng = engine.lock().unwrap();
        let mut pixels_data = vec![0u8; 64 * 4];
        for i in 0..64 {
            let (r, g, b, a) = if (i % 8 + i / 8) % 2 == 0 {
                (255, 0, 255, 255)
            } else {
                (0, 0, 0, 255)
            };
            pixels_data[i * 4] = r;
            pixels_data[i * 4 + 1] = g;
            pixels_data[i * 4 + 2] = b;
            pixels_data[i * 4 + 3] = a;
        }

        let sheet = cathode_core::assets::SpriteSheet::from_rgba(8, 8, 8, 8, pixels_data);
        let sheet_handle = eng.assets.add_sheet(sheet);

        let mut map = TileMap::new("Demo".to_string(), 10, 10, 8, 8);
        let layer = map.add_layer("Background".to_string(), sheet_handle, false);
        for row in 0..10 {
            for col in 0..10 {
                map.set_tile(layer, col, row, 1);
            }
        }
        eng.renderer.tilemaps.push(map);
    }

    // Setup CPAL audio
    let audio_engine = Arc::clone(&engine);
    let _audio_stream = setup_cpal_audio(audio_engine);

    // Setup gilrs
    let mut gilrs = Gilrs::new().ok();

    let mut last_update = Instant::now();
    let mut gamepad = GamepadState::default();
    let mut gamepad_hw = GamepadState::default();

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;

        // Poll gilrs events
        if let Some(ref mut g) = gilrs {
            while let Some(GilrsEvent { id: _, event, .. }) = g.next_event() {
                match event {
                    gilrs::EventType::ButtonPressed(btn, _) => {
                        map_gilrs_button(&mut gamepad_hw, btn, true);
                    }
                    gilrs::EventType::ButtonReleased(btn, _) => {
                        map_gilrs_button(&mut gamepad_hw, btn, false);
                    }
                    _ => {}
                }
            }
        }

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

                // Merge keyboard and gamepad inputs
                let merged = merge_gamepads(&gamepad, &gamepad_hw);

                let mut eng = engine.lock().unwrap();
                eng.input.set_state(0, merged);
                eng.update(dt);
                window.request_redraw();
            }
            Event::RedrawRequested(_) => {
                let frame = pixels.frame_mut();
                let mut eng = engine.lock().unwrap();
                let engine_fb = eng.render();
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

fn setup_cpal_audio(engine: Arc<Mutex<Engine>>) -> Option<cpal::Stream> {
    let host = cpal::default_host();
    let device = host.default_output_device()?;
    let supported_config = device.default_output_config().ok()?;
    let sample_rate = supported_config.sample_rate().0;

    {
        let mut eng = engine.lock().unwrap();
        eng.audio.sample_rate = sample_rate as f32;
    }

    let stream = device
        .build_output_stream(
            &cpal::StreamConfig {
                channels: 2,
                sample_rate: cpal::SampleRate(sample_rate),
                buffer_size: cpal::BufferSize::Default,
            },
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                if let Ok(mut eng) = engine.lock() {
                    eng.audio.fill_stereo(data);
                } else {
                    data.fill(0.0);
                }
            },
            |err| {
                eprintln!("Audio stream error: {}", err);
            },
            None,
        )
        .ok()?;

    stream.play().ok()?;
    Some(stream)
}

fn map_gilrs_button(state: &mut GamepadState, btn: Button, pressed: bool) {
    match btn {
        Button::South => state.a = pressed,
        Button::East => state.b = pressed,
        Button::West => state.y = pressed,
        Button::North => state.x = pressed,
        Button::DPadUp => state.up = pressed,
        Button::DPadDown => state.down = pressed,
        Button::DPadLeft => state.left = pressed,
        Button::DPadRight => state.right = pressed,
        Button::Start => state.start = pressed,
        Button::Select => state.select = pressed,
        Button::LeftTrigger => state.l = pressed,
        Button::RightTrigger => state.r = pressed,
        _ => {}
    }
}

fn merge_gamepads(kbd: &GamepadState, hw: &GamepadState) -> GamepadState {
    GamepadState {
        up: kbd.up || hw.up,
        down: kbd.down || hw.down,
        left: kbd.left || hw.left,
        right: kbd.right || hw.right,
        a: kbd.a || hw.a,
        b: kbd.b || hw.b,
        x: kbd.x || hw.x,
        y: kbd.y || hw.y,
        start: kbd.start || hw.start,
        select: kbd.select || hw.select,
        l: kbd.l || hw.l,
        r: kbd.r || hw.r,
    }
}
