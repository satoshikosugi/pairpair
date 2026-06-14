#![deny(clippy::all)]

use napi_derive::napi;

#[cfg(target_os = "windows")]
mod windows_input;

#[cfg(target_os = "macos")]
mod macos_input;

#[cfg(target_os = "macos")]
mod macos_ime;

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

/// Bring a captured application window to the foreground before injecting input.
#[napi]
pub fn focus_window(window_id: String) {
  #[cfg(target_os = "windows")]
  windows_input::focus_window(&window_id);
  #[cfg(target_os = "macos")]
  macos_input::focus_window(&window_id);
  #[cfg(not(any(target_os = "windows", target_os = "macos")))]
  let _ = window_id;
}

/// macOS TIS API を使って現在の IME 入力ソースを取得する。
///
/// 返り値:
/// - `"japanese"` : 日本語入力ソースがアクティブ
///   (英数キー・かなキー・Ctrl+Space・Globe キー・メニューバーボタン等の
///   あらゆる切り替え方法に対応)
/// - `"latin"` : ASCII / ラテン文字入力ソースがアクティブ
///
/// macOS 以外では常に `"latin"` を返す。
#[napi]
pub fn get_current_ime_mode() -> String {
  #[cfg(target_os = "macos")]
  {
    return macos_ime::get_current_ime_mode();
  }
  #[cfg(not(target_os = "macos"))]
  "latin".to_string()
}
