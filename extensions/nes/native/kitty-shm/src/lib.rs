use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi]
pub fn native_version() -> String {
	env!("CARGO_PKG_VERSION").to_string()
}
