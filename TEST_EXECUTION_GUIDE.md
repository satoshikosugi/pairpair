# PairPair Adaptive Quality Test - 実施ガイド

## ✅ 現在の状態

- ✅ Signaling Server: 起動済み (ローカルホスト)
- ✅ Host App (Electron): 起動済み
- ✅ Guest App (Electron): 起動済み
- ✅ メトリクス自動収集: 実装済み

---

## 📋 実施手順

### フェーズ 1: ホスト側準備

1. **ホスト Electron ウィンドウを確認**
   - ウィンドウタイトル: "PairPair" が表示されている
   
2. **「ホストとして開始」をクリック**
   - "ホストとして開始" ボタンをクリック
   
3. **スクリーンを選択**
   - 共有したい画面（デスクトップまたはアプリケーション）を選択
   - デスクトップ全体がおすすめ
   
4. **適応モード設定**
   - 「従来のプリセット」「適応モード (PairPro)」タブが表示される
   - **「適応モード (PairPro)」タブをクリック**
   
5. **解像度を選択**
   - ドロップダウンで「Balanced (1920x1080)」を選択
   - テーブルに期待値が表示される：
     ```
     アイドル: 1 fps, 30%, 0.8 Mbps
     マウス移動: 15 fps, 60%, 7.8 Mbps
     タイプ中: 5 fps, 50%, 3.2 Mbps
     スクロール: 20 fps, 70%, 10.9 Mbps
     クリック: 30 fps, 80%, 15.6 Mbps
     ```
   
6. **セッション作成**
   - 「セッションを作成」ボタンをクリック
   - **6 桁のコードが表示される** → 記録してください

---

### フェーズ 2: ゲスト側接続

1. **ゲスト Electron ウィンドウを確認**
   - ウィンドウタイトル: "PairPair" が表示されている
   
2. **「コードで接続」をクリック**
   - "コードで接続" ボタンをクリック
   
3. **コードを入力**
   - ホストの 6 桁コードを入力フィールドに貼り付け
   - 「接続」ボタンをクリック
   
4. **P2P 接続待機**
   - 「接続中...」表示から「接続済み」に変わるまで待機
   - ホスト側の画面がゲスト側に表示される

---

### フェーズ 3: メトリクス記録の開始

1. **ゲスト側で DevTools を開く**
   - **F12** キーを押す
   - DevTools ウィンドウが開く
   
2. **Console タブをクリック**
   - DevTools 内で「Console」タブを選択
   
3. **テストヘルパーをロード**
   - [test-helper.js](test-helper.js) の内容をコピー
   - コンソールにペースト
   - **Enter** キーを押す
   
4. **インストール確認**
   - コンソールに以下が表示される：
     ```
     [TestHelper] PairPair Quality Metrics Recorder Started
     === PairPair Adaptive Quality Test Guide ===
     ```

---

### フェーズ 4: テスト実行

#### 方法 A: 自動テストシーケンス（推奨）

1. **自動テスト開始**
   - コンソールに以下を入力：
     ```javascript
     window.autoTestSequence()
     ```
   - **Enter** キーを押す

2. **各シーンで操作実施**
   - コンソールに「>>> Perform [scene] action now...」と表示される
   - 5 秒間、指定されたアクションを実施
   - 何かキーを押して次へ進む

3. **各シーンの詳細**

   **シーン 1: アイドル（動きなし）**
   - ホスト側: マウスやキーボードを操作しない
   - 期待: fps=1, Mbps=0.8
   
   **シーン 2: マウス移動**
   - ホスト側: マウスをゆっくり動かす（0.5 Hz 程度）
   - 期待: fps=15, Mbps=7.8
   
   **シーン 3: スクロール**
   - ホスト側: ブラウザまたはエディタをスクロール
   - 期待: fps=20, Mbps=10.9
   
   **シーン 4: テキスト入力**
   - ホスト側: テキストエディタに入力
   - 期待: fps=5, Mbps=3.2
   
   **シーン 5: クリック**
   - ホスト側: アプリケーションのボタンをクリック
   - 期待: fps=30, Mbps=15.6

---

#### 方法 B: 手動メトリクス記録

1. **シーン開始**
   - コンソールに以下を入力：
     ```javascript
     window.startTestScene("idle", 10)
     ```
   - **Enter** キーを押す

2. **10 秒間操作を実施**
   - 指定されたアクションをホスト側で実施

3. **5 秒ごとにメトリクスをログ**
   - WebRTC Stats API から以下情報を取得：
     - `framesDecoded`: 受信フレーム数
     - `framesDropped`: ドロップフレーム数
     - `bytesReceived`: 受信バイト数 → ビットレート計算
     - `frameWidth`, `frameHeight`: 解像度
   
   - コンソールに以下を入力（例）：
     ```javascript
     window.logMetric(60, 0, 0.78, 1920, 1080)
     ```
   - **Enter** キーを押す
   - 5 秒後に再度実行
   
4. **シーン終了**
   - コンソールに以下を入力：
     ```javascript
     window.endTestScene()
     ```
   - **Enter** キーを押す
   - Summary が表示される

---

## 📊 期待される出力

### 自動テスト実行例

```
[TestHelper] PairPair Quality Metrics Recorder Started

[Test] Starting scene: idle (10s)
Expected: 1 fps, 30% quality, 0.8 Mbps
>>> Perform idle action now, then press any key to continue...

[QualityMetrics] 2026-06-12T21:45:00Z | FD:60 DR:0 BR:0.78Mbps W:1920x1080
[QualityMetrics] 2026-06-12T21:45:05Z | FD:61 DR:0 BR:0.82Mbps W:1920x1080
[QualityMetrics] 2026-06-12T21:45:10Z | FD:62 DR:0 BR:0.80Mbps W:1920x1080
[SharpnessAnalysis] 2026-06-12T21:45:03Z | Sharpness: 45.2/100

[Test] Completed scene: idle (10.1s elapsed)
Summary:
  Avg Bitrate: 0.80 Mbps
  Frames: 2 decoded, 0 dropped
  Drop Rate: 0.00%
Avg Sharpness: 45.2/100

Export Data:
{
  "scene": "idle",
  "elapsed": "10.1",
  "frames": [
    { "timestamp": "2026-06-12T21:45:00Z", "framesDecoded": 60, "framesDropped": 0, "bitrateMbps": 0.78, ... }
  ],
  "sharpness": [...]
}
```

---

## 📁 テスト結果の保存

### ブラウザコンソールからコピー

1. **Export Data セクションを選択**
   - JSON データを右クリック → Copy object
   
2. **テキストファイルに保存**
   - 新規テキストエディタを開く
   - データをペースト
   - `test-results/test-[TIMESTAMP].json` として保存
   
3. **複数シーン分をまとめる**
   - すべてのシーン結果を 1 つの JSON Array にまとめる
   - [test-results/SAMPLE_TEST_REPORT.md](../test-results/SAMPLE_TEST_REPORT.md) フォーマットで報告書を作成

---

## ✅ テスト完了後

1. **サービスを停止**
   ```powershell
   .\start-test.ps1 -StopAll
   ```

2. **ログファイルを確認**
   - `test-results/server-[TIMESTAMP].log`
   - `test-results/host-[TIMESTAMP].log`
   - `test-results/guest-[TIMESTAMP].log`

3. **結果を分析**
   - 実ビットレートが期待値に近いか確認
   - フレームドロップが最小限か確認
   - 鮮明度スコアが段階的に上昇しているか確認

---

## 🐛 トラブルシューティング

### ホスト・ゲスト接続できない

- ホストのコード入力ミスがないか確認
- コードが有効期限内か確認（10 分以内）
- ホスト側の画面共有許可を確認

### メトリクスが表示されない

- DevTools コンソールでエラーがないか確認
- `window.startTestScene` が正常に実行されたか確認
- ゲスト側で P2P 接続が確立されているか確認

### フレームレートが期待値より低い

- ホスト PC の CPU 負荷を確認（タスクマネージャー）
- ネットワーク遅延を確認（ping）
- アダプティブ品質の状態を確認（状態が正しい段階か）

---

## 📝 チェックリスト

- [ ] ホスト・ゲスト・サーバー起動確認
- [ ] ホストで適応モード (PairPro) 選択
- [ ] ゲストで接続コード入力
- [ ] P2P 接続成功
- [ ] ゲスト DevTools (F12) を開く
- [ ] テストヘルパー.js をロード
- [ ] 各テストシーン実行
- [ ] メトリクス記録確認
- [ ] 結果を JSON で export
- [ ] 報告書を作成
- [ ] サービス停止

---

**テスト所要時間**: 約 10～15 分（5 シーン × 2 分）

**保存場所**: `c:\Projects\PairPair\test-results\`
