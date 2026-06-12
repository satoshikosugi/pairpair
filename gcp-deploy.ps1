# GCP Cloud Run デプロイスクリプト (Windows PowerShell)
# 使用方法: .\gcp-deploy.ps1 [-ProjectId <project-id>] [-Region <region>] [-ServiceName <name>]

param(
    [string]$ProjectId = "",
    [string]$Region = "",
    [string]$ServiceName = ""
)

# Set defaults from environment variables or fallback values
if (-not $ProjectId) {
    $ProjectId = if ($env:GCP_PROJECT_ID) { $env:GCP_PROJECT_ID } else { "web-app-project-491513" }
}
if (-not $Region) {
    $Region = if ($env:GCP_REGION) { $env:GCP_REGION } else { "asia-northeast1" }
}
if (-not $ServiceName) {
    $ServiceName = if ($env:GCP_SERVICE_NAME) { $env:GCP_SERVICE_NAME } else { "pairpair-signaling-server" }
}

$ErrorActionPreference = "Stop"

# Color utilities
function Write-Status([string]$message) {
    Write-Host "📦 $message" -ForegroundColor Cyan
}

function Write-Success([string]$message) {
    Write-Host "✅ $message" -ForegroundColor Green
}

function Write-Error([string]$message) {
    Write-Host "❌ $message" -ForegroundColor Red
}

function Write-Debug([string]$message) {
    Write-Host "🔍 $message" -ForegroundColor DarkGray
}

# Display configuration
Write-Host ""
Write-Status "Deploy Configuration:"
Write-Host "  Project ID:    $ProjectId" -ForegroundColor Cyan
Write-Host "  Region:        $Region" -ForegroundColor Cyan
Write-Host "  Service Name:  $ServiceName" -ForegroundColor Cyan
Write-Host ""

# Check requirements
Write-Status "Checking requirements..."

# Check gcloud CLI
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "gcloud CLI is not installed. Please install Google Cloud SDK."
    exit 1
}

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed. Please install Docker."
    exit 1
}

Write-Success "Requirements met"
Write-Debug "ProjectId: $ProjectId, Region: $Region, ServiceName: $ServiceName"

# Set gcloud project
Write-Status "Setting gcloud project to: $ProjectId"
gcloud config set project $ProjectId

# Get current timestamp for image tag
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$gitHashRaw = git rev-parse --short HEAD 2>$null
$gitHash = if ($gitHashRaw) { $gitHashRaw } else { "latest" }
$imageTag = "$timestamp-$gitHash"
$imageName = "gcr.io/$ProjectId/$ServiceName"
$imageUri = "$imageName`:$imageTag"

Write-Status "Image: $imageUri"

# Build Docker image
Write-Status "Building Docker image..."
docker build -t $imageUri -t "$imageName`:latest" -f "apps/signaling-server/Dockerfile" .
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed"
    exit 1
}
Write-Success "Docker image built"

# Configure Docker authentication with gcloud
Write-Status "Configuring Docker authentication..."
gcloud auth configure-docker gcr.io --quiet

# Push image to Google Container Registry
Write-Status "Pushing image to Google Container Registry..."
docker push $imageUri
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker push failed"
    exit 1
}
docker push "$imageName`:latest"
Write-Success "Image pushed"

# Deploy to Cloud Run
Write-Status "Deploying to Cloud Run..."

# Calculate WS_URL for Cloud Run environment
$wsUrl = "wss://$ProjectId-appspot.firebaseapp.com"  # placeholder
$autoWsUrl = $true  # Will be set after getting service URL

gcloud run deploy $ServiceName `
    --image $imageUri `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --memory 512Mi `
    --cpu 1 `
    --timeout 3600 `
    --max-instances 100 `
    --set-env-vars "NODE_ENV=production" `
    --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Run deployment failed"
    exit 1
}

Write-Success "Cloud Run deployment successful"

# Get service URL and set WS_URL environment variable
Write-Status "Configuring WebSocket URL..."
$serviceUrl = gcloud run services describe $ServiceName --platform managed --region $Region --format 'value(status.url)'
$wsUrl = $serviceUrl -replace "https://", "wss://"

Write-Status "Updating service with WebSocket URL..."
gcloud run deploy $ServiceName `
    --image $imageUri `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --set-env-vars "NODE_ENV=production,WS_URL=$wsUrl" `
    --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Error "WebSocket URL configuration failed"
    exit 1
}

# Get final service URL for display
Write-Status "Retrieving final service configuration..."
$finalServiceUrl = gcloud run services describe $ServiceName --platform managed --region $Region --format 'value(status.url)'
$finalWsUrl = $wsUrl
Write-Success "Service deployed successfully!"

# Show deployment info
Write-Host ""
Write-Host "🎉 Deployment Summary" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "Project:          $ProjectId"
Write-Host "Service:          $ServiceName"
Write-Host "Region:           $Region"
Write-Host "Image URI:        $imageUri"
Write-Host "Service URL:      $finalServiceUrl"
Write-Host "WebSocket URL:    $finalWsUrl"
Write-Host "API Endpoint:     $finalServiceUrl/api/health"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Optional: Show logs
$showLogs = Read-Host "Show recent logs? (y/n)"
if ($showLogs -eq "y") {
    Write-Host ""
    Write-Status "Showing recent logs..."
    gcloud run logs read $ServiceName --platform managed --region $Region --limit 50
}

exit 0
