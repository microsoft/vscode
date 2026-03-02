# Plan: Strongly Recommended Workspace Extensions

## Problem

Workspace extension recommendations (`recommendations` in `.vscode/extensions.json`) are too easy to ignore. The current flow shows a non-blocking `Severity.Info` notification toast with `NotificationPriority.OPTIONAL` that users can dismiss once and never see again ("Don't Show Again for this Repository"). This means workspace authors have to separately communicate "please install this extension" — the workspace config doesn't serve as the communication itself.

## Goal

Add a `stronglyRecommended` field to `.vscode/extensions.json` that makes the workspace configuration itself the communication channel. Target: ~99% of users who open a folder with strongly recommended extensions install them.

## Design

### New field in `extensions.json`

```json
{
  "recommendations": ["esbenp.prettier-vscode"],
  "stronglyRecommended": ["ms-python.python", "dbaeumer.vscode-eslint"],
  "unwantedRecommendations": []
}
```

Extensions in `stronglyRecommended` are also treated as workspace recommendations (they appear in `@recommended:workspace`), but they get a more aggressive prompt flow.

### Prompt flow (two phases)

**Phase 1: Modal dialog (shown once per workspace)**

On first open of a workspace with uninstalled `stronglyRecommended` extensions, show a modal dialog:

```
┌─────────────────────────────────────────────────────────┐
│  This workspace strongly recommends installing           │
│  extensions                                              │
│                                                          │
│  Python, ESLint                                          │
│                                                          │
│  [Install Extensions]  [Show Extensions]  [Not Now]      │
└─────────────────────────────────────────────────────────┘
```

- **Install Extensions** — installs all and we're done
- **Show Extensions** — opens the Extensions view filtered to these extensions (user can install selectively)
- **Not Now** — dismisses; modal won't show again for this workspace

The modal is tracked via `extensionsAssistant/stronglyRecommendedModalShown` (workspace-scoped storage). It only fires once.

**Phase 2: Sticky notification (on subsequent opens)**

If the user chose "Not Now" or "Show Extensions" but didn't install, subsequent opens show a sticky notification toast:

```
This workspace strongly recommends the 'Python' extension from Microsoft
and 'ESLint' extension from Dirk Baeumer. Do you want to install?

[Install]  [Show Recommendations]  [...Don't Show Again]
```

- **Install** — installs all (with "Install (Do not sync)" submenu if sync enabled)
- **Show Recommendations** — opens Extensions view
- **Don't Show Again** — hidden in the `...` (secondary) menu; sets `extensionsAssistant/stronglyRecommendedIgnore` (workspace-scoped) to permanently silence

Key difference from regular recommendations: "Don't Show Again" is secondary/hidden in the `...` overflow, not a primary action. This makes it harder to accidentally silence and preserves the persistent nudge.

### Storage keys

| Key | Scope | Purpose |
|-----|-------|---------|
| `extensionsAssistant/stronglyRecommendedModalShown` | `WORKSPACE` / `MACHINE` | Tracks whether modal was already shown |
| `extensionsAssistant/stronglyRecommendedIgnore` | `WORKSPACE` / `MACHINE` | "Don't Show Again" for notifications |

### Relationship to existing recommendations

- `stronglyRecommended` extensions are a superset of `recommendations` behavior — they also appear as workspace recommendations
- They are still filtered by `unwantedRecommendations` and global ignore settings
- They are validated with the same `EXTENSION_IDENTIFIER_PATTERN`
- The prompt fires before the regular workspace recommendation prompt (no 5s delay)

## Files changed

| File | Change |
|------|--------|
| `src/vs/workbench/contrib/extensions/common/extensionsFileTemplate.ts` | Add `stronglyRecommended` to JSON schema |
| `src/vs/workbench/services/extensionRecommendations/common/workspaceExtensionsConfig.ts` | Add to `IExtensionsConfigContent`, parse in config service, add `getStronglyRecommended()` |
| `src/vs/workbench/contrib/extensions/browser/workspaceRecommendations.ts` | Surface `stronglyRecommended` as a separate list + include in regular recommendations |
| `src/vs/platform/extensionRecommendations/common/extensionRecommendations.ts` | Add `promptStronglyRecommendedExtensions` to service interface |
| `src/vs/workbench/contrib/extensions/browser/extensionRecommendationNotificationService.ts` | Implement modal dialog + notification fallback with IDialogService |
| `src/vs/workbench/contrib/extensions/browser/extensionRecommendationsService.ts` | Wire `promptStronglyRecommendedExtensions` into activation flow |

## Open questions

- Should `extensions.ignoreRecommendations` setting also suppress strongly recommended prompts? Currently it does NOT (the modal/notification flow is separate from the regular recommendation notification path).
- Should there be telemetry for the modal dialog interactions?
- Should strongly recommended extensions be scoped to workspace trust? (i.e., only prompt after workspace is trusted)
- Should there be a limit on how many extensions can be `stronglyRecommended`? (to prevent abuse)
