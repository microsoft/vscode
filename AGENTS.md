# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Fork-Specific Change Markers

This project is a fork of VS Code. To minimize merge conflicts when syncing with upstream, mark agent-specific changes in shared code with `test-workbench_change` comments.

### Marking Guidelines

**Single line changes:**
```typescript
const value = 42; // test-workbench_change
```

**Multi-line changes:**
```typescript
// test-workbench_change start
const foo = 1;
const bar = 2;
// test-workbench_change end
```

**New files:**
```typescript
// test-workbench_change - new file
```

Always use these markers when modifying existing VS Code files or adding new files that may conflict with upstream changes. This helps identify fork-specific code during merge operations.
