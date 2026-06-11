# PairPair

軽量・高画質・低遅延なペアプロ用 1:1 リモート操作アプリ。
Electron + WebRTC で構成し、P2P での画面共有とリモートコントロールを実現します。

## 概要

- **ホストが画面を共有**：自分のPC画面をゲストに P2P 配信
- **ゲストが操作可能**：許可を受けてマウス・キーボードでリモート操作
- **4K 対応**：画質プリセット（720p / 1080p / 1440p / 4K）から選択
- **低遅延**：WebRTC P2P のみで TURN リレーなし（初期版）
- **クロスプラットフォーム**：Windows / Mac 対応

## 仕様・設計書

- [SPEC.md](docs/SPEC.md) — 全仕様・API・プロトコル・UI・セキュリティ詳細
- [TASK.md](docs/TASK.md) — 実装タスクチェックリスト（Phase 0〜5）
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — AI 実装ガイドライン

## プロジェクト構成

```
pairpair/
  apps/
    desktop/          # Electron + React デスクトップアプリ
    signaling-server/ # Node.js + Fastify シグナリングサーバー
  packages/
    shared/           # 共通型定義（WebSocket / DataChannel / 入力イベント）
    native-input/     # Rust + napi-rs ネイティブ入力注入
  docs/
    SPEC.md           # 仕様書
    TASK.md           # 実装タスク
```

## 技術スタック

### デスクトップアプリ (`apps/desktop`)

| 項目 | 技術 |
|------|------|
| 基盤 | Electron |
| UI | React + TypeScript |
| ビルド | electron-vite |
| 状態管理 | Zustand |
| ネイティブ操作 | napi-rs (Rust) |
| ログ | electron-log |
| 設定保存 | electron-store |
| テスト | Vitest, Playwright |

### サーバー (`apps/signaling-server`)

| 項目 | 技術 |
|------|------|
| API | Node.js + Fastify |
| WebSocket | ws |
| セッション管理 | Redis |
| バリデーション | Zod |
| ログ | Pino |

### 共通

| 項目 | 技術 |
|------|------|
| パッケージマネージャー | pnpm |
| モノレポ | Turborepo |
| 言語 | TypeScript 5.x |

## 実装フェーズ

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 0 | リポジトリ・環境構築・型定義 | ⏳ 予定 |
| Phase 1 | P2P 画面共有（最小） | ⏳ 予定 |
| Phase 2 | 画質設定 | ⏳ 予定 |
| Phase 3 | マウス操作 | ⏳ 予定 |
| Phase 4 | キーボード操作 | ⏳ 予定 |
| Phase 5 | 安定化・パッケージング | ⏳ 予定 |

詳細は [TASK.md](docs/TASK.md) を参照。

## 重要な制約

- **P2P のみ**：TURN リレーは初期版では使用しない
- **セキュリティ第一**：Electron は sandbox + contextIsolation 必須
- **レイアウト分離**：main / preload / renderer の責務分離を厳格に保つ
- **型定義の集約**：`packages/shared` で全型を管理

詳細は [.github/copilot-instructions.md](.github/copilot-instructions.md) を参照。

## 開発開始

### リポジトリのセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/your-org/pairpair.git
cd pairpair

# 依存をインストール（初期版は package.json が未作成）
pnpm install
```

### ローカルでのホスト・ゲストテスト

ホストとゲストを両方立ち上げてテストする場合：

#### セットアップ確認（推奨）

まずセットアップが正しくできているか確認します：

```batch
# Windows コマンドプロンプト
check-setup.bat
```

または PowerShell：

```powershell
# PowerShell
.\check-setup.ps1
```

#### クイックスタート（Windows）

```batch
# Windows コマンドプロンプト
start-local-test.bat
```

または PowerShell：

```powershell
# PowerShell
.\start-local-test.ps1
```

#### 手動セットアップ

**ターミナル 1: Redis を起動**
```bash
docker run -d -p 6379:6379 redis:latest
```

**ターミナル 2: Signaling Server を起動**
```bash
npx pnpm@9 dev --cwd apps/signaling-server
```

**ターミナル 3: Host App を起動**
```bash
npx pnpm@9 dev --cwd apps/desktop
```

**ターミナル 4: Guest App を起動（Host 起動後）**
```bash
npx pnpm@9 dev --cwd apps/desktop
```

#### テスト手順

1. Host ウィンドウで **「ホストとして開始」** をクリック
2. 画面共有権限を許可
3. セッションコードをコピー
4. Guest ウィンドウで **「ゲストとして接続」** をクリック
5. コードをペーストして接続

詳細は [LOCAL_TEST_GUIDE.md](LOCAL_TEST_GUIDE.md) を参照。

### AI による実装

GitHub Issues でタスクを切り、AI エージェント（GitHub Copilot）が以下に従って実装します：

- [SPEC.md](docs/SPEC.md) — 仕様の正本
- [TASK.md](docs/TASK.md) — 実装チェックリスト
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — 実装ガイドライン

Issue は TASK.md のフェーズ・セクション単位で作成し、完了時に TASK.md を更新します。

## ライセンス

MIT

## 作成者

PairPair Development Team
