# Erdos Update System Implementation Plan

## Overview
This document outlines the implementation plan for connecting the Erdos VSCode fork to the `erdos-updates` S3 bucket for automatic updates across all platforms.

## Current State
- ✅ S3 bucket `erdos-updates` created with proper directory structure
- ✅ VSCode update system code analyzed and understood
- ✅ S3-only update system implemented and tested
- ✅ Upload scripts created for version management
- ✅ VSCode code modified to use commit-specific JSON files

## Architecture Overview

```
Erdos Client → S3 Bucket (Direct)
     ↓              ↓
Check Updates → Static JSON Files
```

**S3-Only Approach**: VSCode clients request commit-specific JSON files directly from S3. If the file exists, it contains update metadata. The system uses version-specific filenames to determine update availability.

## Implementation Steps

### Phase 1: Configuration Setup

#### 1.1 Update product.json
Add the update URL configuration:

```json
{
  "updateUrl": "https://erdos-updates.s3.amazonaws.com",
  "commit": "auto-generated-during-build"
}
```

#### 1.2 Build System Integration
Modify `build/gulpfile.vscode.js` to inject commit hash during build:

```javascript
// In packageTask function, around line 276
.pipe(json({ 
  commit, 
  date: readISODate('out-build'), 
  checksums, 
  version,
  updateUrl: product.updateUrl || 'https://erdos-updates.s3.amazonaws.com'
}))
```

### Phase 2: S3 Bucket Configuration

#### 2.1 Bucket Policy
Ensure the S3 bucket has public read access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadForGetBucketObjects",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::erdos-updates/*"
    }
  ]
}
```

#### 2.2 Update URL Format
VSCode clients now request: `https://erdos-updates.s3.amazonaws.com/api/update/{platform}/{quality}/{commit}.json`

### Phase 3: Platform-Specific Packaging

#### 3.1 Update gulpfile.vscode.js
Modify the packaging task to generate proper update packages:

```javascript
// Add after line 448 in packageTask function
if (opts.updatePackage) {
  const updatePackageName = `erdos-${version}-${platform}-${arch}.zip`;
  result = result.pipe(zip(updatePackageName));
}
```

#### 3.2 Package Formats by Platform
- **Windows**: `.zip` with installer executable
- **macOS**: `.zip` with `.app` bundle  
- **Linux**: `.tar.gz` with binaries

#### 3.3 Upload Process
Use the provided upload script:

```bash
# Build for your platform
npm run compile
npm run package

# Upload using the automated script
./aws/upload-update.sh darwin-arm64 stable 1.85.0 your-commit-hash erdos-1.85.0-darwin-arm64.zip
```

The script automatically:
- Uploads the package to S3
- Calculates SHA256 hash
- Updates all existing version files to point to the new version
- Creates a "no update" file for the current version

## Testing

Use the provided test script:

```bash
./aws/test-update-system.sh darwin-arm64 stable your-commit-hash
```

This will verify:
- S3 bucket accessibility
- Correct JSON response format
- Update availability logic

## File Structure After Implementation

```
erdos-updates/
├── api/
│   └── update/
│       ├── darwin-arm64/stable/
│       │   └── latest.json
│       ├── win32-x64/stable/
│       │   └── latest.json
│       └── linux-x64/stable/
│           └── latest.json
└── updates/
    ├── darwin-arm64/stable/
    │   ├── erdos-1.85.0-darwin-arm64.zip
    │   └── erdos-1.85.1-darwin-arm64.zip
    ├── win32-x64/stable/
    │   ├── erdos-1.85.0-win32-x64.zip
    │   └── erdos-1.85.1-win32-x64.zip
    └── linux-x64/stable/
        ├── erdos-1.85.0-linux-x64.tar.gz
        └── erdos-1.85.1-linux-x64.tar.gz
```

## Implementation Status

- ✅ **Phase 1**: Configuration (Complete)
- ✅ **Phase 2**: S3 Bucket Setup (Complete) 
- ✅ **Phase 3**: Platform Packaging & Testing (Complete)

## Success Criteria

1. ✅ Erdos clients automatically check for updates
2. ✅ Updates download and install correctly on all platforms
3. ✅ Manual update publishing process works reliably

---

*This S3-only implementation provides a secure, scalable auto-update system for the Erdos VSCode fork with minimal AWS infrastructure requirements.*

## Security Notes

- **Public Read Access**: Update metadata and packages are publicly accessible (standard for software distribution)
- **HTTPS by Default**: All S3 requests use HTTPS encryption
- **Package Integrity**: SHA256 checksums verify download integrity
- **No Server-Side Code**: Static files eliminate code execution vulnerabilities
- **Cost Efficient**: Pay only for S3 storage and bandwidth usage