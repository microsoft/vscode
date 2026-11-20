---
name: design-system
description: 'Find, author, update, review, or audit VS Code design guidance, including shared foundations and patterns and code-local component specifications.'
argument-hint: 'lookup | author | update | review | audit [topic, files, or change]'
---

# Design system

Use this entry point for design-guidance work. Choose a command from the request; open only the relevant reference.

## Find the owning guidance

List discovered specifications with `node .github/skills/design-system/scripts/validate.mts --list`. The output is derived from shared `foundations/` and `patterns/` specs and code-local component specs; it includes each path, title, kind, and readiness. No hand-maintained topic inventory is authoritative.

For component guidance, read the `*.design.md` beside the implementation. A missing component spec is not a coverage error; use source search and the [documentation library](references/document-library.md) to find existing contracts.

## Commands

| Command | Use it to | Reference |
| --- | --- | --- |
| `lookup [topic or task]` | Find an owner, relevant code, and applicable guidance | [authoring conventions](references/authoring-conventions.md) |
| `author [topic]` | Create or improve a specification or how its chapter teaches it | [author](references/author.md) |
| `update [change]` | Bring existing guidance in step with a UI change | [update](references/update.md) |
| `review [topic or diff]` | Assess guidance for correctness, clarity, ownership, and evidence | [review](references/review.md) |
| `audit [kind or area]` | Find stale guidance and specific coverage gaps | [audit](references/audit.md) |

If two commands fit, prefer the one that changes the owning source. A prose edit needs link and editorial checks, not a product build.

## Shared contract

- **Placement.** Shared guidance belongs in `foundations/` or `patterns/`; reusable component contracts live beside their implementation. Follow [authoring conventions](references/authoring-conventions.md).
- **Metadata.** Each specification declares `title`, `kind`, and `status` in front matter. `draft` guidance remains visible but provisional; `stable` guidance is established; `deprecated` guidance redirects through `replacedBy`.
- **Ownership.** Code and tests own implemented values, APIs, and behavior. Specifications explain intent, usage, and scoped exceptions. Edit a rule once and link to its owner.
- **Composition.** Per-chapter files under `content/topics/` select how authored guidance and examples are presented. They are not a second catalog; the viewer owns presentation and navigation.
- **Curation.** Component metadata may identify primitives and composites. A fixture is not evidence that a control is a primitive, and the absence of a component spec is not an error.
- **Principles.** Apply [shared design philosophy](foundations/principles.design.md); link to it instead of copying its values or principles.
- **Evidence.** Keep recommendations, draft guidance, and observed implementation distinct. A specification's presence does not make it product-wide policy.
- **Validation.** Use the [authoring references](references/authoring-conventions.md) for source checks and `node .github/skills/design-system/scripts/validate.mts` for metadata and placement validation.

## Related skills

- [motion-design](../motion-design/SKILL.md) for motion tuning and validation.
- [component-fixtures](../component-fixtures/SKILL.md) for live examples of real components.
- [accessibility](../accessibility/SKILL.md) for the subject's accessibility obligations.
