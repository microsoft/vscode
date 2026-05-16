# Auto-Update Guide

AI Studio uses `electron-updater` for seamless background updates.

## How it Works

1. **Check**: The app checks for updates 10 seconds after startup and then every 4 hours.
2. **Download**: If an update is available, it is automatically downloaded in the background.
3. **Notify**: The frontend receives IPC events during the update process:
   - `updater:checking`
   - `updater:available`
   - `updater:progress`
   - `updater:downloaded`
   - `updater:error`
4. **Install**: Once downloaded, the update is installed automatically when the app quits, or can be triggered manually via `updater:install` IPC call.

## Configuration

The auto-updater is configured in `app/electron/main.ts` and `app/electron-builder.yml`.

### `electron-builder.yml`
```yaml
publish:
  provider: github
  owner: nathakumar
  repo: vscode
```

### `main.ts`
```typescript
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
```

## Testing Updates

To test the auto-update flow:
1. Build and install an older version of the app.
2. Push a new version tag to GitHub.
3. Wait for the release to be published.
4. Open the installed app and wait for it to detect and download the update.
