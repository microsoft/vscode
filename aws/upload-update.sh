#!/bin/bash

# Upload Erdos Update to S3 (Erdos Version-based approach)
# Usage: ./upload-update.sh <platform> <quality> <erdos-version> <build-number> <package-file>
# Example: ./upload-update.sh darwin-arm64 stable 1.0.1 2 erdos-1.0.1-build-2-darwin-arm64.zip

set -e

if [ $# -ne 5 ]; then
    echo "Usage: $0 <platform> <quality> <erdos-version> <build-number> <package-file>"
    echo "Example: $0 darwin-arm64 stable 1.0.1 2 erdos-1.0.1-build-2-darwin-arm64.zip"
    exit 1
fi

PLATFORM=$1
QUALITY=$2
ERDOS_VERSION=$3
BUILD_NUMBER=$4
PACKAGE_FILE=$5

# Create version string for update system
VERSION_STRING="${ERDOS_VERSION}-${BUILD_NUMBER}"

BUCKET="erdos-updates"
TIMESTAMP=$(date +%s)

echo "🚀 Uploading Erdos update..."
echo "Platform: $PLATFORM"
echo "Quality: $QUALITY" 
echo "Erdos Version: $ERDOS_VERSION"
echo "Build Number: $BUILD_NUMBER"
echo "Version String: $VERSION_STRING"
echo "Package: $PACKAGE_FILE"

# Check if package file exists
if [ ! -f "$PACKAGE_FILE" ]; then
    echo "❌ Package file not found: $PACKAGE_FILE"
    exit 1
fi

# Calculate SHA256 hash
echo "🔐 Calculating SHA256 hash..."
SHA256=$(shasum -a 256 "$PACKAGE_FILE" | cut -d' ' -f1)
echo "SHA256: $SHA256"

# Upload package to S3
echo "📦 Uploading package to S3..."
aws s3 cp "$PACKAGE_FILE" "s3://$BUCKET/updates/$PLATFORM/$QUALITY/"

# Create version metadata
echo "📝 Creating version metadata..."
cat > temp_metadata.json << EOF
{
  "erdosVersion": "$ERDOS_VERSION",
  "buildNumber": $BUILD_NUMBER,
  "version": "$VERSION_STRING",
  "timestamp": $TIMESTAMP,
  "url": "https://$BUCKET.s3.amazonaws.com/updates/$PLATFORM/$QUALITY/$PACKAGE_FILE",
  "sha256hash": "$SHA256"
}
EOF

# List existing version files to update them all
echo "🔍 Finding existing versions to update..."
EXISTING_VERSIONS=$(aws s3 ls "s3://$BUCKET/api/update/$PLATFORM/$QUALITY/" | grep '\.json$' | awk '{print $4}' | sed 's/\.json$//' || true)

if [ -n "$EXISTING_VERSIONS" ]; then
    echo "📋 Updating existing versions:"
    for OLD_VERSION in $EXISTING_VERSIONS; do
        echo "  - $OLD_VERSION.json"
        aws s3 cp temp_metadata.json "s3://$BUCKET/api/update/$PLATFORM/$QUALITY/$OLD_VERSION.json"
    done
else
    echo "📋 No existing versions found (this is the first release)"
fi

# Create a "no update" metadata file for the current version
echo "📝 Creating 'no update' file for current version..."
cat > temp_no_update.json << EOF
{
  "erdosVersion": "$ERDOS_VERSION",
  "buildNumber": $BUILD_NUMBER,
  "version": "$VERSION_STRING",
  "timestamp": $TIMESTAMP,
  "message": "up_to_date"
}
EOF

aws s3 cp temp_no_update.json "s3://$BUCKET/api/update/$PLATFORM/$QUALITY/$VERSION_STRING.json"

# Clean up temp files
rm temp_metadata.json temp_no_update.json

echo "✅ Upload complete!"
echo ""
echo "📍 Update URL: https://$BUCKET.s3.amazonaws.com/api/update/$PLATFORM/$QUALITY/$VERSION_STRING.json"
echo "📦 Package URL: https://$BUCKET.s3.amazonaws.com/updates/$PLATFORM/$QUALITY/$PACKAGE_FILE"
echo ""
echo "ℹ️  Note: Clients with version '$VERSION_STRING' will get 404 (up to date)"
echo "ℹ️  Note: Clients with older versions will get update metadata"
