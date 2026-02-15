# Hygiene Checks

VS Code runs a hygiene check as a git pre-commit hook. Commits will be rejected if hygiene fails.

## What it checks

The hygiene linter scans all staged `.ts` files for issues including (but not limited to):

- **Unicode characters**: Non-ASCII characters (em-dashes, curly quotes, emoji, etc.) are rejected. Use ASCII equivalents in comments and code.
- **Double-quoted strings**: Only use `"double quotes"` for externalized (localized) strings. Use `'single quotes'` everywhere else.
- **Copyright headers**: All files must include the Microsoft copyright header.

## How it runs

The git pre-commit hook (via husky) runs `npm run precommit`, which executes:

```bash
node --experimental-strip-types build/hygiene.ts
```

This scans only **staged files** (from `git diff --cached`). To run it manually:

```bash
npm run precommit
```
