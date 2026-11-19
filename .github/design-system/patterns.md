# Pattern conventions

Patterns help designers and agents reuse a shared task structure instead of designing each feature in isolation. Teach the shared composition, navigation model, and interaction contract, while making intentional differences easy to explain.

## What belongs in Patterns

| Category | Reader's question | Owns |
| --- | --- | --- |
| Foundations | Which shared design choices apply? | Cross-cutting roles, ramps, and principles |
| Components | Which reusable building block should I use? | A control's contract, states, accessibility, and APIs |
| Patterns | How do these pieces work together for this kind of task? | Reusable relationships, navigation, behavior, and adaptation across scenarios |

A pattern needs a recurring user job, not just a shared container or visual resemblance. Name the task relationship it preserves across features.

Use [Modal](./modal.design.md) for bounded management tasks sharing a temporary surface. The [Dialog component](../../src/vs/base/browser/ui/dialog/dialog.design.md) remains the owner for a short modal decision.

## Establish the reusable contract

Define these decisions before writing detailed guidance:

| Decision | Authoring requirement |
| --- | --- |
| Fit and boundary | State the user job, when the pattern helps, and when an editor, view, picker, or another pattern fits better. |
| Shared composition | Identify regions, hierarchy, action placement, and scrolling relationships that should remain recognizable across features. |
| Navigation model | Distinguish destinations, scope, filtering, selection, and drill-in; explain Back and how readers retain their place. |
| Interaction contract | Describe entry, actions, drafts, feedback, recovery, dismissal, and return to the originating task. |
| Permitted variation | Tie each optional region or behavior to a user need; explain what remains invariant when it changes. |
| Scenario transfer | Compare at least two concrete scenarios, showing the common structure and each justified difference. |
| Evaluation | Give observable checks for the shared experience, including keyboard use and constrained space. |

These are content requirements, not mandatory section titles. Follow [topic authoring](authoring.md) for concise, decision-led writing and source ownership.

## Put sameness before differences

Apply [Sameness signals sameness](../skills/design-philosophy/SKILL.md#6-sameness-signals-sameness) to both appearance and response. Explain the common experience before listing feature-specific needs.

- **Keep consistent:** relationships with the same meaning, such as collection tools versus item actions, or local Back versus closing the task.
- **Vary deliberately:** regions, metadata, or actions required by the task, such as categories for browsing versus connection state for environments.
- **Do not standardize incidentals:** a column count, sample label, or current CSS value is not a pattern contract.

Choose shared components and link their owning guidance. Do not copy token inventories, component APIs, or accessibility procedures into each pattern.

Keep required accessibility obligations visible before the affected interaction. Pattern guidance explains their composition; it cannot weaken the [accessibility contract](../skills/accessibility/SKILL.md).

## Teach transfer, not a feature tour

Lead with fit, then shared composition and behavior, followed by scenario applications and evaluation. Give readers enough structure to apply the pattern to a new feature.

Use a comparison table to connect each scenario's job to the same regions and transitions. State why a difference exists, not merely that the screens differ.

Pair significant relationships with a structural diagram, an owned example, or a short interaction walkthrough. Provide a text equivalent and an observable outcome.

Label diagrams as illustrative when their geometry is not a product specification. A schematic teaches composition; it does not demonstrate implemented keyboard or focus behavior.

## Separate convention from adoption

Distinguish recommended design, current implementation, and unresolved decisions. Name the applicable surface family; do not make a local convention apply to every similarly named component.

For ongoing designs, use a scenario mapping without claiming final layouts or completed adoption. Link available product owners as implementation evidence, not proof of agreement across features.

When a feature needs an exception, record the user need, changed relationship, and preserved contract in its owning specification. Resolve reusable changes here rather than copying divergent rules.

## Register and check

Keep shared pattern guidance in `.github/design-system/{topic}.design.md`, with images under `{topic}/assets/`. Link to component specifications and existing feature contracts rather than duplicating their rules.

Register pattern chapters in [topics.json](./topics.json) with `group: "Patterns"`, after Foundations and before Components. Use the supported guidance renderer unless the lesson needs another representation.

Preserve topic IDs, aliases, and section addresses when moving an existing chapter. Keep archived compatibility topics hidden; they are not new category landing pages.

Before delivery, verify that a reader can:

1. Choose the pattern for a representative task and reject it for a boundary case.
2. Transfer its composition and behavior to another scenario without copying irrelevant feature details.
3. Identify which differences are intentional and which would cause drift.
4. Find the same contract through navigation, source-document lookup, and agent search.
