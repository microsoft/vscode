# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Repository Purpose

This is a personal fork of VS Code used for contributing PRs to the official Microsoft vscode repository. All changes should follow Microsoft's contribution guidelines and coding standards to ensure PRs are accepted upstream.

## Quick Reference

### Before Making Any Changes
1. **Check compilation**: Monitor the `VS Code - Build` watch task for TypeScript errors
2. **Understand the layered architecture**: `base` → `platform` → `editor` → `workbench`
3. **Find existing patterns**: Look at similar code before implementing new features

### Code Style Essentials
- **Tabs, not spaces** for indentation
- **PascalCase** for types/enums, **camelCase** for functions/variables
- **Single quotes** for code strings, **double quotes** for user-facing localized strings
- **Arrow functions** preferred over anonymous functions
- **Curly braces** always required around loop/conditional bodies
- **No `any` or `unknown`** types unless absolutely necessary

### Localization
All user-visible strings must use `nls.localize()`:
```typescript
import * as nls from 'vs/nls';
const message = nls.localize('myKey', "User visible message with {0} placeholder", value);
```

## Building and Testing

### TypeScript Compilation
- **NEVER** use `npm run compile` directly
- Use the `VS Code - Build` watch task which runs `Core - Build` and `Ext - Build`
- Fix ALL compilation errors before running tests or committing

### Running Unit Tests
```bash
# All unit tests (runs in Electron)
./scripts/test.sh

# Filter by pattern
./scripts/test.sh --grep "pattern"

# Specific test file
./scripts/test.sh --glob "**/myFile.test.js"

# Debug mode (opens Electron with DevTools)
./scripts/test.sh --debug --glob "**/myFile.test.js"

# Browser-based tests (common/browser layers)
npm run test-browser -- --browser chromium

# Node-based tests
npm run test-node -- --run src/vs/path/to/test.ts
```

### Running Integration Tests
```bash
# All integration tests
./scripts/test-integration.sh

# Web integration tests
./scripts/test-web-integration.sh --browser chromium
```

### Layering Validation
```bash
npm run valid-layers-check
```

## Writing and Testing Extensions

VS Code's built-in extensions live in the `extensions/` folder. This is "Inception-level" development—you're building extensions that ship with the editor you're also developing.

### Extension Structure
Each extension in `extensions/` follows standard VS Code extension conventions:
```
extensions/my-extension/
├── package.json          # Extension manifest with contributions
├── src/                  # TypeScript source files
│   └── extension.ts      # Entry point
├── tsconfig.json         # TypeScript config
└── out/                  # Compiled output (generated)
```

### Key Extension Directories
- `extensions/vscode-api-tests/` - API test extension (great reference for testing patterns)
- `extensions/typescript-language-features/` - Full language support example
- `extensions/git/` - Complex extension with proposed APIs
- `extensions/extension-editing/` - Extension development tools

### Testing Extensions

#### API Tests (in `extensions/vscode-api-tests/`)
These test the VS Code Extension API itself:
```bash
# Run API tests for single folder workspace
./scripts/test-integration.sh  # Runs as part of integration suite

# Run specific extension tests
npm run test-extension -- -l vscode-api-tests
```

Test files location: `extensions/vscode-api-tests/src/singlefolder-tests/`

#### Extension-Specific Tests
For extensions like `typescript-language-features`:
```bash
# The integration script runs these automatically
./scripts/test-integration.sh
```

#### Writing New Extension Tests
1. Create test files in `src/test/` within your extension
2. Follow patterns in `extensions/vscode-api-tests/src/singlefolder-tests/`
3. Use Mocha's `describe`/`test` (or `it`) structure
4. Tests run via `extensionTestsPath` parameter to VS Code

Example test structure:
```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('My Extension Tests', () => {
    test('should do something', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'test content',
            language: 'plaintext'
        });
        assert.strictEqual(doc.getText(), 'test content');
    });
});
```

### Proposed APIs
Built-in extensions can use proposed APIs by listing them in `package.json`:
```json
{
  "enabledApiProposals": ["proposedApiName"]
}
```
Proposed API definitions: `src/vscode-dts/vscode.proposed.*.d.ts`

### Debugging Extensions
1. Use the launch configurations in `.vscode/launch.json`
2. Set breakpoints in extension TypeScript source
3. Use "Extension Host" debug configuration

## Contributing PR Checklist

Before submitting a PR to upstream:
- [ ] All TypeScript compilation errors fixed
- [ ] Unit tests pass: `./scripts/test.sh`
- [ ] Integration tests pass: `./scripts/test-integration.sh`
- [ ] Layering check passes: `npm run valid-layers-check`
- [ ] No lint errors: `npm run eslint`
- [ ] New code has Microsoft copyright header
- [ ] User-facing strings are localized with `nls.localize()`
- [ ] New tests added for new functionality
- [ ] Existing tests not broken

## Architecture Quick Guide

### Dependency Injection
Services are injected via constructor decorators:
```typescript
class MyService {
    constructor(
        @IConfigurationService private configService: IConfigurationService,
        @ILogService private logService: ILogService
    ) {}
}
```

### Contribution Pattern
Features register via contribution points:
```typescript
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
    .registerWorkbenchContribution(MyContribution, LifecyclePhase.Ready);
```

### Test File Location
- Unit tests: Adjacent to source in `test/` folders (e.g., `src/vs/base/test/`)
- Integration tests: `test/integration/` and extension test folders
- Smoke tests: `test/smoke/`

## Common Pitfalls

1. **Wrong test suite**: Don't add tests to end of file; put them in the relevant `describe` block
2. **Missing localization**: All user-visible strings need `nls.localize()`
3. **Import duplication**: Reuse existing imports, don't duplicate
4. **Temporary files**: Clean up any helper files created during development
5. **Layer violations**: Respect the `base` → `platform` → `editor` → `workbench` hierarchy
