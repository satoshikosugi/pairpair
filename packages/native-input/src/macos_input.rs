use core_graphics::event::{CGEvent, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

pub fn focus_window(_window_id: &str) {
  // Window activation requires an application-level accessibility implementation.
}

pub fn move_mouse(_x: i32, _y: i32) {
  // TODO: Phase 4 - CGEventCreateMouseEvent + CGEventPost
}

pub fn mouse_button(_button: u8, _down: bool, _x: i32, _y: i32) {
  // TODO: Phase 4
}

pub fn mouse_scroll(_delta_x: i32, _delta_y: i32, _x: i32, _y: i32) {
  // TODO: Phase 4
}

fn post_key_event(key_code: u16, key_down: bool) {
  if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
    if let Ok(event) = CGEvent::new_keyboard_event(source, key_code, key_down) {
      event.post(CGEventTapLocation::HID);
    }
  }
}

pub fn key_down(vk_code: u16) {
  post_key_event(vk_code, true);
}

pub fn key_up(vk_code: u16) {
  post_key_event(vk_code, false);
}

pub fn type_text(_text: &str) {
  // TODO: Phase 4
}
