//! CATHODE BRICKS — the desktop runtime, as a playable game.
//!
//! Two ways to run:
//!
//!     cathode-native                       a window, at whatever preset
//!     cathode-native --preset=gameboy      ...on another machine's look
//!     cathode-native --headless 600 --shot shot.png
//!
//! The headless path runs the same game with no window and no GPU and writes
//! the framebuffer to a PNG. It exists because a native binary has no
//! equivalent of opening a browser and looking: without it there is no way to
//! check a build still draws the right thing, and no way to run this anywhere
//! that lacks a graphics stack.

mod app;
mod breakout;

use app::App;
use cathode_core::config::EngineConfig;
use cathode_core::ecs::GamepadState;
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

    let config = args
        .iter()
        .find_map(|arg| arg.strip_prefix("--preset="))
        .map(|name| match name {
            "gameboy" => EngineConfig::gameboy(),
            "neogeo" => EngineConfig::neogeo(),
            "dos" => EngineConfig::dos(),
            "nes" => EngineConfig::nes(),
            other => {
                eprintln!("unknown preset {other:?}; using nes");
                EngineConfig::nes()
            }
        })
        .unwrap_or_else(EngineConfig::nes);

    let value_of = |flag: &str| -> Option<String> {
        let at = args.iter().position(|a| a == flag)?;
        args.get(at + 1).cloned()
    };

    if let Some(frames) = value_of("--headless") {
        let frames: u32 = frames.parse().unwrap_or(600);
        let shot = value_of("--shot");
        run_headless(config, frames, shot.as_deref());
        return;
    }

    run_windowed(config);
}

/// Play the game for `frames` frames with nothing attached, then optionally
/// write the last frame out as a PNG.
fn run_headless(config: EngineConfig, frames: u32, shot: Option<&str>) {
    let (width, height) = (config.width, config.height);
    let mut app = App::new(config);
    let dt = 1.0 / 60.0;

    // One render per step, and the frame we keep is the last one in the loop.
    //
    // `render` drains the text queued during a step, so it pairs with a step
    // exactly once. Stepping many times before a single render draws every
    // frame's HUD on top of itself — the score came out as solid blocks where
    // the digits had changed. Rendering once more afterwards has the opposite
    // problem: the queue is empty, so that frame has no HUD at all.
    let mut pixels = Vec::new();
    for frame in 0..frames {
        let input = app.demo_input();
        app.step(dt, &input);
        let rendered = app.render();
        if frame + 1 == frames {
            pixels = rendered.pixels.clone();
        }
    }
    println!(
        "{frames} frames at {width}x{height} — score {}, {} bricks left, {} balls",
        app.game.score,
        app.game.bricks_left(),
        app.game.lives
    );

    let Some(path) = shot else { return };
    match write_png(path, width, height, &pixels) {
        Ok(()) => println!("wrote {path}"),
        Err(err) => {
            eprintln!("could not write {path}: {err}");
            std::process::exit(1);
        }
    }
}

fn write_png(path: &str, width: u32, height: u32, rgba: &[u8]) -> std::io::Result<()> {
    let file = std::fs::File::create(path)?;
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder
        .write_header()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    writer
        .write_image_data(rgba)
        .map_err(|e| std::io::Error::other(e.to_string()))
}

fn run_windowed(config: EngineConfig) {
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title(&config.title)
        .with_inner_size(LogicalSize::new(
            config.width as f64 * 3.0,
            config.height as f64 * 3.0,
        ))
        .build(&event_loop)
        .expect("Failed to build window");

    let pixels = {
        let window_size = window.inner_size();
        let surface_texture = SurfaceTexture::new(window_size.width, window_size.height, &window);
        match Pixels::new(config.width, config.height, surface_texture) {
            Ok(pixels) => pixels,
            Err(err) => {
                // A backtrace is not a useful thing to show somebody whose
                // machine simply has no GPU, and this is the one failure that
                // reliably happens on a headless box or a bare container.
                eprintln!("Cathode could not open a graphics surface: {err}");
                eprintln!();
                eprintln!("This needs a GPU your driver exposes to wgpu (Vulkan, Metal, DX12");
                eprintln!("or GL). On a headless machine there may be none. To run without a");
                eprintln!("window and write a screenshot instead:");
                eprintln!();
                eprintln!("    cathode-native --headless 600 --shot shot.png");
                std::process::exit(1);
            }
        }
    };

    let app = Arc::new(Mutex::new(App::new(config)));
    let mut pixels = pixels;

    // The audio thread reads the same mixer the game writes to.
    let _audio_stream = setup_cpal_audio(Arc::clone(&app));
    let mut gilrs = Gilrs::new().ok();

    let mut last_update = Instant::now();
    let mut gamepad = GamepadState::default();
    let mut gamepad_hw = GamepadState::default();

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;

        match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => *control_flow = ControlFlow::Exit,
                WindowEvent::KeyboardInput { input, .. } => {
                    if let Some(key) = input.virtual_keycode {
                        let is_pressed = input.state == ElementState::Pressed;
                        match key {
                            VirtualKeyCode::Escape if is_pressed => {
                                *control_flow = ControlFlow::Exit;
                            }
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
                        eprintln!("pixels.resize_surface error: {err}");
                        *control_flow = ControlFlow::Exit;
                    }
                }
                _ => {}
            },
            Event::MainEventsCleared => {
                if let Some(gilrs) = gilrs.as_mut() {
                    while let Some(GilrsEvent { event, .. }) = gilrs.next_event() {
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

                let now = Instant::now();
                let dt = now.duration_since(last_update).as_secs_f32();
                last_update = now;

                let merged = merge_gamepads(&gamepad, &gamepad_hw);
                app.lock().unwrap().step(dt.min(0.05), &merged);
                window.request_redraw();
            }
            Event::RedrawRequested(_) => {
                let frame = pixels.frame_mut();
                frame.copy_from_slice(&app.lock().unwrap().render().pixels);
                if let Err(err) = pixels.render() {
                    eprintln!("pixels.render error: {err}");
                    *control_flow = ControlFlow::Exit;
                }
            }
            _ => {}
        }
    });
}

fn setup_cpal_audio(app: Arc<Mutex<App>>) -> Option<cpal::Stream> {
    let host = cpal::default_host();
    let device = host.default_output_device()?;
    let supported_config = device.default_output_config().ok()?;
    let sample_rate = supported_config.sample_rate().0;

    {
        let mut owner = app.lock().unwrap();
        owner.engine.audio.sample_rate = sample_rate as f32;
    }

    let stream = device
        .build_output_stream(
            &cpal::StreamConfig {
                channels: 2,
                sample_rate: cpal::SampleRate(sample_rate),
                buffer_size: cpal::BufferSize::Default,
            },
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                if let Ok(mut owner) = app.lock() {
                    owner.engine.audio.fill_stereo(data);
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
