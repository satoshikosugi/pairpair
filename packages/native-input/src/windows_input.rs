#[cfg(target_os = "windows")]
use windows::{
  Win32::Foundation::HWND,
  Win32::UI::Input::KeyboardAndMouse::*,
  Win32::UI::Input::Ime::{ImmGetContext, ImmReleaseContext, ImmSetOpenStatus},
  Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetForegroundWindow, IsIconic, SetCursorPos, SetForegroundWindow, ShowWindow, SW_RESTORE,
  },
};

pub fn focus_window(window_id: &str) {
  let Ok(raw_handle) = window_id.parse::<isize>() else {
    return;
  };
  let hwnd = HWND(raw_handle);
  unsafe {
    if IsIconic(hwnd).as_bool() {
      let _ = ShowWindow(hwnd, SW_RESTORE);
    }
    let _ = BringWindowToTop(hwnd);
    let _ = SetForegroundWindow(hwnd);
  }
}

fn parse_hwnd(window_id: &str) -> Option<HWND> {
  let Ok(raw_handle) = window_id.parse::<isize>() else {
    return None;
  };
  Some(HWND(raw_handle))
}

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

/// IMM32 API を使って Windows IME の ON/OFF を直接制御する。
/// `open=true` で日本語入力 ON、`open=false` で英数入力 (IME OFF)。
/// SendInput での VK_KANA と異なり、フォアグラウンドウィンドウがどこであっても確実に動作する。
pub fn set_ime_mode_win(open: bool) {
  #[cfg(target_os = "windows")]
  unsafe {
    let hwnd = GetForegroundWindow();
    if hwnd.0 == 0 {
      return;
    }
    set_ime_open_status(hwnd, open);
  }
}

pub fn set_ime_mode_for_window_win(window_id: &str, open: bool) {
  #[cfg(target_os = "windows")]
  unsafe {
    let Some(hwnd) = parse_hwnd(window_id) else {
      return;
    };
    if hwnd.0 == 0 {
      return;
    }
    set_ime_open_status(hwnd, open);
  }
}

unsafe fn set_ime_open_status(hwnd: HWND, open: bool) {
  unsafe {
    if hwnd.0 == 0 {
      return;
    }
    let himc = ImmGetContext(hwnd);
    // himc が null でなければ（IME が使えるウィンドウであれば）切り替える
    if !himc.is_invalid() {
      let _ = ImmSetOpenStatus(himc, open);
      let _ = ImmReleaseContext(hwnd, himc);
    }
  }
}
