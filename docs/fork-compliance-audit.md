# Fork Compliance Audit

**Date of audit:** 2026-03-08
**Upstream fork:** microsoft/vscode (Code - OSS, MIT License)

This document records the modifications made to strip Microsoft branding, telemetry, proprietary extensions, and service endpoints from the Code - OSS base to create the Son of Anton IDE.

## Branding
- **product.json**: All product identifiers changed — `nameShort` → "Son of Anton", `nameLong` → "Son of Anton IDE", `applicationName` → "son-of-anton", `dataFolderName` → ".son-of-anton", `urlProtocol` → "son-of-anton", `darwinBundleIdentifier` → "com.sonofanton.ide", `win32AppUserModelId` → "SonOfAnton.IDE", `licenseName` → "MIT".
- **package.json**: Updated `name`, `author`, `repository`, `bugs`, `homepage` fields.
- **Application IDs**: Generated new GUIDs for all Windows app IDs (`win32x64AppId`, `win32arm64AppId`, etc.) and macOS profile UUIDs.
- **User-facing strings**: Replaced "Visual Studio Code" and "VS Code" with "Son of Anton" in all user-visible locations including:
  - Issue reporter source selector and template logic
  - External terminal title
  - Extension validator messages
  - Context key descriptions
  - Settings descriptions (terminal, sandbox, secret storage)
  - Session management UI (account menu, update dialogs, open actions)
  - Debug protocol renderer descriptions
  - MCP gateway server info
  - CLI error messages
  - argv.json configuration comments

## Telemetry
- **Default Settings**: Telemetry is fully disabled by default. `TelemetryConfiguration.OFF` is the only supported level in `src/vs/platform/telemetry/common/telemetryService.ts` and `telemetryUtils.ts`. `getTelemetryLevel()` returns `TelemetryLevel.NONE` for all cases.
- **product.json**: `enableTelemetry` set to `false`. No `updateUrl`, `serviceMachineId`, `aiConfig`, `instrumentationKey`, `connectionString`, or `msftInternalDomains` fields present. No `privacyStatementUrl` field.

## Extension Marketplace
- **Open VSX**: Extension gallery configured to use `open-vsx.org` for `serviceUrl`, `itemUrl`, `resourceUrlTemplate`, and `extensionUrlTemplate`.
- **No marketplace.visualstudio.com references** remain in source code.

## Removed Extensions
- `ms-vscode.js-debug`: Microsoft proprietary JS debugger.
- `ms-vscode.js-debug-companion`: JS debugger companion.
- `ms-vscode.vscode-js-profile-table`: JS profile table visualizer.
- `microsoft-authentication`: Microsoft Account / Azure AD auth provider. Removed from all build configs (`gulpfile.extensions.ts`, `dirs.ts`, `extensions.ts`, `mangle/index.ts`, `verify-macho.ts`, `create-universal-app.ts`). Extension directory retained for reference but excluded from compilation and builds.
- `builtInExtensions` array in `product.json` is empty — no external extensions are bundled.

## Service Endpoints Removed
- No Microsoft telemetry endpoints (`dc.services.visualstudio.com`, `vortex.data.microsoft.com`, `browser.events.data.microsoft.com`).
- No Application Insights configuration.
- No update server URL.
- No crash reporter endpoints targeting Microsoft.
- `microsoft-authentication` extension (connecting to `login.microsoftonline.com`, `graph.microsoft.com`) excluded from build.
- `reportIssueUrl` points to Son of Anton repository.
- `licenseUrl` and `serverLicenseUrl` point to Son of Anton repository.

## Legal
- MIT License retained with original Microsoft copyright attribution (legally required).
- Son of Anton Contributors copyright added.
- `NOTICE` file documents fork provenance and modifications.
- `ThirdPartyNotices.txt` retained for dependency attribution.

## Remaining Microsoft References (Justified)
- **Copyright headers** in all source files: Required by MIT License — must be preserved.
- **Variable names** and **internal identifiers** (e.g., `vscode`, `IVSCodeWindow`): Part of the codebase architecture, not user-facing.
- **Test fixtures** with sample paths (e.g., `/Applications/Visual Studio Code.app`): Used in test assertions, not shipped to users.
- **Shell integration sequence comments**: Document protocol compatibility, not user-facing.
- **ThirdPartyNotices.txt** and **LICENSE.txt**: Legal attribution — must be preserved.
- **extensions/microsoft-authentication/ directory**: Source retained for reference but excluded from all builds.
