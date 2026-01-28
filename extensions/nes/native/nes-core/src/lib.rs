use napi::bindgen_prelude::Uint8Array;
use napi_derive::napi;
use nes_rust::button::Button;
use nes_rust::default_audio::DefaultAudio;
use nes_rust::default_input::DefaultInput;
use nes_rust::display::{Display, SCREEN_HEIGHT, SCREEN_WIDTH};
use nes_rust::rom::Rom;
use nes_rust::Nes;

#[napi]
pub fn native_version() -> String {
	env!("CARGO_PKG_VERSION").to_string()
}

struct NativeDisplay {
	pixels: Vec<u8>,
}

impl NativeDisplay {
	fn new() -> Self {
		Self {
			pixels: vec![0; (SCREEN_WIDTH * SCREEN_HEIGHT * 3) as usize],
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

#[napi]
pub struct NativeNes {
	nes: Nes,
	framebuffer: Vec<u8>,
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
			framebuffer: vec![0; (SCREEN_WIDTH * SCREEN_HEIGHT * 3) as usize],
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
	}

	#[napi]
	pub fn reset(&mut self) {
		self.nes.reset();
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
