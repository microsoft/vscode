#!/bin/bash

# Test Erdos S3-only Update System
# Usage: ./test-update-system.sh <platform> <quality> <commit>
# Example: ./test-update-system.sh darwin-arm64 stable abc123def456

set -e

if [ $# -ne 3 ]; then
    echo "Usage: $0 <platform> <quality> <commit>"
    echo "Example: $0 darwin-arm64 stable abc123def456"
    exit 1
fi

PLATFORM=$1
QUALITY=$2
COMMIT=$3

BUCKET="erdos-updates"
TEST_URL="https://$BUCKET.s3.amazonaws.com/api/update/$PLATFORM/$QUALITY/$COMMIT.json"

echo "🧪 Testing Erdos Update System..."
echo "Platform: $PLATFORM"
echo "Quality: $QUALITY"
echo "Commit: $COMMIT"
echo "Test URL: $TEST_URL"
echo ""

# Test the update check
echo "📡 Making update request..."
HTTP_CODE=$(curl -s -o response.json -w "%{http_code}" "$TEST_URL")

echo "HTTP Status: $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Update available!"
    echo "📄 Response:"
    cat response.json | jq '.' 2>/dev/null || cat response.json
elif [ "$HTTP_CODE" = "404" ]; then
    echo "✅ No update needed (client is up to date)"
else
    echo "❌ Unexpected response"
    echo "📄 Response:"
    cat response.json 2>/dev/null || echo "(no response body)"
fi

# Clean up
rm -f response.json

echo ""
echo "🏁 Test complete!"
