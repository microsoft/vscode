# Authoring design specifications

Write useful standalone Markdown, backed by actual specifications, tokens, and components. These conventions cover ownership, writing, and source checks, not extra requirements for ordinary UI changes.

For intentional guidance work, use the [design-system skill](../SKILL.md) (`/design-system author` or `/design-system review`). Read [visual topic authoring](visual-topic-authoring.md) only when adding visual teaching material or changing optional renderer composition.

## Choose the owner

| Material | Where it belongs |
| --- | --- |
| Component-specific intent, usage, pitfalls, and accessibility | `<subject>.design.md` beside the component; reuse an existing specification rather than creating a parallel owner |
| Feature behavior and cross-surface invariants | The feature's existing specification, respecting its change policy |
| Product-wide guidance with an existing owner | That existing document, instruction, or skill |
| Foundation design guidance | `.github/skills/design-system/foundations/<subject>.design.md`; link to product definitions rather than placing guidance in registry folders |
| Reusable cross-feature compositions and interaction contracts | `.github/skills/design-system/patterns/<subject>.design.md`; follow [pattern conventions](pattern-authoring.md) and link to existing authoritative contracts |
| Example-specific explanations and captions | Beside the owning examples or foundation; keep specimen labels and controls out of general design rules |
| Cross-cutting design guidance without a narrower owner | The owning foundation or pattern directory; existing instruction and workflow documents retain their scope |
| Images and other specification assets | Beside the owning shared or component specification |
| Topic identity, readiness, chapter presentation, specimens, and component relationships | The owning specification's front matter; keep only choices that cannot be derived from its Markdown or product source |
| Token values, APIs, and executable behavior | Product code and tests |
| Actual interactive examples | The existing component-fixture infrastructure |
| Layout, playback controls, and explanatory diagram mechanics | The external viewer repository, outside product documentation contributions |

Keep component specifications beside their implementation and shared foundations and patterns in their respective directories. Discovery derives kinds and readiness from their front matter.

A viewer consumes product-owned guidance and metadata; it does not supply their source of truth. Product documentation must be usable without installing or modifying a viewer.

Existing document boundaries still apply. For example, a feature's state-ownership specification should not acquire row-styling instructions if its change policy excludes them. Add a separate focused document only when there is a real missing body of guidance.

## Write intent, not a parallel implementation

Explain when to choose a pattern, why it exists, what must remain true, and where an exception applies. Prefer links to real component APIs and examples over hand-maintained copies of complete signatures or numeric tables.

Keep each rule in one authoritative place. When a rule changes owners, update its references in the same change rather than leaving two independently editable copies.

Example headings should name a reusable pattern or design decision. Lead with purpose, applicability, and constraints rather than widget anatomy, diagram mechanics, or sample labels. Keep task-specific walkthroughs and approval questions in the task conversation.

### Separate guidance from captions

Read the surrounding guidance before changing its copy. Keep a consistent sequence of decision, guidance, then example across sibling topics. Captions describe what an example demonstrates, not rules that should have preceded it.

General guidance and captions must remain useful if sample content changes. Explain what to choose, why it helps, and what to preserve without narrating dummy labels or preview controls.

## Name files and topics

- Use descriptive lowercase kebab-case for new page, content, module, and script filenames.
- Use `<subject>.design.md` for authored design specifications, with a descriptive lowercase kebab-case name: `button.design.md`, `input-box.design.md`, `count-badge.design.md`, `motion.design.md`, and `typography.design.md`. Components stay beside their code; shared foundations and patterns live in their respective directories under `.github/skills/design-system/`.
- Keep the repository README and the design-system skill as entry points. Instructions, skills, and authored example explanations retain their existing formats rather than acquiring a design-spec suffix.
- Derive shared topic identity from its stable filename unless a documented compatibility requirement needs an explicit `id`. Do not encode display order, renderer implementation, dates, or draft status in IDs.
- Put readiness, search aliases, and optional editorial order in the specification's front matter.
- Group authored content by subject, not by the agent or task that produced it.
- Use ordinary Markdown for prose and the specification's front matter for structured choices that cannot be derived from source. Do not hide application code or serialized HTML inside metadata.
- Use sentence-case headings that describe the reader's task or decision.
- Do not create placeholder files for topics that have no authored content.

### Change guidance with its owner

Explain when to use a component or pattern, the mistakes to avoid, accessibility obligations, and any scoped exceptions that the API alone cannot communicate. Link to implemented values and signatures rather than copying them. Existing repository requirements remain authoritative; a filename does not promote draft or local guidance into a universal rule.

Edit the owning Markdown once and review it with the relevant component or foundation maintainers. A prose edit should not require a viewer change. Update front matter or anchors only when the chapter's selected sections change. Keep agent procedures and decisive instruction rules at their existing entry points, with links to the design specification; do not thin a skill merely to regularize filenames.

When renaming a specification, update inbound Markdown links, `$text` file references, and affected source tests together. Keep topic and example IDs stable. Do not keep path aliases or a second editable copy at the old location; repository links are the compatibility contract. Consumer-specific adaptations belong in the consuming project.

### Component references

Code-local specifications with `kind: "component"` identify reusable building blocks, including composed controls. Keep the guidance beside the implementation; fixtures and API selections are optional.

Explain non-obvious activation, state, accessibility, and disposal advice in ordinary Markdown. Link to the owning source instead of copying its API inventory.

Read [component bindings](visual-topic-authoring.md#component-bindings) only when adding or changing an optional API or fixture projection.

## Optional presentation

A useful specification needs no `presentation`, `specimens`, or renderer-specific anchors. Use [visual topic authoring](visual-topic-authoring.md) only for intentional visual teaching or [renderer composition](visual-topic-authoring.md#optional-renderer-composition) changes.

## Preserve evidence boundaries

An extracted value describes this checkout. A fixture demonstrates the component or composition it actually renders. An authored recommendation expresses design intent. Adoption requires evidence and an explicit scope. These are related but not interchangeable; source-backed presentation must not turn observations into recommendations.

- Do not promote incidental CSS values into universal design rules.
- Do not label every observed implementation as recommended.
- Question gaps, duplicated roles, and unnecessary parameters in a catalog; exhaustive extraction doesn't prove a coherent foundation.
- State applicability for draft, deprecated, feature-specific, or intentionally exceptional guidance.
- Distinguish missing documentation from unsupported extraction or an unavailable preview.
- Keep coverage diagnostics out of the main reading flow unless they affect the reader's decision.
- Local documents do not automatically override product-wide instructions; exceptions need explicit scope.

## Add or update an example

A worked scenario, a source link, or a small code example can teach a decision without an interactive preview.

When adding an interactive example, reuse the real component and its existing fixture. Follow [visual topic authoring](visual-topic-authoring.md) for the applicable representation and rendering checks.

## Verify the change

1. Check the owning source and its guidance for consistency.
2. Check links, anchors, and referenced source sections.
3. When metadata, placement, or source bindings change, run `node .github/skills/design-system/scripts/validate.mts`. Use `--list` only when a specification inventory helps.
4. Read the Markdown to confirm its decisions and examples remain understandable without a viewer.
5. If an interactive example changed, use its existing fixture checks, including keyboard and reduced-motion behavior where relevant.

External viewer checks are optional and separate. Do not use a successful screenshot or an extracted value as proof of product-wide adherence.
