# Product Identity

> product.json identity, data folders, URL protocol for the mia-vscode fork.

## Desired Outcome
mia-vscode has its own product identity — distinct application name, data folder, URL protocol, and extension allowances — so it coexists with stock VS Code and presents itself as the Mia Code platform.

## Current Reality
The fork uses Code - OSS defaults: `code-oss` application name, `.vscode-oss` data folder, no custom extension allowances.

## Structural Tension
Product identity is the single configuration file that cascades into every surface: window titles, data directories, URL handlers, and extension trust.

---

## Components

### ProductJsonOverrides
Core product.json field replacements.
- **Behavior:** Replace identity fields in `product.json` at the repository root. These fields propagate through the build system into all platform binaries.
- **Data:**
  ```json
  {
    "nameShort": "Mia Code",
    "nameLong": "Mia Code - Narrative-Driven Development",
    "applicationName": "mia-code",
    "dataFolderName": ".mia-code",
    "win32MutexName": "miacode",
    "serverApplicationName": "mia-code-server",
    "serverDataFolderName": ".mia-code-server",
    "tunnelApplicationName": "mia-code-tunnel",
    "urlProtocol": "mia-code",
    "reportIssueUrl": "https://github.com/miadisabelle/mia-vscode/issues/new",
    "licenseUrl": "https://github.com/miadisabelle/mia-vscode/blob/main/LICENSE.txt"
  }
  ```

### ExtensionAllowances
Proposed API access for built-in mia extensions.
- **Behavior:** Grant proposed API access to mia extensions so they can use advanced VS Code APIs (chat, inline completion, etc.) without marketplace publishing restrictions.
- **Data:**
  ```json
  {
    "extensionAllowedProposedApi": [
      "mia.three-universe",
      "mia.stc-charts",
      "mia.story-monitor",
      "mia.agent-panel",
      "mia.chat-participant"
    ]
  }
  ```

### PlatformIdentifiers
OS-specific identifiers.
- **Behavior:** Update platform-specific identifiers for coexistence with VS Code:
  - **Windows**: AppIds, mutex names, shell name, registry values
  - **macOS**: Bundle identifier (`com.mia.code`), profile UUIDs
  - **Linux**: Icon name (`mia-code`), desktop file name

---

## Supporting Structures
- `product.json` is the central identity file — all changes localized here
- Changes require VS Code rebuild from source
- No source code modifications needed — product.json is a configuration file
- Fulfills: `mia-code-server/rispecs/mia-vscode/08-product-json.spec.md`
