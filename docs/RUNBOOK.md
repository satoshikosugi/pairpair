# PairPair 起動手順と依存関係

更新日: 2026-06-13

## 前提

- Node.js 20 以上
- npm
- `pnpm` を使えること
  - 推奨: `corepack enable`
  - 代替: `npx pnpm@11`
- Windows または macOS
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
npx pnpm@11 install
```

`pnpm` が PATH に無いままでも、以後のコマンドは `npx pnpm@11` で代用できる。

## ローカル起動

### 1. signaling server

```powershell
npx pnpm@11 --dir apps/signaling-server dev
```

デフォルト:

- `PORT=8080`
- `HOST=0.0.0.0`
- `WS_URL` 未指定時は `ws://localhost:8080`

### 2. desktop app

ホスト用:

```powershell
npx pnpm@11 --dir apps/desktop dev
```

ゲスト用:

```powershell
npx pnpm@11 --dir apps/desktop dev
```

同一 PC で 2 つ起動してもよい。

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
- `ホイール: Windows / Mac` でスクロール方向を切替。設定は終了後も保持
- ホストの前回共有ソース、画質モード、解像度は次回開始時に復元

## DevTools

DevTools は既定で自動表示しない。開発起動時に自動表示する場合:

```powershell
$env:PAIRPAIR_OPEN_DEVTOOLS="1"
npx pnpm@11 --dir apps/desktop dev
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
  - `corepack enable` または `npx pnpm@11 ...` を使う
- 共有画面が出ない
  - OS 権限を確認する
- 接続はできるが操作が効かない
  - ゲストが操作権限を取得しているか確認する
- 企業ネットワーク/VPN で P2P が張れない
  - 初期版は TURN を使わないため接続不可のことがある
