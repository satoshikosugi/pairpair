#!/usr/bin/env pwsh

# PairPair セットアップ確認スクリプト

Write-Host "==============================" -ForegroundColor Cyan
Write-Host "PairPair セットアップ確認" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# Node.js チェック
Write-Host "[1/4] Node.js チェック..." -ForegroundColor Yellow
$node = node -v 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Node.js $node" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js が見つかりません" -ForegroundColor Red
    $allOk = $false
}

# Redis チェック
Write-Host "[2/4] Redis チェック..." -ForegroundColor Yellow
$redis = redis-cli ping 2>&1
if ($redis -eq "PONG") {
    Write-Host "✅ Redis (localhost:6379)" -ForegroundColor Green
} else {
    $dockerRedis = docker ps -a --filter "name=pairpair-redis" --format "{{.Names}}" 2>&1
    if ($dockerRedis -eq "pairpair-redis") {
        Write-Host "✅ Redis (Docker: pairpair-redis)" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Redis が起動していません" -ForegroundColor Yellow
        Write-Host "   Docker: docker run -d -p 6379:6379 redis:latest" -ForegroundColor Gray
        Write-Host "   または redis-cli ping で確認してください" -ForegroundColor Gray
        $allOk = $false
    }
}

# Signaling Server チェック
Write-Host "[3/4] Signaling Server チェック..." -ForegroundColor Yellow
$health = curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/health 2>&1
if ($health -eq "200") {
    Write-Host "✅ Signaling Server (localhost:8080)" -ForegroundColor Green
} else {
    Write-Host "❌ Signaling Server が起動していません" -ForegroundColor Red
    Write-Host "   ターミナルで以下を実行してください:" -ForegroundColor Gray
    Write-Host "   npx pnpm@9 dev --cwd apps/signaling-server" -ForegroundColor Gray
    $allOk = $false
}

# pnpm チェック
Write-Host "[4/4] pnpm チェック..." -ForegroundColor Yellow
$pnpmVersion = npx pnpm@9 -v 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ pnpm $pnpmVersion" -ForegroundColor Green
} else {
    Write-Host "⚠️  pnpm をインストール中..." -ForegroundColor Yellow
}

Write-Host ""
if ($allOk) {
    Write-Host "==============================" -ForegroundColor Green
    Write-Host "セットアップが完了しています ✅" -ForegroundColor Green
    Write-Host "==============================" -ForegroundColor Green
    Write-Host "アプリを起動できます:"
    Write-Host "  npx pnpm@9 dev --cwd apps/desktop" -ForegroundColor Cyan
} else {
    Write-Host "==============================" -ForegroundColor Yellow
    Write-Host "セットアップに不足がある ⚠️" -ForegroundColor Yellow
    Write-Host "==============================" -ForegroundColor Yellow
    Write-Host "LOCAL_TEST_GUIDE.md を参照して修正してください" -ForegroundColor Gray
}

Write-Host ""
