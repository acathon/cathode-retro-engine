use crate::input::InputState;
use crate::renderer::Renderer;
use hecs::World;

pub enum SceneTransition {
    Stay,
    Push(Box<dyn Scene>),
    Replace(Box<dyn Scene>),
    Pop,
    Quit,
}

pub trait Scene: Send + Sync {
    fn name(&self) -> &str;
    fn on_enter(&mut self, world: &mut World) {
        let _ = world;
    }
    fn on_exit(&mut self, world: &mut World) {
        let _ = world;
    }
    fn update(&mut self, world: &mut World, input: &InputState) -> SceneTransition;
    fn draw(&mut self, renderer: &mut Renderer, world: &World);
}

pub struct SceneManager {
    pub stack: Vec<Box<dyn Scene>>,
    pub quit: bool,
}

impl Default for SceneManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SceneManager {
    pub fn new() -> Self {
        Self {
            stack: Vec::new(),
            quit: false,
        }
    }

    pub fn push(&mut self, mut scene: Box<dyn Scene>, world: &mut World) {
        scene.on_enter(world);
        self.stack.push(scene);
    }

    pub fn update(&mut self, world: &mut World, input: &InputState) {
        if let Some(scene) = self.stack.last_mut() {
            match scene.update(world, input) {
                SceneTransition::Stay => {}
                SceneTransition::Push(mut new_scene) => {
                    new_scene.on_enter(world);
                    self.stack.push(new_scene);
                }
                SceneTransition::Replace(mut new_scene) => {
                    if let Some(mut old) = self.stack.pop() {
                        old.on_exit(world);
                    }
                    new_scene.on_enter(world);
                    self.stack.push(new_scene);
                }
                SceneTransition::Pop => {
                    if let Some(mut old) = self.stack.pop() {
                        old.on_exit(world);
                    }
                }
                SceneTransition::Quit => {
                    self.quit = true;
                }
            }
        }
    }

    pub fn draw(&mut self, renderer: &mut Renderer, world: &World) {
        if let Some(scene) = self.stack.last_mut() {
            scene.draw(renderer, world);
        }
    }

    pub fn current_scene_name(&self) -> Option<&str> {
        self.stack.last().map(|s| s.name())
    }

    pub fn depth(&self) -> usize {
        self.stack.len()
    }
}
