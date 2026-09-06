//! Netplay primitives.
//!
//! The engine does not open sockets — a browser build wants WebRTC or a
//! WebSocket, a native build wants UDP, and neither belongs in a portable
//! core. What *is* portable is everything above the socket: agreeing on a
//! tick, holding inputs until every player has reported one, and smoothing
//! the gap between the snapshots that actually arrive.
//!
//! Feed bytes in from whatever transport you have; these types decide when
//! the simulation may step and where a remote body should be drawn.

use std::collections::HashMap;

/// A fixed-step clock.
///
/// Networked play needs every machine to run the same number of simulation
/// steps for the same span of wall-clock time, which a variable `dt` cannot
/// promise. Feed it real frame times and it hands back whole ticks.
#[derive(Debug, Clone)]
pub struct Clock {
    step: f32,
    accumulated: f32,
    tick: u32,
    max_catch_up: u32,
}

impl Clock {
    /// A clock running at `hz` ticks per second.
    pub fn new(hz: f32) -> Self {
        Self {
            step: 1.0 / hz.max(1.0),
            accumulated: 0.0,
            tick: 0,
            max_catch_up: 8,
        }
    }

    /// Seconds in one tick.
    pub fn step(&self) -> f32 {
        self.step
    }

    /// Ticks simulated so far.
    pub fn tick(&self) -> u32 {
        self.tick
    }

    /// How much of the next tick has already elapsed, in 0..1. Render with
    /// this to draw between two simulation steps instead of on top of one.
    pub fn alpha(&self) -> f32 {
        (self.accumulated / self.step).clamp(0.0, 1.0)
    }

    /// Advance by a real frame time and return how many ticks to run.
    ///
    /// A long stall — a backgrounded tab, a breakpoint — is capped rather
    /// than replayed, so the game never tries to catch up on a lost minute.
    pub fn advance(&mut self, dt: f32) -> u32 {
        self.accumulated += dt.max(0.0);
        let mut ticks = 0;
        while self.accumulated >= self.step && ticks < self.max_catch_up {
            self.accumulated -= self.step;
            ticks += 1;
        }
        if ticks == self.max_catch_up {
            self.accumulated = 0.0; // drop the backlog instead of spiralling
        }
        self.tick += ticks;
        ticks
    }
}

/// Collects one input per player per tick and reports when a tick is complete.
///
/// This is deterministic lockstep: every machine runs tick N with the exact
/// same set of inputs, so every machine reaches the same state without ever
/// sending that state over the wire. The cost is that one slow player stalls
/// everyone, which is why `delay` exists — inputs are scheduled a few ticks
/// ahead, giving the network that long to deliver them.
#[derive(Debug, Clone)]
pub struct Lockstep<T> {
    players: Vec<u32>,
    delay: u32,
    pending: HashMap<(u32, u32), T>,
    next: u32,
}

impl<T: Clone> Lockstep<T> {
    /// `delay` is how many ticks ahead a local input is scheduled.
    pub fn new(players: impl IntoIterator<Item = u32>, delay: u32) -> Self {
        Self {
            players: players.into_iter().collect(),
            delay,
            pending: HashMap::new(),
            next: 0,
        }
    }

    pub fn delay(&self) -> u32 {
        self.delay
    }

    /// The tick waiting to run.
    pub fn next_tick(&self) -> u32 {
        self.next
    }

    /// The tick a local input submitted now should be scheduled for.
    pub fn scheduled_tick(&self) -> u32 {
        self.next + self.delay
    }

    /// Record `player`'s input for `tick`. A second submission for the same
    /// slot replaces the first, so a retransmitted packet is harmless.
    pub fn submit(&mut self, player: u32, tick: u32, input: T) {
        if tick >= self.next {
            self.pending.insert((tick, player), input);
        }
    }

    /// True when every player has reported an input for the next tick.
    pub fn ready(&self) -> bool {
        self.players
            .iter()
            .all(|p| self.pending.contains_key(&(self.next, *p)))
    }

    /// Which players have not reported yet — the ones stalling the game.
    pub fn waiting_on(&self) -> Vec<u32> {
        self.players
            .iter()
            .copied()
            .filter(|p| !self.pending.contains_key(&(self.next, *p)))
            .collect()
    }

    /// Take the next tick's inputs, in player order, and advance.
    ///
    /// Returns `None` while any player is still missing; the caller should
    /// render the last simulated state and try again next frame.
    pub fn advance(&mut self) -> Option<(u32, Vec<(u32, T)>)> {
        if !self.ready() {
            return None;
        }
        let tick = self.next;
        let inputs = self
            .players
            .iter()
            .map(|p| (*p, self.pending.remove(&(tick, *p)).expect("ready checked")))
            .collect();
        self.next += 1;
        Some((tick, inputs))
    }
}

/// A value that can be blended with another of its kind.
pub trait Interpolate: Clone {
    fn lerp(&self, other: &Self, t: f32) -> Self;
}

impl Interpolate for f32 {
    fn lerp(&self, other: &Self, t: f32) -> Self {
        self + (other - self) * t
    }
}

impl Interpolate for glam::Vec2 {
    fn lerp(&self, other: &Self, t: f32) -> Self {
        *self + (*other - *self) * t
    }
}

/// Smooths the sparse snapshots a server sends into per-frame positions.
///
/// A server that sends 20 updates a second cannot drive a 60fps screen
/// directly; drawing each packet as it lands makes every remote player jitter.
/// Holding snapshots and rendering slightly in the past — `delay` seconds —
/// means there are almost always two to blend between.
#[derive(Debug, Clone)]
pub struct Interpolator<T> {
    samples: Vec<(f32, T)>,
    delay: f32,
    capacity: usize,
}

impl<T: Interpolate> Interpolator<T> {
    /// Render `delay` seconds behind the newest snapshot. One and a half
    /// send intervals is the usual choice: enough to absorb a late packet.
    pub fn new(delay: f32) -> Self {
        Self {
            samples: Vec::new(),
            delay: delay.max(0.0),
            capacity: 32,
        }
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }

    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    /// Add a snapshot stamped with the time it describes.
    ///
    /// Out-of-order arrivals are inserted in place rather than dropped: UDP
    /// reorders packets routinely, and a late one still carries real state.
    pub fn push(&mut self, time: f32, value: T) {
        let at = self
            .samples
            .iter()
            .position(|(t, _)| *t > time)
            .unwrap_or(self.samples.len());
        self.samples.insert(at, (time, value));
        while self.samples.len() > self.capacity {
            self.samples.remove(0);
        }
    }

    /// The value to draw at wall-clock `now`, blended between the snapshots
    /// bracketing `now - delay`.
    ///
    /// Before the first snapshot, or after the last, the nearest one is held
    /// rather than extrapolated — a guess that overshoots looks worse than a
    /// body that pauses for a frame.
    pub fn sample(&self, now: f32) -> Option<T> {
        if self.samples.is_empty() {
            return None;
        }
        let target = now - self.delay;

        let newest = &self.samples[self.samples.len() - 1];
        if target >= newest.0 {
            return Some(newest.1.clone());
        }
        let oldest = &self.samples[0];
        if target <= oldest.0 {
            return Some(oldest.1.clone());
        }

        let i = self
            .samples
            .iter()
            .position(|(t, _)| *t > target)
            .unwrap_or(self.samples.len() - 1);
        let (t0, a) = &self.samples[i - 1];
        let (t1, b) = &self.samples[i];
        let span = t1 - t0;
        if span <= 1e-6 {
            return Some(b.clone());
        }
        Some(a.lerp(b, (target - t0) / span))
    }

    /// Forget snapshots older than the interpolation window needs.
    pub fn prune(&mut self, now: f32) {
        let target = now - self.delay;
        // Keep one sample before the window so there is always a left edge.
        while self.samples.len() > 2 && self.samples[1].0 < target {
            self.samples.remove(0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use glam::Vec2;

    // --- Clock -----------------------------------------------------------

    #[test]
    fn a_clock_emits_one_tick_per_step() {
        let mut clock = Clock::new(60.0);
        assert_eq!(clock.advance(1.0 / 60.0), 1);
        assert_eq!(clock.tick(), 1);
    }

    #[test]
    fn a_short_frame_emits_no_tick_but_is_not_lost() {
        let mut clock = Clock::new(60.0);
        assert_eq!(clock.advance(1.0 / 120.0), 0);
        assert_eq!(clock.advance(1.0 / 120.0), 1, "the halves add up");
    }

    #[test]
    fn a_long_frame_emits_several_ticks() {
        let mut clock = Clock::new(60.0);
        assert_eq!(clock.advance(3.5 / 60.0), 3);
        assert!((clock.alpha() - 0.5).abs() < 1e-4);
    }

    #[test]
    fn a_stalled_frame_is_capped_instead_of_replayed() {
        let mut clock = Clock::new(60.0);
        assert_eq!(clock.advance(60.0), 8, "a lost minute is not simulated");
        assert_eq!(clock.advance(1.0 / 60.0), 1, "and the clock recovers");
    }

    #[test]
    fn a_negative_frame_time_is_ignored() {
        let mut clock = Clock::new(60.0);
        assert_eq!(clock.advance(-5.0), 0);
        assert_eq!(clock.tick(), 0);
    }

    // --- Lockstep --------------------------------------------------------

    fn two_players() -> Lockstep<&'static str> {
        Lockstep::new([1, 2], 2)
    }

    #[test]
    fn a_tick_waits_for_every_player() {
        let mut ls = two_players();
        ls.submit(1, 0, "left");
        assert!(!ls.ready());
        assert_eq!(ls.waiting_on(), vec![2]);
        assert!(ls.advance().is_none());

        ls.submit(2, 0, "right");
        assert!(ls.ready());
        assert_eq!(
            ls.advance(),
            Some((0, vec![(1, "left"), (2, "right")])),
            "inputs come back in player order"
        );
        assert_eq!(ls.next_tick(), 1);
    }

    #[test]
    fn a_resent_input_replaces_the_first_copy() {
        let mut ls = two_players();
        ls.submit(1, 0, "stale");
        ls.submit(1, 0, "fresh");
        ls.submit(2, 0, "right");
        let (_, inputs) = ls.advance().unwrap();
        assert_eq!(inputs[0].1, "fresh");
    }

    #[test]
    fn inputs_for_a_tick_already_run_are_dropped() {
        let mut ls = two_players();
        ls.submit(1, 0, "a");
        ls.submit(2, 0, "b");
        ls.advance().unwrap();

        ls.submit(1, 0, "too late");
        assert_eq!(ls.waiting_on(), vec![1, 2], "tick 0 is history");
    }

    #[test]
    fn inputs_can_be_queued_several_ticks_ahead() {
        let mut ls = two_players();
        for tick in 0..3 {
            ls.submit(1, tick, "a");
            ls.submit(2, tick, "b");
        }
        for tick in 0..3 {
            assert_eq!(ls.advance().map(|(t, _)| t), Some(tick));
        }
        assert!(ls.advance().is_none());
    }

    #[test]
    fn input_delay_schedules_ahead_of_the_running_tick() {
        let mut ls = two_players();
        assert_eq!(ls.scheduled_tick(), 2, "delay of 2");
        ls.submit(1, 0, "a");
        ls.submit(2, 0, "b");
        ls.advance().unwrap();
        assert_eq!(ls.scheduled_tick(), 3);
    }

    #[test]
    fn a_solo_game_never_stalls() {
        let mut ls: Lockstep<u8> = Lockstep::new([1], 0);
        ls.submit(1, 0, 7);
        assert_eq!(ls.advance(), Some((0, vec![(1, 7)])));
    }

    // --- Interpolator ----------------------------------------------------

    #[test]
    fn an_empty_interpolator_has_nothing_to_show() {
        let interp: Interpolator<f32> = Interpolator::new(0.1);
        assert!(interp.is_empty());
        assert_eq!(interp.sample(1.0), None);
    }

    #[test]
    fn a_sample_blends_the_two_snapshots_around_it() {
        let mut interp = Interpolator::new(0.1);
        interp.push(0.0, 0.0f32);
        interp.push(1.0, 10.0);
        // now 0.6 renders 0.5 -> halfway.
        assert!((interp.sample(0.6).unwrap() - 5.0).abs() < 1e-4);
    }

    #[test]
    fn vectors_interpolate_component_wise() {
        let mut interp = Interpolator::new(0.0);
        interp.push(0.0, Vec2::new(0.0, 10.0));
        interp.push(2.0, Vec2::new(4.0, 0.0));
        let mid = interp.sample(1.0).unwrap();
        assert!((mid - Vec2::new(2.0, 5.0)).length() < 1e-4);
    }

    #[test]
    fn the_newest_snapshot_is_held_rather_than_extrapolated() {
        let mut interp = Interpolator::new(0.0);
        interp.push(0.0, 0.0f32);
        interp.push(1.0, 10.0);
        assert_eq!(
            interp.sample(9.0),
            Some(10.0),
            "a late server must not launch the body into orbit"
        );
    }

    #[test]
    fn a_sample_before_the_first_snapshot_holds_the_oldest() {
        let mut interp = Interpolator::new(0.5);
        interp.push(1.0, 3.0f32);
        interp.push(2.0, 6.0);
        assert_eq!(interp.sample(0.2), Some(3.0));
    }

    #[test]
    fn a_late_packet_is_filed_in_order_not_appended() {
        let mut interp = Interpolator::new(0.0);
        interp.push(0.0, 0.0f32);
        interp.push(2.0, 20.0);
        interp.push(1.0, 10.0); // arrives out of order
        assert!((interp.sample(1.5).unwrap() - 15.0).abs() < 1e-4);
    }

    #[test]
    fn two_snapshots_at_the_same_time_do_not_divide_by_zero() {
        let mut interp = Interpolator::new(0.0);
        interp.push(0.0, 1.0f32);
        interp.push(1.0, 2.0);
        interp.push(1.0, 3.0);
        assert!(interp.sample(0.999).unwrap().is_finite());
    }

    #[test]
    fn pruning_keeps_the_window_but_never_empties_it() {
        let mut interp = Interpolator::new(0.1);
        for i in 0..10 {
            interp.push(i as f32, i as f32);
        }
        interp.prune(9.0);
        assert!(interp.len() >= 2, "must keep a left edge to blend from");
        assert!((interp.sample(9.0).unwrap() - 8.9).abs() < 1e-3);
    }

    #[test]
    fn the_buffer_does_not_grow_without_bound() {
        let mut interp = Interpolator::new(0.0);
        for i in 0..500 {
            interp.push(i as f32, i as f32);
        }
        assert!(interp.len() <= 32);
        assert_eq!(interp.sample(1000.0), Some(499.0), "newest is kept");
    }
}
