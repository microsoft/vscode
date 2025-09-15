# Erdos Update System - AWS Scripts

This directory contains scripts for managing the Erdos S3-only update system.

## Scripts

### `upload-update.sh`
Uploads a new Erdos version to S3 and manages version metadata.

**Usage:**
```bash
./upload-update.sh <platform> <quality> <version> <commit> <package-file>
```

**Example:**
```bash
./upload-update.sh darwin-arm64 stable 1.85.0 abc123def456 erdos-1.85.0-darwin-arm64.zip
```

**What it does:**
- Uploads package to S3
- Calculates SHA256 hash
- Updates all existing version files to point to new version
- Creates "no update" file for current version

### `test-update-system.sh`
Tests the update system by making HTTP requests to S3.

**Usage:**
```bash
./test-update-system.sh <platform> <quality> <commit>
```

**Example:**
```bash
./test-update-system.sh darwin-arm64 stable abc123def456
```

**What it tests:**
- S3 bucket accessibility
- Correct JSON response format
- Update availability logic

## S3 Bucket Structure

```
erdos-updates/
├── api/update/{platform}/{quality}/{commit}.json  ← Version metadata
└── updates/{platform}/{quality}/package.zip       ← Actual packages
```

## Security

- Public read access for update files (standard for software distribution)
- HTTPS by default via S3
- SHA256 checksums for package integrity
- No server-side code execution
