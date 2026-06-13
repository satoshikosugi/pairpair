# PairPair 起動手順と依存関係

更新日: 2026-06-13

## 前提

- Node.js 20 以上
- npm
- `pnpm` を使えること
  - 推奨: `corepack enable`
  - 代替: `npx pnpm@10.5.0`
- Windows または macOS
- macOS では PairPair Desktop のみをサポート対象とし、signaling server のローカル起動は対象外
- デスクトップアプリの画面共有権限

## 実行依存関係

### 必須

- `apps/desktop`
  - Electron
  - React
  - Zustand
  - `@pairpair/shared`
  - `@pairpair/native-input`
- `apps/signaling-server`
  - Fastify
  - ws
  - zod
  - pino
  - uuid

### 現在は不要

- Redis
  - ドキュメント名は `infra/redis.ts` だが、実装は in-memory セッションストア
  - ローカル起動に Redis コンテナは不要

## 初回セットアップ

```powershell
corepack enable
npx pnpm@10.5.0 install
```

`pnpm` が PATH に無いままでも、以後のコマンドは `npx pnpm@10.5.0` で代用できる。

## ローカル起動

### 1. signaling server

Windows または Linux で起動する。

```powershell
npx pnpm@10.5.0 --dir apps/signaling-server dev
```

デフォルト:

- `PORT=8080`
- `HOST=0.0.0.0`
- `WS_URL` 未指定時は `ws://localhost:8080`

### 2. desktop app

ホスト用:

```powershell
npx pnpm@10.5.0 --dir apps/desktop dev
```

ゲスト用:

```powershell
npx pnpm@10.5.0 --dir apps/desktop dev
```

同一 PC で 2 つ起動してもよい。

macOS ではホスト・ゲストともこの desktop app を実行し、signaling server には既存の配備先を使う。

## 接続手順

1. ホストで `ホストとして開始`
2. 共有ソースと画質を選択
3. 必要なら画質設定の下で「あいことば」を指定
4. セッションコードを発行
5. ゲストで `ゲストとして参加`
6. コード入力で接続
7. あいことばが設定されている場合は、追加表示された入力欄で認証

あいことばはシグナリングサーバーへ送信されない。最初に映像なしの P2P DataChannel を確立し、その上で接続コード照合と OPAQUE 認証を行う。認証成功後にのみ画面共有とリモート入力を有効化する。

## セッション中の機能

- 画面クリックでリモート操作を開始
- マーカーを ON にすると描画モード
- `Undo` と `全削除`
- `全画面` でヘッダなし表示
- 全画面解除は `ESC` を素早く 2 回
- `フィット` と `等倍` を切替可能
- `等倍` で表示領域より映像が大きい場合は右ドラッグでパン
- `ホイール: Windows / Mac` でスクロール方向を切替。設定は終了後も保持
- ホストの前回共有ソース、画質モード、解像度は次回開始時に復元
- メニューバーの `ヘルプ` からホスト / ゲスト別の詳細ガイドを開ける

## macOS の注意

- 初回起動時に `画面収録` と `アクセシビリティ` の許可が必要
- リモート入力座標は macOS では Retina 倍率を二重適用しないよう補正済み
- ローカルのメニューショートカットがリモートの `Command` 系操作を奪わないよう、アプリメニューは最小構成

## パッケージング

Windows:

```powershell
npx pnpm@10.5.0 --dir apps/desktop package:win
```

macOS:

```bash
npx pnpm@10.5.0 --dir apps/desktop package:mac
```

Apple Silicon 専用:

```bash
npx pnpm@10.5.0 --dir apps/desktop package:mac:arm64
```

Intel Mac 専用:

```bash
npx pnpm@10.5.0 --dir apps/desktop package:mac:x64
```

VS Code では `PairPair Package (Windows)` と `PairPair Package (macOS)` タスクを利用できる。

## DevTools

DevTools は既定で自動表示しない。開発起動時に自動表示する場合:

```powershell
$env:PAIRPAIR_OPEN_DEVTOOLS="1"
npx pnpm@10.5.0 --dir apps/desktop dev
```

## 検証コマンド

型チェック:

```powershell
npx tsc -p apps/desktop/tsconfig.json --noEmit
```

トップレベルテスト:

```powershell
npm test
```

注意:

- これは内部で `turbo run test` を叩く
- `pnpm` バイナリが無い環境では失敗する

## よくある詰まりどころ

- `pnpm` が見つからない
  - `corepack enable` または `npx pnpm@10.5.0 ...` を使う
- 共有画面が出ない
  - OS 権限を確認する
- 接続はできるが操作が効かない
  - ゲストが操作権限を取得しているか確認する
- 企業ネットワーク/VPN で P2P が張れない
  - 初期版は TURN を使わないため接続不可のことがある
