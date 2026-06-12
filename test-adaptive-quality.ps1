# PairPair Adaptive Quality Test Script (Windows)
# このスクリプトはホスト・ゲスト・サーバーを自動起動し、テスト結果を記録します。

param(
    [switch]$StopAll = $false
)

if ($StopAll) {
    Write-Host "Stopping all PairPair services..." -ForegroundColor Yellow
    Get-Process | Where-Object { $_.Name -match "pnpm|node|electron" -and $_.CommandLine -match "PairPair" } | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Write-Host "All services stopped." -ForegroundColor Green
    exit 0
}

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$TestResultsDir = Join-Path $ProjectRoot "test-results"
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$TestLog = Join-Path $TestResultsDir "test-${Timestamp}.log"

Write-Host "PairPair Adaptive Quality Test Suite" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Test started at $(Get-Date)" -ForegroundColor Gray
Write-Host ""

# Create results directory
if (!(Test-Path $TestResultsDir)) {
    New-Item -ItemType Directory -Path $TestResultsDir | Out-Null
}

function Start-Service {
    param(
        [string]$Name,
        [string]$WorkingDir,
        [string]$Command
    )
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting ${Name}..." -ForegroundColor Green
    
    $LogFile = Join-Path $TestResultsDir "${Name}-${Timestamp}.log"
    $PidFile = Join-Path $TestResultsDir "${Name}.pid"
    
    # Start in new process
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/k cd /d `"$WorkingDir`" && $Command"
    $psi.UseShellExecute = $true
    $psi.CreateNoWindow = $false
    
    $process = [System.Diagnostics.Process]::Start($psi)
    $process.Id | Out-File -FilePath $PidFile
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ${Name} started (PID: $($process.Id))" -ForegroundColor Gray
}

# Start services
Start-Service -Name "signaling-server" -WorkingDir "$ProjectRoot\apps\signaling-server" -Command "npx pnpm@9 dev"
Start-Sleep -Seconds 3

Start-Service -Name "host" -WorkingDir "$ProjectRoot\apps\desktop" -Command "npx pnpm@9 dev"
Start-Sleep -Seconds 5

Start-Service -Name "guest" -WorkingDir "$ProjectRoot\apps\desktop" -Command "npx pnpm@9 dev"
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Services started. Test framework ready." -ForegroundColor Green
Write-Host ""
Write-Host "次のステップ（マニュアル）:" -ForegroundColor Yellow
Write-Host "  1. ホスト ウィンドウを開く（最初のデスクトップアプリ）"
Write-Host "  2. 『ホストとして開始』をクリック"
Write-Host "  3. 共有する画面を選択"
Write-Host "  4. 『適応モード (PairPro)』タブをクリック"
Write-Host "  5. 『セッションを作成』をクリック"
Write-Host "  6. 6 桁のコードをメモ"
Write-Host "  7. ゲスト ウィンドウに切り替え（2 番目のデスクトップアプリ）"
Write-Host "  8. 『コードで接続』をクリック"
Write-Host "  9. コードを入力"
Write-Host " 10. P2P 接続を待つ"
Write-Host " 11. ゲスト ウィンドウで DevTools を開く (F12)"
Write-Host " 12. コンソール タブを開く"
Write-Host " 13. 各テストシーンを実行（TEST_ADAPTIVE_QUALITY.md を参照）"
Write-Host ""
Write-Host "メトリクスは自動的にコンソールに記録されます:" -ForegroundColor Cyan
Write-Host "  [QualityMetrics] ... | FD:X DR:Y BR:Z.XXMbps"
Write-Host "  [SharpnessAnalysis] ... | Sharpness: XX.X/100"
Write-Host ""
Write-Host "全サービスを停止するには実行:" -ForegroundColor Yellow
Write-Host "  .\test-adaptive-quality.ps1 -StopAll"
Write-Host ""
Write-Host "テスト結果ログ: $TestResultsDir" -ForegroundColor Gray
