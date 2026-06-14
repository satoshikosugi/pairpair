#[cfg(target_os = "windows")]
use windows::{
  Win32::Foundation::{HINSTANCE, HWND, LPARAM, RECT, WPARAM},
  Win32::UI::Input::KeyboardAndMouse::*,
  Win32::UI::Input::Ime::{IMC_SETOPENSTATUS, ImmGetContext, ImmGetDefaultIMEWnd, ImmReleaseContext, ImmSetOpenStatus},
  Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, CURSORINFO, GetCursorInfo, GetForegroundWindow, IDC_APPSTARTING, IDC_ARROW, IDC_CROSS, IDC_HAND, IDC_HELP, IDC_IBEAM, IDC_NO,
    IDC_SIZEALL, IDC_SIZENESW, IDC_SIZENS, IDC_SIZENWSE, IDC_SIZEWE, IDC_UPARROW, IDC_WAIT, IsIconic, LoadCursorW, GetWindowRect, SendMessageW,
    SetCursorPos, SetForegroundWindow, ShowWindow, SW_RESTORE, WM_IME_CONTROL,
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

pub fn get_cursor_kind() -> String {
  unsafe {
    let mut info = CURSORINFO {
      cbSize: std::mem::size_of::<CURSORINFO>() as u32,
      ..Default::default()
    };
    if GetCursorInfo(&mut info).is_err() || info.hCursor.0 == 0 {
      return "default".to_string();
    }

    let load = |cursor_id| LoadCursorW(HINSTANCE(0), cursor_id).ok();
    let current = info.hCursor;

    if Some(current) == load(IDC_IBEAM) {
      return "text".to_string();
    }
    if Some(current) == load(IDC_CROSS) {
      return "crosshair".to_string();
    }
    if Some(current) == load(IDC_HAND) {
      return "pointer".to_string();
    }
    if Some(current) == load(IDC_SIZEALL) {
      return "move".to_string();
    }
    if Some(current) == load(IDC_WAIT) {
      return "wait".to_string();
    }
    if Some(current) == load(IDC_APPSTARTING) {
      return "progress".to_string();
    }
    if Some(current) == load(IDC_HELP) {
      return "help".to_string();
    }
    if Some(current) == load(IDC_NO) {
      return "not-allowed".to_string();
    }
    if Some(current) == load(IDC_SIZEWE) {
      return "ew-resize".to_string();
    }
    if Some(current) == load(IDC_SIZENS) {
      return "ns-resize".to_string();
    }
    if Some(current) == load(IDC_SIZENWSE) {
      return "nwse-resize".to_string();
    }
    if Some(current) == load(IDC_SIZENESW) {
      return "nesw-resize".to_string();
    }
    if Some(current) == load(IDC_ARROW) || Some(current) == load(IDC_UPARROW) {
      return "default".to_string();
    }

    "default".to_string()
  }
}

pub fn get_window_bounds(window_id: &str) -> Option<(i32, i32, i32, i32)> {
  let hwnd = parse_hwnd(window_id)?;
  unsafe {
    let mut rect = RECT::default();
    if GetWindowRect(hwnd, &mut rect).is_err() {
      return None;
    }
    Some((rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top))
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

    let ime_hwnd = ImmGetDefaultIMEWnd(hwnd);
    if ime_hwnd.0 != 0 {
      let _ = SendMessageW(ime_hwnd, WM_IME_CONTROL, WPARAM(IMC_SETOPENSTATUS as usize), LPARAM(open as isize));
    }

    let himc = ImmGetContext(hwnd);
    // himc が null でなければ（IME が使えるウィンドウであれば）切り替える
    if !himc.is_invalid() {
      let _ = ImmSetOpenStatus(himc, open);
      let _ = ImmReleaseContext(hwnd, himc);
    }
  }
}
