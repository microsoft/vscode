# Update specs after a UI change

Keep guidance in step with code. Run this when a change alters behavior, appearance, or usage that a spec describes, or adds a reusable component or pattern.

## 1. Find the affected guidance

- List the changed UI files from the diff or the named change.
- Read any `*.design.md` beside them.
- Use `node .github/skills/design-system/scripts/validate.mts --list` to locate shared foundations and patterns. A foundation or pattern may describe code elsewhere.
- Do not infer a spec from a class name or assume every component directory needs one.
- Search headless documents for the component or token names: `node <viewer>/scripts/book.mjs documents --root <checkout> --query "<subject>"`.

Record each candidate spec and the section the change touches. If none applies and the change adds a reusable component or pattern, continue with [author](author.md) to create one.

## 2. Decide what changed

For each candidate, classify the change:

| Change | Spec action |
| --- | --- |
| Values or APIs only, with the same intent | None. Specs link to values; confirm the links still resolve. |
| Usage, states, or behavior a reader relies on | Update the affected rule, example caption, or accessibility obligation. |
| A new variant or exception | Add it under its owning decision, with its applicability boundary. |
| A contradiction with the spec | Don't silently rewrite the rule. Report it: the UI or the spec may be wrong. |

## 3. Edit and verify

- Edit the owning section once, following [author](author.md) writing limits.
- Update bindings, fixtures, and links only if the selected content or paths changed.
- Run the product validator and its source checks: `node .github/skills/design-system/scripts/validate.mts`.
- Run focused viewer tests when extraction, discovery, or reader behavior changed.

Return the specs changed, the specs checked and left alone, and any contradiction for a human to decide. Agents keep guidance located and current; people own whether a rule is right.
