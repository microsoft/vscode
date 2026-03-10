---
description: Create a pull request for the current branch
---

Before creating the PR, run the TypeScript compile check to catch any errors:

```
npm run compile-check-ts-native
```

Fix any errors before proceeding.

Then create a pull request for the current branch targeting `main` with:
- A concise title summarizing the change
- A description covering: what changed, why, and which issue(s) it fixes (use "Fixes #<number>")
