# PairPair 実装タスクチェックリスト

このドキュメントは SPEC.md を元に作成した実装タスクの一覧です。  
各フェーズを順番に完了させることで MVP が完成します。

---

## Phase 0: リポジトリ・環境構築

### 0-1. monorepo 初期化

- [x] `pnpm init` + `pnpm-workspace.yaml` 作成
- [x] `package.json` に workspaces 設定（`apps/*`, `packages/*`）
- [x] `turbo.json` 作成（build / dev / test のパイプライン定義）
- [x] `.gitignore` 作成（node_modules, dist, out, .turbo, *.log 等）
- [x] `tsconfig.base.json` 作成（全パッケージ共通の TypeScript 設定）
- [x] Node.js バージョンを `.nvmrc` または `package.json#engines` に固定

### 0-2. packages/shared 作成

- [x] `packages/shared/package.json` 作成
- [x] `packages/shared/tsconfig.json` 作成
- [x] `src/signaling-types.ts` — WebSocket メッセージ型定義
  - [x] `HostRegisterMessage`
  - [x] `GuestRegisterMessage`
  - [x] `GuestJoinedMessage`
  - [x] `RtcOfferMessage`
  - [x] `RtcAnswerMessage`
  - [x] `RtcIceMessage`
  - [x] `SessionCloseMessage`
  - [x] 共通型 `BaseMessage<T>`
- [x] `src/rtc-types.ts` — DataChannel 上の制御メッセージ型定義
  - [x] `ControlMessage` ユニオン型（remoteControlRequest / granted / revoked / paused / ping / pong / statsReport）
- [x] `src/input-events.ts` — 入力イベント型定義
  - [x] `MouseMoveEvent`
  - [x] `MouseDownEvent`
  - [x] `MouseUpEvent`
  - [x] `MouseWheelEvent`
  - [x] `KeyboardDownEvent`
  - [x] `KeyboardUpEvent`
  - [x] `TextInputEvent`
  - [x] `InputEvent` ユニオン型
- [x] `src/quality.ts` — 画質プリセット型・定数定義
  - [x] `QualityPreset` 型（Low / Balanced / Sharp / Ultra / Custom）
  - [x] 各プリセットの定数オブジェクト
- [x] `src/errors.ts` — アプリ共通エラーコード定義

### 0-3. packages/native-input 骨格作成

- [x] `packages/native-input/package.json` 作成（napi-rs 依存）
- [x] `@napi-rs/cli` を devDependencies に追加
- [x] `napi build` スクリプト設定
- [x] Rust プロジェクト初期化（`cargo init`）
- [x] `build.rs` でプラットフォーム別ターゲット設定
- [ ] Windows ビルド確認（`cargo build --target x86_64-pc-windows-msvc`）
- [ ] Mac ビルド確認は Mac 環境で行う（Mac 向けは Phase 5 以降）

### 0-4. apps/signaling-server 作成

- [x] `apps/signaling-server/package.json` 作成
- [x] 依存追加: `fastify`, `@fastify/cors`, `ws`, `ioredis`, `zod`, `pino`, `uuid`
- [x] `tsconfig.json` 作成
- [x] ビルドスクリプト設定（`tsc` or `tsup`）
- [x] `src/index.ts` エントリポイント作成

### 0-5. apps/desktop 作成

- [x] `apps/desktop/package.json` 作成
- [x] 依存追加: `electron`, `electron-vite`, `react`, `react-dom`, `zustand`, `electron-store`, `electron-log`
- [x] devDependencies: `@types/react`, `@types/react-dom`, `@types/electron`, `vitest`, `playwright`
- [x] `electron.vite.config.ts` 作成
- [x] `tsconfig.json`（main / preload / renderer の 3 設定 or 統合）
- [x] `electron-builder.yml` 骨格作成（Windows / Mac targets）
- [x] Electron ハードウェアエンコードフラグを `main.ts` に設定
  ```ts
  app.commandLine.appendSwitch("enable-accelerated-video-encode");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  // Windows のみ
  app.commandLine.appendSwitch("enable-features", "MediaFoundationVideoCapture");
  ```

---

## Phase 1: 最小 P2P 画面共有

### 1-1. Signaling Server — セッション管理

- [x] `src/infra/redis.ts` — Redis クライアント初期化（IORedis）
- [x] `src/services/code-generator.ts` — 6〜8 桁コード生成（重複チェック付き）
- [x] `src/services/session-service.ts`
  - [x] `createHostSession(deviceName, platform, appVersion)` → sessionId / code / hostToken / expiresAt
  - [x] `guestJoin(code, deviceName, platform, appVersion)` → sessionId / guestToken / hostDeviceName
  - [x] `getSession(sessionId)` → セッション情報
  - [x] TTL 管理（code TTL: 10分、session TTL: 24時間）
  - [x] コード使用済みフラグ管理（再利用不可）
  - [x] `closeSession(sessionId)` → Redis から削除

### 1-2. Signaling Server — REST API

- [x] `src/routes/health.ts` — `GET /api/health`
- [x] `src/routes/sessions.ts`
  - [x] `POST /api/sessions/host` — Zod バリデーション + セッション作成
  - [x] `POST /api/sessions/join` — Zod バリデーション + ゲスト参加
- [x] レート制限実装（IP ベース、例: 10回/分）
- [x] `@fastify/cors` 設定（Electron からのリクエスト許可）

### 1-3. Signaling Server — WebSocket

- [x] `src/ws/session-registry.ts` — セッションごとの WebSocket 接続管理
  - [x] `registerHost(sessionId, hostToken, ws)` — ホスト接続登録
  - [x] `registerGuest(sessionId, guestToken, ws)` — ゲスト接続登録
  - [x] 接続切断時のクリーンアップ
- [x] `src/ws/signaling.ts` — WebSocket ハンドラー
  - [x] `host.register` 受信処理（hostToken 検証）
  - [x] `guest.register` 受信処理（guestToken 検証）
  - [x] `guest.register` 後にホストへ `guest.joined` 通知
  - [x] `rtc.offer` 中継（ホスト → ゲスト）
  - [x] `rtc.answer` 中継（ゲスト → ホスト）
  - [x] `rtc.ice` 中継（双方向）
  - [x] `session.close` 処理（双方に通知してセッション削除）
  - [x] heartbeat / ping-pong 実装
  - [x] 不正メッセージの無視（tokenが一致しないものは転送しない）

### 1-4. Desktop — Electron 基盤

- [x] `src/main/main.ts`
  - [x] BrowserWindow 作成（nodeIntegration: false, contextIsolation: true, sandbox: true）
  - [x] `app.ready` 前にハードウェアエンコードフラグ設定
  - [x] `session.defaultSession.setDisplayMediaRequestHandler` 設定（画面ソース提供）
  - [x] dev/prod 環境切り替え（`loadURL` vs `loadFile`）
- [x] `src/main/window.ts` — BrowserWindow 管理ユーティリティ
- [x] `src/preload/index.ts`
  - [x] `contextBridge.exposeInMainWorld` で必要最小限の API のみ公開
  - [ ] IPC invoke ラッパー: `getScreenSources`, `startHost`, `joinGuest`, `stopSession`, `checkPermissions`
  - [x] 任意 IPC 送信を exposeしない（セキュリティ要件）

### 1-5. Desktop — IPC ハンドラー

- [x] `src/main/ipc/screen.ipc.ts`
  - [x] `screen:getSources` — `desktopCapturer.getSources()` をmain processで実行し返す
- [x] `src/main/ipc/permission.ipc.ts`
  - [x] `permissions:check` — macOS: 画面収録・アクセシビリティ権限確認 / Windows: 常時 true
- [x] `src/main/ipc/settings.ipc.ts`
  - [x] `settings:get` / `settings:set` — `electron-store` 経由

### 1-6. Desktop — WebRTC クライアント

- [x] `src/renderer/webrtc/signaling-client.ts`
  - [x] WebSocket 接続・切断
  - [x] `host.register` 送信
  - [x] `guest.register` 送信
  - [x] `rtc.offer/answer/ice` 送受信
  - [x] `session.close` 送受信
  - [x] 再接続ロジック（指数バックオフ）
- [x] `src/renderer/webrtc/rtc-client.ts`
  - [x] `RTCPeerConnection` 作成（STUN サーバー設定）
  - [x] DataChannel 作成（`control`, `input`, `inputReliable`）
  - [x] offer 作成・送信フロー
  - [x] answer 受信・setRemoteDescription フロー
  - [x] ICE candidate 送受信
  - [x] connectionState 変化のイベント発火
- [x] `src/renderer/webrtc/data-channel.ts`
  - [x] `control` チャンネルの送受信ラッパー
  - [x] `input` チャンネル（unreliable）送受信ラッパー
  - [x] `inputReliable` チャンネル（reliable）送受信ラッパー
- [ ] `src/main/webrtc/peer-host.ts`
  - [ ] `desktopCapturer` でキャプチャした MediaStream を RTCPeerConnection に追加
  - [ ] `RTCRtpSender.setParameters()` で bitrate / fps 設定
- [ ] `src/main/webrtc/peer-guest.ts`
  - [ ] `ontrack` で受信した MediaStream を `<video>` に表示
- [ ] `src/main/webrtc/media-controller.ts`
  - [ ] `applyConstraints()` で解像度・fps 変更
  - [ ] 変更できない場合は track replacement
- [ ] `src/main/webrtc/stats-monitor.ts`
  - [ ] `getStats()` を 1秒ごとに呼び出し
  - [ ] `RTCInboundRtpStreamStats` / `RTCOutboundRtpStreamStats` から必要な値を抽出

### 1-7. Desktop — 画面キャプチャ設定

- [x] `src/renderer/components/ScreenSourcePicker.tsx`
  - [x] `getScreenSources()` IPC で画面・ウィンドウ一覧取得
  - [x] サムネイル表示（小サイズで取得してメモリ節約）
  - [ ] 画面名・ウィンドウ名・解像度表示
  - [x] 選択状態管理

### 1-8. Desktop — 画面・ルーティング

- [x] `src/renderer/App.tsx` — React Router (または独自ルーティング) 設定
- [x] `src/renderer/routes/HomePage.tsx`
  - [x] 「ホストとして開始」ボタン
  - [x] 「ゲストとして参加」ボタン
  - [x] 設定へのリンク
  - [x] 前回品質設定の表示
- [x] `src/renderer/routes/HostPage.tsx`（Host Setup）
  - [x] ScreenSourcePicker 組み込み
  - [x] 品質プリセット選択
  - [x] カスタム設定（解像度 / fps / ビットレート）
  - [x] 「セッションを作成」ボタン → REST API 呼び出し + WebSocket 接続
  - [ ] 権限チェック呼び出し・不足時のエラー表示
- [x] `src/renderer/routes/HostPage.tsx`（Host Waiting）
  - [x] セッションコード表示（XXX XXX 形式）
  - [x] コピーボタン
  - [x] 有効期限カウントダウン
  - [ ] WebSocket 接続状態表示
  - [x] `guest.joined` 受信でセッション画面へ遷移
  - [x] キャンセルボタン
- [x] `src/renderer/routes/GuestPage.tsx`（Guest Join）
  - [x] コード入力フォーム（数字のみ、6〜8桁）
  - [x] 「接続」ボタン → REST API 呼び出し + WebSocket 接続 → WebRTC ネゴシエーション
  - [x] 接続中スピナー
  - [x] エラー表示
- [x] `src/renderer/routes/SessionPage.tsx` — Host / Guest それぞれの分岐

### 1-9. Desktop — セッション画面（Phase 1 最小版）

- [x] `src/renderer/routes/SessionPage.tsx`（Host 側）
  - [ ] 共有中情報表示（画面名・接続先・P2P 状態）
  - [x] 「セッション終了」ボタン
- [x] `src/renderer/routes/SessionPage.tsx`（Guest 側）
  - [x] `<video>` タグで受信映像表示（autoplay, muted）
  - [x] 「切断」ボタン
- [x] `src/renderer/components/StatsOverlay.tsx`（最小版）
  - [x] RTT / Codec / Resolution / FPS / Bitrate / ICE state 表示
  - [x] トグルで表示/非表示

### 1-10. Desktop — 状態管理

- [x] `src/renderer/store/session-store.ts`（Zustand）
  - [x] sessionId / role / connectionState / guestDeviceName / hostDeviceName
  - [x] signalingState / iceConnectionState
- [x] `src/renderer/store/settings-store.ts`（Zustand + electron-store 同期）
  - [x] defaultPreset / stun server URL
- [x] `src/renderer/store/app-store.ts`（Zustand）
  - [x] currentRoute / permissionState / error

### 1-11. 動作確認

- [ ] Windows 同士でセッション接続できる
- [ ] ホスト画面がゲスト側に P2P で表示される
- [ ] Stats Overlay で ICE connection state が `connected` になる
- [ ] サーバーが映像を中継していないことを Wireshark / ネットワークログで確認

---

## Phase 2: 画質設定

### 2-1. 品質プリセット実装

- [ ] `packages/shared/src/quality.ts` に全プリセット定数確認・拡充
- [x] `src/renderer/components/QualityPresetSelector.tsx`
  - [x] Low / Balanced / Sharp / Ultra / Custom 切り替え
  - [x] Custom 選択時に個別設定入力 UI 表示
- [x] `src/renderer/utils/bitrate.ts`
  - [x] ビットレート文字列変換ユーティリティ
  - [x] `RTCRtpSender.setParameters()` 用パラメータ生成ヘルパー

### 2-2. セッション中の画質変更

- [ ] `control` DataChannel で品質変更メッセージ定義（`quality.change`）
- [ ] ゲストが品質変更を提案 → ホストが承認するフロー（または Host のみ変更可とする）
- [ ] `media-controller.ts` の `applyConstraints()` 実装
- [ ] 解像度変更時の track replacement フロー実装
- [ ] `RTCRtpSender.setParameters()` でビットレート・fps 変更実装
- [ ] 画質変更後に Stats Overlay が更新されることを確認

### 2-3. コーデック選択

- [ ] `RTCRtpSender.getCapabilities('video')` で利用可能コーデック一覧取得
- [ ] SDP offer に優先コーデックを先頭に並べる処理実装
- [ ] `encoderImplementation` を Stats Overlay で表示
- [ ] H.264 ハードウェアエンコード確認（`ExternalEncoder` の表示）

### 2-4. 4K 対応確認

- [ ] Ultra プリセット（3840x2160 / 30fps / 25Mbps）で接続確認
- [ ] ホスト画面が 4K 超の場合に 4K へ縮小する処理確認
- [ ] CPU/GPU 負荷確認

### 2-5. 品質維持不可警告

- [ ] `stats-monitor.ts` で packet loss > 3% または actual fps < target の 70% を検出
- [ ] 警告ダイアログ表示（「品質を下げることを推奨します」）
- [ ] 「変更する」でプリセットを自動変更

---

## Phase 3: マウス操作

### 3-1. ゲスト側マウスキャプチャ

- [ ] `src/renderer/components/RemoteVideoView.tsx` — 映像表示コンポーネント
  - [ ] `<video>` の `onMouseMove`, `onMouseDown`, `onMouseUp`, `onWheel` イベント取得
  - [ ] letterbox / pillarbox 領域を除外した相対座標計算
  - [ ] 0.0〜1.0 の正規化座標変換
- [ ] `src/renderer/utils/coordinate.ts`
  - [ ] `toNormalizedCoordinate(videoElement, clientX, clientY)` 実装
  - [ ] letterbox/pillarbox オフセット計算

### 3-2. マウスイベント間引き

- [ ] `mouse.move` は 16ms（60Hz）ごとに間引き送信
- [ ] 同一座標付近（1px 以内）のイベントは破棄
- [ ] `mouse.wheel` は短時間バッチ化（最大 16ms）

### 3-3. DataChannel 送信

- [ ] `mouse.move` / `mouse.wheel` → `input` チャンネル（unreliable）送信
- [ ] `mouse.down` / `mouse.up` → `inputReliable` チャンネル（reliable）送信
- [ ] `timestamp` を付与して入力遅延計測に使用

### 3-4. packages/native-input — Windows 入力注入

- [ ] `src/` に TypeScript バインディング `index.ts` 作成
- [ ] Rust 側に以下の関数実装
  - [ ] `move_mouse(x: i32, y: i32)` — `SetCursorPos` + `MOUSEINPUT`
  - [ ] `mouse_button(button: u8, down: bool, x: i32, y: i32)` — `SendInput`
  - [ ] `mouse_scroll(delta_x: i32, delta_y: i32, x: i32, y: i32)` — `MOUSEEVENTF_WHEEL`
- [ ] napi-rs でエクスポート（`#[napi]` macro）
- [ ] `electron-rebuild` 設定

### 3-5. ホスト側座標変換・入力注入

- [ ] `src/main/native/input-controller.ts`
  - [ ] 正規化座標 → 実画面座標変換
  - [ ] `screenX = normalizedX * captureWidth + captureOffsetX`
  - [ ] DPI スケールファクター対応（Windows: `screen.getPrimaryDisplay().scaleFactor`）
  - [ ] Retina display 対応（Mac: `scaleFactor` 考慮）
  - [ ] マルチモニター対応（選択画面のバウンディングボックスオフセット適用）
  - [ ] ウィンドウ共有時のオフセット適用
- [ ] `src/main/ipc/input.ipc.ts`
  - [ ] DataChannel からの入力イベントを受け取り `native-input` を呼び出す

### 3-6. 操作許可フロー UI

- [ ] `src/renderer/components/PermissionPanel.tsx`
  - [ ] ホスト側: 「操作を許可」「一時停止」「操作権限を取り消す」ボタン
  - [ ] ゲスト側: 「操作をリクエスト」ボタン
  - [ ] ホスト側: 操作中の常時表示バー（「Guest PC が操作中」）
- [ ] `control` DataChannel で権限状態メッセージ送受信
  - [ ] `remoteControl.request` (ゲスト → ホスト)
  - [ ] `remoteControl.granted` (ホスト → ゲスト)
  - [ ] `remoteControl.revoked` (ホスト → ゲスト)
  - [ ] `remoteControl.paused` (ホスト → ゲスト)
- [ ] ホストの停止ショートカット実装
  - [ ] Windows: `Ctrl + Alt + P`（一時停止）、`Ctrl + Alt + Esc`（取り消し）
  - [ ] Mac: `Cmd + Option + P`、`Cmd + Option + Esc`
  - [ ] Electron `globalShortcut.register` で登録（セッション中のみ有効）
- [ ] 権限状態を `session-store` で管理（viewOnly / controlRequested / controlAllowed / controlPaused / controlRevoked）

### 3-7. 動作確認

- [ ] ゲストがホスト側でマウスカーソルを移動させられる
- [ ] クリックが正確に反映される
- [ ] ホストが一時停止/取り消しができる
- [ ] ショートカットキーで即時停止できる
- [ ] DPI スケーリングが異なる環境で座標がずれないことを確認

---

## Phase 4: キーボード操作

### 4-1. ゲスト側キーボードキャプチャ

- [ ] セッション画面フォーカス時に `keydown` / `keyup` イベントを capture（`addEventListener` の `capture: true`）
- [ ] ブラウザデフォルト動作との競合を防ぐため必要な `preventDefault` を適用
- [ ] `controlAllowed` 状態のときのみ入力を送信

### 4-2. DataChannel 送信

- [ ] `keyboard.down` / `keyboard.up` → `inputReliable` チャンネル送信
- [ ] `code`, `key`, `ctrlKey`, `shiftKey`, `altKey`, `metaKey` 全送信
- [ ] `text.input` → `inputReliable` チャンネル送信（IME 確定時）

### 4-3. packages/native-input — Windows キーボード注入

- [ ] `key_down(vk_code: u16)` — `SendInput` (KEYEVENTF_KEYDOWN)
- [ ] `key_up(vk_code: u16)` — `SendInput` (KEYEVENTF_KEYUP)
- [ ] `type_text(text: &str)` — クリップボード経由またはUnicode入力
- [ ] KeyCode（DOM） → Virtual Key コード変換テーブル実装
- [ ] 修飾キー（Ctrl / Shift / Alt / Win）の組み合わせ対応

### 4-4. 日本語入力暫定対応

- [ ] `text.input` イベントを受信したらホスト側でクリップボードにセット → Paste 実行
  ```
  ゲスト側で IME 確定 → text.input で文字列送信 → ホスト側クリップボードに書き込み → Ctrl+V 注入
  ```
- [ ] Windows: `WriteClipboard` API またはクリップボードライブラリ使用
- [ ] クリップボード汚染のリスクを UI で通知（「テキスト貼り付け方式を使用中」）

### 4-5. packages/native-input — macOS 入力注入（Mac ビルド環境で実施）

- [ ] `CGEventCreateMouseEvent` でマウスイベント注入
- [ ] `CGEventPost(kCGHIDEventTap, event)` で投稿
- [ ] `CGEventCreateKeyboardEvent` でキーイベント注入
- [ ] `AXIsProcessTrustedWithOptions` でアクセシビリティ権限確認
- [ ] macOS キーコード変換テーブル実装

### 4-6. 動作確認

- [ ] ゲストがホスト側のエディタにコードを入力できる
- [ ] Ctrl+C / Ctrl+V 等のショートカットが機能する
- [ ] 日本語テキストを `text.input` 経由で貼り付けられる
- [ ] ホスト側のショートカットキー（操作停止）が入力と競合しないことを確認

---

## Phase 5: 安定化・パッケージング

### 5-1. 切断・再接続

- [ ] WebSocket 切断時の自動再接続（指数バックオフ、最大 5回）
- [ ] RTCPeerConnection の `connectionState` が `disconnected` / `failed` になった場合の処理
  - [ ] `failed` → ユーザーにエラー表示・セッション終了
  - [ ] `disconnected` → 30秒待って回復しなければ `failed` 扱い
- [ ] ホスト / ゲストどちらかが切断した場合に相手側にも通知
- [ ] セッション終了時のリソース解放（MediaStream.stop() / DataChannel.close() / PeerConnection.close()）

### 5-2. P2P 接続失敗時のエラー表示

- [ ] ICE 接続が `failed` になった場合の専用エラー画面
  - [ ] 原因候補のリスト表示（Section 16.1 参照）
  - [ ] 「P2P 限定のためリレーは行いません」の明示
- [ ] WebSocket 接続失敗時エラー表示
- [ ] コード期限切れエラー表示
- [ ] コード不一致エラー表示

### 5-3. macOS 権限チェック UI

- [ ] `src/main/native/permission-checker.ts`
  - [ ] 画面収録権限チェック（`systemPreferences.getMediaAccessStatus('screen')`）
  - [ ] アクセシビリティ権限チェック（`systemPreferences.isTrustedAccessibilityClient(false)`）
- [ ] 権限不足時の専用画面（Section 10.3 参照）
  - [ ] 「システム設定を開く」ボタン（`shell.openExternal` でシステム設定 URL）
  - [ ] 「再チェック」ボタン

### 5-4. Stats Overlay 完全版

- [ ] RTT / Packet Loss / Jitter / Actual FPS / Target FPS / Bitrate / Resolution
- [ ] Codec / encoderImplementation
- [ ] Frames Dropped / Freeze Count
- [ ] Input Latency（DataChannel の `input.latency` メッセージで計測）
- [ ] ICE connection state / selected candidate pair
- [ ] local / remote candidate type（host / srflx / relay）
- [ ] Keyboard shortcut でオーバーレイ切り替え（例: `Ctrl+Shift+S`）

### 5-5. 入力遅延計測

- [ ] `inputReliable` チャンネルで `input.latency` メッセージ送受信
- [ ] ゲスト: `clientTimestamp` 付きでイベント送信
- [ ] ホスト: 受信後に `hostReceivedTimestamp` を付けて返信
- [ ] Stats Overlay に `Input Latency: XX ms` 表示

### 5-6. ログ実装

- [ ] `apps/desktop` に `electron-log` 設定
  - [ ] ログファイル保存先設定
  - [ ] アプリ起動/終了ログ
  - [ ] セッション開始/終了ログ
  - [ ] signaling 状態変化ログ
  - [ ] ICE candidate type ログ
  - [ ] 品質設定変化ログ
  - [ ] エラーログ
  - [ ] **保存しないもの**: 入力キー内容、クリップボード内容、映像データ
- [ ] `apps/signaling-server` のサーバーログ（Pino）
  - [ ] session created / guest joined / signaling completed / session closed
  - [ ] ICE candidate IP は匿名化（最終オクテットのみ削除等）
  - [ ] SDP 本文は保存しない

### 5-7. Settings 画面

- [ ] `src/renderer/routes/SettingsPage.tsx`
  - [ ] 一般設定（起動時設定の保持、終了確認）
  - [ ] 画質設定（デフォルトプリセット、コーデック優先度）
  - [ ] 接続設定（STUN サーバー URL、接続タイムアウト秒数）
  - [ ] 操作設定（マウスカーソル表示、ホスト側停止ショートカットカスタマイズ）
  - [ ] セキュリティ設定（毎回操作許可確認、ログ保存の ON/OFF）
- [ ] `electron-store` との双方向同期

### 5-8. ネットワーク診断（簡易版）

- [ ] STUN サーバーへの到達確認（`RTCPeerConnection` で host candidate が取得できるか）
- [ ] 診断結果を Home 画面に表示（「P2P 接続可能」「制限あり」等）

### 5-9. electron-builder パッケージング

- [ ] Windows: `NSIS` インストーラー設定
- [ ] Mac: `dmg` + `zip` 設定
- [ ] napi-rs のビルド成果物（`.node` ファイル）を `extraResources` に含める
- [ ] `electron-rebuild` を package 前に実行するスクリプト設定
- [ ] コードサイニング設定（Mac: `hardened-runtime`, `entitlements`）
- [ ] macOS Entitlements ファイル作成
  ```xml
  <key>com.apple.security.cs.allow-jit</key>
  <key>com.apple.security.device.audio-input</key>
  ```

### 5-10. E2E テスト（Playwright）

- [ ] Playwright + Electron セットアップ
- [ ] テストケース: Host 起動 → コード発行 → Guest 接続 → P2P 確立
- [ ] テストケース: Host が操作権限を付与・取り消しできる
- [ ] テストケース: セッション終了でリソースが解放される
- [ ] CI 設定（GitHub Actions または相当）

### 5-11. MVP 判定チェック（Section 24 対応）

- [ ] Windows 同士でホスト/ゲスト接続できる
- [ ] Mac ホスト、Windows ゲストで接続できる
- [ ] 1080p / 30fps で安定表示できる
- [ ] 1440p / 30fps で実用表示できる
- [ ] 4K / 30fps で接続・表示できる
- [ ] ゲストがマウス操作できる
- [ ] ゲストがキーボード入力できる
- [ ] ホストが操作権限を即停止できる
- [ ] TURN なしで接続失敗するケースを正しくエラー表示できる
- [ ] サーバーが映像・入力を中継していないことを確認できる

---

## クロスカット関心事

### セキュリティ確認チェックリスト

- [ ] `nodeIntegration: false` / `contextIsolation: true` / `sandbox: true` が全 BrowserWindow に設定されている
- [ ] preload で `ipcRenderer.send` や `require` を renderer に expose していない
- [ ] WebSocket 通信が必ず TLS（`wss://`）
- [ ] `hostToken` / `guestToken` が 128bit ランダム値
- [ ] セッションコード使用後に無効化されている
- [ ] DataChannel 経由の入力がホストの `controlAllowed` フラグ確認後に実行される
- [ ] ログにキー入力内容・クリップボード・映像データが含まれていない

### パフォーマンス確認チェックリスト

- [ ] mouse.move 間引き（最大 60Hz）が実装されている
- [ ] Stats 取得間隔が 1秒程度
- [ ] サムネイル取得時に thumbnailSize を小さく設定している
- [ ] Renderer プロセスで重い画像処理を行っていない
- [ ] DataChannel メッセージが JSON の最小サイズになっている

---

## メモ: 既知の技術的制約

| 項目 | 制約 | 対応方針 |
|------|------|----------|
| P2P 接続 | 対称 NAT / 企業 NW では接続不可 | 明確なエラー表示。将来 TURN オプション追加 |
| Windows UAC 画面 | `SendInput` では操作不可 | 操作対象外と明示 |
| sandbox + desktopCapturer | renderer から直接使用不可 | `setDisplayMediaRequestHandler` (Electron 22+) で対応 |
| H.264 HWエンコード | Electron の起動フラグが必要 | `enable-accelerated-video-encode` 等を main.ts で設定 |
| 日本語 IME | key event だけでは不安定 | text.input + クリップボード貼り付け方式で暫定対応 |
| Rust napi-rs | electron-rebuild が必要 | パッケージング時に自動実行するスクリプトを設定 |
| macOS 公証 | Hardened Runtime + Entitlements が必要 | entitlements.plist を事前に作成 |
