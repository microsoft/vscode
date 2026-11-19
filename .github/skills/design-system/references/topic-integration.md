# Topic integration

Use the current [authoring conventions](../../../design-system/authoring.md), [book index](../../../design-system/README.md), and [component qualification](../../../design-system/components.md) as the contracts. Inspect the selected checkout and compatible viewer before editing; do not assume an older topic's format is still the preferred architecture.

## Place and register the topic

Decide where readers expect to find the concept and where its facts belong. Shared foundations and patterns live in `.github/design-system/{topic}.design.md`; component guidance lives beside the reusable component. Existing technical contracts and workflows retain their scope. Keep variants and parts under their reusable contract unless their behavior warrants a separate topic.

If existing placement is poor, recommend the destination, discoverability benefit, and affected links. Make a move only within the agreed scope, updating references and preserving compatibility rather than leaving a second editable copy.

| Entry path | Current registration owner | Authoring action |
| --- | --- | --- |
| Foundation or directly declared guidance chapter | [topics.json](../../../design-system/topics.json) and its referenced [page](../../../design-system/content/topics/) | Choose the appropriate group, stable ID, aliases, renderer, and source composition. Insert a foundation by its teaching relationship to its neighbors; preserve curated order rather than sorting it. |
| Reusable cross-feature pattern | [Pattern conventions](../../../design-system/patterns.md), [topics.json](../../../design-system/topics.json), and its referenced page | Use `Patterns` for shared task compositions, navigation, and behavior. Explain invariants, permitted variation, and scenario transfer rather than duplicating component contracts. |
| Reusable component chapter | [Component curation](../../../design-system/content/components/curation.json), reached through the book's component collection | Add or update the canonical family, design source, implementation owners, selected public APIs, aliases, and fixture relationships. Let the collection derive registrations; do not duplicate them in the book. |
| Component navigation | The resolved collection and other visible Components entries | Keep the visible list flat and alphabetical by display title, including directly declared entries. Verify the generated navigation rather than treating curation-file order as display order. |
| Source-document discovery | The book's `documentSources` scopes | Confirm the owner is included and not excluded. An ordinary document in an existing scope needs no individual catalog entry. |
| Repository agent entry point | The README's owning-guidance topic map and relevant existing instruction/skill links | Add or update a useful route to a new guidance owner. Link to the authoritative source; do not inject the full topic into instructions or create an instruction for every chapter. |

Use existing categories rather than inventing a family hierarchy for a single addition. Curated foundation order is an editorial decision, not an alphabetical list or a permanent sequence copied into this skill. Suggest broader ordering improvements separately when the surrounding structure needs attention.

Keep stable semantic topic and example IDs. Preserve known document paths and renamed topic/section addresses through the supported alias mechanisms. Check hidden compatibility entries without making them visible merely to satisfy discovery.

## Design the smallest complete data/view path

Trace a comparable current topic from its owners to its consumers:

**Owned Markdown, code, and fixtures -> curated bindings -> validated adapter projection -> shared chapter blocks and headless resources -> canvas, portable output, and agent readers.**

Assign each fact once:

- Markdown owns guidance, explanations, and accessibility obligations.
- Code and tests own values, APIs, states, and behavior.
- Curation owns deliberate selection, relationships, and stable identities.
- Adapters resolve and validate source facts into the shared projection.
- Views own presentation and inspection controls, not hidden guidance or copied product defaults.

For a new authored chapter, start with the supported `guidance` renderer; specialized renderers are not arbitrary reusable page builders. A directly declared chapter's `id` and `section` must match its page ID. Select existing shared blocks when they express the lesson. Whole-section Markdown bindings should carry ordinary prose without paragraph-index reconstruction. Preserve deliberate caption or specimen bindings. For components, inspect the current reader's Overview, Usage, Accessibility, and Preview conventions and shared layout before changing headings; keep selected API declarations source-derived.

A prose chapter does not need a custom renderer. A new combination of existing blocks does not automatically need a new renderer kind. A genuinely new interaction or representation may need a small typed data extension, extraction, rendering, text equivalent, and focused tests. Design those together so that canvas-only strings or opaque visual payloads do not strand agent readers.

When reader support must change, work in the actual viewer source repository, not a generated projection or installed copy. Trace and update the real schema/validation, adapter dispatch, renderer/block registration, resource/search projection, and tests affected by that change. Inspect current indices and routers; do not guess filenames or add parallel registries. A new topic using a supported format should need content registration, not a new route implementation.

Reject missing or ambiguous bindings explicitly. Support old and new formats during a required transition before activating new metadata. Do not migrate unrelated topics merely to make the new topic possible.

## Compose the outline

Plan destinations around the reader's job before mapping them to data. Lead with approach selection, then application and examples, followed by reference and evaluation.

Link shared principles from their owner; add only the topic-specific application or scoped extension. Include anatomy, states, accessibility, and APIs where they support those decisions.

Adapt to the reader's supported layout rather than imposing a fixed heading template.

Use the supported section order, heading selections, labels, and anchors as the composition owner. Do not maintain a second independent "On this page" list. Keep detailed props, individual examples, and short callouts below the major destinations unless readers genuinely need direct navigation to them. Validate the projected and rendered outline, not only the Markdown hierarchy.

## Verify both discovery paths

Use the commands documented by the selected viewer and the repository's [validation workflow](../../../design-system/README.md#preview-and-validate-before-pushing). Resolve the actual viewer path; do not assume a legacy installation exists.

For the current viewer CLI, these commands take an explicit checkout:

```bash
node <viewer>/scripts/book.mjs list --root <checkout>
node <viewer>/scripts/book.mjs validate --root <checkout> --topics <topic-id>
node <viewer>/scripts/book.mjs read --root <checkout> --topic <topic-id>
node <viewer>/scripts/book.mjs search --root <checkout> --topic <topic-id> --query "<reader's task>"
node <viewer>/scripts/book.mjs documents --root <checkout> --query "<subject>"
node <viewer>/scripts/book.mjs read-document --root <checkout> --document <repository-relative-path>
```

Check that:

- The resolved catalog shows the right title, category, visibility, and sequence, without duplicate canonical topics.
- A human can navigate to the chapter, use its outline, and follow preserved deep links.
- A relevant task query and document lookup find the guidance; bounded topic output includes the important decisions and meaningful example explanations, not just paths or token names. If output is truncated, use the reader's supported section or limit controls and verify the missing material explicitly.
- Source links resolve to the selected checkout, not another installation's content.
- The affected chapter renders its promised sections and examples. Run the documented rendering check when composition or reader behavior changes, and inspect visual and interaction quality separately.

Use existing focused reader tests for changed extraction, sorting, routing, and failure behavior. A guidance-only skill edit needs link and editorial checks, not a product build. Report source, headless, portable-rendering, and native-canvas checks distinctly.

Follow current provider refresh instructions for structural catalog changes. Reuse the worktree's established canvas through its owner; coordinate any shared installation or reload. Saved source files, a successful projection, and a refreshed native canvas are separate delivery states.
