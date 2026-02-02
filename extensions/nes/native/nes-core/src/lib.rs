use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;
use nes_rust::button::Button;
use nes_rust::default_audio::DefaultAudio;
use nes_rust::default_input::DefaultInput;
use nes_rust::display::{Display, SCREEN_HEIGHT, SCREEN_WIDTH};
use nes_rust::rom::Rom;
use nes_rust::Nes;

const FRAME_BYTE_LEN: usize = (SCREEN_WIDTH * SCREEN_HEIGHT * 3) as usize;

#[derive(Clone, Copy, PartialEq, Eq)]
enum VideoFilterMode {
	Off,
	NtscComposite,
	NtscSvideo,
	NtscRgb,
}

struct VideoFilterConfig {
	luma: [f32; 3],
	chroma: [f32; 3],
	scanline_dim: f32,
	chroma_gain: f32,
}

struct NativeDisplay {
	pixels: Vec<u8>,
}

impl NativeDisplay {
	fn new() -> Self {
		Self {
			pixels: vec![0; FRAME_BYTE_LEN],
		}
	}
}

impl Display for NativeDisplay {
	fn render_pixel(&mut self, x: u16, y: u16, c: u32) {
		let x = x as usize;
		let y = y as usize;
		if x >= SCREEN_WIDTH as usize || y >= SCREEN_HEIGHT as usize {
			return;
		}
		let base_index = (y * SCREEN_WIDTH as usize + x) * 3;
		let r = (c & 0xff) as u8;
		let g = ((c >> 8) & 0xff) as u8;
		let b = ((c >> 16) & 0xff) as u8;
		self.pixels[base_index] = r;
		self.pixels[base_index + 1] = g;
		self.pixels[base_index + 2] = b;
	}

	fn vblank(&mut self) {}

	fn copy_to_rgba_pixels(&self, pixels: &mut [u8]) {
		let len = pixels.len().min(self.pixels.len());
		pixels[..len].copy_from_slice(&self.pixels[..len]);
	}
}

#[napi(object)]
pub struct CpuDebugState {
	pub pc: u16,
	pub a: u8,
	pub x: u8,
	pub y: u8,
	pub sp: u8,
	pub p: u8,
	pub last_pc: u16,
	pub last_opcode: u8,
}

#[napi(object)]
pub struct MapperDebugState {
	pub mapper_num: u8,
	pub control: u8,
	pub prg: u8,
	pub chr0: u8,
	pub chr1: u8,
	pub prg_mode: u8,
	pub chr_mode: u8,
	pub outer_prg: u8,
}

#[napi(object)]
pub struct NesDebugState {
	pub cpu: CpuDebugState,
	pub mapper: MapperDebugState,
}

#[napi]
pub struct NativeNes {
	nes: Nes,
	framebuffer: Vec<u8>,
	filter_buffer: Vec<u8>,
	video_filter: VideoFilterMode,
}

#[napi]
impl NativeNes {
	#[napi(constructor)]
	pub fn new() -> Self {
		let input = Box::new(DefaultInput::new());
		let display = Box::new(NativeDisplay::new());
		let audio = Box::new(DefaultAudio::new());
		let nes = Nes::new(input, display, audio);
		Self {
			nes,
			framebuffer: vec![0; FRAME_BYTE_LEN],
			filter_buffer: vec![0; FRAME_BYTE_LEN],
			video_filter: VideoFilterMode::Off,
		}
	}

	#[napi]
	pub fn set_rom(&mut self, data: napi::bindgen_prelude::Uint8Array) {
		let rom = Rom::new(data.to_vec());
		self.nes.set_rom(rom);
	}

	#[napi]
	pub fn bootup(&mut self) {
		self.nes.bootup();
	}

	#[napi]
	pub fn step_frame(&mut self) {
		self.nes.step_frame();
	}

	#[napi]
	pub fn refresh_framebuffer(&mut self) {
		self.nes.copy_pixels(&mut self.framebuffer);
		if let Some(config) = video_filter_config(self.video_filter) {
			self.filter_buffer.copy_from_slice(&self.framebuffer);
			apply_video_filter(&self.filter_buffer, &mut self.framebuffer, &config);
		}
	}

	#[napi]
	pub fn set_video_filter(&mut self, mode: u8) {
		self.video_filter = match mode {
			1 => VideoFilterMode::NtscComposite,
			2 => VideoFilterMode::NtscSvideo,
			3 => VideoFilterMode::NtscRgb,
			_ => VideoFilterMode::Off,
		};
	}

	#[napi]
	pub fn press_button(&mut self, button: u8) {
		if let Some(mapped) = map_button(button) {
			self.nes.press_button(mapped);
		}
	}

	#[napi]
	pub fn release_button(&mut self, button: u8) {
		if let Some(mapped) = map_button(button) {
			self.nes.release_button(mapped);
		}
	}

	#[napi]
	pub fn has_battery_backed_ram(&self) -> bool {
		self.nes.has_battery_backed_ram()
	}

	#[napi]
	pub fn get_sram(&self) -> Uint8Array {
		Uint8Array::from(self.nes.get_sram())
	}

	#[napi]
	pub fn set_sram(&mut self, data: Uint8Array) {
		self.nes.set_sram(data.to_vec());
	}

	#[napi]
	pub fn is_sram_dirty(&self) -> bool {
		self.nes.is_sram_dirty()
	}

	#[napi]
	pub fn mark_sram_saved(&mut self) {
		self.nes.mark_sram_saved();
	}

	#[napi]
	pub fn get_debug_state(&self) -> NesDebugState {
		let state = self.nes.debug_state();
		NesDebugState {
			cpu: CpuDebugState {
				pc: state.cpu.pc,
				a: state.cpu.a,
				x: state.cpu.x,
				y: state.cpu.y,
				sp: state.cpu.sp,
				p: state.cpu.p,
				last_pc: state.cpu.last_pc,
				last_opcode: state.cpu.last_opcode,
			},
			mapper: MapperDebugState {
				mapper_num: state.mapper.mapper_num,
				control: state.mapper.control,
				prg: state.mapper.prg,
				chr0: state.mapper.chr0,
				chr1: state.mapper.chr1,
				prg_mode: state.mapper.prg_mode,
				chr_mode: state.mapper.chr_mode,
				outer_prg: state.mapper.outer_prg,
			},
		}
	}

	#[napi]
	pub fn get_framebuffer(&mut self) -> Uint8Array {
		let ptr = self.framebuffer.as_mut_ptr();
		let len = self.framebuffer.len();
		unsafe { Uint8Array::with_external_data(ptr, len, |_data, _len| {}) }
	}
}

fn map_button(button: u8) -> Option<Button> {
	match button {
		0 => Some(Button::Select),
		1 => Some(Button::Start),
		2 => Some(Button::Joypad1A),
		3 => Some(Button::Joypad1B),
		4 => Some(Button::Joypad1Up),
		5 => Some(Button::Joypad1Down),
		6 => Some(Button::Joypad1Left),
		7 => Some(Button::Joypad1Right),
		_ => None,
	}
}

fn video_filter_config(mode: VideoFilterMode) -> Option<VideoFilterConfig> {
	match mode {
		VideoFilterMode::Off => None,
		VideoFilterMode::NtscComposite => Some(VideoFilterConfig {
			luma: [0.2, 0.6, 0.2],
			chroma: [0.25, 0.5, 0.25],
			scanline_dim: 0.85,
			chroma_gain: 0.9,
		}),
		VideoFilterMode::NtscSvideo => Some(VideoFilterConfig {
			luma: [0.15, 0.7, 0.15],
			chroma: [0.2, 0.6, 0.2],
			scanline_dim: 0.9,
			chroma_gain: 0.95,
		}),
		VideoFilterMode::NtscRgb => Some(VideoFilterConfig {
			luma: [0.1, 0.8, 0.1],
			chroma: [0.1, 0.8, 0.1],
			scanline_dim: 0.95,
			chroma_gain: 1.0,
		}),
	}
}

fn apply_video_filter(source: &[u8], target: &mut [u8], config: &VideoFilterConfig) {
	let width = SCREEN_WIDTH as usize;
	let height = SCREEN_HEIGHT as usize;
	if source.len() < FRAME_BYTE_LEN || target.len() < FRAME_BYTE_LEN {
		return;
	}
	for y in 0..height {
		let scanline = if y % 2 == 0 { 1.0 } else { config.scanline_dim };
		for x in 0..width {
			let left_x = if x == 0 { 0 } else { x - 1 };
			let right_x = if x + 1 >= width { width - 1 } else { x + 1 };
			let center_x = x;

			let left_idx = (y * width + left_x) * 3;
			let center_idx = (y * width + center_x) * 3;
			let right_idx = (y * width + right_x) * 3;

			let (y0, i0, q0) = rgb_to_yiq(source[left_idx], source[left_idx + 1], source[left_idx + 2]);
			let (y1, i1, q1) = rgb_to_yiq(source[center_idx], source[center_idx + 1], source[center_idx + 2]);
			let (y2, i2, q2) = rgb_to_yiq(source[right_idx], source[right_idx + 1], source[right_idx + 2]);

			let luma = config.luma[0] * y0 + config.luma[1] * y1 + config.luma[2] * y2;
			let chroma_i = config.chroma_gain * (config.chroma[0] * i0 + config.chroma[1] * i1 + config.chroma[2] * i2);
			let chroma_q = config.chroma_gain * (config.chroma[0] * q0 + config.chroma[1] * q1 + config.chroma[2] * q2);

			let (r, g, b) = yiq_to_rgb(luma, chroma_i, chroma_q);
			target[center_idx] = clamp_u8(r * scanline);
			target[center_idx + 1] = clamp_u8(g * scanline);
			target[center_idx + 2] = clamp_u8(b * scanline);
		}
	}
}

fn rgb_to_yiq(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
	let r = r as f32;
	let g = g as f32;
	let b = b as f32;
	let y = 0.299 * r + 0.587 * g + 0.114 * b;
	let i = 0.596 * r - 0.274 * g - 0.322 * b;
	let q = 0.211 * r - 0.523 * g + 0.312 * b;
	(y, i, q)
}

fn yiq_to_rgb(y: f32, i: f32, q: f32) -> (f32, f32, f32) {
	let r = y + 0.956 * i + 0.621 * q;
	let g = y - 0.272 * i - 0.647 * q;
	let b = y - 1.106 * i + 1.703 * q;
	(r, g, b)
}

fn clamp_u8(value: f32) -> u8 {
	value.max(0.0).min(255.0).round() as u8
}
