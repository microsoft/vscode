# VS Code Agents Instructions

This file provides instructions for AI coding agents working with the VS Code codebase.

For detailed project overview, architecture, coding guidelines, and validation steps, see the [Copilot Instructions](.github/copilot-instructions.md).

## Code Formatting (IMPORTANT)

**After creating or modifying any TypeScript files within `/vscode`, ALWAYS run the formatting script:**

```bash
cd vscode
npm run format:uncommitted
```

This ensures all modified TypeScript files are properly formatted according to the project's formatting rules.

### Why this is critical

The pre-commit hook runs a hygiene check that will **fail** if files are not properly formatted. The error looks like:

```
File not formatted. Run the 'Format Document' command to fix it: src/path/to/file.ts
Hygiene failed with 1 errors.
```

To avoid blocking commits, **always run the format command after editing TypeScript files** in this directory.

### Alternative: Format a single file

If you need to format a specific file:

```bash
cd vscode
node --input-type=module -e "import {format} from './build/lib/formatter.ts'; import fs from 'fs'; const content = fs.readFileSync('src/path/to/file.ts', 'utf8'); const formatted = format('src/path/to/file.ts', content); fs.writeFileSync('src/path/to/file.ts', formatted, 'utf8'); console.log('Formatted');"
```

Replace `src/path/to/file.ts` with the actual file path relative to the `vscode` directory.
