//! macOS Text Input Sources (TIS) API による IME 入力ソース監視
//!
//! `TISCopyCurrentKeyboardInputSource()` でキーボードレイアウト／入力メソッドを
//! 取得し、日本語入力ソースかどうかを判定する。
//!
//! これにより、JIS キーボードの英数・かな物理キー、メニューバーの ABC/あ
//! ソフトボタンクリック、US キーボードの Ctrl+Space、Globe キーなど
//! **あらゆる IME 切り替え手段を統一的に検出**できる。

#![allow(non_upper_case_globals, non_camel_case_types)]

use std::ffi::CStr;
use std::os::raw::{c_char, c_long, c_void};

// ---- 型エイリアス (CoreFoundation / TIS opaque types) ----

type CFTypeRef = *const c_void;
type CFStringRef = *const c_void;
type CFArrayRef = *const c_void;
/// TISInputSourceRef は retain/release が必要な CF オブジェクト
type TISInputSourceRef = *mut c_void;
/// macOS 64bit では CFIndex = long = i64
type CFIndex = c_long;

/// kCFStringEncodingUTF8 = 0x08000100
const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

// ---- Carbon (HIToolbox) フレームワーク: TIS 関数とプロパティキー ----

#[link(name = "Carbon", kind = "framework")]
extern "C" {
  /// 現在アクティブなキーボード入力ソースの TISInputSourceRef を返す。
  /// 呼び出し元が CFRelease する責任を持つ (Copy semantics)。
  fn TISCopyCurrentKeyboardInputSource() -> TISInputSourceRef;

  /// 入力ソースのプロパティ値を返す。
  /// 返り値は **borrowed** (CFRelease 不要)。
  fn TISGetInputSourceProperty(
    input_source: TISInputSourceRef,
    property_key: CFStringRef,
  ) -> CFTypeRef;

  /// 入力ソース識別子文字列 ("com.apple.inputmethod.Japanese.Hiragana" など)
  static kTISPropertyInputSourceID: CFStringRef;

  /// 対応言語コードの CFArray<CFString> ("ja", "en" など)
  static kTISPropertyInputSourceLanguages: CFStringRef;
}

// ---- CoreFoundation フレームワーク ----

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
  fn CFRelease(cf: CFTypeRef);
  fn CFArrayGetCount(the_array: CFArrayRef) -> CFIndex;
  fn CFArrayGetValueAtIndex(the_array: CFArrayRef, idx: CFIndex) -> CFTypeRef;
  fn CFStringGetCString(
    the_string: CFStringRef,
    buffer: *mut c_char,
    buffer_size: CFIndex,
    encoding: u32,
  ) -> u8; // Boolean (unsigned char)
}

// ---- ユーティリティ ----

/// CFStringRef → Rust String への変換 (失敗時 None)
unsafe fn cfstring_to_string(s: CFStringRef) -> Option<String> {
  if s.is_null() {
    return None;
  }
  let mut buf = [0i8; 512];
  let ok = CFStringGetCString(s, buf.as_mut_ptr(), 512, CF_STRING_ENCODING_UTF8);
  if ok == 0 {
    return None;
  }
  let cstr = CStr::from_ptr(buf.as_ptr());
  Some(cstr.to_string_lossy().into_owned())
}

/// 入力ソース ID が日本語 IME を示すかどうか判定する。
///
/// 既知の日本語入力ソース ID プレフィックス:
/// - `com.apple.inputmethod.Japanese`          (macOS Ventura 以降)
/// - `com.apple.inputmethod.Japanese.Hiragana`
/// - `com.apple.inputmethod.Japanese.Katakana`
/// - `com.apple.inputmethod.Japanese.FullWidthRoman`
/// - `com.apple.inputmethod.Japanese.HalfWidthEisen`
/// - `com.apple.inputmethod.Kotoeri`           (旧 macOS)
/// - `com.apple.inputmethod.Kotoeri.KanaTyping`
/// - `com.apple.inputmethod.Kotoeri.RomajiTyping`
fn is_japanese_source_id(id: &str) -> bool {
  id.contains("Japanese") || id.contains("Kotoeri")
}

// ---- 公開 API ----

/// 現在の macOS キーボード入力ソースから IME モードを取得する。
///
/// 返り値: `"japanese"` または `"latin"`
pub fn get_current_ime_mode() -> String {
  unsafe {
    let source = TISCopyCurrentKeyboardInputSource();
    if source.is_null() {
      return "latin".to_string();
    }

    // 1. 入力ソース ID で判定（最も信頼性が高い）
    let id_prop = TISGetInputSourceProperty(source, kTISPropertyInputSourceID);
    if !id_prop.is_null() {
      if let Some(id) = cfstring_to_string(id_prop as CFStringRef) {
        CFRelease(source as CFTypeRef);
        return if is_japanese_source_id(&id) {
          "japanese".to_string()
        } else {
          "latin".to_string()
        };
      }
    }

    // 2. フォールバック: 対応言語リストで "ja" を探す
    let langs_prop = TISGetInputSourceProperty(source, kTISPropertyInputSourceLanguages);
    let mode = if !langs_prop.is_null() {
      let array = langs_prop as CFArrayRef;
      let count = CFArrayGetCount(array);
      let mut found_ja = false;
      for i in 0..count {
        let lang_ptr = CFArrayGetValueAtIndex(array, i);
        if !lang_ptr.is_null() {
          if let Some(lang) = cfstring_to_string(lang_ptr as CFStringRef) {
            if lang == "ja" {
              found_ja = true;
              break;
            }
          }
        }
      }
      if found_ja { "japanese" } else { "latin" }
    } else {
      "latin"
    };

    CFRelease(source as CFTypeRef);
    mode.to_string()
  }
}
