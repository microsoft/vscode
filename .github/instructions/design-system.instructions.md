---
description: 'Find source-backed Visual Studio Code design guidance and product examples when building or changing UI.'
applyTo: "{src/vs/**/browser/**/*.{ts,css},**/*.design.md}"
---

# Design-system reference

Use the [design-system skill](../skills/design-system/SKILL.md) to find, author, update, review, or audit guidance. Its deterministic `scripts/validate.mts --list` command discovers shared foundations and patterns from specification front matter; a missing component specification is not itself a coverage error.

Read only the specification relevant to the task. Component contracts live beside their implementation; shared foundations and patterns live under `.github/skills/design-system/`. Code and tests own implemented values, APIs, and behavior. Specifications explain intent, usage, and scoped exceptions.

Specifications are not automatically injected as instructions. Follow the repository's existing skill and instruction routes, and do not duplicate their rules into a new chapter. When a UI change alters behavior, appearance, or usage that a specification describes, update its owning document in the same change.

For motion design, tuning, or validation, use the [motion-design skill](../skills/motion-design/SKILL.md).
