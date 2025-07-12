---
applyTo: '**/*.ts'
---

# VS Code Copilot Development Instructions

## ⚠️ MANDATORY COMPILATION CHECK

**CRITICAL: You MUST check compilation output before running ANY script or declaring work complete!**

### Before running any command:
1. **ALWAYS** check the "Core - Build" task output for compilation errors
2. **ALWAYS** check the "Ext - Build" task output for compilation errors
3. **NEVER** run tests if there are compilation errors
4. **FIX** all compilation errors before moving forward

## Scripts
- Use `npm install` to install dependencies if you changed `package.json`
- Use `scripts/test.sh` (or `scripts\test.bat` on Windows) for unit tests (add `--grep <pattern>` to filter tests)
- Use `scripts/test-integration.sh` (or `scripts\test-integration.bat` on Windows) for integration tests
- Use `npm run valid-layers-check` to check for layering issues

## Compilation Tasks
Typescript compilation errors can be found by running the "Core - Build" and "Ext - Build" tasks:
- **Core - Build**: Compiles the main VS Code TypeScript sources
- **Ext - Build**: Compiles the built-in extensions
- These background tasks may already be running from previous development sessions
- If not already running, start them to get real-time compilation feedback
- The tasks provide incremental compilation, so they will automatically recompile when files change
