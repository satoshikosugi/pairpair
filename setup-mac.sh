#!/usr/bin/env bash
# =============================================================================
# PairPair macOS セットアップ・ビルド・実行スクリプト
#
# 使い方:
#   ./setup-mac.sh          # 初回セットアップ + ビルド + 開発サーバー起動
#   ./setup-mac.sh --setup  # 依存関係のインストールのみ
#   ./setup-mac.sh --build  # ビルドのみ (依存関係インストール済み前提)
#   ./setup-mac.sh --dev    # 開発モードで起動
#   ./setup-mac.sh --package        # arm64/x64 それぞれパッケージング
#   ./setup-mac.sh --package-arm64  # Apple Silicon 向けパッケージング
#   ./setup-mac.sh --package-x64    # Intel Mac 向けパッケージング
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# -----------------------------------------------------------------------
# ログ用ユーティリティ
# -----------------------------------------------------------------------
info()    { echo "  [INFO] $*"; }
success() { echo "  [OK]   $*"; }
warn()    { echo "  [WARN] $*"; }
error()   { echo "  [ERR]  $*" >&2; exit 1; }
step()    { echo; echo ">>> $*"; }

# -----------------------------------------------------------------------
# Xcode コマンドラインツール
# -----------------------------------------------------------------------
ensure_xcode_clt() {
  step "Xcode コマンドラインツール確認"
  if xcode-select -p &>/dev/null; then
    success "Xcode CLT: $(xcode-select -p)"
  else
    warn "Xcode CLT が見つかりません。インストールを開始します..."
    xcode-select --install || true
    echo
    echo "  Xcode CLT のインストールが完了したら、このスクリプトを再実行してください。"
    exit 1
  fi
}

# -----------------------------------------------------------------------
# Homebrew
# -----------------------------------------------------------------------
ensure_homebrew() {
  step "Homebrew 確認"
  if command -v brew &>/dev/null; then
    success "Homebrew: $(brew --version | head -1)"
  else
    info "Homebrew をインストールしています..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon では /opt/homebrew/bin にインストールされる
    if [[ -f /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    success "Homebrew インストール完了"
  fi
}

# -----------------------------------------------------------------------
# Node.js (nvm 経由)
# -----------------------------------------------------------------------
ensure_node() {
  step "Node.js 確認"

  # nvm がなければインストール
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    info "nvm をインストールしています..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi
  # nvm をロード
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh" 2>/dev/null || true

  if ! command -v node &>/dev/null; then
    info "Node.js LTS をインストールしています..."
    nvm install --lts
    nvm use --lts
  fi

  NODE_VERSION=$(node --version)
  MAJOR=${NODE_VERSION#v}
  MAJOR=${MAJOR%%.*}
  if (( MAJOR < 20 )); then
    info "Node.js v${MAJOR} は古いため LTS へ更新します..."
    nvm install --lts
    nvm use --lts
  fi
  success "Node.js: $(node --version)"
}

# -----------------------------------------------------------------------
# pnpm
# -----------------------------------------------------------------------
ensure_pnpm() {
  step "pnpm 確認"
  if command -v pnpm &>/dev/null; then
    success "pnpm: $(pnpm --version)"
  else
    info "pnpm をインストールしています..."
    npm install -g pnpm
    success "pnpm: $(pnpm --version)"
  fi
}

# -----------------------------------------------------------------------
# Rust + rustup
# -----------------------------------------------------------------------
ensure_rust() {
  step "Rust 確認"

  # rustup がなければインストール
  if ! command -v rustup &>/dev/null; then
    info "Rust (rustup) をインストールしています..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  fi

  # cargo/rustup のパスを通す
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env" 2>/dev/null || export PATH="$HOME/.cargo/bin:$PATH"

  success "Rust: $(rustc --version)"
  success "cargo: $(cargo --version)"

  # 現在のアーキテクチャのターゲットを追加
  ARCH=$(uname -m)
  if [[ "$ARCH" == "arm64" ]]; then
    info "aarch64-apple-darwin ターゲットを追加..."
    rustup target add aarch64-apple-darwin
  else
    info "x86_64-apple-darwin ターゲットを追加..."
    rustup target add x86_64-apple-darwin
  fi
}

# -----------------------------------------------------------------------
# napi-rs CLI (グローバル)
# -----------------------------------------------------------------------
ensure_napi_cli() {
  step "napi-rs CLI 確認"
  if command -v napi &>/dev/null; then
    success "napi: $(napi --version)"
  else
    info "@napi-rs/cli をインストールしています..."
    npm install -g @napi-rs/cli
    success "napi: $(napi --version)"
  fi
}

# -----------------------------------------------------------------------
# pnpm install (全 workspace)
# -----------------------------------------------------------------------
install_deps() {
  step "依存関係インストール (pnpm install)"
  pnpm install
  success "依存関係インストール完了"
}

# -----------------------------------------------------------------------
# native-input Rust ビルド
# -----------------------------------------------------------------------
build_native() {
  local mode="${1:-debug}"
  step "native-input Rust ビルド (${mode})"

  local release_flag=""
  if [[ "$mode" == "release" ]]; then
    release_flag="--release"
  fi

  # shellcheck disable=SC1091
  source "$HOME/.cargo/env" 2>/dev/null || export PATH="$HOME/.cargo/bin:$PATH"

  (cd packages/native-input && napi build --platform ${release_flag})
  success "native-input ビルド完了"
}

# -----------------------------------------------------------------------
# TypeScript ビルド
# -----------------------------------------------------------------------
build_ts() {
  step "TypeScript ビルド"
  pnpm --filter @pairpair/shared build
  pnpm --filter @pairpair/native-input build:ts
  success "TypeScript ビルド完了"
}

# -----------------------------------------------------------------------
# Electron ビルド
# -----------------------------------------------------------------------
build_electron() {
  step "Electron ビルド (electron-vite build)"
  pnpm --filter @pairpair/desktop build
  success "Electron ビルド完了"
}

# -----------------------------------------------------------------------
# 開発モード起動
# -----------------------------------------------------------------------
run_dev() {
  step "開発モード起動"
  echo "  Signaling Server と Desktop を同時に起動します。"
  echo "  Ctrl+C で停止できます。"
  echo

  # Signaling Server をバックグラウンドで起動
  pnpm --filter @pairpair/signaling-server dev &
  SIGNALING_PID=$!
  info "Signaling Server 起動 (PID: $SIGNALING_PID)"

  sleep 2

  # Desktop を前面で起動
  pnpm --filter @pairpair/desktop dev

  # Desktop 終了後に Signaling Server も停止
  kill "$SIGNALING_PID" 2>/dev/null || true
}

# -----------------------------------------------------------------------
# パッケージング
# -----------------------------------------------------------------------
package_app() {
  local arch="${1:-current}"
  step "パッケージング (arch: ${arch})"

  # リリースビルドで native-input を再ビルド
  build_native "release"
  build_ts

  case "$arch" in
    arm64)
      pnpm --filter @pairpair/desktop package:mac:arm64
      ;;
    x64)
      pnpm --filter @pairpair/desktop package:mac:x64
      ;;
    *)
      pnpm --filter @pairpair/desktop package:mac
      ;;
  esac
  success "パッケージング完了 → apps/desktop/dist/"
}

# -----------------------------------------------------------------------
# macOS 権限確認ヘルプ
# -----------------------------------------------------------------------
show_permission_help() {
  echo
  echo "================================================================"
  echo "  macOS 権限設定 (初回起動時に必要)"
  echo "================================================================"
  echo
  echo "  1. 画面収録 (ホスト機能に必要)"
  echo "     システム設定 → プライバシーとセキュリティ → 画面収録"
  echo "     → PairPair にチェックを入れる"
  echo
  echo "  2. アクセシビリティ (リモート入力注入に必要)"
  echo "     システム設定 → プライバシーとセキュリティ → アクセシビリティ"
  echo "     → PairPair にチェックを入れる"
  echo
  echo "  権限を付与後、アプリを再起動してください。"
  echo "================================================================"
  echo
}

# -----------------------------------------------------------------------
# メイン処理
# -----------------------------------------------------------------------
MODE="${1:---all}"

case "$MODE" in
  --setup)
    ensure_xcode_clt
    ensure_homebrew
    ensure_node
    ensure_pnpm
    ensure_rust
    ensure_napi_cli
    install_deps
    build_native "debug"
    build_ts
    show_permission_help
    success "セットアップ完了！"
    echo "  次に ./setup-mac.sh --dev で開発サーバーを起動できます。"
    ;;

  --build)
    build_native "debug"
    build_ts
    build_electron
    success "ビルド完了"
    ;;

  --dev)
    # nvm / cargo のパスを通す
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    [[ -s "$NVM_DIR/nvm.sh" ]] && source "$NVM_DIR/nvm.sh"
    # shellcheck disable=SC1091
    [[ -s "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env" || export PATH="$HOME/.cargo/bin:$PATH"
    run_dev
    ;;

  --package)
    package_app "current"
    ;;
  --package-arm64)
    package_app "arm64"
    ;;
  --package-x64)
    package_app "x64"
    ;;

  --help|-h)
    echo "使い方: ./setup-mac.sh [オプション]"
    echo
    echo "  --setup         初回セットアップ（依存関係インストール + デバッグビルド）"
    echo "  --build         ビルドのみ（依存関係インストール済み前提）"
    echo "  --dev           開発モードで起動（Signaling Server + Desktop）"
    echo "  --package       現在のアーキテクチャ向けに dmg/zip をビルド"
    echo "  --package-arm64 Apple Silicon (arm64) 向けにパッケージング"
    echo "  --package-x64   Intel Mac (x64) 向けにパッケージング"
    echo "  (引数なし)      初回セットアップ + ビルド + 開発モード起動"
    ;;

  *)
    # 引数なし or --all: フルセットアップ → 開発起動
    ensure_xcode_clt
    ensure_homebrew
    ensure_node
    ensure_pnpm
    ensure_rust
    ensure_napi_cli
    install_deps
    build_native "debug"
    build_ts
    show_permission_help
    success "セットアップ完了！開発モードを起動します..."
    run_dev
    ;;
esac
