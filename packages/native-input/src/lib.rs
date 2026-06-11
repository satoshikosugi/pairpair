#![deny(clippy::all)]

use napi_derive::napi;

#[cfg(target_os = "windows")]
mod windows_input;

#[cfg(target_os = "macos")]
mod macos_input;

/// Move mouse cursor to absolute screen position
#[napi]
pub fn move_mouse(x: i32, y: i32) {
  #[cfg(target_os = "windows")]
  windows_input::move_mouse(x, y);
  #[cfg(target_os = "macos")]
  macos_input::move_mouse(x, y);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = (x, y);
}

/// Simulate mouse button press/release
/// button: 0=left, 1=right, 2=middle
#[napi]
pub fn mouse_button(button: u8, down: bool, x: i32, y: i32) {
  #[cfg(target_os = "windows")]
  windows_input::mouse_button(button, down, x, y);
  #[cfg(target_os = "macos")]
  macos_input::mouse_button(button, down, x, y);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = (button, down, x, y);
}

/// Simulate mouse wheel scroll
#[napi]
pub fn mouse_scroll(delta_x: i32, delta_y: i32, x: i32, y: i32) {
  #[cfg(target_os = "windows")]
  windows_input::mouse_scroll(delta_x, delta_y, x, y);
  #[cfg(target_os = "macos")]
  macos_input::mouse_scroll(delta_x, delta_y, x, y);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = (delta_x, delta_y, x, y);
}

/// Simulate key press
#[napi]
pub fn key_down(vk_code: u16) {
  #[cfg(target_os = "windows")]
  windows_input::key_down(vk_code);
  #[cfg(target_os = "macos")]
  macos_input::key_down(vk_code);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = vk_code;
}

/// Simulate key release
#[napi]
pub fn key_up(vk_code: u16) {
  #[cfg(target_os = "windows")]
  windows_input::key_up(vk_code);
  #[cfg(target_os = "macos")]
  macos_input::key_up(vk_code);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = vk_code;
}

/// Type text using clipboard paste method
#[napi]
pub fn type_text(text: String) {
  #[cfg(target_os = "windows")]
  windows_input::type_text(&text);
  #[cfg(target_os = "macos")]
  macos_input::type_text(&text);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = text;
}
