# Linux Policy Management for VS Code

This document describes the JSON-based policy management system for Linux in VS Code.

## Overview

VS Code on Linux now supports JSON-based policy management that follows the XDG Base Directory specification. This allows system administrators and users to configure VS Code policies using standard Linux configuration patterns.

## Policy File Locations

### System-wide Policies
- **Path**: `/etc/vscode/policies.json`
- **Purpose**: Define organization-wide or system-wide policies
- **Scope**: Applies to all VS Code installations on the system

### User-specific Policies  
- **Path**: `$XDG_CONFIG_HOME/vscode/policies.json` (usually `~/.config/vscode/policies.json`)
- **Purpose**: Define user-specific policy overrides
- **Scope**: Applies only to the current user's VS Code installation

## Policy Precedence

When both system-wide and user-specific policy files exist:
1. System-wide policies are loaded first
2. User-specific policies are loaded and override any conflicting system policies
3. The final policy set is the merger of both, with user policies taking precedence

## Policy File Format

Policy files use standard JSON format:

```json
{
  "editor.fontSize": 14,
  "workbench.colorTheme": "Default Dark+",
  "editor.wordWrap": "on",
  "files.autoSave": "onFocusChange"
}
```

## Features

- **Automatic file watching**: Policy files are monitored for changes and reloaded automatically
- **Error handling**: Invalid JSON or missing files are handled gracefully with logging
- **Policy validation**: Only known policy definitions are processed; unknown policies are ignored
- **Change notifications**: The policy system fires change events when policies are updated

## Example Usage

### System-wide Policy Setup
Create `/etc/vscode/policies.json`:
```json
{
  "editor.fontSize": 12,
  "workbench.colorTheme": "Default Light+",
  "telemetry.telemetryLevel": "off",
  "update.mode": "manual"
}
```

### User Override
Create `~/.config/vscode/policies.json`:
```json
{
  "editor.fontSize": 16,
  "workbench.colorTheme": "Default Dark+"
}
```

**Result**: The user gets:
- `editor.fontSize`: 16 (user override)
- `workbench.colorTheme`: "Default Dark+" (user override)  
- `telemetry.telemetryLevel`: "off" (from system)
- `update.mode`: "manual" (from system)

## Technical Details

The Linux policy service is implemented in `src/vs/platform/policy/node/linuxPolicyService.ts` and automatically activated on Linux systems. It extends the abstract policy service and provides:

- XDG Base Directory specification compliance
- File system watching for both policy locations
- Policy merging with proper precedence
- Comprehensive error handling and logging

## Benefits

1. **Standards compliance**: Follows Linux filesystem hierarchy and XDG standards
2. **No special flags**: Works by default without requiring `--enable-file-policy`
3. **Flexible deployment**: Supports both system-wide and user-specific configurations
4. **Live updates**: Changes to policy files are applied immediately
5. **Graceful degradation**: Missing or invalid files don't break VS Code functionality

This implementation provides Linux users with a native, standards-compliant way to manage VS Code policies through JSON configuration files.