use std::collections::HashMap;
use std::ffi::CString;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use libc::{c_void, close, ftruncate, mmap, munmap, shm_open, shm_unlink, MAP_FAILED, MAP_SHARED, O_CREAT, O_EXCL, O_RDWR, PROT_READ, PROT_WRITE};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use once_cell::sync::Lazy;

struct ShmMapping {
	ptr: *mut u8,
	size: usize,
	fd: i32,
	name: String,
}

unsafe impl Send for ShmMapping {}
unsafe impl Sync for ShmMapping {}

static SHM_MAP: Lazy<Mutex<HashMap<String, ShmMapping>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static COUNTER: AtomicUsize = AtomicUsize::new(0);

#[napi(object)]
pub struct SharedMemoryHandle {
	pub name: String,
	pub size: u32,
	pub buffer: Uint8Array,
}

#[napi]
pub fn native_version() -> String {
	env!("CARGO_PKG_VERSION").to_string()
}

#[napi]
pub fn create_shared_memory(size: u32) -> Result<SharedMemoryHandle> {
	if size == 0 {
		return Err(Error::new(Status::InvalidArg, "size must be greater than 0".to_string()));
	}
	let size_usize = size as usize;
	for _ in 0..8 {
		let name = generate_name();
		let c_name = CString::new(name.clone())
			.map_err(|_| Error::new(Status::InvalidArg, "invalid shared memory name".to_string()))?;
		let fd = unsafe { shm_open(c_name.as_ptr(), O_CREAT | O_EXCL | O_RDWR, 0o600) };
		if fd < 0 {
			let err = std::io::Error::last_os_error();
			if err.raw_os_error() == Some(libc::EEXIST) {
				continue;
			}
			return Err(Error::new(
				Status::GenericFailure,
				format!("shm_open failed: {err}"),
			));
		}

		let truncate_result = unsafe { ftruncate(fd, size as libc::off_t) };
		if truncate_result != 0 {
			let err = std::io::Error::last_os_error();
			cleanup_failed_shm(fd, &c_name, None, size_usize);
			return Err(Error::new(
				Status::GenericFailure,
				format!("ftruncate failed: {err}"),
			));
		}

		let ptr = unsafe {
			mmap(
				std::ptr::null_mut(),
				size_usize,
				PROT_READ | PROT_WRITE,
				MAP_SHARED,
				fd,
				0,
			)
		};
		if ptr == MAP_FAILED {
			let err = std::io::Error::last_os_error();
			cleanup_failed_shm(fd, &c_name, None, size_usize);
			return Err(Error::new(
				Status::GenericFailure,
				format!("mmap failed: {err}"),
			));
		}
		let ptr = ptr as *mut u8;

		let mapping = ShmMapping {
			ptr,
			size: size_usize,
			fd,
			name: name.clone(),
		};
		{
			let mut map = SHM_MAP.lock().map_err(|_| {
				cleanup_failed_shm(fd, &c_name, Some(ptr), size_usize);
				Error::new(Status::GenericFailure, "shared memory map lock poisoned".to_string())
			})?;
			map.insert(name.clone(), mapping);
		}

		let name_for_finalize = name.clone();
		let buffer = unsafe {
			Uint8Array::with_external_data(ptr, size_usize, move |_data, _len| {
				close_shared_memory_internal(&name_for_finalize);
			})
		};

		return Ok(SharedMemoryHandle { name, size, buffer });
	}

	Err(Error::new(
		Status::GenericFailure,
		"unable to allocate shared memory name".to_string(),
	))
}

#[napi]
pub fn close_shared_memory(name: String) -> Result<bool> {
	Ok(close_shared_memory_internal(&name))
}

fn cleanup_failed_shm(fd: i32, name: &CString, ptr: Option<*mut u8>, size: usize) {
	unsafe {
		if let Some(ptr) = ptr {
			munmap(ptr as *mut c_void, size);
		}
		if fd >= 0 {
			close(fd);
		}
		shm_unlink(name.as_ptr());
	}
}

fn close_shared_memory_internal(name: &str) -> bool {
	let mapping = {
		let mut map = match SHM_MAP.lock() {
			Ok(map) => map,
			Err(_) => return false,
		};
		map.remove(name)
	};

	let Some(mapping) = mapping else {
		return false;
	};

	unsafe {
		munmap(mapping.ptr as *mut c_void, mapping.size);
		if mapping.fd >= 0 {
			close(mapping.fd);
		}
		if let Ok(c_name) = CString::new(mapping.name) {
			shm_unlink(c_name.as_ptr());
		}
	}

	true
}

fn generate_name() -> String {
	let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
	let now = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.unwrap_or_default()
		.as_nanos();
	format!("/pi-nes-shm-{pid}-{now}-{counter}", pid = std::process::id())
}
