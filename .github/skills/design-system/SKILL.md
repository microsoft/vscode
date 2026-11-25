---
name: design-system
description: 'Use when design feedback or a visual design question needs shared VS Code guidance, or when finding, authoring, updating, reviewing, or auditing that guidance. Ordinary UI work does not require a design specification.'
argument-hint: 'lookup | author | update | review | audit [topic, files, or change]'
---

# Design system

For UI work, consult relevant existing guidance and follow the normal implementation and validation workflow. Writing specifications and using an external viewer are optional.

## Find the owning guidance

For component guidance, read any existing `*.design.md` beside the implementation. If none applies, use the existing source, specifications, and skills for the owning contract.

Find shared guidance in [foundations](foundations/) and [patterns](patterns/) using ordinary repository search. With repository dependencies available, `node .github/skills/design-system/scripts/validate.mts --list` can optionally list specification paths, titles, kinds, and readiness.

## Commands

| Command | Use it to | Reference |
| --- | --- | --- |
| `lookup [topic or task]` | Find an owner, relevant code, and applicable guidance | [Find the owning guidance](#find-the-owning-guidance) |
| `author [topic]` | Create or improve a specification | [author](references/author.md) |
| `update [change]` | Bring existing guidance in step with a UI change | [update](references/update.md) |
| `review [topic or diff]` | Assess guidance for correctness, clarity, ownership, and evidence | [review](references/review.md) |
| `audit [kind or area]` | Find stale guidance and specific coverage gaps | [audit](references/audit.md) |

Use author, update, review, or audit when guidance itself is in scope. A prose edit needs link and editorial checks, not a product build.

## Shared contract

- **Placement.** Shared guidance belongs in `foundations/` or `patterns/`; reusable component contracts live beside their implementation. Follow [authoring conventions](references/authoring-conventions.md).
- **Metadata.** Each specification declares `title` and `kind` in front matter. Set `isDraft: true` for visible, provisional guidance; omit it or use `false` for established guidance. Superseded guidance redirects through `replacedBy`.
- **Ownership.** Code and tests own implemented values, APIs, and behavior. Specifications explain intent, usage, and scoped exceptions. Edit a rule once and link to its owner.
- **Composition.** Optional presentation metadata lets external viewers render guidance and examples from product-owned sources. Documentation remains useful as Markdown and does not depend on viewer implementation, installation, or validation.
- **Curation.** Component specifications are optional and focus on design-system primitives (reusable building blocks), including composed controls. `kind: "component"` identifies them; fixtures supply examples, not classification.
- **Principles.** Apply the [design principles](foundations/principles.design.md); link to this single owner instead of copying its values, principles, or examples.
- **Evidence.** Keep recommendations, draft guidance, and observed implementation distinct. A specification's presence does not make it product-wide policy.
- **Validation.** When changing specification metadata, placement, or source bindings, run `node .github/skills/design-system/scripts/validate.mts`. Ordinary UI work does not require documentation validation.

## Related skills

- [component-fixtures](../component-fixtures/SKILL.md) for live examples of real components.
- [accessibility](../accessibility/SKILL.md) for the subject's accessibility obligations.
