# Metered Connection Support for VS Code Updates

## Overview

VS Code now respects metered network connections when performing automatic updates. When on a metered connection, automatic update checks are postponed to avoid consuming mobile data or incurring bandwidth costs.

## How It Works

### Detection

The feature uses the browser's Network Information API to detect metered connections:
- `navigator.connection.saveData` - Indicates if the user has enabled data saving mode
- `navigator.connection.metered` - Indicates if the connection is metered (e.g., mobile data, tethering)

### Behavior

**Automatic Updates:**
- When an automatic update check is scheduled and the connection is detected as metered, the check is postponed by 30 minutes
- After 30 minutes, the system checks again and repeats the process if still on a metered connection
- This continues until either:
  - The connection becomes unmetered
  - The user manually initiates an update check

**Manual Updates:**
- When a user explicitly clicks "Check for Updates" in the menu, the metered connection check is bypassed
- Updates proceed normally regardless of connection type

### Platform Support

The feature is supported on all platforms (Windows, macOS, Linux) where the Network Information API is available:
- **Windows**: Full support via Chromium's Network Information API
- **macOS**: Full support via Chromium's Network Information API  
- **Linux**: Full support via Chromium's Network Information API

If the API is not available on a platform or in a specific environment, the feature gracefully degrades - automatic updates proceed as normal.

## Implementation Details

### Key Files

- `src/vs/base/common/networkConnection.ts` - Network connection detection utility
- `src/vs/platform/update/electron-main/updateNetworkHelper.ts` - Main process helper for checking network status
- `src/vs/platform/update/electron-main/abstractUpdateService.ts` - Base update service with metered connection logic
- Platform-specific update services (win32, darwin, linux, snap) - Override to provide metered connection detection

### Testing

Unit tests are provided in:
- `src/vs/platform/update/test/common/networkConnection.test.ts`

## Future Enhancements

Potential improvements for the future:
1. Add user preference to control metered connection behavior
2. Show a notification when updates are postponed due to metered connection
3. Expose API to extensions for metered connection detection
4. Add telemetry to track how often updates are postponed
