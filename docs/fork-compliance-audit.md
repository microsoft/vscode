# Fork Compliance Audit

This document records the modifications made to strip Microsoft branding and telemetry from the Code - OSS base to create the Son of Anton IDE.

## Branding
- **Name**: Changed references from `Microsoft Code OSS` to `Son of Anton IDE` in `product.json` and `package.json`.
- **Application IDs**: Generated new GUIDs for Windows and Mac bundle identifiers.
- **Repository URLs**: Changed to point to the `son-of-anton` GitHub repositories.

## Telemetry
- **Default Settings**: Telemetry is fully disabled by default and the configuration `TelemetryConfiguration.OFF` is the only supported level in `src/vs/platform/telemetry/common/telemetryService.ts` and `telemetryUtils.ts`.
- **product.json**: Removed auto-update `updateUrl` endpoints and disabled `enableTelemetry`.

## Extension Marketplace
- **Open VSX**: Switched all references from `marketplace.visualstudio.com` to `open-vsx.org`.
- **Removed Extensions**: Removed `ms-vscode.js-debug`, `ms-vscode.js-debug-companion`, and `ms-vscode.vscode-js-profile-table` which are Microsoft proprietary extensions.

## Results of `grep` audit for Microsoft terms
There are still thousands of hits for `microsoft`, `vscode`, and `visual studio` across the massive codebase. The majority of these are acceptable as license attributions or harmless variable names. The critical changes for application names, endpoints, and identifiers in the build system (`product.json`, `package.json`) and core telemetry implementations have been removed or replaced.
