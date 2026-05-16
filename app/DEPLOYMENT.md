# AI Studio — Deployment & Release Guide

## Overview

AI Studio uses **Electron Builder** for packaging and **GitHub Releases** for distribution. A single command builds the app and publishes installers for Windows, macOS, and Linux. Auto-updates are built in via `electron-updater`.

## Prerequisites

- Node.js 20+
- npm 9+
- A GitHub Personal Access Token with `repo` and `workflow` permissions

## GitHub Token Setup

### Generate a Token

1. Go to https://github.com/settings/tokens/new
2. Select scopes: **repo** (full) and **workflow**
3. Click "Generate token"
4. Copy the token — you won't see it again

### Set the Token

**Linux / macOS:**
```bash
export GH_TOKEN=your_github_personal_access_token
```

**Windows (Command Prompt):**
```cmd
set GH_TOKEN=your_github_personal_access_token
```

**Windows (PowerShell):**
```powershell
$env:GH_TOKEN = "your_github_personal_access_token"
```

### Store in GitHub Secrets (for CI/CD)

1. Go to your repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `GH_TOKEN`
4. Value: your token
5. Click "Add secret"

## Local Build & Publish

### Build Only (no publish)

```bash
cd app

# Build for current platform
npm run package

# Platform-specific
npm run package:win
npm run package:mac
npm run package:linux
```

Output goes to `app/dist/`.

### Build + Publish to GitHub Releases

```bash
cd app

# All platforms (current OS)
npm run publish

# Platform-specific
npm run publish:win
npm run publish:mac
npm run publish:linux

# Or use the shorthand
npm run release
```

This will:
1. Build the frontend (Vite)
2. Build Electron (esbuild)
3. Package the installer
4. Create a GitHub Release
5. Upload installer assets

## Automated Releases (CI/CD)

### How It Works

The GitHub Actions workflow (`.github/workflows/release-app.yml`) triggers on version tags matching `app-v*`.

### Release Flow

```
npm version patch → git tag app-v1.0.1 → git push --tags → GitHub Actions builds all 3 platforms
```

### Using the Release Script

The easiest way to release:

```bash
cd app

# Patch release (1.0.0 → 1.0.1)
./scripts/release.sh patch

# Minor release (1.0.0 → 1.1.0)
./scripts/release.sh minor

# Major release (1.0.0 → 2.0.0)
./scripts/release.sh major
```

The script will:
1. Bump the version in `package.json`
2. Commit the version bump
3. Create a git tag (`app-v{version}`)
4. Push the commit and tag
5. GitHub Actions builds and publishes automatically

### Manual Tag Push

```bash
cd app
npm version patch
git add package.json
git commit -m "chore: bump version to $(node -p 'require(\"./package.json\").version')"
git tag "app-v$(node -p 'require(\"./package.json\").version')"
git push origin HEAD --tags
```

## Auto Updates

The app automatically checks for updates using `electron-updater`:

- **On startup:** checks after 10 seconds
- **Periodically:** checks every 4 hours
- **Manual:** users can trigger a check from the app

When an update is available:
1. Download happens in the background
2. The renderer is notified via IPC (`updater:downloaded`)
3. The update installs on next app quit (or immediately via `updater:install` IPC)

### IPC Events (Renderer → Main)

| Channel | Description |
|---|---|
| `updater:check` | Manually check for updates |
| `updater:install` | Quit and install downloaded update |

### IPC Events (Main → Renderer)

| Channel | Data | Description |
|---|---|---|
| `updater:checking` | — | Started checking |
| `updater:available` | `UpdateInfo` | Update found |
| `updater:not-available` | — | Already on latest |
| `updater:progress` | `ProgressInfo` | Download progress |
| `updater:downloaded` | `UpdateInfo` | Ready to install |
| `updater:error` | `string` | Error message |

## Build Outputs

| Platform | File | Location |
|---|---|---|
| Windows | `AI Studio-{version}-Setup.exe` | `app/dist/` |
| macOS | `AI Studio-{version}-mac.dmg` | `app/dist/` |
| Linux | `AI Studio-{version}-linux.AppImage` | `app/dist/` |

## Security Rules

- **Never** hardcode tokens in source code
- **Never** commit `.env` files
- Store `GH_TOKEN` in GitHub Secrets for CI/CD
- Store API keys in the app's settings (SQLite), not in environment variables
- Use `.env.example` as a template — copy to `.env` locally

## Troubleshooting

### "GH_TOKEN is not set"
Set the environment variable before running publish commands.

### "Cannot find module 'electron-updater'"
Run `npm install` in the `app/` directory.

### macOS code signing errors
For distribution, you need an Apple Developer certificate. For local testing, builds work unsigned.

### Linux AppImage won't run
Make it executable: `chmod +x AI-Studio-*.AppImage`
