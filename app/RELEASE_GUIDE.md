# Release Guide

This document outlines the process for releasing a new version of AI Studio.

## Prerequisites

- Ensure you have the necessary permissions to push tags to the repository.
- Ensure the `GH_TOKEN` is set in GitHub Actions secrets.
- Working directory should be clean.

## Release Steps

1. **Update Version**: Run the release script with the desired bump type (patch, minor, or major).
   ```bash
   ./scripts/release.sh patch
   ```
   This script will:
   - Bump the version in `package.json`.
   - Commit the change.
   - Create a git tag (e.g., `app-v1.0.1`).
   - Push the commit and tag to GitHub.

2. **Monitor Build**: Go to the GitHub Actions tab in the repository to monitor the "Release AI Studio" workflow.

3. **Verify Release**: Once the workflow completes, verify that a new release has been created in the GitHub Releases section with the appropriate assets:
   - Windows: `.exe` setup
   - macOS: `.dmg` installer
   - Linux: `.AppImage`

## Release Channels

- **Stable**: Triggered by regular version bumps (e.g., `1.0.1`).
- **Beta/Nightly**: Use prerelease versioning (e.g., `1.0.1-beta.0`) if configured. Currently, all `app-v*` tags trigger a production release.
