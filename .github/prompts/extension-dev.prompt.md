---
description: 'Guide for developing and testing VS Code built-in extensions'
---
# Extension Development Guide

When working on built-in extensions in the `extensions/` folder:

## Structure
- Extensions use standard VS Code extension structure with `package.json`, TypeScript sources, and contribution points
- Entry point is typically `src/extension.ts` compiled to `out/main.js`
- Use `enabledApiProposals` in package.json for proposed APIs

## Testing Extensions
1. Write tests in `src/test/` following patterns in `extensions/vscode-api-tests/`
2. Use Mocha's `suite`/`test` structure
3. Run with: `npm run test-extension -- -l <extension-name>`
4. Integration tests run via `./scripts/test-integration.sh`

## Key References
- API test examples: `extensions/vscode-api-tests/src/singlefolder-tests/`
- Language features: `extensions/typescript-language-features/`
- Proposed APIs: `src/vscode-dts/vscode.proposed.*.d.ts`

## Checklist
- [ ] Tests pass locally
- [ ] No TypeScript errors in extension
- [ ] User strings localized
- [ ] package.json contributions properly defined
