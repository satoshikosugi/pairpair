# PairPair 設計書

## 1. 概要

### 1.1 アプリ名

**PairPair**

### 1.2 目的

Tupleのようなペアプロ用途のリモート操作アプリを、より軽量・高画質・低遅延に実現する。

ホストとゲストが1対1で接続し、ホストの画面をゲストへP2Pで配信する。ゲストは許可された範囲でホストPCをリモートコントロールできる。

### 1.3 基本方針

* 待ち合わせ用サーバーは使う
* 映像・音声・入力操作は原則P2Pのみ
* TURNリレーは初期版では使わない
* STUNはNAT越えの経路探索にのみ使う
* Mac利用を最終ターゲットにする
* Windows上で開発・テスト可能な構成にする
* Electron + WebRTCを中心に構成する
* 4Kまで対応する
* フレームレート、ビットレート、画質設定をユーザーが選べるようにする
* Tuple代替として、ペアプロに必要な機能を優先する

---

## 2. 重要な制約

### 2.1 P2Pのみの制約

「待ち合わせ後はP2Pのみ」を厳密に守る場合、TURNサーバーによる中継は使えない。

そのため、以下の環境では接続に失敗する可能性がある。

* 対称NAT
* 企業ネットワーク
* UDP制限のあるネットワーク
* 厳格なファイアウォール
* VPN配下
* CGNAT環境の一部

### 2.2 設計上の扱い

初期版では以下の方針にする。

* signaling server: 使用する
* STUN server: 使用する
* TURN server: 使用しない
* media relay: 使用しない
* input relay: 使用しない
* file relay: 使用しない

接続できない場合は、アプリ上で明確に表示する。

例:

> このネットワーク構成では直接P2P接続を確立できません。PairPairのP2P限定モードでは接続できない可能性があります。

将来版では、設定で「TURNリレーを許可する」を追加してもよいが、初期版のコンセプトからは外す。

---

## 3. 想定ユースケース

### 3.1 メインユースケース

* 2人でペアプロする
* ホストが自分の画面を共有する
* ゲストがコードレビューや実装操作を行う
* ゲストがマーカーで画面上に注釈を書いて会話する
* ホストはいつでも操作権限を停止できる
* 通信負荷を抑えつつ、文字が鮮明に読める画質を優先する

### 3.2 対象外

初期版では以下を対象外にする。

* 多人数接続
* 録画
* クラウド経由のリモートデスクトップ
* 常時無人アクセス
* ファイル転送
* チャット
* 音声通話
* 会議アプリ機能
* TURNリレーによる接続保証
* モバイルアプリ

---

## 4. 全体アーキテクチャ

```text
+------------------+                         +------------------+
| Host App         |                         | Guest App        |
| Electron         |                         | Electron         |
|                  |                         |                  |
| Screen Capture   | ---- WebRTC Video ----> | Video Viewer     |
| Input Injector   | <--- DataChannel ------ | Input Sender     |
| Permission UI    | ---- DataChannel -----> | Control UI       |
+--------+---------+                         +---------+--------+
         |                                             |
         | WebSocket Signaling                         |
         |                                             |
         v                                             v
+--------------------------------------------------------------+
| PairPair Signaling Server                                    |
| - session code issue                                         |
| - host/guest matching                                        |
| - SDP offer/answer exchange                                  |
| - ICE candidate exchange                                     |
| - session lifecycle                                          |
| - no media relay                                             |
| - no input relay                                             |
+--------------------------------------------------------------+

+--------------------------------------------------------------+
| STUN Server                                                   |
| - NAT traversal discovery only                                |
| - no relay                                                    |
+--------------------------------------------------------------+
```

---

## 5. 推奨技術スタック

## 5.1 デスクトップアプリ

| 項目      | 採用技術                                     |
| ------- | ---------------------------------------- |
| アプリ基盤   | Electron                                 |
| UI      | React                                    |
| 言語      | TypeScript                               |
| ビルド     | Vite                                     |
| 状態管理    | Zustand                                  |
| 通信      | WebRTC / WebSocket                       |
| ネイティブ操作 | napi-rs (Rust → Node Native Addon)       |
| パッケージング | electron-builder                         |
| モノレポ管理  | Turborepo                                |
| 自動更新    | electron-updater、将来対応                    |
| ログ      | electron-log                             |
| 設定保存    | electron-store                           |
| E2Eテスト  | Playwright                               |
| 単体テスト   | Vitest                                   |

### 5.2 サーバー

| 項目        | 採用技術                               |
| --------- | ---------------------------------- |
| API       | Node.js + Fastify                  |
| WebSocket | ws                                 |
| 一時セッション管理 | メモリ内 Map + JavaScript タイマー         |
| DB        | 初期版は不要。監査ログが必要ならPostgreSQL         |
| デプロイ      | Cloud Run / VPS / Fly.io / Render等 |
| TLS       | 必須                                 |
| STUN      | coturnをSTUN専用運用、または既存STUNを開発用に利用   |

---

## 6. Electronアプリ構成

```text
apps/desktop/
  src/
    main/
      main.ts
      window.ts
      ipc/
        screen.ipc.ts
        input.ipc.ts
        permission.ipc.ts
        settings.ipc.ts
      native/
        input-controller.ts
        permission-checker.ts
      webrtc/
        peer-host.ts
        peer-guest.ts
        media-controller.ts
        stats-monitor.ts

    preload/
      index.ts

    renderer/
      App.tsx
      routes/
        HomePage.tsx
        HostPage.tsx
        GuestPage.tsx
        SessionPage.tsx
        SettingsPage.tsx
      components/
        ConnectionStatus.tsx
        QualityPresetSelector.tsx
        ScreenSourcePicker.tsx
        RemoteVideoView.tsx
        PermissionPanel.tsx
        StatsOverlay.tsx
        Toolbar.tsx
      store/
        app-store.ts
        session-store.ts
        settings-store.ts
      webrtc/
        signaling-client.ts
        rtc-client.ts
        data-channel.ts
      utils/
        coordinate.ts
        bitrate.ts
        logger.ts
```

---

## 7. サーバー機能

## 7.1 役割

サーバーは「待ち合わせ」と「WebRTC接続確立」に必要な情報交換のみを行う。

サーバーが扱うもの:

* ホスト用セッション作成
* 一意コード発行
* ゲスト参加
* WebSocket接続管理
* SDP offer/answer中継
* ICE candidate中継
* セッション期限管理
* 接続状態管理
* 簡易レート制限

サーバーが扱わないもの:

* 映像データ
* 音声データ
* マウス操作
* キーボード操作
* クリップボード
* ファイル
* 画面キャプチャ画像

---

## 7.2 セッションコード仕様

### コード形式

初期案:

```text
PAIR-123-456
```

または短縮表示:

```text
123456
```

### 要件

* 一定時間で失効
* 推測されにくい
* 同時発行で重複しない
* ゲスト接続後は再利用不可
* ホストがキャンセルしたら無効化
* セッション成立後、サーバー側のコード情報は短時間で破棄

### 推奨

* 表示コード: 6桁から8桁
* 内部sessionId: UUID
* hostToken: ランダム128bit
* guestToken: ランダム128bit
* code TTL: 10分
* session TTL: 24時間、ただしWebSocket切断で短縮

---

## 7.3 サーバーAPI

### POST /api/sessions/host

ホストがセッションを作成する。

#### Request

```json
{
  "appVersion": "0.1.0",
  "deviceName": "Satoshi's MacBook Pro",
  "platform": "darwin"
}
```

#### Response

```json
{
  "sessionId": "uuid",
  "code": "123456",
  "hostToken": "random-token",
  "expiresAt": "2026-06-11T12:00:00.000Z",
  "wsUrl": "wss://pairpair.example.com/ws"
}
```

---

### POST /api/sessions/join

ゲストがコードを入力して参加する。

#### Request

```json
{
  "code": "123456",
  "appVersion": "0.1.0",
  "deviceName": "Guest PC",
  "platform": "win32"
}
```

#### Response

```json
{
  "sessionId": "uuid",
  "guestToken": "random-token",
  "hostDeviceName": "Satoshi's MacBook Pro",
  "wsUrl": "wss://pairpair.example.com/ws"
}
```

---

### GET /api/health

ヘルスチェック。

#### Response

```json
{
  "ok": true,
  "version": "0.1.0"
}
```

---

## 7.4 WebSocketメッセージ

### 共通形式

```json
{
  "type": "message-type",
  "sessionId": "uuid",
  "sender": "host",
  "payload": {}
}
```

---

### host.register

ホストがWebSocketへ登録する。

```json
{
  "type": "host.register",
  "sessionId": "uuid",
  "hostToken": "random-token"
}
```

---

### guest.register

ゲストがWebSocketへ登録する。

```json
{
  "type": "guest.register",
  "sessionId": "uuid",
  "guestToken": "random-token"
}
```

---

### guest.joined

ゲスト参加をホストへ通知する。

```json
{
  "type": "guest.joined",
  "sessionId": "uuid",
  "payload": {
    "guestDeviceName": "Guest PC",
    "platform": "win32"
  }
}
```

---

### rtc.offer

```json
{
  "type": "rtc.offer",
  "sessionId": "uuid",
  "payload": {
    "sdp": "..."
  }
}
```

---

### rtc.answer

```json
{
  "type": "rtc.answer",
  "sessionId": "uuid",
  "payload": {
    "sdp": "..."
  }
}
```

---

### rtc.ice

```json
{
  "type": "rtc.ice",
  "sessionId": "uuid",
  "payload": {
    "candidate": "...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

---

### session.close

```json
{
  "type": "session.close",
  "sessionId": "uuid",
  "payload": {
    "reason": "host_closed"
  }
}
```

---

## 8. P2P通信設計

## 8.1 WebRTC PeerConnection

ホストとゲストの間で1本の`RTCPeerConnection`を作成する。

利用するもの:

* 映像: WebRTC MediaStreamTrack
* 入力操作: RTCDataChannel
* 制御情報: RTCDataChannel
* 統計情報: getStats

初期版では音声は扱わない。

---

## 8.2 ICE設定

### 初期版

```ts
const peerConnection = new RTCPeerConnection({
  iceServers: [
    { urls: ["stun:stun.pairpair.example.com:3478"] }
  ],
  iceTransportPolicy: "all"
});
```

ただしTURNサーバーを設定しないため、実質的にリレーなしになる。

### 禁止事項

初期版では以下を入れない。

```ts
{
  urls: "turn:turn.example.com:3478",
  username: "...",
  credential: "..."
}
```

---

## 8.3 DataChannel構成

### control channel

信頼性重視。権限、状態変更、品質設定変更に使う。

```ts
pc.createDataChannel("control", {
  ordered: true
});
```

用途:

* remote control許可
* remote control停止
* 品質設定変更
* 注釈ストローク同期
* 注釈Undo / 全削除
* 非操作時ゲストカーソル位置同期
* ホスト状態通知
* ゲスト状態通知
* ping/pong
* stats summary

---

### input channel（低遅延・損失許容）

低遅延重視。マウス移動・スクロールのみを送る。

```ts
pc.createDataChannel("input", {
  ordered: false,
  maxRetransmits: 0
});
```

用途:

* mouse.move
* mouse.wheel

マウス移動とスクロールは古いイベントが届いても意味が薄いため、順序保証と再送を捨てる。

---

### inputReliable channel（信頼性重視・入力確定イベント）

クリック・キー入力など取りこぼすと困るイベントを送る。

```ts
pc.createDataChannel("inputReliable", {
  ordered: true
});
```

用途:

* mouse.down
* mouse.up
* keyboard.down
* keyboard.up
* text.input

入力チャンネル使い分け:

| イベント               | チャンネル       |
| ------------------ | ----------- |
| mouse.move         | input       |
| mouse.wheel        | input       |
| mouse.down/up      | inputReliable |
| keyboard.down/up   | inputReliable |
| text.input         | inputReliable |

---

## 8.5 注釈・カーソルプレゼンス

セッション中、ゲストは映像上にマーカー注釈を重ねられる。

* 注釈は正規化座標で送る
* ホスト側では共有対象ディスプレイに透明オーバーレイを重ねる
* Undo は最後のストローク単位
* 全削除は全ストロークを破棄

ゲストが操作権限を持っていない間は、マウス位置をホストに送る。

* カーソル形状は十字
* 移動中は表示
* 停止後3秒で自動非表示
* 操作権限を取得したら非表示

---

## 8.4 入力イベント形式

### mouse.move

```json
{
  "type": "mouse.move",
  "x": 0.5231,
  "y": 0.4219,
  "screenId": "primary",
  "timestamp": 1710000000000
}
```

x, yは共有画面内の正規化座標にする。

* 左上: 0,0
* 右下: 1,1

ホスト側で実画面座標に変換する。

---

### mouse.down

```json
{
  "type": "mouse.down",
  "button": "left",
  "x": 0.5231,
  "y": 0.4219
}
```

---

### mouse.up

```json
{
  "type": "mouse.up",
  "button": "left",
  "x": 0.5231,
  "y": 0.4219
}
```

---

### mouse.wheel

```json
{
  "type": "mouse.wheel",
  "deltaX": 0,
  "deltaY": -120,
  "x": 0.5231,
  "y": 0.4219
}
```

---

### keyboard.down

```json
{
  "type": "keyboard.down",
  "code": "KeyA",
  "key": "a",
  "ctrlKey": false,
  "shiftKey": false,
  "altKey": false,
  "metaKey": false
}
```

---

### keyboard.up

```json
{
  "type": "keyboard.up",
  "code": "KeyA",
  "key": "a",
  "ctrlKey": false,
  "shiftKey": false,
  "altKey": false,
  "metaKey": false
}
```

---

### text.input

IMEや日本語入力対策として、通常のキーイベントだけでなくテキスト入力イベントを用意する。

```json
{
  "type": "text.input",
  "text": "こんにちは"
}
```

---

## 9. 映像設計

## 9.1 画質方針

PairPairはペアプロ用途のため、ゲーム配信のような動きの滑らかさよりも、コード・文字・UIの鮮明さを優先する。

優先順位:

1. 文字の鮮明さ
2. 入力遅延の少なさ
3. フレームレート
4. 帯域消費の少なさ

---

## 9.2 最大解像度

最大4Kまで対応する。

| モード   |       解像度 |
| ----- | --------: |
| 720p  |  1280x720 |
| 1080p | 1920x1080 |
| 1440p | 2560x1440 |
| 4K    | 3840x2160 |

ホストの物理画面が4Kを超える場合は4Kへ縮小する。

---

## 9.3 フレームレート

選択可能にする。

| 設定    | 用途           |
| ----- | ------------ |
| 15fps | 低帯域、コード閲覧中心  |
| 30fps | 標準           |
| 45fps | 操作感重視        |
| 60fps | 高性能PC・高速回線向け |

初期デフォルトは30fps。

---

## 9.4 ビットレート

選択可能にする。

| モード           |     推奨ビットレート |
| ------------- | -----------: |
| 720p / 30fps  |   2 - 4 Mbps |
| 1080p / 30fps |   4 - 8 Mbps |
| 1440p / 30fps |  8 - 14 Mbps |
| 4K / 30fps    | 15 - 30 Mbps |
| 4K / 60fps    | 30 - 60 Mbps |

初期デフォルト:

```text
1080p / 30fps / 8Mbps
```

ペアプロ用途では、4K/60fpsよりも4K/30fpsの方が現実的。

---

## 9.5 品質プリセット

### Low

```json
{
  "resolution": "1280x720",
  "fps": 15,
  "bitrateMbps": 2
}
```

### Balanced

```json
{
  "resolution": "1920x1080",
  "fps": 30,
  "bitrateMbps": 6
}
```

### Sharp

```json
{
  "resolution": "2560x1440",
  "fps": 30,
  "bitrateMbps": 12
}
```

### Ultra

```json
{
  "resolution": "3840x2160",
  "fps": 30,
  "bitrateMbps": 25
}
```

### Custom

ユーザーが以下を個別指定する。

* 解像度
* fps
* 最大ビットレート
* コーデック優先度
* マウス表示
* stats overlay

---

## 9.6 コーデック方針

初期版の優先順:

1. H.264
2. VP9
3. VP8
4. AV1

理由:

* H.264はハードウェアエンコード対応が広く、実用性が高い
* VP9は画質効率がよいが、環境によって負荷が高い
* AV1は将来的には有力だが、初期版では環境依存が強い可能性がある
* VP8は互換性重視のフォールバック

実装では、利用可能なコーデックを検出してUIに表示する。

### H.264ハードウェアエンコードの有効化

ElectronでH.264ハードウェアエンコードを有効にするため、mainプロセスで以下のフラグを設定する。

```ts
// main.ts (app.ready前に呼ぶ)
app.commandLine.appendSwitch("enable-features", "MediaFoundationVideoCapture"); // Windows
app.commandLine.appendSwitch("enable-accelerated-video-encode");
app.commandLine.appendSwitch("enable-gpu-rasterization");
```

実際に使われているエンコーダーは `RTCRtpSender.getStats()` の `encoderImplementation` で確認できる（`ExternalEncoder` ならハードウェア）。

---

## 9.7 映像パラメータ変更

セッション中に以下を変更できるようにする。

* fps
* bitrate
* resolution
* codec preference
* sharpness mode

変更時はホスト側で`RTCRtpSender.setParameters()`を使って反映する。

解像度変更については、可能なら`applyConstraints()`、難しい場合はMediaStreamを再取得してtrack replacementする。

---

## 10. 画面キャプチャ設計

## 10.1 ホスト側画面共有

ホストは共有対象を選択する。

選択肢:

* 画面全体
* 特定ウィンドウ
* 将来: 特定アプリ単位

初期版では以下を優先する。

1. 画面全体
2. ウィンドウ

### Electronでの実装方式

Electron 22以降では `session.setDisplayMediaRequestHandler` を使う方式を採用する。

```ts
// main process
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
    // ホストが選択したsourceを返す
    callback({ video: sources[0], audio: "loopback" });
  });
});
```

renderer側では `navigator.mediaDevices.getDisplayMedia()` を呼ぶだけでよい。

**注意**: `sandbox: true` の場合、renderer/preloadから `desktopCapturer` を直接呼ぶことはできない。必ずmainプロセスで取得し、`setDisplayMediaRequestHandler` または IPC経由でrendererへ返す。

---

## 10.2 ScreenSourcePicker

ホストのセッション開始時に、共有対象を選ぶ画面を表示する。

表示項目:

* サムネイル
* 画面名
* ウィンドウ名
* 解像度
* 共有開始ボタン

---

## 10.3 macOS権限

Macでは以下の権限が必要になる。

* 画面収録
* アクセシビリティ
* 入力監視が必要になる可能性

アプリ起動時またはホスト開始時に権限チェックを行う。

### 権限不足時の画面

```text
PairPairを使用するには、macOSの権限設定が必要です。

必要な権限:
- 画面収録
- アクセシビリティ

[システム設定を開く]
[再チェック]
```

---

## 10.4 Windows権限

Windowsでは通常、画面キャプチャに特別なOS権限は不要。

ただし、リモート操作の入力注入には以下が必要になる場合がある。

* 管理者権限アプリへの操作制限
* UAC画面操作不可
* セキュリティソフトによる制限

初期版では、管理者権限アプリやUAC画面は操作対象外とする。

---

## 11. リモートコントロール設計

## 11.1 権限モデル

ホストはゲストに操作権限を明示的に付与する。

権限状態:

| 状態               | 説明        |
| ---------------- | --------- |
| viewOnly         | 視聴のみ      |
| controlRequested | ゲストが操作要求中 |
| controlAllowed   | 操作許可中     |
| controlPaused    | 一時停止      |
| controlRevoked   | 操作権限取り消し  |

初期状態は`viewOnly`。

---

## 11.2 操作許可フロー

```text
1. ゲストが「操作をリクエスト」を押す
2. ホストに確認ダイアログを表示
3. ホストが「許可」を押す
4. controlAllowedになる
5. ゲストのマウス・キーボード入力をホストへ送信
6. ホストはいつでもEscまたは停止ボタンで取り消せる
```

---

## 11.3 ホスト側の安全操作

ホスト側に常時表示する。

```text
Guest PC が操作中
[一時停止] [操作権限を取り消す] [切断]
```

ショートカット:

| 操作       | キー                     |
| -------- | ---------------------- |
| 操作一時停止   | Ctrl + Alt + P         |
| 操作権限取り消し | Ctrl + Alt + Esc       |
| セッション終了  | Ctrl + Alt + Shift + Q |

Macでは以下も検討する。

| 操作       | キー                 |
| -------- | ------------------ |
| 操作一時停止   | Cmd + Option + P   |
| 操作権限取り消し | Cmd + Option + Esc |

---

## 11.4 座標変換

ゲスト側では映像表示領域と実画面の縦横比が異なる場合がある。

そのため、座標は以下の流れで変換する。

```text
Guest mouse position
  -> video element内の相対座標
  -> letterbox/pillarboxを除外
  -> 0.0 - 1.0の正規化座標
  -> DataChannel送信
  -> Host側で共有対象の実座標へ変換
  -> OS入力注入
```

注意点:

* Retina display
* Windows DPI scaling
* マルチモニター
* ウィンドウ共有時のオフセット
* ゲスト側のズーム
* ホスト側のスケールファクター

---

## 11.5 入力注入

### Windows

Windowsではネイティブヘルパーで以下を使う。

* SendInput
* SetCursorPos
* mouse_eventは非推奨
* 可能ならRustで薄いwrapperを作る

### macOS

Macではネイティブヘルパーで以下を使う。

* CGEventCreateMouseEvent
* CGEventPost
* CGEventCreateKeyboardEvent
* AXIsProcessTrustedWithOptions

必要権限:

* Accessibility
* Screen Recording

---

## 11.6 日本語入力対応

キーイベントだけでは日本語IME操作が不安定になりやすい。

そのため、以下の二段構えにする。

1. 通常キー入力はkeyDown/keyUpで送る
2. テキスト入力確定時はtext.inputで文字列として送る

初期版では完全なIME同期は対象外にし、テキスト貼り付け方式を用意する。

例:

```text
ゲスト側で日本語入力
  -> 確定文字列をtext.inputで送信
  -> ホスト側でクリップボード経由または直接テキスト挿入
```

---

## 12. 画面構成

## 12.1 Home画面

### 目的

ホスト開始かゲスト参加を選ぶ。

### UI

```text
+------------------------------------------------+
| PairPair                                       |
| 軽量・高画質なペアプロ用リモート操作アプリ        |
|                                                |
| [ホストとして開始]                              |
| [ゲストとして参加]                              |
|                                                |
| 最近の設定: 1080p / 30fps / 8Mbps              |
|                                                |
| [設定]                                         |
+------------------------------------------------+
```

### 機能

* ホスト開始
* ゲスト参加
* 設定画面への遷移
* 前回品質設定の表示
* ネットワーク診断への導線

---

## 12.2 Host Setup画面

### 目的

共有対象と品質設定を選んでセッションを作成する。

### UI

```text
+------------------------------------------------+
| ホストとして開始                                |
|                                                |
| 共有する画面                                    |
| [ Screen 1  3840x2160 ]                         |
| [ Window: VS Code      ]                        |
| [ Window: IntelliJ     ]                        |
|                                                |
| 画質設定                                        |
| プリセット: [Balanced v]                        |
| 解像度: [1920x1080 v]                           |
| FPS: [30 v]                                     |
| ビットレート: [8 Mbps v]                        |
|                                                |
| [セッションを作成]                              |
+------------------------------------------------+
```

### 機能

* 画面全体選択
* ウィンドウ選択
* 品質プリセット選択
* カスタム設定
* 権限チェック
* セッション作成

---

## 12.3 Host Waiting画面

### 目的

接続コードを表示し、ゲストを待つ。

### UI

```text
+------------------------------------------------+
| ゲストを待っています                            |
|                                                |
| 接続コード                                      |
|                                                |
|              123 456                           |
|                                                |
| このコードをゲストに伝えてください。             |
| 有効期限: 09:58                                 |
|                                                |
| 状態: サーバーに接続済み                        |
|                                                |
| [コードをコピー] [キャンセル]                    |
+------------------------------------------------+
```

### 機能

* コード表示
* コードコピー
* 有効期限表示
* WebSocket接続状態表示
* キャンセル
* ゲスト参加通知

---

## 12.4 Guest Join画面

### 目的

ゲストがコードを入力して接続する。

### UI

```text
+------------------------------------------------+
| ゲストとして参加                                |
|                                                |
| ホストから共有されたコードを入力してください。    |
|                                                |
| [ 123456 ]                                     |
|                                                |
| [接続]                                         |
|                                                |
| 接続方式: P2P限定                              |
| ※ネットワーク環境によっては接続できません。      |
+------------------------------------------------+
```

### 機能

* コード入力
* コード正規化
* セッション検索
* WebSocket接続
* WebRTC接続開始
* エラー表示

---

## 12.5 Host Session画面

### 目的

ホスト側のセッション管理。

### UI

```text
+------------------------------------------------+
| PairPair - ホスト中                             |
|                                                |
| 共有中: Screen 1                                |
| 接続先: Guest PC                                |
| 状態: P2P接続済み                               |
| 遅延: 24ms / 受信品質: Good                     |
|                                                |
| 操作権限: 視聴のみ                              |
| [操作を許可] [一時停止] [切断]                  |
|                                                |
| 画質: 1080p / 30fps / 8Mbps                     |
| [画質を変更]                                    |
|                                                |
| [セッション終了]                                |
+------------------------------------------------+
```

### 機能

* 接続状態表示
* ゲスト情報表示
* 操作許可/停止
* 画質変更
* セッション終了
* stats overlay
* 権限状態表示

---

## 12.6 Guest Session画面

### 目的

ゲストがホスト画面を見て操作する。

### UI

```text
+------------------------------------------------+
| PairPair - ゲスト                               |
| 状態: P2P接続済み | 1080p / 30fps / 8Mbps        |
| [マーカーON/OFF] [色] [太さ] [Undo] [全削除] [全画面] |
+------------------------------------------------+
|                                                |
|              Remote Screen Video               |
|                                                |
+------------------------------------------------+
| [操作をリクエスト] [表示倍率] [統計] [切断]      |
+------------------------------------------------+
```

### 機能

* リモート画面表示
* 画面フィット
* 原寸表示
* 縮小表示
* マーカー注釈
* Undo / 全削除
* 操作リクエスト
* マウス/キーボードキャプチャ
* 全画面表示
* `ESC` 2回で全画面解除
* stats表示
* 切断

---

## 12.7 Settings画面

### 項目

```text
一般
- 起動時に前回設定を使う
- 終了時に確認する

画質
- デフォルト解像度
- デフォルトFPS
- デフォルトビットレート
- コーデック優先度
- 自動品質調整

接続
- STUNサーバー
- P2P限定モード
- 接続タイムアウト秒数

操作
- 操作許可のデフォルト
- ホスト側停止ショートカット
- マウスカーソル表示
- キーボード入力を許可

セキュリティ
- 毎回操作許可を確認
- セッション終了時に権限を破棄
- ログ保存
```

---

## 12.8 Stats Overlay

開発・検証に必須。

表示項目:

* RTT
* packet loss
* jitter
* actual fps
* target fps
* bitrate
* resolution
* codec
* encoder implementation
* frames dropped
* freeze count
* input latency
* ICE connection state
* selected candidate pair
* local candidate type
* remote candidate type

UI例:

```text
Codec: H264
Resolution: 1920x1080
FPS: 29.8 / 30
Bitrate: 7.8 Mbps
RTT: 23 ms
Packet Loss: 0.2%
ICE: connected / host-srflx
Input latency: 18 ms
```

---

## 12.9 ホスト透明オーバーレイ

ホスト側は共有対象ディスプレイの上に透明オーバーレイウィンドウを出せるようにする。

表示内容:

* ゲストのマーカー注釈
* 非操作時ゲストカーソル

要件:

* クリックを奪わない
* 常時最前面
* セッション終了で閉じる

---

## 13. 接続フロー

## 13.1 ホスト開始

```text
1. アプリ起動
2. ホストとして開始
3. 権限チェック
4. 共有画面選択
5. 画質設定選択
6. サーバーへセッション作成要求
7. サーバーが一意コード発行
8. ホスト画面にコード表示
9. WebSocket接続
10. ゲスト待機
```

---

## 13.2 ゲスト参加

```text
1. アプリ起動
2. ゲストとして参加
3. コード入力
4. サーバーへjoin要求
5. WebSocket接続
6. ホストにguest.joined通知
7. ホストがWebRTC offer作成
8. ゲストがanswer返却
9. ICE candidate交換
10. P2P接続確立
11. 映像track受信開始
12. DataChannel open
13. サーバーはsignaling用途のみ継続、映像・入力はP2P
```

---

## 13.3 操作リクエスト

```text
1. ゲストが操作リクエスト
2. control DataChannelでホストへ通知
3. ホストに確認UI表示
4. ホストが許可
5. controlAllowedをゲストへ通知
6. ゲスト側で入力キャプチャ開始
7. input DataChannelで入力イベント送信
8. ホスト側native helperでOS入力注入
```

---

## 14. 自動品質調整

## 14.1 初期版

初期版では手動設定を優先する。

ただし、明らかに通信が悪い場合は警告を出す。

例:

```text
現在の回線では4K/30fps/25Mbpsの維持が難しい可能性があります。
1440p/30fps/12Mbpsへ下げることを推奨します。
[変更する] [そのまま]
```

---

## 14.2 将来版

WebRTC statsを見て自動調整する。

判断材料:

* packet loss
* RTT
* jitter
* frames dropped
* freeze count
* available outgoing bitrate
* current bitrate
* actual encoded fps

調整順:

1. bitrateを下げる
2. fpsを下げる
3. resolutionを下げる
4. それでも悪ければ警告

---

## 15. セキュリティ設計

## 15.1 基本方針

* WebSocketは必ずTLS
* セッションコードは短時間で失効
* コードは一度使ったら無効
* ホストの明示許可なしに操作不可
* ホストはいつでも停止可能
* サーバーは映像・入力を中継しない
* Electronではrendererに強い権限を直接持たせない
* Node Integrationは無効
* Context Isolationは有効
* preload経由で必要最小限のAPIのみ公開

---

## 15.2 Electronセキュリティ設定

BrowserWindowの基本設定:

```ts
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true
  }
});
```

preloadでは安全なAPIだけを公開する。

```ts
contextBridge.exposeInMainWorld("pairpair", {
  getScreenSources: () => ipcRenderer.invoke("screen:getSources"),
  startHost: (options) => ipcRenderer.invoke("session:startHost", options),
  stopSession: () => ipcRenderer.invoke("session:stop"),
  checkPermissions: () => ipcRenderer.invoke("permissions:check")
});
```

悪い例:

```ts
contextBridge.exposeInMainWorld("pairpair", {
  send: ipcRenderer.send
});
```

任意IPC送信を許すため禁止。

---

## 15.3 操作権限

操作権限はセッション単位で管理する。

* セッション開始時はviewOnly
* ゲストごとに明示許可
* 切断時に権限破棄
* 再接続時も再許可
* 操作許可中はホスト画面に常時表示
* ホストのローカル操作を優先

---

## 15.4 MITM対策

WebRTC自体は暗号化されるが、signaling serverが悪意を持つと接続相手のすり替えリスクがある。

初期版では以下を入れる。

* ホスト画面に接続ゲスト名を表示
* ゲスト画面にホスト名を表示
* セッションコードは短命
* 1コード1ゲストのみ
* WebSocket tokenをrole別に分ける

将来版では以下を検討する。

* ホスト/ゲスト双方にfingerprint表示
* SAS確認
* QRコード接続
* E2E認証キー交換

---

## 16. エラー設計

## 16.1 接続失敗

```text
P2P接続を確立できませんでした。

考えられる原因:
- どちらかのネットワークがUDP通信を制限している
- 企業ネットワークまたはVPNを利用している
- NAT構成により直接接続できない
- ファイアウォールが通信をブロックしている

PairPairの初期版はP2P限定のため、リレー接続は行いません。
```

---

## 16.2 権限不足

```text
画面共有またはリモート操作に必要な権限が不足しています。

必要な権限:
- 画面収録
- アクセシビリティ

設定を変更した後、PairPairを再起動してください。
```

---

## 16.3 画質維持不可

```text
現在の回線では指定された画質を維持できていません。

現在:
- 4K / 30fps / 25Mbps
- 実効fps: 18fps
- packet loss: 4.2%

推奨:
- 1440p / 30fps / 12Mbps
```

---

## 17. ログ設計

## 17.1 アプリログ

保存する:

* 起動/終了
* セッション開始/終了
* signaling状態
* WebRTC connection state
* ICE candidate type
* 品質設定
* エラー
* 権限状態
* stats summary

保存しない:

* 画面映像
* 入力内容そのもの
* キー入力文字列
* クリップボード内容
* コード本文

---

## 17.2 サーバーログ

保存する:

* session created
* guest joined
* signaling started
* signaling completed
* session closed
* error
* rate limit

保存しない:

* SDP全文は原則保存しない
* ICE candidateのIPは匿名化または短期保持
* 映像/入力はそもそもサーバーを通らない

---

## 18. パフォーマンス方針

## 18.1 軽量化

* 映像処理はWebRTC/Chromiumのハードウェアエンコードを優先
* rendererで重い画像処理をしない
* stats取得間隔は1秒程度
* マウスmoveは間引く
* wheelイベントは短時間バッチ化
* DataChannelメッセージは小さく保つ
* サムネイル取得は必要時のみ
* 画面ソース一覧のthumbnailSizeを小さくする

---

## 18.2 マウスイベント間引き

目標:

* 最大送信頻度: 60Hz
* 低帯域時: 30Hz
* 同一座標付近のイベントは破棄
* 古いmoveは送らない

例:

```ts
const MOUSE_MOVE_SEND_INTERVAL_MS = 16;
```

---

## 18.3 入力遅延測定

ゲストがinput eventにtimestampを付与する。

ホストは受信時刻との差分を計算し、control channelで返す。

```json
{
  "type": "input.latency",
  "clientTimestamp": 1710000000000,
  "hostReceivedTimestamp": 1710000000018
}
```

---

## 19. MVPスコープ

## 19.1 MVPで作るもの

### サーバー

* セッション作成
* コード発行
* コード参加
* WebSocket signaling
* SDP/ICE中継
* TTL管理
* 1対1制限

### デスクトップアプリ

* ホスト開始
* ゲスト参加
* 画面共有
* WebRTC P2P接続
* 映像表示
* 画質プリセット
* stats overlay
* マウス操作
* キーボード操作
* 操作許可/停止
* 切断
* 注釈
* 全画面表示
* ゲストカーソルのホスト投影
* Windows開発/テスト
* Mac基本対応

---

## 19.2 MVPで作らないもの

* 音声
* チャット
* ファイル転送
* 複数人
* 録画
* TURNリレー
* 自動更新
* アカウント機能
* 履歴管理
* 常時無人アクセス
* モバイル対応

---

## 20. ディレクトリ構成案

```text
pairpair/
  package.json
  pnpm-workspace.yaml
  turbo.json

  apps/
    desktop/
      package.json
      electron.vite.config.ts
      src/
        main/
        preload/
        renderer/

    signaling-server/
      package.json
      src/
        index.ts
        routes/
          sessions.ts
          health.ts
        ws/
          signaling.ts
          session-registry.ts
        services/
          code-generator.ts
          session-service.ts
        infra/
          redis.ts
          logger.ts

  packages/
    shared/
      package.json
      src/
        signaling-types.ts
        rtc-types.ts
        input-events.ts
        quality.ts
        errors.ts

    native-input/
      package.json
      src/
        index.ts
      native/
        rust-or-cpp-source/

  docs/
    SPEC.md
    protocol.md
    security.md
    development.md
```

---

## 21. 実装順序

## Phase 1: 最小P2P画面共有

* Electron起動
* Host/Guest画面
* signaling server
* WebSocket接続
* session code発行
* WebRTC offer/answer
* ICE candidate交換
* ホスト画面をゲストへ表示
* stats overlay

成果物:

```text
ホストの画面がゲストにP2Pで表示される
```

---

## Phase 2: 画質設定

* 解像度選択
* fps選択
* bitrate選択
* 品質プリセット
* セッション中のbitrate変更
* 4Kテスト

成果物:

```text
1080p/1440p/4K、fps、bitrateを選択して画面共有できる
```

---

## Phase 3: マウス操作

* ゲスト側mouse capture
* 座標正規化
* DataChannel送信
* ホスト側座標復元
* Windows入力注入
* Mac入力注入
* 操作許可UI

成果物:

```text
ゲストがホストPCのマウスを操作できる
```

---

## Phase 4: キーボード操作

* keyDown/keyUp送信
* modifier対応
* ショートカット対応
* 日本語入力の暫定対応
* text.input対応

成果物:

```text
ゲストがホストPCでコード編集できる
```

---

## Phase 5: 安定化

* 切断/再接続
* エラーメッセージ
* 権限チェック
* ログ
* 自動品質警告
* Windows/Macパッケージング
* E2Eテスト

成果物:

```text
実用的なペアプロセッションができる
```

---

## 22. AI実装用プロンプト

以下を実装AIに渡す。

```text
PairPairというElectron + React + TypeScriptアプリを実装してください。

目的:
Tupleのような1対1ペアプロ用リモート操作アプリです。
ホストが画面を共有し、ゲストが許可を受けてホストPCをリモート操作します。

重要条件:
- 待ち合わせ用signaling serverは使う
- 映像、入力、制御はWebRTC P2Pで送る
- TURNリレーは使わない
- STUNのみ使う
- ElectronでWindows開発、Mac利用を想定
- 最大4K対応
- fpsとbitrateをユーザーが選択できる
- ホスト/ゲストは1対1
- ホスト開始時にサーバーで一意コードを発行
- ゲストはコード入力で接続
- サーバーはSDP/ICEの中継のみ行い、映像や入力は扱わない

まずPhase 1として以下を作ってください。
1. pnpm monorepo構成
2. apps/desktop: Electron + React + TypeScript + Vite
3. apps/signaling-server: Node.js + Fastify + ws
4. packages/shared: signaling型定義
5. ホスト開始画面
6. ゲスト参加画面
7. セッションコード発行
8. WebSocket signaling
9. WebRTC offer/answer/ICE交換
10. ホスト画面をゲストに表示
11. stats overlayの最小表示

セキュリティ:
- ElectronはnodeIntegration false
- contextIsolation true
- preload経由で必要最小限APIだけ公開
- サーバーは映像や入力を保存・中継しない

実装は段階的に行い、各Phaseで動作確認手順をREADMEに書いてください。
```

---

## 23. 主要なリスク

| リスク        | 内容                         | 対策                                 |
| ---------- | -------------------------- | ---------------------------------- |
| P2P接続不可    | TURNなしのため一部NWで接続不可         | 明確なエラー表示、将来TURNオプション               |
| Mac権限      | 画面収録・アクセシビリティが必要           | 権限チェックUI                           |
| 入力注入       | OSごとに実装が異なる                | native helperを分離                   |
| 4K負荷       | CPU/GPU/帯域負荷が高い            | プリセット、自動警告                         |
| 日本語入力      | key eventだけでは不安定           | text.input経路                       |
| 座標ズレ       | DPI/Retina/マルチモニター         | 正規化座標とscaleFactor対応                |
| セキュリティ     | リモート操作は危険                  | 明示許可、常時表示、即停止                      |
| Electron重量 | Tupleより軽くしたいがElectron自体は重い | WebRTC処理をネイティブ/Chromiumに寄せ、UIを軽く保つ |

---

## 24. 初期リリース判定基準

MVP完了条件:

* Windows同士でホスト/ゲスト接続できる
* Macホスト、Windowsゲストで接続できる
* 1080p/30fpsで安定表示できる
* 1440p/30fpsで実用表示できる
* 4K/30fpsで接続・表示できる
* ゲストがマウス操作できる
* ゲストがキーボード入力できる
* ホストが操作権限を即停止できる
* TURNなしで接続失敗するケースを正しく表示できる
* サーバーが映像・入力を中継していないことを確認できる

---

## 25. 結論

PairPairの初期版は、Electron + WebRTC + STUN-only + signaling serverという構成が最も現実的。

映像はWebRTCのMediaStreamで送り、入力操作はRTCDataChannelでP2P送信する。ホスト側ではネイティブヘルパーでOS入力注入を行う。

最重要ポイントは以下。

1. TURNなしでは接続できない環境があることを仕様として明示する
2. 画質は4K対応よりも文字の鮮明さを優先する
3. マウス移動は低遅延、クリックとキー入力は信頼性重視で送る
4. Mac権限とDPI/Retina座標変換を初期から設計に入れる
5. ホストの安全停止UIを常時表示する
6. Phase 1ではまず画面共有だけを確実に完成させる

この順で作ると、AI実装でも破綻しにくい。
