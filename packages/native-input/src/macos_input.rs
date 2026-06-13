use core_graphics::event::{
  CGEvent, CGEventTapLocation, CGEventType, CGMouseButton, EventField, ScrollEventUnit,
};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use core_graphics::geometry::CGPoint;

fn with_source<F>(mut callback: F)
where
  F: FnMut(CGEventSource),
{
  if let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
    callback(source);
  }
}

fn point(x: i32, y: i32) -> CGPoint {
  CGPoint::new(x as f64, y as f64)
}

fn post_mouse_event(
  event_type: CGEventType,
  button: CGMouseButton,
  x: i32,
  y: i32,
  click_state: i64,
) {
  with_source(|source| {
    if let Ok(event) = CGEvent::new_mouse_event(source, event_type, point(x, y), button) {
      event.set_integer_value_field(EventField::MOUSE_EVENT_CLICK_STATE, click_state);
      event.post(CGEventTapLocation::HID);
    }
  });
}

pub fn focus_window(_window_id: &str) {
  // PairPair's captured window identifier is currently only usable for the Windows native path.
}

pub fn move_mouse(x: i32, y: i32) {
  post_mouse_event(CGEventType::MouseMoved, CGMouseButton::Left, x, y, 0);
}

pub fn mouse_button(button: u8, down: bool, x: i32, y: i32) {
  let (mouse_button, event_type) = match (button, down) {
    (0, true) => (CGMouseButton::Left, CGEventType::LeftMouseDown),
    (0, false) => (CGMouseButton::Left, CGEventType::LeftMouseUp),
    (1, true) => (CGMouseButton::Right, CGEventType::RightMouseDown),
    (1, false) => (CGMouseButton::Right, CGEventType::RightMouseUp),
    (2, true) => (CGMouseButton::Center, CGEventType::OtherMouseDown),
    (2, false) => (CGMouseButton::Center, CGEventType::OtherMouseUp),
    _ => return,
  };
  post_mouse_event(event_type, mouse_button, x, y, 1);
}

pub fn mouse_scroll(delta_x: i32, delta_y: i32, x: i32, y: i32) {
  move_mouse(x, y);
  with_source(|source| {
    if let Ok(event) =
      CGEvent::new_scroll_event(source, ScrollEventUnit::PIXEL, 2, -delta_y, -delta_x, 0)
    {
      event.set_double_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_1, (-delta_y) as f64);
      event.set_double_value_field(EventField::SCROLL_WHEEL_EVENT_POINT_DELTA_AXIS_2, (-delta_x) as f64);
      event.set_double_value_field(EventField::SCROLL_WHEEL_EVENT_FIXED_POINT_DELTA_AXIS_1, ((-delta_y) as f64) * 65536.0);
      event.set_double_value_field(EventField::SCROLL_WHEEL_EVENT_FIXED_POINT_DELTA_AXIS_2, ((-delta_x) as f64) * 65536.0);
      event.post(CGEventTapLocation::HID);
    }
  });
}

fn post_key_event(key_code: u16, key_down: bool) {
  with_source(|source| {
    if let Ok(event) = CGEvent::new_keyboard_event(source, key_code, key_down) {
      event.post(CGEventTapLocation::HID);
    }
  });
}

pub fn key_down(vk_code: u16) {
  post_key_event(vk_code, true);
}

pub fn key_up(vk_code: u16) {
  post_key_event(vk_code, false);
}

pub fn type_text(text: &str) {
  let encoded: Vec<u16> = text.encode_utf16().collect();
  if encoded.is_empty() {
    return;
  }

  with_source(|source| {
    if let Ok(key_down) = CGEvent::new_keyboard_event(source, 0, true) {
      key_down.set_string_from_utf16_unchecked(&encoded);
      key_down.post(CGEventTapLocation::HID);
    }
  });
  with_source(|source| {
    if let Ok(key_up) = CGEvent::new_keyboard_event(source, 0, false) {
      key_up.post(CGEventTapLocation::HID);
    }
  });
}
