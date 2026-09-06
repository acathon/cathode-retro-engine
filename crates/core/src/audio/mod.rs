pub mod envelope;
pub mod sequencer;

use self::envelope::Envelope;
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
    pub envelope: Envelope,
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
            envelope: Envelope::default_envelope(),
        }
    }
}

impl Channel {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn sample(&mut self, sample_rate: f32) -> f32 {
        if !self.active || self.volume <= 0.0 {
            // still tick envelope during release phase
            if !self.envelope.is_done() {
                let env = self.envelope.tick(1.0 / sample_rate);
                if env <= 0.0 {
                    return 0.0;
                }
                // Generate waveform even during release
                let inc = self.frequency / sample_rate;
                let raw = self.generate_waveform(inc);
                return raw * self.volume * env;
            }
            return 0.0;
        }

        let inc = self.frequency / sample_rate;
        let env = self.envelope.tick(1.0 / sample_rate);
        let raw = self.generate_waveform(inc);
        raw * self.volume * env
    }

    fn generate_waveform(&mut self, inc: f32) -> f32 {
        match self.waveform {
            Waveform::Noise => {
                // 15-bit Galois LFSR
                // step at frequency rate, not sample rate, to control pitch
                self.phase += inc;
                if self.phase >= 1.0 {
                    self.phase -= 1.0;
                    let bit = (self.noise_state ^ (self.noise_state >> 1)) & 1;
                    self.noise_state = (self.noise_state >> 1) | (bit << 14);
                }
                if (self.noise_state & 1) == 1 {
                    1.0
                } else {
                    -1.0
                }
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
        }
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
            channel.envelope.note_on();
        }
    }

    pub fn stop(&mut self, ch: usize) {
        if let Some(channel) = self.channels.get_mut(ch) {
            channel.active = false;
            channel.envelope.note_off();
        }
    }

    pub fn stop_all(&mut self) {
        for ch in &mut self.channels {
            ch.active = false;
            // Without releasing the envelope a channel sitting in its sustain
            // phase keeps producing sound forever (sample() plays the release
            // tail for inactive channels, and sustain never ends on its own).
            ch.envelope.note_off();
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
        for frame in buf.as_chunks_mut::<2>().0 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn play_configures_channel_and_clamps_volume() {
        let mut mixer = AudioMixer::new(2);
        mixer.play(0, 220.0, Waveform::Triangle, 3.0);
        assert!(mixer.channels[0].active);
        assert_eq!(mixer.channels[0].frequency, 220.0);
        assert_eq!(mixer.channels[0].waveform, Waveform::Triangle);
        assert_eq!(mixer.channels[0].volume, 1.0);
        assert!(!mixer.channels[1].active);

        // Out-of-range channels are ignored.
        mixer.play(7, 440.0, Waveform::Sine, 0.5);
    }

    #[test]
    fn every_waveform_stays_within_unit_range() {
        let waveforms = [
            Waveform::Pulse25,
            Waveform::Pulse50,
            Waveform::Triangle,
            Waveform::Sawtooth,
            Waveform::Noise,
            Waveform::Sine,
        ];
        for wf in waveforms {
            let mut mixer = AudioMixer::new(1);
            mixer.play(0, 440.0, wf, 1.0);
            for _ in 0..1000 {
                let s = mixer.channels[0].sample(44100.0);
                assert!(
                    (-1.001..=1.001).contains(&s),
                    "{wf:?} produced out-of-range sample {s}"
                );
            }
        }
    }

    #[test]
    fn active_channel_produces_audible_output() {
        let mut mixer = AudioMixer::new(1);
        mixer.play(0, 440.0, Waveform::Pulse50, 0.8);
        let mut buf = vec![0.0f32; 4096];
        mixer.fill_mono(&mut buf);
        assert!(buf.iter().any(|s| s.abs() > 0.01));
        assert!(buf.iter().all(|s| (-1.0..=1.0).contains(s)));
    }

    #[test]
    fn fill_stereo_duplicates_samples_across_both_channels() {
        let mut mixer = AudioMixer::new(1);
        mixer.play(0, 440.0, Waveform::Sine, 0.5);
        let mut buf = vec![0.0f32; 512];
        mixer.fill_stereo(&mut buf);
        for frame in buf.as_chunks::<2>().0 {
            assert_eq!(frame[0], frame[1]);
        }
    }

    #[test]
    fn stop_all_actually_silences_sustained_channels() {
        // Regression test: stop_all used to clear `active` without releasing
        // the envelope, so a channel sitting at its sustain level kept
        // sounding forever.
        let mut mixer = AudioMixer::new(2);
        mixer.play(0, 440.0, Waveform::Pulse50, 0.8);
        mixer.play(1, 220.0, Waveform::Triangle, 0.8);

        // Advance well past attack + decay into sustain.
        let mut buf = vec![0.0f32; 8192];
        mixer.fill_mono(&mut buf);
        assert!(buf.iter().any(|s| s.abs() > 0.01), "should be audible");

        mixer.stop_all();

        // Play out the release tail (default release is 0.1s ≈ 4410 samples).
        let mut tail = vec![0.0f32; 16384];
        mixer.fill_mono(&mut tail);

        let mut silent = vec![1.0f32; 512];
        mixer.fill_mono(&mut silent);
        assert!(
            silent.iter().all(|s| *s == 0.0),
            "channels must be silent after stop_all + release tail"
        );
    }

    #[test]
    fn stop_releases_a_single_channel() {
        let mut mixer = AudioMixer::new(2);
        mixer.play(0, 440.0, Waveform::Pulse50, 0.8);
        mixer.play(1, 220.0, Waveform::Pulse50, 0.8);
        mixer.stop(0);
        assert!(!mixer.channels[0].active);
        assert!(mixer.channels[1].active);
    }

    #[test]
    fn master_volume_scales_the_mix() {
        let mut mixer = AudioMixer::new(1);
        mixer.master_vol = 0.0;
        mixer.play(0, 440.0, Waveform::Pulse50, 1.0);
        let mut buf = vec![1.0f32; 256];
        mixer.fill_mono(&mut buf);
        assert!(buf.iter().all(|s| *s == 0.0));
    }
}
