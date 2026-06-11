#!/usr/bin/env pwsh

# PairPair ローカルテスト開始スクリプト
# このスクリプトは Redis、Signaling Server、Host、Guest を起動します

param(
    [switch]$SkipRedis = $false
)

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "PairPair ローカルテスト開始" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# 確認
Write-Host "`n以下を実行します:" -ForegroundColor Yellow
Write-Host "1. Redis サーバー（Docker）" -ForegroundColor Gray
Write-Host "2. Signaling Server" -ForegroundColor Gray
Write-Host "3. Host App (Electron)" -ForegroundColor Gray
Write-Host "4. Guest App (Electron) - Host 起動後に起動可能" -ForegroundColor Gray

$response = Read-Host "`n続行しますか？ (y/n)"
if ($response -ne 'y') {
    Write-Host "キャンセルしました" -ForegroundColor Red
    exit 1
}

# Redis を Docker で起動（スキップ可能）
if (-not $SkipRedis) {
    Write-Host "`n[1/2] Redis をスタート中..." -ForegroundColor Cyan
    
    # Docker が動作中か確認
    $dockerCheck = & docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Docker が実行中ではありません" -ForegroundColor Yellow
        Write-Host "詳細は LOCAL_TEST_GUIDE.md を参照してください" -ForegroundColor Gray
    } else {
        # 既存の redis コンテナを停止
        Write-Host "既存の Redis コンテナを確認中..." -ForegroundColor Gray
        & docker stop pairpair-redis 2>$null
        & docker rm pairpair-redis 2>$null
        
        # 新しい Redis を起動
        & docker run -d --name pairpair-redis -p 6379:6379 redis:latest | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Redis が起動しました (localhost:6379)" -ForegroundColor Green
        } else {
            Write-Host "❌ Redis の起動に失敗しました" -ForegroundColor Red
            exit 1
        }
        
        # Redis 接続待機
        Write-Host "Redis の初期化を待機中..." -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

# Signaling Server を起動
Write-Host "`n[2/2] Signaling Server をスタート中..." -ForegroundColor Cyan
Write-Host "コマンド: npx pnpm@9 dev --cwd apps/signaling-server" -ForegroundColor Gray

if ($IsWindows) {
    Start-Process cmd -ArgumentList "/k", "cd /d c:\Projects\PairPair && npx pnpm@9 dev --cwd apps/signaling-server"
} else {
    # Unix-like systems
    Start-Process pwsh -ArgumentList "-Command", "cd c:\Projects\PairPair; npx pnpm@9 dev --cwd apps/signaling-server"
}

Write-Host "✅ Signaling Server 起動中 (localhost:8080)" -ForegroundColor Green

# Host を起動
Write-Host "`n[3/3] Host App をスタート中..." -ForegroundColor Cyan
Write-Host "コマンド: npx pnpm@9 dev --cwd apps/desktop" -ForegroundColor Gray

if ($IsWindows) {
    Start-Process cmd -ArgumentList "/k", "cd /d c:\Projects\PairPair && npx pnpm@9 dev --cwd apps/desktop"
} else {
    Start-Process pwsh -ArgumentList "-Command", "cd c:\Projects\PairPair; npx pnpm@9 dev --cwd apps/desktop"
}

Write-Host "✅ Host App 起動中" -ForegroundColor Green

# Host の起動完了を待機
Write-Host "`nHost App を起動したら Enter キーを押してください..." -ForegroundColor Yellow
Read-Host | Out-Null

# Guest を起動
Write-Host "`n[4/4] Guest App をスタート中..." -ForegroundColor Cyan
Write-Host "コマンド: npx pnpm@9 dev --cwd apps/desktop" -ForegroundColor Gray

if ($IsWindows) {
    Start-Process cmd -ArgumentList "/k", "cd /d c:\Projects\PairPair && npx pnpm@9 dev --cwd apps/desktop"
} else {
    Start-Process pwsh -ArgumentList "-Command", "cd c:\Projects\PairPair; npx pnpm@9 dev --cwd apps/desktop"
}

Write-Host "✅ Guest App 起動中" -ForegroundColor Green

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "セットアップ完了！" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "`n📝 テスト手順:" -ForegroundColor Yellow
Write-Host "1. Host ウィンドウで 'ホストとして開始' をクリック" -ForegroundColor Gray
Write-Host "2. セッションコードをコピー" -ForegroundColor Gray
Write-Host "3. Guest ウィンドウでコードを入力して接続" -ForegroundColor Gray

Write-Host "`n📚 詳細は LOCAL_TEST_GUIDE.md を参照してください" -ForegroundColor Cyan
