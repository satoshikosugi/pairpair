# PairPair — GitHub Copilot 実装ガイドライン

このファイルは PairPair プロジェクトの AI 実装エージェントが参照する行動規範です。
GitHub Issues を通じた開発を円滑に進めるために、必ずこのファイルの指示に従ってください。

---

## 1. プロジェクト概要

PairPair は Electron + WebRTC による 1 対 1 のペアプロ用リモート操作アプリです。
ホストが画面を共有し、ゲストが操作権限を受けてホスト PC をリモートコントロールします。

**最重要制約**:
- 映像・音声・入力操作は WebRTC P2P のみ
- TURN リレーは使用しない（初期版）
- signaling server はシグナリングのみ行い、メディアデータは一切中継しない

---

## 2. ドキュメント参照ルール

実装前に必ず以下を確認してください。

| ドキュメント | 用途 |
|---|---|
| `docs/SPEC.md` | 全仕様の正本。設計・API・プロトコル・UI・セキュリティの詳細はここを見る |
| `docs/TASK.md` | 実装タスクのチェックリスト。進捗管理に使う |

### 参照の優先順位

1. Issue の本文に明記された指示
2. `docs/SPEC.md` の該当セクション
3. `docs/TASK.md` のチェックリスト
4. このファイル（`copilot-instructions.md`）

Issue に記載がない場合は SPEC.md を正として実装してください。推測で仕様を決めないこと。

---

## 3. Issue 対応フロー

### 3-1. Issue 受け取り時の手順

1. **Issue タイトルと TASK.md の対応を確認する**
   - Issue は TASK.md のフェーズ・セクション単位で切られます
   - 例: `[Phase 0] 0-2: packages/shared 作成`
2. **SPEC.md の対応セクションを読む**（例: Phase 0 なら Section 5, 20）
3. **依存する先行タスクが完了しているか確認する**
   - TASK.md のチェックボックスを確認
   - 未完の依存タスクがあれば Issue にコメントして報告する
4. **実装を開始する**

### 3-2. 実装完了時の手順

1. **TASK.md の対応チェックボックスを `[x]` に更新する**
   - 実装した項目を漏れなくチェックする
   - 実装しなかった（スコープ外の）項目はチェックしない
2. **変更したファイルの一覧をコミットメッセージに含める**
3. **動作確認手順を PR の説明に書く**
4. **TASK.md の更新も同じ PR に含める**

### 3-3. 不明点・ブロッカー発生時

- 仕様が不明確な場合は **実装を止めて** Issue にコメントする
- 技術的に実現不可能な仕様を発見した場合も Issue にコメントする
- 推測で実装して後で問題になるよりも、確認コメントを優先する

---

## 4. 技術スタック（変更禁止）

SPEC.md Section 5 で定義されたスタックから逸脱しないこと。

### デスクトップアプリ (`apps/desktop`)

| 項目 | 採用技術 |
|---|---|
| アプリ基盤 | Electron |
| UI | React |
| 言語 | TypeScript（strict モード） |
| ビルド | electron-vite |
| 状態管理 | Zustand |
| 通信 | WebRTC / WebSocket |
| ネイティブ操作 | napi-rs (Rust) |
| パッケージング | electron-builder |
| ログ | electron-log |
| 設定保存 | electron-store |
| E2E テスト | Playwright |
| 単体テスト | Vitest |

### サーバー (`apps/signaling-server`)

| 項目 | 採用技術 |
|---|---|
| API | Node.js + Fastify |
| WebSocket | ws |
| セッション管理 | Redis (ioredis) |
| バリデーション | Zod |
| ログ | Pino |

### 共通

| 項目 | 採用技術 |
|---|---|
| パッケージマネージャー | pnpm |
| モノレポ管理 | Turborepo |
| 言語 | TypeScript 5.x |

---

## 5. ディレクトリ構成規則

SPEC.md Section 6 および Section 20 のディレクトリ構成を厳守してください。

```
pairpair/
  apps/
    desktop/
      src/
        main/          # Electron main process のみ
        preload/       # contextBridge のみ
        renderer/      # React UI のみ
    signaling-server/
      src/
        routes/        # REST エンドポイント
        ws/            # WebSocket ハンドラー
        services/      # ビジネスロジック
        infra/         # 外部依存（Redis 等）
  packages/
    shared/            # 型定義のみ（ロジック禁止）
    native-input/      # Rust + napi-rs のみ
  docs/
```

### 禁止事項

- `main/` プロセスに UI ロジックを書かない
- `renderer/` プロセスから Node.js API（fs, path 等）を直接使わない
- `packages/shared/` にランタイムロジックを書かない（型定義・定数のみ）
- `apps/` 間で直接 import しない（`packages/shared` 経由のみ）

---

## 6. Electron セキュリティ規則（絶対遵守）

SPEC.md Section 15 の全要件を満たすこと。

### BrowserWindow の必須設定

```typescript
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, "preload.js"),
    nodeIntegration: false,      // 必須: false
    contextIsolation: true,      // 必須: true
    sandbox: true,               // 必須: true
  },
});
```

### preload の禁止パターン

```typescript
// ❌ 絶対禁止: 任意の IPC 送信を expose する
contextBridge.exposeInMainWorld("api", {
  send: ipcRenderer.send,
  invoke: ipcRenderer.invoke, // チャンネル名を絞らない形はNG
});

// ✅ 正しい: 機能ごとに個別ラッパーを expose する
contextBridge.exposeInMainWorld("pairpair", {
  getScreenSources: () => ipcRenderer.invoke("screen:getSources"),
  startHost: (options: StartHostOptions) => ipcRenderer.invoke("session:startHost", options),
  stopSession: () => ipcRenderer.invoke("session:stop"),
  checkPermissions: () => ipcRenderer.invoke("permissions:check"),
});
```

### desktopCapturer の使用方法

`sandbox: true` 環境では renderer/preload から `desktopCapturer` を直接呼べません。

```typescript
// ✅ 正しい: main process で setDisplayMediaRequestHandler を使う
session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
  desktopCapturer.getSources({ types: ["screen", "window"] }).then((sources) => {
    callback({ video: sources[0] });
  });
});
```

### IPC チャンネル名の規則

```
{domain}:{action}
例: screen:getSources, session:startHost, permissions:check, settings:get
```

IPC ハンドラーは `src/main/ipc/` 以下のファイルに集約してください。

---

## 7. WebRTC 実装規則

SPEC.md Section 8 の設計に従ってください。

### DataChannel の構成（変更禁止）

| チャンネル名 | ordered | maxRetransmits | 用途 |
|---|---|---|---|
| `control` | true | — | 権限変更・状態通知・ping/pong |
| `input` | false | 0 | mouse.move / mouse.wheel のみ |
| `inputReliable` | true | — | mouse.down/up / keyboard.down/up / text.input |

### ICE 設定

```typescript
const peerConnection = new RTCPeerConnection({
  iceServers: [
    { urls: ["stun:stun.pairpair.example.com:3478"] }
  ],
  iceTransportPolicy: "all",
});
// TURN サーバーは追加しないこと
```

### 映像パラメータ変更の方法

1. 解像度変更: `applyConstraints()` を試み、失敗したら track replacement
2. ビットレート/fps 変更: `RTCRtpSender.setParameters()`

---

## 8. コーディング規則

### TypeScript

- `strict: true` を有効にする
- `any` は禁止。どうしても必要な場合は `unknown` + 型ガードを使う
- 非同期は `async/await` を使う（`Promise.then` チェーンは避ける）
- 型定義は `packages/shared` に集約し、アプリ間で共有する

### エラーハンドリング

- ユーザーに見えるエラーメッセージは SPEC.md Section 16 の文言を使う
- サーバー側エラーはステータスコードと `{ error: string, code: string }` 形式で返す
- クライアント側では `electron-log` でエラーを記録する

### サーバーバリデーション

REST API のリクエストボディは必ず Zod で検証してください。

```typescript
const HostSessionSchema = z.object({
  appVersion: z.string(),
  deviceName: z.string().max(100),
  platform: z.enum(["darwin", "win32", "linux"]),
});
```

### ログ規則

以下のデータは**絶対にログに記録しない**（SPEC.md Section 17 参照）:

- キーボード入力の内容
- クリップボードの内容
- 映像データ・スクリーンショット
- SDP 本文全体
- ICE candidate の IP アドレス（匿名化すること）
- hostToken / guestToken の値

---

## 9. 入力イベント実装規則

SPEC.md Section 8.4 のイベント形式を厳守してください。

### 座標の扱い

- ゲスト側では必ず **0.0〜1.0 の正規化座標** に変換してから送信する
- letterbox / pillarbox 領域を除いた映像エリア内の相対座標を計算すること
- ホスト側では `captureWidth * normalizedX + captureOffsetX` で実座標に変換する

### マウス移動の間引き

```typescript
const MOUSE_MOVE_INTERVAL_MS = 16; // 最大 60Hz
// 同一座標付近（1px 以内）は破棄
// requestAnimationFrame または throttle で制御
```

### 入力チャンネルの使い分け

```
mouse.move, mouse.wheel  → "input" チャンネル（unreliable）
mouse.down, mouse.up     → "inputReliable" チャンネル（reliable）
keyboard.down, keyboard.up → "inputReliable" チャンネル（reliable）
text.input               → "inputReliable" チャンネル（reliable）
```

---

## 10. セッションコード仕様

SPEC.md Section 7.2 に従ってください。

- 表示コード: 6〜8 桁の数字
- 内部 sessionId: UUID v4
- hostToken / guestToken: 128bit ランダム（`crypto.randomBytes(16).toString('hex')`）
- code TTL: 10 分
- session TTL: 24 時間（WebSocket 切断時は短縮）
- コードは 1 回使ったら再利用不可
- ゲスト接続後はコードを無効化する

---

## 11. フェーズ別の実装優先度

TASK.md のフェーズ順序を必ず守ってください。後のフェーズを先に実装しないこと。

| フェーズ | 内容 | 完了判定 |
|---|---|---|
| Phase 0 | 環境構築・型定義 | `pnpm build` が全パッケージで通る |
| Phase 1 | P2P 画面共有（最小） | Windows 同士でホスト画面がゲストに表示される |
| Phase 2 | 画質設定 | 1080p/1440p/4K で接続・表示できる |
| Phase 3 | マウス操作 | ゲストがホスト PC のマウスを操作できる |
| Phase 4 | キーボード操作 | ゲストがホスト PC でコード編集できる |
| Phase 5 | 安定化・パッケージング | TASK.md Section 5-11 の MVP 判定基準を全て満たす |

---

## 12. TASK.md の更新ルール

実装完了時には必ず TASK.md を更新してください。

### チェックボックスの更新例

```markdown
<!-- 実装前 -->
- [ ] `src/signaling-types.ts` — WebSocket メッセージ型定義

<!-- 実装後 -->
- [x] `src/signaling-types.ts` — WebSocket メッセージ型定義
```

### 更新タイミング

- **Issue 単位の作業が終わったら PR に TASK.md の更新を含める**
- 部分的に実装した場合は部分的にチェックする（やっていない項目をチェックしない）
- Phase 全体が完了したら Phase のヘッダーに `✅` を付ける

---

## 13. PR・コミット規則

### コミットメッセージ形式

```
<type>(<scope>): <summary>

例:
feat(shared): add signaling message types
feat(server): implement session creation API
feat(desktop): add screen source picker UI
fix(desktop): correct coordinate normalization for letterbox
chore(repo): initialize pnpm monorepo
```

| type | 用途 |
|---|---|
| feat | 新機能 |
| fix | バグ修正 |
| chore | ビルド・設定変更 |
| docs | ドキュメント更新 |
| test | テスト追加・修正 |
| refactor | リファクタリング（機能変更なし） |

### PR の説明に必ず含めること

1. 対応 TASK.md の項目（箇条書き）
2. 動作確認手順（ステップバイステップ）
3. テスト方法（単体テスト / 手動テストの区別）
4. 変更した SPEC.md の箇所（あれば）

---

## 14. テスト規則

### 単体テスト（Vitest）

- `packages/shared` の型ガード・バリデーション関数は必ずテストを書く
- `apps/signaling-server` の service 層はモックを使ってテストする
- テストファイルは実装ファイルと同じディレクトリに `*.test.ts` として置く

### E2E テスト（Playwright + Electron）

- Phase 5 で整備する
- 最低限のハッピーパス（Host 起動 → コード発行 → Guest 接続 → P2P 確立）を自動化する

### 手動確認が必要なもの

- ハードウェアエンコードの動作（`encoderImplementation: ExternalEncoder` の確認）
- DPI スケーリング環境での座標精度
- macOS 権限ダイアログの動作

---

## 15. よくある間違いと防止策

| 間違い | 防止策 |
|---|---|
| renderer から `desktopCapturer` を直接呼ぶ | `setDisplayMediaRequestHandler` を main process で使う |
| `nodeIntegration: true` にする | BrowserWindow 設定を必ず確認する |
| TURN サーバーを ICE 設定に追加する | ICE 設定は SPEC.md Section 8.2 のみ使う |
| DataChannel の `input` に click イベントを流す | click は `inputReliable` チャンネルを使う |
| 正規化座標変換を省略する | ゲスト側では必ず `coordinate.ts` の変換関数を通す |
| `control` チャンネルの権限チェックを省略する | 入力注入前に `controlAllowed` フラグを必ず確認する |
| SDP 全文をサーバーログに保存する | Pino の redact 設定または手動でフィールドを除外する |
| packages/shared にロジックを書く | shared は型定義・定数のみ |
| host/guestToken をクライアントログに記録する | token はログ記録禁止 |

---

## 16. 参照セクション早見表

実装内容と SPEC.md セクションの対応表です。

| 実装内容 | SPEC.md セクション |
|---|---|
| アーキテクチャ全体 | Section 4 |
| 技術スタック | Section 5 |
| ディレクトリ構成 | Section 6, 20 |
| サーバー API | Section 7.3 |
| WebSocket メッセージ | Section 7.4 |
| DataChannel 設計 | Section 8.3 |
| 入力イベント形式 | Section 8.4 |
| 画質プリセット | Section 9.5 |
| コーデック方針 | Section 9.6 |
| 画面キャプチャ | Section 10 |
| 操作許可フロー | Section 11.2, 11.3 |
| 座標変換 | Section 11.4 |
| 入力注入 (OS別) | Section 11.5 |
| 日本語入力 | Section 11.6 |
| 画面 UI 仕様 | Section 12 |
| 接続フロー | Section 13 |
| Electron セキュリティ | Section 15.2 |
| エラーメッセージ文言 | Section 16 |
| ログ設計 | Section 17 |
| パフォーマンス | Section 18 |
| MVP スコープ | Section 19 |
| 実装フェーズ順序 | Section 21 |
| 既知リスク | Section 23 |
| MVP 判定基準 | Section 24 |
