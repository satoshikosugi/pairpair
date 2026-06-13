# GCP Cloud Run デプロイメントガイド

PairPair の signaling-server を Google Cloud Platform (GCP) の Cloud Run にデプロイするガイドです。

## 前提条件

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) がインストール済み
- [Docker](https://docs.docker.com/get-docker/) がインストール済み
- GCP プロジェクトが作成済み
- Billing が有効化されている
- `gcloud auth` で認証済み

## セットアップ

### 1. GCP プロジェクトの初期化

```powershell
# デフォルトはweb-app-project-491513です
# 別のプロジェクトを使う場合のみ設定してください
$env:GCP_PROJECT_ID = "your-project-id"
$env:GCP_REGION = "asia-northeast1"
$env:GCP_SERVICE_NAME = "pairpair-signaling-server"

# gcloud で認証
gcloud auth login
gcloud config set project $env:GCP_PROJECT_ID
```

### 2. 必要な API を有効化

```powershell
# Cloud Run API
gcloud services enable run.googleapis.com

# Container Registry API
gcloud services enable containerregistry.googleapis.com

# Cloud Build API (推奨)
gcloud services enable cloudbuild.googleapis.com
```

### 3. サービスアカウント（オプション）の作成

本番環境では、専用のサービスアカウントを作成することを推奨します：

```powershell
gcloud iam service-accounts create pairpair-deployer `
    --display-name="PairPair Deployer"

gcloud projects add-iam-policy-binding $env:GCP_PROJECT_ID `
    --member=serviceAccount:pairpair-deployer@$env:GCP_PROJECT_ID.iam.gserviceaccount.com `
    --role=roles/run.developer

gcloud projects add-iam-policy-binding $env:GCP_PROJECT_ID `
    --member=serviceAccount:pairpair-deployer@$env:GCP_PROJECT_ID.iam.gserviceaccount.com `
    --role=roles/storage.admin
```

## デプロイ方法

### デフォルト設定

デフォルトでは以下の値が使用されます：

| 設定項目 | デフォルト値 |
|---|---|
| **Project ID** | `web-app-project-491513` |
| **Region** | `asia-northeast1` |
| **Service Name** | `pairpair-signaling-server` |

### 方法 1: VS Code タスク（推奨）

VS Code の **Run Task** パネルから以下のいずれかを選択：

#### オプション A: デフォルト設定でデプロイ

```
GCP Deploy: Signaling Server
```

このタスクはデフォルト値（Project ID: `web-app-project-491513`）を使用します。

### 方法 2: PowerShell スクリプト直接実行

```powershell
# デフォルト値で実行（Project ID: web-app-project-491513）
./gcp-deploy.ps1

# カスタム Project ID で実行
./gcp-deploy.ps1 -ProjectId "my-project" -Region "us-central1" -ServiceName "my-service"

# デプロイ後に直近ログも表示
./gcp-deploy.ps1 -ShowLogs
```

### 方法 3: 環境変数を上書き

```powershell
# 環境変数で一時的に上書き
$env:GCP_PROJECT_ID = "my-project"
$env:GCP_REGION = "us-central1"
$env:GCP_SERVICE_NAME = "my-service"
./gcp-deploy.ps1
```

### 方法 4: Bash スクリプト（Linux/Mac）

```bash
# デフォルト値で実行（Project ID: web-app-project-491513）
chmod +x gcp-deploy.sh
./gcp-deploy.sh

# カスタム設定で実行
./gcp-deploy.sh -p "my-project" -r "us-central1" -s "my-service"

# 長い形式
./gcp-deploy.sh --project-id "my-project" --region "us-central1" --service-name "my-service"

# 環境変数で上書き
export GCP_PROJECT_ID="my-project"
export GCP_REGION="us-central1"
export GCP_SERVICE_NAME="my-service"
./gcp-deploy.sh
```

## デプロイスクリプトの処理内容

`gcp-deploy.ps1` は以下を実行します：

1. **環境チェック**: gcloud と Docker のインストール確認
2. **イメージ構築**: Docker イメージをタイムスタンプ + Git コミットハッシュ付きで構築
3. **レジストリプッシュ**: Google Container Registry (gcr.io) にプッシュ
4. **初期デプロイ**: Cloud Run に初回デプロイ（開発段階）
5. **WebSocket URL 設定**: サービスの URL を取得し、`WS_URL` 環境変数を自動設定
6. **最終デプロイ**: 正しい WebSocket URL を使用して再デプロイ
7. **確認**: サービス URL とエンドポイントを表示、ログ表示オプション

## Docker イメージの詳細

### Dockerfile の仕様

- **マルチステージビルド**: ビルドステージとランタイムステージに分離
- **ベースイメージ**: `node:22-alpine` (軽量化)
- **pnpm**: モノレポ依存関係管理
- **ヘルスチェック**: `/health` エンドポイントを監視

### イメージサイズの最適化

- ビルド成果物のみをコピー
- `node_modules` は最小化（本番依存関係のみ）
- 不要なファイルは `.dockerignore` で除外

## Cloud Run の構成

デフォルト設定：

| 項目 | 値 |
|---|---|
| **メモリ** | 512 MB |
| **CPU** | 1 |
| **タイムアウト** | 3600 秒（1 時間） |
| **最大インスタンス数** | 100 |
| **認証** | 不要（--allow-unauthenticated） |

### カスタマイズ

スクリプト内の以下の部分を編集してカスタマイズできます：

```powershell
gcloud run deploy $ServiceName `
    --memory 512Mi `          # メモリを変更
    --cpu 1 `                 # CPU を変更
    --max-instances 100       # 最大インスタンス数を変更
```

## 環境変数の設定

Cloud Run 上の signaling-server は以下の環境変数をサポート：

| 変数 | デフォルト | 説明 |
|---|---|---|
| `PORT` | `8080` | リッスンポート |
| `HOST` | `0.0.0.0` | バインドアドレス |
| `NODE_ENV` | `production` | Node.js 環境 |
| `REDIS_URL` | - | Redis 接続 URL（複数インスタンス時に必須） |

スクリプト内で環境変数を追加するには：

```powershell
--set-env-vars "VAR1=value1,VAR2=value2"
```

## Redis の統合（本番環境）

### 現在の状態

signaling-server は現在、インメモリセッションストア（Map）を使用しています。これは単一インスタンスでの動作に適しています。

### 複数インスタンスが必要な場合

複数の Cloud Run インスタンスでセッションを共有するには Redis が必要です。

#### オプション 1: Cloud Memorystore for Redis（推奨）

```powershell
# Memorystore Redis インスタンスを作成
gcloud redis instances create pairpair-session-store `
    --size=1 `
    --region=asia-northeast1 `
    --redis-version=7.0

# 接続情報を確認
gcloud redis instances describe pairpair-session-store `
    --region=asia-northeast1
```

Cloud Run から Cloud Memorystore にアクセスするには VPC コネクタが必要です：

```powershell
# VPC コネクタを作成
gcloud compute networks vpc-access connectors create pairpair-connector `
    --network=default `
    --region=asia-northeast1 `
    --min-instances=2 `
    --max-instances=10

# Cloud Run にデプロイ時に VPC コネクタを指定
gcloud run deploy pairpair-signaling-server `
    --image $imageUri `
    --vpc-connector projects/$PROJECT_ID/locations/asia-northeast1/connectors/pairpair-connector `
    --set-env-vars REDIS_URL=redis://IP:PORT
```

#### オプション 2: Cloud Run の単一インスタンス（MVP）

初期段階では単一インスタンスでデプロイし、インメモリストアを使用：

```powershell
gcloud run deploy pairpair-signaling-server `
    --image $imageUri `
    --min-instances=1 `
    --max-instances=1  # 単一インスタンス
```

### Redis サポートの実装

signaling-server で Redis をサポートするには、`packages/shared` に Redis クライアント依存関係を追加し、`src/infra/redis.ts` を更新してください。詳細は SPEC.md の Session Storage セクションを参照。

## デプロイ後の確認

### サービスの状態確認

```powershell
gcloud run services describe pairpair-signaling-server `
    --platform managed `
    --region asia-northeast1
```

### ログの確認

```powershell
# リアルタイムログ
gcloud run logs read pairpair-signaling-server `
    --platform managed `
    --region asia-northeast1 `
    --follow

# 過去のログ（最新50行）
gcloud run logs read pairpair-signaling-server `
    --platform managed `
    --region asia-northeast1 `
    --limit 50
```

## デプロイ後の検証

### ヘルスチェック（GET /api/health）

```bash
curl https://[SERVICE-URL]/api/health
```

**応答例:**
```json
{
  "ok": true,
  "version": "0.1.0"
}
```

### ホストセッション作成（POST /api/sessions/host）

```bash
curl -X POST https://[SERVICE-URL]/api/sessions/host \
  -H "Content-Type: application/json" \
  -d '{
    "appVersion": "0.1.0",
    "deviceName": "Test-PC",
    "platform": "win32"
  }'
```

**応答例:**
```json
{
  "sessionId": "88cefb4e-0118-40d1-8941-6f9f31a6b097",
  "code": "473488",
  "hostToken": "e5ff87d4c7772ce9ea380759fcd9da1a",
  "expiresAt": "2026-06-12T04:47:23.465Z",
  "wsUrl": "wss://pairpair-signaling-server-245497898064.asia-northeast1.run.app/ws"
}
```

### ゲスト参加（POST /api/sessions/join）

```bash
curl -X POST https://[SERVICE-URL]/api/sessions/join \
  -H "Content-Type: application/json" \
  -d '{
    "code": "473488",
    "appVersion": "0.1.0",
    "deviceName": "Guest-PC",
    "platform": "darwin"
  }'
```

**応答例:**
```json
{
  "sessionId": "88cefb4e-0118-40d1-8941-6f9f31a6b097",
  "guestToken": "eebd928d8a04f73b0f70dde6d048ba2b",
  "hostDeviceName": "Test-PC",
  "wsUrl": "wss://pairpair-signaling-server-245497898064.asia-northeast1.run.app/ws"
}
```

### WebSocket URL 確認

**自動設定について:**
- デプロイスクリプトは Cloud Run のサービス URL を自動取得します
- `https://` を `wss://` に変換して環境変数 `WS_URL` として設定します
- API レスポンスには正しい WebSocket URL が含まれます

## トラブルシューティング

### Docker ビルド失敗

```
Error: Docker build failed
```

**解決策**：
- Docker daemon が実行中か確認
- ディスク容量を確認
- `docker system prune` でクリーンアップ

### イメージプッシュ失敗

```
Error: Docker push failed
```

**解決策**：
- `gcloud auth configure-docker` を再実行
- GCP 認証を再確認: `gcloud auth login`
- プロジェクト ID が正しいか確認

### Cloud Run デプロイ失敗

```
Error: Cloud Run deployment failed
```

**解決策**：
- `gcloud run logs read` でエラーログを確認
- Cloud Run API が有効か確認
- `gcloud services enable run.googleapis.com`
- サービスアカウント権限を確認

### コンテナが起動しない

ログを確認：

```powershell
gcloud run logs read pairpair-signaling-server `
    --platform managed `
    --region asia-northeast1 `
    --limit 100
```

## 本番環境での推奨設定

### セキュリティ

```powershell
# 認証が必要な設定
gcloud run deploy pairpair-signaling-server `
    --no-allow-unauthenticated  # デフォルトで認証が必要

# カスタムドメイン（DNS ルーティング）
gcloud run domain-mappings create \
    --service=pairpair-signaling-server \
    --domain=signaling.example.com
```

### スケーリング

```powershell
gcloud run deploy pairpair-signaling-server `
    --min-instances 1 `       # 最小インスタンス数
    --max-instances 100 `     # 最大インスタンス数
    --memory 1Gi `            # メモリ増加
    --cpu 2                   # CPU 増加
```

### トラフィック管理

```powershell
# カナリアデプロイ（新バージョンに 10% のトラフィック）
gcloud run deploy pairpair-signaling-server \
    --image gcr.io/PROJECT/pairpair-signaling-server:new \
    --traffic latest=90,new=10
```

## コスト最適化

- **インスタンス数**: 最大インスタンス数を制限
- **リソース**: 実際の使用量に応じて CPU/メモリを調整
- **リージョン**: スループットが低い場合は Tier 2 リージョンを検討
- **VPC**:外部接続が不要な場合は VPC 制限を検討

## 関連リンク

- [Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [Google Container Registry](https://cloud.google.com/container-registry/docs)
- [gcloud run コマンドリファレンス](https://cloud.google.com/sdk/gcloud/reference/run)
- [Cloud Run 価格](https://cloud.google.com/run/pricing)
