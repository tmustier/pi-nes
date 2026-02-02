use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use nes_rust::audio::Audio;
use ringbuf::{traits::{Consumer, Producer, Split}, HeapCons, HeapProd, HeapRb};

const TARGET_SAMPLE_RATE: u32 = 44_100;
const RING_BUFFER_CAPACITY: usize = 44_100 * 2;

#[derive(Clone)]
pub struct CpalAudio {
	inner: Arc<Mutex<CpalAudioInner>>,
}

struct CpalAudioInner {
	producer: HeapProd<f32>,
	consumer: HeapCons<f32>,
	stream: Option<cpal::Stream>,
	last_sample: f32,
	channels: u16,
}

impl CpalAudio {
	pub fn new() -> Self {
		let ring = HeapRb::<f32>::new(RING_BUFFER_CAPACITY);
		let (producer, consumer) = ring.split();
		Self {
			inner: Arc::new(Mutex::new(CpalAudioInner {
				producer,
				consumer,
				stream: None,
				last_sample: 0.0,
				channels: 2,
			})),
		}
	}

	pub fn set_enabled(&self, enabled: bool) -> bool {
		if enabled {
			self.start_stream()
		} else {
			self.stop_stream();
			true
		}
	}

	fn stop_stream(&self) {
		if let Ok(mut inner) = self.inner.lock() {
			inner.stream.take();
		}
	}

	fn start_stream(&self) -> bool {
		{
			if let Ok(inner) = self.inner.lock() {
				if inner.stream.is_some() {
					return true;
				}
			}
		}

		let host = cpal::default_host();
		let device = match host.default_output_device() {
			Some(device) => device,
			None => return false,
		};

		let config = select_output_config(&device).or_else(|| device.default_output_config().ok());
		let config = match config {
			Some(config) => config,
			None => return false,
		};

		let sample_format = config.sample_format();
		let stream_config: StreamConfig = config.clone().into();
		let channels = stream_config.channels;
		let inner = self.inner.clone();

		let stream = match sample_format {
			SampleFormat::F32 => device.build_output_stream(
				&stream_config,
				move |data: &mut [f32], _| fill_output_f32(data, channels, &inner),
				log_stream_error,
				None,
			),
			SampleFormat::I16 => device.build_output_stream(
				&stream_config,
				move |data: &mut [i16], _| fill_output_i16(data, channels, &inner),
				log_stream_error,
				None,
			),
			SampleFormat::U16 => device.build_output_stream(
				&stream_config,
				move |data: &mut [u16], _| fill_output_u16(data, channels, &inner),
				log_stream_error,
				None,
			),
			_ => return false,
		};

		let stream = match stream {
			Ok(stream) => stream,
			Err(_) => return false,
		};

		if stream.play().is_err() {
			return false;
		}

		if let Ok(mut inner) = self.inner.lock() {
			inner.channels = channels;
			inner.stream = Some(stream);
		}

		true
	}
}

impl Audio for CpalAudio {
	fn push(&mut self, value: f32) {
		if let Ok(mut inner) = self.inner.lock() {
			let _ = inner.producer.try_push(value);
		}
	}

	fn copy_sample_buffer(&mut self, sample_buffer: &mut [f32]) {
		if let Ok(mut inner) = self.inner.lock() {
			for sample in sample_buffer.iter_mut() {
				*sample = next_sample(&mut inner);
			}
		}
	}
}

fn select_output_config(device: &cpal::Device) -> Option<cpal::SupportedStreamConfig> {
	let configs = device.supported_output_configs().ok()?;
	let mut best: Option<(i32, cpal::SupportedStreamConfig)> = None;

	for config in configs {
		let min = config.min_sample_rate();
		let max = config.max_sample_rate();
		if TARGET_SAMPLE_RATE < min || TARGET_SAMPLE_RATE > max {
			continue;
		}
		let score = score_config(&config);
		let config = config.with_sample_rate(TARGET_SAMPLE_RATE);
		if best.as_ref().map(|(best_score, _)| score > *best_score).unwrap_or(true) {
			best = Some((score, config));
		}
	}

	best.map(|(_, config)| config)
}

fn score_config(config: &cpal::SupportedStreamConfigRange) -> i32 {
	let mut score = 0;
	match config.sample_format() {
		SampleFormat::F32 => score += 100,
		SampleFormat::I16 => score += 60,
		SampleFormat::U16 => score += 50,
		_ => score += 0,
	}
	if config.channels() >= 2 {
		score += 10;
	}
	score
}

fn fill_output_f32(output: &mut [f32], channels: u16, inner: &Arc<Mutex<CpalAudioInner>>) {
	if let Ok(mut inner) = inner.lock() {
		for frame in output.chunks_mut(channels as usize) {
			let sample = next_sample(&mut inner);
			for out in frame.iter_mut() {
				*out = sample;
			}
		}
	}
}

fn fill_output_i16(output: &mut [i16], channels: u16, inner: &Arc<Mutex<CpalAudioInner>>) {
	if let Ok(mut inner) = inner.lock() {
		for frame in output.chunks_mut(channels as usize) {
			let sample = next_sample(&mut inner);
			let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
			for out in frame.iter_mut() {
				*out = value;
			}
		}
	}
}

fn fill_output_u16(output: &mut [u16], channels: u16, inner: &Arc<Mutex<CpalAudioInner>>) {
	if let Ok(mut inner) = inner.lock() {
		for frame in output.chunks_mut(channels as usize) {
			let sample = next_sample(&mut inner);
			let normalized = (sample.clamp(-1.0, 1.0) + 1.0) * 0.5;
			let value = (normalized * u16::MAX as f32) as u16;
			for out in frame.iter_mut() {
				*out = value;
			}
		}
	}
}

fn next_sample(inner: &mut CpalAudioInner) -> f32 {
	if let Some(sample) = inner.consumer.try_pop() {
		inner.last_sample = sample;
		sample
	} else {
		inner.last_sample
	}
}

fn log_stream_error(error: cpal::StreamError) {
	eprintln!("NES audio stream error: {error}");
}
