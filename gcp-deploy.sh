#!/bin/bash

# GCP Cloud Run デプロイスクリプト (Linux/Mac)
# 使用方法: ./gcp-deploy.sh [-p project-id] [-r region] [-s service-name]

set -e

# Color utilities
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

write_status() {
    echo -e "${CYAN}📦 $1${NC}"
}

write_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

write_error() {
    echo -e "${RED}❌ $1${NC}"
}

write_debug() {
    echo -e "${CYAN}🔍 $1${NC}"
}

# Parse arguments
PROJECT_ID="${GCP_PROJECT_ID:-web-app-project-491513}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-pairpair-signaling-server}"

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--project-id)
            PROJECT_ID="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -s|--service-name)
            SERVICE_NAME="$2"
            shift 2
            ;;
        *)
            write_error "Unknown option: $1"
            echo "Usage: $0 [-p project-id] [-r region] [-s service-name]"
            exit 1
            ;;
    esac
done

# Display configuration
echo ""
write_status "Deploy Configuration:"
echo "  Project ID:    $PROJECT_ID"
echo "  Region:        $REGION"
echo "  Service Name:  $SERVICE_NAME"
echo ""

# Check requirements
write_status "Checking requirements..."

if ! command -v gcloud &> /dev/null; then
    write_error "gcloud CLI is not installed. Please install Google Cloud SDK."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    write_error "Docker is not installed. Please install Docker."
    exit 1
fi

write_success "Requirements met"
write_debug "ProjectId: $PROJECT_ID, Region: $REGION, ServiceName: $SERVICE_NAME"

# Set gcloud project
write_status "Setting gcloud project to: $PROJECT_ID"
gcloud config set project "$PROJECT_ID"

# Get current timestamp for image tag
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
IMAGE_TAG="$TIMESTAMP-$GIT_HASH"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
IMAGE_URI="$IMAGE_NAME:$IMAGE_TAG"

write_status "Image: $IMAGE_URI"

# Build Docker image
write_status "Building Docker image..."
docker build -t "$IMAGE_URI" -t "$IMAGE_NAME:latest" -f "apps/signaling-server/Dockerfile" .
if [ $? -ne 0 ]; then
    write_error "Docker build failed"
    exit 1
fi
write_success "Docker image built"

# Configure Docker authentication with gcloud
write_status "Configuring Docker authentication..."
gcloud auth configure-docker gcr.io --quiet

# Push image to Google Container Registry
write_status "Pushing image to Google Container Registry..."
docker push "$IMAGE_URI"
if [ $? -ne 0 ]; then
    write_error "Docker push failed"
    exit 1
fi
docker push "$IMAGE_NAME:latest"
write_success "Image pushed"

# Deploy to Cloud Run
write_status "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_URI" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --timeout 3600 \
    --max-instances 100 \
    --set-env-vars "NODE_ENV=production" \
    --quiet

if [ $? -ne 0 ]; then
    write_error "Cloud Run deployment failed"
    exit 1
fi

write_success "Cloud Run deployment successful"

# Get service URL and set WS_URL environment variable
write_status "Configuring WebSocket URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform managed \
    --region "$REGION" \
    --format 'value(status.url)')

WS_URL=$(echo "$SERVICE_URL" | sed 's/https:\/\//wss:\/\//')

write_status "Updating service with WebSocket URL..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_URI" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars "NODE_ENV=production,WS_URL=$WS_URL" \
    --quiet

if [ $? -ne 0 ]; then
    write_error "WebSocket URL configuration failed"
    exit 1
fi

write_success "Service configured successfully!"

# Show deployment info
echo ""
echo -e "${GREEN}🎉 Deployment Summary${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Project:          $PROJECT_ID"
echo "Service:          $SERVICE_NAME"
echo "Region:           $REGION"
echo "Image URI:        $IMAGE_URI"
echo "Service URL:      $SERVICE_URL"
echo "WebSocket URL:    $WS_URL"
echo "API Endpoint:     $SERVICE_URL/api/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Optional: Show logs
echo ""
read -p "Show recent logs? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    write_status "Showing recent logs..."
    gcloud run logs read "$SERVICE_NAME" \
        --platform managed \
        --region "$REGION" \
        --limit 50
fi

exit 0
