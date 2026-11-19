---
name: design-system
description: 'Author, update, review, or audit VS Code design-system guidance: foundation, component, and pattern specs (`{topic}.design.md`) and their topic map. Use for writing or improving a topic, keeping specs in step with UI changes, reviewing guidance, or finding coverage gaps.'
argument-hint: 'author | update | review | audit [topic, files, or change]'
---

# Design system

One entry point for work on design-system guidance. The first argument picks the command; the rest names the topic, files, or change.

## Commands

| Command | Use it to | Edits? | Reference |
| --- | --- | --- | --- |
| `author [topic]` | Create a topic, improve its guidance, or change how its chapter presents it | Yes | [author.md](references/author.md) |
| `update [change]` | Bring specs in step with a UI change: find the affected guidance and update it | Yes | [update.md](references/update.md) |
| `review [topic or diff]` | Judge a topic or a guidance change, and return prioritized findings | No | [review.md](references/review.md) |
| `audit [kind or area]` | Find coverage gaps, stale specs, and broken map entries across the system | No | [audit.md](references/audit.md) |

Without an argument, infer the command from the request. If two commands fit, ask once. Open only the selected reference.

## Shared contract

- **Owners.** Follow [authoring conventions](../../design-system/authoring.md) for where each kind of material lives. Edit the owning document once; link to it rather than copying it.
- **Topic map.** [topics.json](../../design-system/topics.json) lists shared topics, their kinds, and design sources; its component curation identifies code-local specifications and implementation owners. The [README](../../design-system/README.md#find-the-owning-guidance) routes to them. Use the map to locate and place guidance; never guess a spec from a class name.
- **Kinds.** Foundations teach shared choices. Components teach reusable contracts. [Patterns](../../design-system/patterns.md) teach task compositions across scenarios.
- **Principles.** Apply the [design philosophy](../design-philosophy/SKILL.md); link to its principles instead of restating them.
- **Content vs. view.** The repository holds guidance, examples, and composition data. The external canvas plugin holds presentation. Never put product guidance in the viewer.
- **Evidence.** Keep recommendations, draft guidance, and observed implementation distinct. A spec's presence doesn't make it product-wide policy.
- **Validation.** Use the commands in [Preview and validate](../../design-system/README.md#preview-and-validate-before-pushing). A prose-only edit needs link and editorial checks, not a product build.

## Related skills

- [motion-design](../motion-design/SKILL.md) for motion tuning and validation.
- [component-fixtures](../component-fixtures/SKILL.md) for live examples of real components.
- [accessibility](../accessibility/SKILL.md) for the subject's accessibility obligations.
