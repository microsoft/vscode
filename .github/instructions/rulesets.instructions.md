---
description: "Use when changing the rulesets in .github/rulesets. Explains that the files don't configure the repository until an admin applies them."
applyTo: ".github/rulesets/**"
---

# Rulesets

- The JSON files in `.github/rulesets/` are versioned copies of the repository's rulesets, such as the merge queue of `main`. GitHub never reads them: committing or merging a change to one changes nothing on the repository.
- A change takes effect only when a repository admin runs `node .github/rulesets/rulesets.ts apply` from an up-to-date `main` (see `.github/rulesets/README.md`). Never run `apply` yourself, and never change rulesets through the API or the settings.
- When you change a file, say so in the pull request, and that an admin needs to apply it after it merges. Until then, the Rulesets workflow, which compares the files with the live rulesets, fails on `main`.
- To see the live settings, read the ruleset (`gh api repos/microsoft/vscode/rulesets/<id>`) or run `node .github/rulesets/rulesets.ts check`, rather than assuming that a file matches them.
- Keep each file in the format of the REST API for rulesets, and its `name` unique: `rulesets.ts` matches a file with the live ruleset of the same name.
