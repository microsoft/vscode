---
applyTo: '**/*.ts'
---

# VS Code Copilot Development Instructions for TypeScript

You MUST check compilation output before running ANY script or declaring work complete!

1. **ALWAYS** check the "Core - Build" task output for compilation errors
2. **ALWAYS** check the "Ext - Build" task output for compilation errors
3. **NEVER** run tests if there are compilation errors
3. **NEVER** use `npm run compile` to compile TypeScript files, always check task output
4. **FIX** all compilation errors before moving forward

## TypeScript compilation steps

Typescript compilation errors can be found by running the "Core - Build" and "Ext - Build" tasks:
- **Core - Build**: Compiles the main VS Code TypeScript sources
- **Ext - Build**: Compiles the built-in extensions
- These background tasks may already be running from previous development sessions
- If not already running, start them to get real-time compilation feedback
- The tasks provide incremental compilation, so they will automatically recompile when files change

## TypeScript validation steps
- Use `scripts/test.sh` (or `scripts\test.bat` on Windows) for unit tests (add `--grep <pattern>` to filter tests)
- Use `scripts/test-integration.sh` (or `scripts\test-integration.bat` on Windows) for integration tests
- Use `npm run valid-layers-check` to check for layering issues

