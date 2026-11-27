# Update specs after a UI change

Use this procedure when a change affects a contract described by existing guidance. Ordinary UI work does not require new specifications.

## 1. Find the affected guidance

- List the changed UI files from the diff or the named change.
- Read any `*.design.md` beside them.
- Search the repository for related foundations, patterns, and component or token names. The optional `node .github/skills/design-system/scripts/validate.mts --list` command can help locate specifications.
- Do not infer a spec from a class name or assume every component directory needs one.

If no existing guidance needs updating, no documentation work is required. Consider [authoring](author.md) a specification only for a useful, missing design-system contract.

## 2. Decide what changed

For each candidate, classify the change:

| Change | Spec action |
| --- | --- |
| Values or APIs only, with the same intent | None. Specs link to values; confirm the links still resolve. |
| Usage, states, or behavior a reader relies on | Update the affected rule, example caption, or accessibility obligation. |
| A new variant or exception | Add it under its owning decision, with its applicability boundary. |
| A contradiction with the spec | Don't silently rewrite the rule. Report it: the UI or the spec may be wrong. |

## 3. Edit and verify

- When guidance changes, edit the owning section once, following [author](author.md) writing limits.
- Update bindings, fixtures, and links only if the selected content or paths changed.
- Check links and the guidance against its source. Run `node .github/skills/design-system/scripts/validate.mts` when metadata, placement, or source bindings change.

Report unresolved contradictions, keeping draft recommendations distinct from existing product requirements. Viewer work and verification are separate from product or documentation changes.
