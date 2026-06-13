#[cfg(target_os = "windows")]
use windows::{
  Win32::UI::Input::KeyboardAndMouse::*,
  Win32::UI::WindowsAndMessaging::SetCursorPos,
};

pub fn move_mouse(x: i32, y: i32) {
  unsafe {
    let _ = SetCursorPos(x, y);
    let input = INPUT {
      r#type: INPUT_MOUSE,
      Anonymous: INPUT_0 {
        mi: MOUSEINPUT {
          dx: 0,
          dy: 0,
          mouseData: 0,
          dwFlags: MOUSEEVENTF_MOVE,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
  }
}

pub fn mouse_button(button: u8, down: bool, x: i32, y: i32) {
  let (down_flag, up_flag) = match button {
    0 => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    1 => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
    2 => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
    _ => return,
  };
  let flag = if down { down_flag } else { up_flag };
  unsafe {
    let _ = SetCursorPos(x, y);
    let input = INPUT {
      r#type: INPUT_MOUSE,
      Anonymous: INPUT_0 {
        mi: MOUSEINPUT {
          dx: 0,
          dy: 0,
          mouseData: 0,
          dwFlags: flag,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
  }
}

pub fn mouse_scroll(delta_x: i32, delta_y: i32, x: i32, y: i32) {
  unsafe {
    let _ = SetCursorPos(x, y);
    if delta_y != 0 {
      let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
          mi: MOUSEINPUT {
            dx: 0,
            dy: 0,
            mouseData: delta_y as u32,
            dwFlags: MOUSEEVENTF_WHEEL,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      };
      SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
    if delta_x != 0 {
      let input = INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
          mi: MOUSEINPUT {
            dx: 0,
            dy: 0,
            mouseData: delta_x as u32,
            dwFlags: MOUSEEVENTF_HWHEEL,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      };
      SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
    }
  }
}

pub fn key_down(vk_code: u16) {
  unsafe {
    let input = INPUT {
      r#type: INPUT_KEYBOARD,
      Anonymous: INPUT_0 {
        ki: KEYBDINPUT {
          wVk: VIRTUAL_KEY(vk_code),
          wScan: 0,
          dwFlags: KEYBD_EVENT_FLAGS(0),
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
  }
}

pub fn key_up(vk_code: u16) {
  unsafe {
    let input = INPUT {
      r#type: INPUT_KEYBOARD,
      Anonymous: INPUT_0 {
        ki: KEYBDINPUT {
          wVk: VIRTUAL_KEY(vk_code),
          wScan: 0,
          dwFlags: KEYEVENTF_KEYUP,
          time: 0,
          dwExtraInfo: 0,
        },
      },
    };
    SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
  }
}

pub fn type_text(text: &str) {
  // Type text by simulating Unicode key events for each character
  for c in text.chars() {
    let c_u16 = c as u32 as u16;
    unsafe {
      let input_down = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
          ki: KEYBDINPUT {
            wVk: VIRTUAL_KEY(0),
            wScan: c_u16,
            dwFlags: KEYEVENTF_UNICODE,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      };
      let input_up = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
          ki: KEYBDINPUT {
            wVk: VIRTUAL_KEY(0),
            wScan: c_u16,
            dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
            time: 0,
            dwExtraInfo: 0,
          },
        },
      };
      SendInput(&[input_down, input_up], std::mem::size_of::<INPUT>() as i32);
    }
  }
}
