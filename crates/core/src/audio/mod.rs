use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Waveform {
    Pulse25,
    Pulse50,
    Triangle,
    Sawtooth,
    Noise,
    Sine,
}

pub struct Channel {
    pub waveform: Waveform,
    pub frequency: f32,
    pub volume: f32,
    pub active: bool,
    pub phase: f32,
    pub noise_state: u16,
}

impl Default for Channel {
    fn default() -> Self {
        Self {
            waveform: Waveform::Pulse50,
            frequency: 440.0,
            volume: 0.5,
            active: false,
            phase: 0.0,
            noise_state: 1, // Must be non-zero for LFSR
        }
    }
}

impl Channel {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn sample(&mut self, sample_rate: f32) -> f32 {
        if !self.active || self.volume <= 0.0 {
            return 0.0;
        }

        let inc = self.frequency / sample_rate;

        let out = match self.waveform {
            Waveform::Noise => {
                // 15-bit Galois LFSR
                // step at frequency rate, not sample rate, to control pitch
                self.phase += inc;
                if self.phase >= 1.0 {
                    self.phase -= 1.0;
                    let bit = (self.noise_state ^ (self.noise_state >> 1)) & 1;
                    self.noise_state = (self.noise_state >> 1) | (bit << 14);
                }
                if (self.noise_state & 1) == 1 { 1.0 } else { -1.0 }
            }
            Waveform::Pulse50 => {
                let v = if self.phase < 0.5 { 1.0 } else { -1.0 };
                self.phase = (self.phase + inc).fract();
                v
            }
            Waveform::Pulse25 => {
                let v = if self.phase < 0.25 { 1.0 } else { -1.0 };
                self.phase = (self.phase + inc).fract();
                v
            }
            Waveform::Triangle => {
                let v = if self.phase < 0.5 {
                    4.0 * self.phase - 1.0
                } else {
                    3.0 - 4.0 * self.phase
                };
                self.phase = (self.phase + inc).fract();
                v
            }
            Waveform::Sawtooth => {
                let v = 2.0 * self.phase - 1.0;
                self.phase = (self.phase + inc).fract();
                v
            }
            Waveform::Sine => {
                let v = (self.phase * std::f32::consts::TAU).sin();
                self.phase = (self.phase + inc).fract();
                v
            }
        };

        out * self.volume
    }
}

pub struct AudioMixer {
    pub channels: Vec<Channel>,
    pub sample_rate: f32,
    pub master_vol: f32,
}

impl AudioMixer {
    pub fn new(channel_count: u8) -> Self {
        let mut channels = Vec::with_capacity(channel_count as usize);
        for _ in 0..channel_count {
            channels.push(Channel::new());
        }
        Self {
            channels,
            sample_rate: 44100.0,
            master_vol: 1.0,
        }
    }

    pub fn play(&mut self, ch: usize, freq: f32, waveform: Waveform, vol: f32) {
        if let Some(channel) = self.channels.get_mut(ch) {
            channel.frequency = freq;
            channel.waveform = waveform;
            channel.volume = vol.clamp(0.0, 1.0);
            channel.active = true;
            // dont reset phase to avoid clicks, unless newly started
            // channel.phase = 0.0;
        }
    }

    pub fn stop(&mut self, ch: usize) {
        if let Some(channel) = self.channels.get_mut(ch) {
            channel.active = false;
        }
    }

    pub fn stop_all(&mut self) {
        for ch in &mut self.channels {
            ch.active = false;
        }
    }

    pub fn fill_mono(&mut self, buf: &mut [f32]) {
        for sample in buf.iter_mut() {
            let mut mix = 0.0;
            for ch in &mut self.channels {
                mix += ch.sample(self.sample_rate);
            }
            *sample = (mix * self.master_vol).clamp(-1.0, 1.0);
        }
    }

    pub fn fill_stereo(&mut self, buf: &mut [f32]) {
        for frame in buf.chunks_exact_mut(2) {
            let mut mix = 0.0;
            for ch in &mut self.channels {
                mix += ch.sample(self.sample_rate);
            }
            let out = (mix * self.master_vol).clamp(-1.0, 1.0);
            frame[0] = out;
            frame[1] = out;
        }
    }
}
