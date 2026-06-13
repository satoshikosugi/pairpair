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
- 注目スポットのゲスト送信とホスト / ゲスト側ハイライト表示
- 認証専用 P2P DataChannel 上のコード照合と任意の OPAQUE あいことば認証
- ゲストのホイール方向切替とホスト開始設定の復元
- macOS 向けネイティブ入力、最小メニュー、ホスト / ゲスト別ヘルプ

## apps/desktop

### main / preload

- `src/main/main.ts`
  - Electron 起動、セキュア設定、ハードウェアエンコードフラグ
  - `setDisplayMediaRequestHandler` による画面共有
  - DevTools は既定 OFF。`PAIRPAIR_OPEN_DEVTOOLS=1` の場合のみ自動表示
- `src/main/menu.ts`
  - Electron 既定ヘルプを外し、ホスト / ゲスト別ヘルプウィンドウを提供
  - macOS の `Command` 系ショートカットと衝突しにくい最小メニュー構成
- `src/main/ipc/*.ts`
  - 画面選択、権限、設定、入力注入、ショートカット、活動監視
  - ホスト透明オーバーレイ更新 IPC を追加
- `src/main/overlay/host-overlay.ts`
  - 共有ディスプレイ上に透明オーバーレイを表示
  - 注釈ポリライン、十字カーソル、注目スポットを描画
- `src/preload/index.ts`
  - renderer へ必要最小限 API を公開

### renderer

- `src/renderer/App.tsx`
  - 画面遷移の実体
- `src/renderer/routes/HomePage.tsx`
  - ホスト/ゲスト導線
- `src/renderer/routes/HostPage.tsx`
  - 共有ソース選択、品質選択、任意のあいことば、前回開始設定の復元、セッション作成
- `src/renderer/routes/GuestPage.tsx`
  - セッションコード参加、自動フォーカス、必要時のあいことば認証
- `src/renderer/webrtc/peer-auth.ts`
  - シグナリングサーバーへあいことばを渡さない OPAQUE 認証
  - P2P DataChannel 上でホストが接続コードを再照合
- `src/renderer/webrtc/rtc-client.ts`
  - 認証前は映像キャプチャと入力注入を無効化
  - 認証成功後の再ネゴシエーションで画面共有を開始
- `src/renderer/routes/SessionPage.tsx`
  - ホスト: 品質変更、オーバーレイ反映、セッション終了
  - ゲスト: 画面表示、マーカー、注目スポット送信、全画面、ESC 2回で復帰
- `src/renderer/components/RemoteVideoView.tsx`
  - 映像表示、入力送信、注釈描画、ホバー位置送信、注目スポット表示
  - 等倍表示時の中央寄せと右ドラッグパン
- `src/renderer/components/MarkerToolbar.tsx`
  - 色、太さ、Undo、全削除、全画面、表示倍率、ホイール方向、注目スポット送信

### 既知の構造的注意点

- `src/renderer/App.tsx` と `src/renderer/src/App.tsx` が共存している
  - 実際に使われているのは前者
  - 後者は古い足場コード

## apps/signaling-server

- `src/index.ts`
  - Fastify と WebSocket サーバー起動
- `src/routes/sessions.ts`
  - ホスト作成、ゲスト参加、接続コードによる短期セッション検索、バリデーション
- `src/ws/signaling.ts`
  - `offer` / `answer` / `ice` / `session.close`
  - あいことばやパスワード相当値は扱わない
- `src/infra/redis.ts`
  - 名前に反して Redis ではなく in-memory セッションストア

## packages/shared

- `src/signaling-types.ts`
  - WebSocket メッセージ型
- `src/rtc-types.ts`
  - control DataChannel 型
  - 注釈同期、ゲストカーソル投影、注目スポット同期を追加
- `src/input-events.ts`
  - 入力イベント型
- `src/annotation.ts`
  - 注釈ストローク、カーソル投影、注目スポット、オーバーレイ状態
- `src/quality.ts`
  - 品質プリセット、適応品質計算

## packages/native-input

- Rust + napi-rs で以下を公開
  - マウス移動
  - クリック
  - スクロール
  - キー押下/解放
  - テキスト貼り付け型入力
  - Windows共有ウィンドウの前面化
- `macos_input.rs` で CGEvent ベースのマウス、ホイール、キーボード入力を実装
- macOS では Retina スケールを二重適用しない座標変換へ補正

## テスト/検証資産

- `apps/desktop/src/renderer/webrtc/adaptive-quality.test.ts`
  - 適応品質ステートマシン
- `packages/shared/src/quality.test.ts`
  - 品質計算
- `test-results/*.md`
  - 既存の検証レポート

## 現時点で動く範囲

- 同一 repo 内コードとしては、接続、共有、入力、品質変更、注釈、注目スポットまで一通り実装済み
- `npx tsc -p apps/desktop/tsconfig.json --noEmit` は通過
- ただしトップレベル `npm test` は `pnpm` バイナリが環境に無いと失敗する
- macOS では desktop app の起動・操作・パッケージング導線を整備済み
- signaling server の macOS ローカル実行はサポート対象外
