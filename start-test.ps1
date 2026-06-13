param([switch]$StopAll)

if ($StopAll) {
    Write-Host "Stopping services..." -ForegroundColor Yellow
    Get-Process | Where-Object { $_.Name -match "node|Electron" } | ForEach-Object { 
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    exit 0
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$time = Get-Date -Format "yyyyMMdd-HHmmss"
mkdir "$root\test-results" -ErrorAction SilentlyContinue | Out-Null

Write-Host "PairPair Adaptive Quality Test" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/3] Starting Signaling Server..." -ForegroundColor Green
Start-Process cmd "/c cd $root\apps\signaling-server && npx pnpm@11 dev > $root\test-results\server-$time.log 2>&1"
Start-Sleep -Seconds 3

Write-Host "[2/3] Starting Host App..." -ForegroundColor Green
Start-Process cmd "/c cd $root\apps\desktop && npx pnpm@11 dev > $root\test-results\host-$time.log 2>&1"
Start-Sleep -Seconds 5

Write-Host "[3/3] Starting Guest App..." -ForegroundColor Green
Start-Process cmd "/c cd $root\apps\desktop && npx pnpm@11 dev > $root\test-results\guest-$time.log 2>&1"
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Services started. Ready for testing." -ForegroundColor Green
Write-Host ""
Write-Host "Test Steps:" -ForegroundColor Yellow
Write-Host "  1. Host window: Click [Host] button"
Write-Host "  2. Select screen to share"
Write-Host "  3. Click [Adaptive Mode (PairPro)] tab"
Write-Host "  4. Click [Create Session]"
Write-Host "  5. Copy the 6-digit code"
Write-Host "  6. Guest window: Click [Connect with Code]"
Write-Host "  7. Paste code and connect"
Write-Host "  8. Guest: Open DevTools (F12) > Console"
Write-Host ""
Write-Host "Console Output:" -ForegroundColor Cyan
Write-Host "  [QualityMetrics] ... | FD:X DR:Y BR:Z.XXMbps"
Write-Host "  [SharpnessAnalysis] ... | Sharpness: XX.X/100"
Write-Host ""
Write-Host "To stop all services:" -ForegroundColor Yellow
Write-Host "  .\start-test.ps1 -StopAll"
Write-Host ""
Write-Host "Logs saved to: $root\test-results\" -ForegroundColor Gray
