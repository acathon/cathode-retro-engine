use std::collections::HashMap;

/// A single note event in a pattern.
#[derive(Debug, Clone)]
pub struct NoteEvent {
    pub channel: u8,
    pub note: f32,
    pub waveform: u8,
    pub volume: f32,
    pub duration: f32,
}

/// An ordered list of NoteEvents that loops.
#[derive(Debug, Clone)]
pub struct Pattern {
    pub events: Vec<NoteEvent>,
    pub bpm: f32,
}

pub struct Sequencer {
    pub pattern: Option<Pattern>,
    pub playing: bool,
    current_event: usize,
    timer: f32,
    paused: bool,
}

impl Default for Sequencer {
    fn default() -> Self {
        Self::new()
    }
}

impl Sequencer {
    pub fn new() -> Self {
        Self {
            pattern: None,
            playing: false,
            current_event: 0,
            timer: 0.0,
            paused: false,
        }
    }

    pub fn load(&mut self, pattern: Pattern) {
        self.pattern = Some(pattern);
        self.current_event = 0;
        self.timer = 0.0;
    }

    pub fn play(&mut self) {
        self.playing = true;
        self.paused = false;
        if self.pattern.is_some() && self.current_event == 0 {
            self.timer = 0.0;
        }
    }

    pub fn stop(&mut self) {
        self.playing = false;
        self.paused = false;
        self.current_event = 0;
        self.timer = 0.0;
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn resume(&mut self) {
        self.paused = false;
    }

    pub fn set_bpm(&mut self, bpm: f32) {
        if let Some(ref mut pattern) = self.pattern {
            pattern.bpm = bpm;
        }
    }

    pub fn update(&mut self, dt: f32) -> Vec<NoteEvent> {
        let mut fired = Vec::new();

        if !self.playing || self.paused {
            return fired;
        }

        let pattern = match &self.pattern {
            Some(p) => p,
            None => return fired,
        };

        if pattern.events.is_empty() {
            return fired;
        }

        self.timer -= dt;

        while self.timer <= 0.0 {
            let event = &pattern.events[self.current_event];
            fired.push(event.clone());
            let wait = event.duration;
            self.timer += wait;

            self.current_event += 1;
            if self.current_event >= pattern.events.len() {
                self.current_event = 0;
            }
        }

        fired
    }

    pub fn parse_mml(mml: &str, bpm: f32) -> Pattern {
        let note_freq = build_note_table();
        let beat_secs = 60.0 / bpm;

        let channels: Vec<&str> = mml.split('|').collect();
        let mut all_events: Vec<Vec<NoteEvent>> = Vec::new();

        for (ch_idx, channel_str) in channels.iter().enumerate() {
            let mut ch_events = Vec::new();
            let tokens: Vec<&str> = channel_str.split_whitespace().collect();

            for token in tokens {
                let (note_name, dur_str) = if let Some(colon_pos) = token.find(':') {
                    (&token[..colon_pos], &token[colon_pos + 1..])
                } else {
                    (token, "4")
                };

                let dotted = dur_str.ends_with('.');
                let dur_num_str = if dotted {
                    &dur_str[..dur_str.len() - 1]
                } else {
                    dur_str
                };

                let divisor: f32 = dur_num_str.parse().unwrap_or(4.0);
                let mut duration = beat_secs * 4.0 / divisor;
                if dotted {
                    duration *= 1.5;
                }

                let freq = if note_name == "REST" {
                    0.0
                } else {
                    *note_freq.get(note_name).unwrap_or(&440.0)
                };

                ch_events.push(NoteEvent {
                    channel: ch_idx as u8,
                    note: freq,
                    waveform: if ch_idx == 0 { 1 } else { 2 }, // pulse50 for ch0, triangle for others
                    volume: 0.4,
                    duration,
                });
            }

            all_events.push(ch_events);
        }

        // Interleave: for now, flatten channel events sequentially
        // A proper interleave would need timing alignment, but for a simple sequencer
        // we play channel 0 events with channel info so the engine routes them correctly
        let mut events = Vec::new();
        let max_len = all_events.iter().map(|v| v.len()).max().unwrap_or(0);

        if all_events.len() == 1 {
            events = all_events.into_iter().next().unwrap_or_default();
        } else {
            // Interleave: fire all channel events at each step simultaneously
            // We emit them in sequence but with zero duration for all but the last in each step
            for step in 0..max_len {
                let mut step_dur = 0.0f32;
                let mut step_events: Vec<NoteEvent> = Vec::new();

                for ch_events in &all_events {
                    if let Some(evt) = ch_events.get(step) {
                        step_dur = step_dur.max(evt.duration);
                        step_events.push(evt.clone());
                    }
                }

                for (i, mut evt) in step_events.into_iter().enumerate() {
                    if i == 0 {
                        evt.duration = step_dur;
                    } else {
                        evt.duration = 0.0;
                    }
                    events.push(evt);
                }
            }
        }

        Pattern { events, bpm }
    }
}

fn build_note_table() -> HashMap<&'static str, f32> {
    let mut m = HashMap::new();
    let notes = [
        ("C0", 16.35),
        ("C#0", 17.32),
        ("D0", 18.35),
        ("D#0", 19.45),
        ("E0", 20.60),
        ("F0", 21.83),
        ("F#0", 23.12),
        ("G0", 24.50),
        ("G#0", 25.96),
        ("A0", 27.50),
        ("A#0", 29.14),
        ("B0", 30.87),
        ("C1", 32.70),
        ("C#1", 34.65),
        ("D1", 36.71),
        ("D#1", 38.89),
        ("E1", 41.20),
        ("F1", 43.65),
        ("F#1", 46.25),
        ("G1", 49.00),
        ("G#1", 51.91),
        ("A1", 55.00),
        ("A#1", 58.27),
        ("B1", 61.74),
        ("C2", 65.41),
        ("C#2", 69.30),
        ("D2", 73.42),
        ("D#2", 77.78),
        ("E2", 82.41),
        ("F2", 87.31),
        ("F#2", 92.50),
        ("G2", 98.00),
        ("G#2", 103.83),
        ("A2", 110.00),
        ("A#2", 116.54),
        ("B2", 123.47),
        ("C3", 130.81),
        ("C#3", 138.59),
        ("D3", 146.83),
        ("D#3", 155.56),
        ("E3", 164.81),
        ("F3", 174.61),
        ("F#3", 185.00),
        ("G3", 196.00),
        ("G#3", 207.65),
        ("A3", 220.00),
        ("A#3", 233.08),
        ("B3", 246.94),
        ("C4", 261.63),
        ("C#4", 277.18),
        ("D4", 293.66),
        ("D#4", 311.13),
        ("E4", 329.63),
        ("F4", 349.23),
        ("F#4", 369.99),
        ("G4", 392.00),
        ("G#4", 415.30),
        ("A4", 440.00),
        ("A#4", 466.16),
        ("B4", 493.88),
        ("C5", 523.25),
        ("C#5", 554.37),
        ("D5", 587.33),
        ("D#5", 622.25),
        ("E5", 659.25),
        ("F5", 698.46),
        ("F#5", 739.99),
        ("G5", 783.99),
        ("G#5", 830.61),
        ("A5", 880.00),
        ("A#5", 932.33),
        ("B5", 987.77),
        ("C6", 1046.50),
        ("C#6", 1108.73),
        ("D6", 1174.66),
        ("D#6", 1244.51),
        ("E6", 1318.51),
        ("F6", 1396.91),
        ("F#6", 1479.98),
        ("G6", 1567.98),
        ("G#6", 1661.22),
        ("A6", 1760.00),
        ("A#6", 1864.66),
        ("B6", 1975.53),
        ("C7", 2093.00),
        ("C#7", 2217.46),
        ("D7", 2349.32),
        ("D#7", 2489.02),
        ("E7", 2637.02),
        ("F7", 2793.83),
        ("F#7", 2959.96),
        ("G7", 3135.96),
        ("G#7", 3322.44),
        ("A7", 3520.00),
        ("A#7", 3729.31),
        ("B7", 3951.07),
    ];
    for (name, freq) in &notes {
        m.insert(*name, *freq);
    }
    m
}
