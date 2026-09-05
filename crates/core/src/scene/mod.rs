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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Records lifecycle calls so tests can assert on ordering.
    #[derive(Default)]
    struct Log {
        entered: AtomicUsize,
        exited: AtomicUsize,
        drawn: AtomicUsize,
    }

    struct TestScene {
        name: String,
        log: Arc<Log>,
        next: Option<Box<dyn Fn() -> SceneTransition + Send + Sync>>,
    }

    impl TestScene {
        fn new(name: &str, log: Arc<Log>) -> Self {
            Self {
                name: name.to_string(),
                log,
                next: None,
            }
        }

        fn then(mut self, f: impl Fn() -> SceneTransition + Send + Sync + 'static) -> Self {
            self.next = Some(Box::new(f));
            self
        }

        fn boxed(self) -> Box<dyn Scene> {
            Box::new(self)
        }
    }

    impl Scene for TestScene {
        fn name(&self) -> &str {
            &self.name
        }

        fn on_enter(&mut self, _world: &mut World) {
            self.log.entered.fetch_add(1, Ordering::SeqCst);
        }

        fn on_exit(&mut self, _world: &mut World) {
            self.log.exited.fetch_add(1, Ordering::SeqCst);
        }

        fn update(&mut self, _world: &mut World, _input: &InputState) -> SceneTransition {
            match &self.next {
                Some(f) => f(),
                None => SceneTransition::Stay,
            }
        }

        fn draw(&mut self, _renderer: &mut Renderer, _world: &World) {
            self.log.drawn.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn fixture() -> (SceneManager, World, InputState, Arc<Log>) {
        (
            SceneManager::new(),
            World::new(),
            InputState::default(),
            Arc::new(Log::default()),
        )
    }

    #[test]
    fn a_new_manager_is_empty() {
        let mgr = SceneManager::new();
        assert_eq!(mgr.depth(), 0);
        assert_eq!(mgr.current_scene_name(), None);
        assert!(!mgr.quit);
    }

    #[test]
    fn pushing_a_scene_enters_it() {
        let (mut mgr, mut world, _, log) = fixture();
        mgr.push(TestScene::new("title", log.clone()).boxed(), &mut world);

        assert_eq!(mgr.depth(), 1);
        assert_eq!(mgr.current_scene_name(), Some("title"));
        assert_eq!(log.entered.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn updating_an_empty_manager_is_harmless() {
        let (mut mgr, mut world, input, _) = fixture();
        mgr.update(&mut world, &input);
        assert_eq!(mgr.depth(), 0);
    }

    #[test]
    fn stay_leaves_the_stack_untouched() {
        let (mut mgr, mut world, input, log) = fixture();
        mgr.push(TestScene::new("game", log.clone()).boxed(), &mut world);

        mgr.update(&mut world, &input);
        mgr.update(&mut world, &input);

        assert_eq!(mgr.depth(), 1);
        assert_eq!(log.exited.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn push_stacks_a_scene_without_exiting_the_one_below() {
        let (mut mgr, mut world, input, log) = fixture();
        let pause_log = log.clone();
        mgr.push(
            TestScene::new("game", log.clone())
                .then(move || {
                    SceneTransition::Push(TestScene::new("pause", pause_log.clone()).boxed())
                })
                .boxed(),
            &mut world,
        );

        mgr.update(&mut world, &input);

        assert_eq!(mgr.depth(), 2);
        assert_eq!(mgr.current_scene_name(), Some("pause"));
        assert_eq!(log.entered.load(Ordering::SeqCst), 2);
        assert_eq!(log.exited.load(Ordering::SeqCst), 0, "game is only paused");
    }

    #[test]
    fn pop_exits_the_top_scene_and_reveals_the_one_below() {
        let (mut mgr, mut world, input, log) = fixture();
        mgr.push(TestScene::new("game", log.clone()).boxed(), &mut world);
        mgr.push(
            TestScene::new("pause", log.clone())
                .then(|| SceneTransition::Pop)
                .boxed(),
            &mut world,
        );

        mgr.update(&mut world, &input);

        assert_eq!(mgr.depth(), 1);
        assert_eq!(mgr.current_scene_name(), Some("game"));
        assert_eq!(log.exited.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn replace_swaps_the_top_scene_and_keeps_the_depth() {
        let (mut mgr, mut world, input, log) = fixture();
        let over_log = log.clone();
        mgr.push(
            TestScene::new("game", log.clone())
                .then(move || {
                    SceneTransition::Replace(TestScene::new("gameover", over_log.clone()).boxed())
                })
                .boxed(),
            &mut world,
        );

        mgr.update(&mut world, &input);

        assert_eq!(mgr.depth(), 1);
        assert_eq!(mgr.current_scene_name(), Some("gameover"));
        assert_eq!(log.exited.load(Ordering::SeqCst), 1, "old scene exits");
        assert_eq!(log.entered.load(Ordering::SeqCst), 2, "new scene enters");
    }

    #[test]
    fn quit_sets_the_flag_and_leaves_the_stack() {
        let (mut mgr, mut world, input, log) = fixture();
        mgr.push(
            TestScene::new("game", log.clone())
                .then(|| SceneTransition::Quit)
                .boxed(),
            &mut world,
        );

        mgr.update(&mut world, &input);

        assert!(mgr.quit);
        assert_eq!(mgr.depth(), 1);
    }

    #[test]
    fn only_the_top_scene_is_updated_and_drawn() {
        let (mut mgr, mut world, input, log) = fixture();
        let mut renderer = Renderer::new(32, 32, 8, false, crate::config::HardwareProfile::Custom);

        let bottom_log = Arc::new(Log::default());
        mgr.push(
            TestScene::new("bottom", bottom_log.clone()).boxed(),
            &mut world,
        );
        mgr.push(TestScene::new("top", log.clone()).boxed(), &mut world);

        mgr.update(&mut world, &input);
        mgr.draw(&mut renderer, &world);

        assert_eq!(log.drawn.load(Ordering::SeqCst), 1);
        assert_eq!(bottom_log.drawn.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn popping_the_last_scene_empties_the_manager() {
        let (mut mgr, mut world, input, log) = fixture();
        mgr.push(
            TestScene::new("only", log.clone())
                .then(|| SceneTransition::Pop)
                .boxed(),
            &mut world,
        );

        mgr.update(&mut world, &input);

        assert_eq!(mgr.depth(), 0);
        assert_eq!(mgr.current_scene_name(), None);
        // Updating and drawing an emptied manager stays safe.
        mgr.update(&mut world, &input);
    }
}
