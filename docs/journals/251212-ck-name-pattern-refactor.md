# CK_NAME_PATTERN Refactor: Breaking 30+ Files for DRY

**Date**: 2025-12-12 18:50
**Severity**: High
**Component**: File naming system across agents and commands
**Status**: Resolved

## What Happened

We just completed a major refactor to centralize file naming patterns through the CK_NAME_PATTERN environment variable. This changed how 29 agent and command files handle naming, replacing hardcoded patterns with a centralized system.

## The Brutal Truth

This was absolutely maddening to implement. The codebase had naming patterns scattered across 30+ files, each with their own slightly different interpretation of how dates and slugs should be formatted. The real kick in the teeth is that we let this technical debt accumulate for so long - every new agent or command was copy-pasting the same naming logic, creating a maintenance nightmare waiting to explode.

## Technical Details

### The Problem
- 13 agent files and 16 command files had hardcoded naming patterns
- Each used different date format references: `{date}`, `YYMMDD`, `$CK_PLAN_DATE_FORMAT`
- Inconsistent slug handling: some used `{slug}`, others implied it
- The journal-writer agent had: `filename format: {date}-title-of-the-journal.md`
- Plan commands had: `plans/{date}-plan-name` with date format from `$CK_PLAN_DATE_FORMAT`

### The Solution
- Added `formatDate()` and `resolveNamingPattern()` functions to session-init.cjs hook
- Hook now computes resolved pattern at startup, keeping `{slug}` as placeholder
- Set `CK_NAME_PATTERN` environment variable with format like "251212-1830-GH-88-{slug}"
- Updated all 29 files to use `$CK_NAME_PATTERN` instead of their own patterns

### Key Changes
```javascript
// Before in multiple files:
`plans/{date}-plan-name` // with date format from $CK_PLAN_DATE_FORMAT
`./docs/journals/{date}-title-of-the-journal.md`

// After in all files:
`plans/$CK_NAME_PATTERN`
`./docs/journals/$CK_NAME_PATTERN.md`
```

## What We Tried

1. **Initial approach**: Tried to update files manually with find/replace - failed because patterns were too inconsistent
2. **Scripted approach**: Had to write custom logic in session-init.cjs to handle date formatting and issue extraction
3. **Gradual migration**: Considered updating piecemeal but realized it would break consistency during transition

## Root Cause Analysis

This happened because of three fundamental failures:
1. **No centralization**: When the first agent was created, we copy-pasted the naming logic instead of centralizing it
2. **YAGNI violation**: We said "we'll centralize later" but never did
3. **Documentation drift**: The CLAUDE.md file even had misleading references to `.ck.json` that weren't accurate

The real mistake was treating naming as an implementation detail rather than a system-wide convention that needed to be enforced.

## Lessons Learned

1. **Centralize early**: Any convention used by more than 3 components MUST be centralized immediately
2. **Environment variables are your friend**: For system-wide patterns, env vars prevent drift and make updates atomic
3. **Hook-based initialization is powerful**: The session-init hook proved invaluable for computing complex patterns at startup
4. **Documentation must match reality**: We had outdated docs that confused more than they helped

## Next Steps

1. Monitor for any remaining hardcoded patterns that might have been missed
2. Add validation to ensure new agents/commands use CK_NAME_PATTERN
3. Consider adding similar centralization for other common patterns (report paths, etc.)

The refactor was painful but necessary. We now have a single source of truth for naming patterns that can be updated system-wide without touching 30+ files. That's a win for maintainability, even if it took us way too long to get here.