@echo off
REM PairPair セットアップ確認スクリプト

setlocal enabledelayedexpansion

echo ==============================
echo PairPair セットアップ確認
echo ==============================
echo.

set allOk=1

REM Node.js チェック
echo [1/4] Node.js チェック...
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js が見つかりません
    set allOk=0
) else (
    for /f "tokens=*" %%a in ('node -v 2^>nul') do set nodeVersion=%%a
    echo ✅ Node.js !nodeVersion!
)

REM Redis チェック
echo [2/4] Redis チェック...
redis-cli ping >nul 2>&1
if errorlevel 1 (
    docker ps -a --filter "name=pairpair-redis" --format "{{.Names}}" >nul 2>&1
    if errorlevel 1 (
        echo ⚠️  Redis が起動していません
        echo    Docker: docker run -d -p 6379:6379 redis:latest
        set allOk=0
    ) else (
        echo ✅ Redis (Docker: pairpair-redis)
    )
) else (
    echo ✅ Redis (localhost:6379)
)

REM Signaling Server チェック
echo [3/4] Signaling Server チェック...
curl -s -o nul -w "%%{http_code}" http://localhost:8080/api/health >tempfile.txt 2>&1
set /p statusCode=<tempfile.txt
del tempfile.txt

if "%statusCode%"=="200" (
    echo ✅ Signaling Server (localhost:8080)
) else (
    echo ❌ Signaling Server が起動していません
    echo    ターミナルで以下を実行してください:
    echo    npx pnpm@9 dev --cwd apps/signaling-server
    set allOk=0
)

REM pnpm チェック
echo [4/4] pnpm チェック...
npx pnpm@9 -v >nul 2>&1
if errorlevel 1 (
    echo ⚠️  pnpm をインストール中...
) else (
    for /f "tokens=*" %%a in ('npx pnpm@9 -v 2^>nul') do set pnpmVersion=%%a
    echo ✅ pnpm !pnpmVersion!
)

echo.
if "%allOk%"=="1" (
    echo ==============================
    echo セットアップが完了しています ✅
    echo ==============================
    echo アプリを起動できます:
    echo   npx pnpm@9 dev --cwd apps/desktop
) else (
    echo ==============================
    echo セットアップに不足がある ⚠️
    echo ==============================
    echo LOCAL_TEST_GUIDE.md を参照して修正してください
)

echo.
pause
