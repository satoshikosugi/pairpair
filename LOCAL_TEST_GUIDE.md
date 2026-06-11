# PairPair ローカルテストガイド

このガイドに従って、ホストとゲストを両方立ち上げてローカルテストを実行します。

## 前提条件チェック

セットアップが正しくできているか確認します：

```batch
# Windows コマンドプロンプト
check-setup.bat
```

または PowerShell：

```powershell
# PowerShell
.\check-setup.ps1
```

以下が確認されます：
- ✅ Node.js がインストールされているか
- ✅ Redis が起動しているか
- ✅ Signaling Server が起動しているか
- ✅ pnpm がインストールされているか

## 前提条件

- Node.js 20以上
- pnpm（自動インストール可能）

## セットアップ手順

### 1. Signaling Server を起動

**ターミナル 1:**
```bash
cd c:\Projects\PairPair
npx pnpm@9 dev --cwd apps/signaling-server
```

出力例：
```
Signaling server running at http://localhost:8080
```

### 3. ホストアプリを起動

**ターミナル 2:**
```bash
cd c:\Projects\PairPair
npx pnpm@9 dev --cwd apps/desktop
```

Electron ウィンドウが立ち上がります。
- "ホストとして開始" ボタンをクリック

### 4. ゲストアプリを起動

**ターミナル 3:**
```bash
cd c:\Projects\PairPair
npx pnpm@9 dev --cwd apps/desktop
```

別の Electron ウィンドウが立ち上がります。
- ホスト側のセッションコードをコピー
- "ゲストとして接続" にコードを入力して接続

## VS Code タスク経由での起動

### 方法 1: 各タスクを個別に実行

1. `Ctrl+Shift+P` で "タスク: タスクを実行" を開く
2. "PairPair Signaling Server" を実行（ターミナル 1）
3. "PairPair Host" を実行（ターミナル 2）
4. "PairPair Guest" を実行（ターミナル 3）

### 方法 2: ターミナルコマンドで全て実行

```bash
# ターミナル 1: Signaling Server
cd c:\Projects\PairPair && npx pnpm@9 dev --cwd apps/signaling-server

# ターミナル 2: Host
cd c:\Projects\PairPair && npx pnpm@9 dev --cwd apps/desktop

# ターミナル 3: Guest（ホスト起動後に実行）
cd c:\Projects\PairPair && npx pnpm@9 dev --cwd apps/desktop
```

## テスト手順

### ホスト側の操作

1. ホスト Electron ウィンドウを開く
2. "ホストとして開始" をクリック
3. 画面共有権限を許可
4. 表示されたセッションコードをコピー

### ゲスト側の操作

1. ゲスト Electron ウィンドウを開く
2. "ゲストとして接続" をクリック
3. ホストのセッションコードをペースト
4. "接続" をクリック

### 接続後のテスト項目

- [ ] ホストの画面がゲストに表示される
- [ ] 映像品質（1080p/1440p/4K）を切り替えられる
- [ ] ゲストがマウスを操作できる
- [ ] ゲストがキーボードを操作できる
- [ ] 通信統計が表示される
- [ ] ホストが操作権限を取り消せる

## トラブルシューティング

### Redis が起動しないエラー

### ポートが既に使用中

```
Error: Address already in use
```

**解決策:**
```bash
# デフォルトポート：
# - Signaling Server: 8080
# - Vite Dev Server: 5173

# 既存プロセスを終了
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

## パフォーマンステスト

### 推奨スペック

- CPU: i5 以上
- RAM: 8GB 以上
- ネットワーク: 100Mbps 以上

### 計測項目

- 接続時間
- フレームレート
- ビットレート
- 遅延（RTT）
- CPU/メモリ使用率

これらは Electron ウィンドウの "統計オーバーレイ" で確認できます。

## 参考資料

- [SPEC.md](./docs/SPEC.md) - 全設計書
- [TASK.md](./docs/TASK.md) - 実装タスク
