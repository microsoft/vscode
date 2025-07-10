---
applyTo: '**'
---

# VS Code Copilot Development Guide

This file contains key information to help AI assistants work more efficiently with the VS Code codebase.

## Quick Reference for Common Issues

### Build & Test Workflow
1. **Compile**: `npm run compile` (required before testing code changes)
2. **Run specific tests**: `./scripts/test.sh --grep "pattern"`
3. **Test file location**: `out/` directory contains compiled JavaScript
4. **Extension compilation**: Extensions compile separately and take significant time

### Code Architecture Patterns

#### Testing Strategy
- Unit tests in `src/vs/*/test/` directories
- Integration tests in `test/` directory
- Use `npm run compile` before running node-based tests

## Common Gotchas

### Module Loading
- Use compiled files from `out/` directory when testing with node
- Import paths: `const { Class } = require('../out/vs/path/to/module.js')`
- ES modules require `.mjs` extension or package.json type modification

### Test Location
- Don't add tests to the wrong test suite (e.g., adding to end of file instead of inside relevant suite)
- Look for existing test patterns before creating new structures
- Use `describe` and `test` consistently with existing patterns

## Investigation Shortcuts

### Finding Related Code
1. **Semantic search first**: Use file search for general concepts
2. **Grep for exact strings**: Use grep for error messages or specific function names
3. **Follow imports**: Check what files import the problematic module
4. **Check test files**: Often reveal usage patterns and expected behavior

### Build Optimization
- Compilation takes ~2 minutes - do this once at start
- Extensions compile separately - skip if not needed
- Use incremental compilation for faster iteration

## File Structure Quick Reference

```
src/vs/
├── base/common/           # Core utilities (color.ts, etc.)
├── editor/contrib/        # Editor features
├── platform/             # Platform services
└── workbench/            # Main UI components

test/                     # Integration tests
out/                     # Compiled output
scripts/                 # Build and test scripts
```
