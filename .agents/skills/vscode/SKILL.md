```markdown
# vscode Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill covers the core development patterns and conventions used in the `vscode` TypeScript codebase. It documents file naming, import/export styles, commit practices, and testing patterns, providing a practical guide for contributing to or maintaining similar projects. While no explicit frameworks or automated workflows are detected, this guide outlines the implicit standards and offers suggested commands for common tasks.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `myComponent.ts`, `userSettings.test.ts`

### Import Style
- Use **relative imports** for referencing modules within the project.
  - Example:
    ```typescript
    import { doSomething } from './utils';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // utils.ts
    export function doSomething() { /* ... */ }
    ```

### Commit Patterns
- Commit messages are freeform and not strictly structured.
- Prefixes are sometimes used but not enforced.
- Average commit message length is about 44 characters.
  - Example:  
    ```
    Fix bug in editor selection logic
    ```

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new feature or module  
**Command:** `/add-feature`

1. Create a new TypeScript file using camelCase naming.
2. Use relative imports to include dependencies.
3. Export new functions or classes using named exports.
4. Write corresponding tests in a `.test.ts` file.
5. Commit changes with a clear, concise message.

### Fixing a Bug
**Trigger:** When resolving a reported issue or bug  
**Command:** `/fix-bug`

1. Locate the relevant file(s) using camelCase naming.
2. Make necessary code changes.
3. Update or add tests in the corresponding `.test.ts` file.
4. Commit with a descriptive message indicating the fix.

### Writing Tests
**Trigger:** When adding or updating tests  
**Command:** `/write-test`

1. Create or update a test file matching the pattern `*.test.ts`.
2. Use the project's preferred (undetected) testing framework.
3. Use relative imports for modules under test.
4. Export test utilities or helpers as named exports if needed.

## Testing Patterns

- Test files follow the pattern: `*.test.ts`
- The specific testing framework is unknown, but standard TypeScript test structure applies.
- Example test file:
  ```typescript
  import { doSomething } from './utils';

  describe('doSomething', () => {
    it('should perform the expected action', () => {
      // Test implementation
    });
  });
  ```

## Commands
| Command      | Purpose                                 |
|--------------|-----------------------------------------|
| /add-feature | Scaffold and implement a new feature    |
| /fix-bug     | Guide through fixing a bug              |
| /write-test  | Steps for writing or updating a test    |
```
