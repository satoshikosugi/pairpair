# PairPair 実装棚卸し

更新日: 2026-06-13

## 全体所見

実装は README の「Phase 0〜5 予定」表記より進んでいる。現状は以下までコードが存在する。

- ホスト/ゲスト接続フロー
- REST + WebSocket によるシグナリング
- WebRTC 画面共有
- 入力注入
- 品質プリセットと適応品質
- 統計オーバーレイ
- ゲストのマーカー注釈
- ゲスト全画面表示
- 非操作時ゲストカーソルのホスト投影

## apps/desktop

### main / preload

- `src/main/main.ts`
  - Electron 起動、セキュア設定、ハードウェアエンコードフラグ
  - `setDisplayMediaRequestHandler` による画面共有
- `src/main/ipc/*.ts`
  - 画面選択、権限、設定、入力注入、ショートカット、活動監視
  - ホスト透明オーバーレイ更新 IPC を追加
- `src/main/overlay/host-overlay.ts`
  - 共有ディスプレイ上に透明オーバーレイを表示
  - 注釈ポリラインと十字カーソルを描画
- `src/preload/index.ts`
  - renderer へ必要最小限 API を公開

### renderer

- `src/renderer/App.tsx`
  - 画面遷移の実体
- `src/renderer/routes/HomePage.tsx`
  - ホスト/ゲスト導線
- `src/renderer/routes/HostPage.tsx`
  - 共有ソース選択、品質選択、セッション作成
- `src/renderer/routes/GuestPage.tsx`
  - セッションコード参加
- `src/renderer/routes/SessionPage.tsx`
  - ホスト: 品質変更、オーバーレイ反映、セッション終了
  - ゲスト: 画面表示、マーカー、全画面、ESC 2回で復帰
- `src/renderer/components/RemoteVideoView.tsx`
  - 映像表示、入力送信、注釈描画、ホバー位置送信
- `src/renderer/components/MarkerToolbar.tsx`
  - 色、太さ、Undo、全削除、全画面

### 既知の構造的注意点

- `src/renderer/App.tsx` と `src/renderer/src/App.tsx` が共存している
  - 実際に使われているのは前者
  - 後者は古い足場コード

## apps/signaling-server

- `src/index.ts`
  - Fastify と WebSocket サーバー起動
- `src/routes/sessions.ts`
  - ホスト作成、ゲスト参加、バリデーション
- `src/ws/signaling.ts`
  - `offer` / `answer` / `ice` / `session.close`
- `src/infra/redis.ts`
  - 名前に反して Redis ではなく in-memory セッションストア

## packages/shared

- `src/signaling-types.ts`
  - WebSocket メッセージ型
- `src/rtc-types.ts`
  - control DataChannel 型
  - 注釈同期、ゲストカーソル投影を追加
- `src/input-events.ts`
  - 入力イベント型
- `src/annotation.ts`
  - 注釈ストローク、カーソル投影、オーバーレイ状態
- `src/quality.ts`
  - 品質プリセット、適応品質計算

## packages/native-input

- Rust + napi-rs で以下を公開
  - マウス移動
  - クリック
  - スクロール
  - キー押下/解放
  - テキスト貼り付け型入力

## テスト/検証資産

- `apps/desktop/src/renderer/webrtc/adaptive-quality.test.ts`
  - 適応品質ステートマシン
- `packages/shared/src/quality.test.ts`
  - 品質計算
- `test-results/*.md`
  - 既存の検証レポート

## 現時点で動く範囲

- 同一 repo 内コードとしては、接続、共有、入力、品質変更、注釈まで一通り実装済み
- `npx tsc -p apps/desktop/tsconfig.json --noEmit` は通過
- ただしトップレベル `npm test` は `pnpm` バイナリが環境に無いと失敗する
