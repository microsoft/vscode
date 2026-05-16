# Troubleshooting Guide

Common issues and solutions for AI Studio builds and releases.

## Build Failures

### Node-pty or Better-sqlite3 Errors
These are native modules and may need to be rebuilt for the correct Electron version.
```bash
cd app
npm install
```
`electron-builder` usually handles native module rebuilding automatically during the packaging step.

### Missing Icons
Ensure that the following icons exist in `app/resources/`:
- `icon.ico` (Windows)
- `icon.icns` (macOS)
- `icon.png` (Linux)

## Release Failures

### GH_TOKEN Issues
If the release workflow fails at the "Publish" step, check that:
- `GH_TOKEN` is correctly set in GitHub Secrets.
- The token has `repo` and `workflow` permissions.

### Tag Mismatch
The release workflow only triggers on tags matching `app-v*`. Ensure you are using the correct tag format.

## App Runtime Issues

### Logs
Check the application logs for errors. Logs are stored in the user data directory:
- Windows: `%APPDATA%\AI Studio\app.log`
- macOS: `~/Library/Application Support/AI Studio/app.log`
- Linux: `~/.config/AI Studio/app.log`

### Whitescreen on Startup
This usually means the frontend build is missing or the path in `main.ts` is incorrect. Ensure `npm run build:frontend` was successful and the files exist in `app/dist/renderer/`.
