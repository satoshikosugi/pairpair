@echo off
REM PairPair ローカルテスト開始スクリプト（バッチ版）

cd /d %~dp0

echo ==================================
echo PairPair ローカルテスト開始
echo ==================================
echo.
echo 以下を実行します:
echo 1. Redis サーバー（Docker）
echo 2. Signaling Server
echo 3. Host App ^(Electron^)
echo 4. Guest App ^(Electron^)
echo.

setlocal enabledelayedexpansion
set /p response="続行しますか？ (y/n) "
if not "!response!"=="y" (
    echo キャンセルしました
    exit /b 1
)

echo.
echo [1/2] Redis をスタート中...
docker ps >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Docker が実行中ではありません
    echo 詳細は LOCAL_TEST_GUIDE.md を参照してください
) else (
    echo 既存の Redis コンテナを確認中...
    docker stop pairpair-redis >nul 2>&1
    docker rm pairpair-redis >nul 2>&1
    
    echo Redis を起動中...
    docker run -d --name pairpair-redis -p 6379:6379 redis:latest >nul
    if errorlevel 1 (
        echo ❌ Redis の起動に失敗しました
        exit /b 1
    )
    echo ✅ Redis が起動しました ^(localhost:6379^)
    timeout /t 2 /nobreak
)

echo.
echo [2/2] Signaling Server をスタート中...
echo コマンド: npx pnpm@9 dev --cwd apps/signaling-server
start cmd /k "cd /d %CD% && npx pnpm@9 dev --cwd apps/signaling-server"
echo ✅ Signaling Server 起動中 ^(localhost:8080^)

echo.
echo [3/3] Host App をスタート中...
echo コマンド: npx pnpm@9 dev --cwd apps/desktop
start cmd /k "cd /d %CD% && npx pnpm@9 dev --cwd apps/desktop"
echo ✅ Host App 起動中

echo.
echo Host App を起動したら、このウィンドウで Enter キーを押してください...
pause

echo.
echo [4/4] Guest App をスタート中...
echo コマンド: npx pnpm@9 dev --cwd apps/desktop
start cmd /k "cd /d %CD% && npx pnpm@9 dev --cwd apps/desktop"
echo ✅ Guest App 起動中

echo.
echo ==================================
echo セットアップ完了！
echo ==================================
echo.
echo 📝 テスト手順:
echo 1. Host ウィンドウで 'ホストとして開始' をクリック
echo 2. セッションコードをコピー
echo 3. Guest ウィンドウでコードを入力して接続
echo.
echo 📚 詳細は LOCAL_TEST_GUIDE.md を参照してください
echo.
pause
