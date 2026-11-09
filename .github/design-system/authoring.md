# Authoring the design-system book

The book is a human-first design reference, not a rendered instruction file. Explain choices through concise guidance and useful visualizations, backed by the actual specifications, tokens, and components. Keep complete source documents available through the document library and source links.

## Choose the owner

| Material | Where it belongs |
| --- | --- |
| Component-specific intent, usage, and accessibility | An existing specification beside the component, or a focused new Markdown document there |
| Feature behavior and cross-surface invariants | The feature's existing specification, respecting its change policy |
| Product-wide guidance with an existing owner | That existing document, instruction, or skill |
| Foundation guidance and example descriptions | Beside the owning registry or implementation; cross-cutting material without a narrower owner goes in `.github/design-system/guidance/` |
| Structured curation and source bindings | `.github/design-system/content/`; prose is referenced from its owning Markdown, not copied here |
| Topic order, aliases, content references, and example bindings | `.github/design-system/book.json` and `.github/design-system/pages/` |
| Token values, APIs, and executable behavior | Product code and tests |
| Actual interactive examples | The existing component-fixture infrastructure |
| Layout, playback controls, and explanatory diagram mechanics | The canvas package's `view/`; only renderer implementation documentation belongs in that package |

Do not move code-local specifications merely to make the table of contents resemble the filesystem. One chapter can compose several sources; one source can serve several chapters.

The extension must not own product guidance, chapter data, or fixture curation. Its controllers load a validated repository projection from the selected checkout; views consume that projection rather than importing repository files. A private viewer installation must not supply a fallback book when a checkout is missing its data.

Existing document boundaries still apply. For example, a feature's state-ownership specification should not acquire row-styling instructions if its change policy excludes them. Add a separate focused document only when there is a real missing body of guidance.

### Motion ownership

[MOTION.md](../../src/vs/platform/theme/common/motion/MOTION.md) owns the motion foundation, [preset contract](../../src/vs/platform/theme/common/motion/MOTION.md#preset-contract), and [authoring method](../../src/vs/platform/theme/common/motion/MOTION.md#authoring-and-validation). The chapter presents Principles, Foundations, Best practices, and Accessibility. Select the human-relevant guidance and visualize the source values; don't mirror the specification's entire heading tree.

Keep reusable definitions in the data-only [motionPresets.ts](../../src/vs/platform/theme/common/motion/motionPresets.ts) catalog, independent of legacy CSS IDs. [motionPresetBindings.ts](../../src/vs/platform/theme/common/motion/motionPresetBindings.ts) maps those definitions to product token defaults. [motionResponsePresets.json](../../src/vs/platform/theme/common/motion/motionResponsePresets.json) owns physical inputs; its compiler generates the paired timing in [motionResponses.ts](../../src/vs/platform/theme/common/motion/motionResponses.ts). The book projects those sources, including generated `responsive` and `settled` pairs, not a second derivation or copied numerical table. Properties, geometry, semantic state, focus, presence, interruption, and disposal still require component-owned design and implementation.

Use [the chapter's presentation copy](../../src/vs/platform/theme/common/motion/motion-examples.md) for short explanations and separately bound captions. Resolve it through the same `$text` bindings used elsewhere in the book. Keep computed values and executable behavior in product sources, not in presentation copy. Technical contracts, validation procedures, agent workflows, and analysis records stay in their source documents rather than becoming primary chapter sections. Product players expose reduced motion beside playback. Explanatory timing and curve diagrams have playback controls, not a product-preference comparison switch.

The [motion-design skill](../skills/motion-design/SKILL.md) runs the generate, check, and validate workflow. Book controls and slow playback support inspection; they don't establish product-host performance or human suitability. Preserve real persistence, including notification auto-hide, instead of changing lifecycle for easier inspection.

## Write intent, not a parallel implementation

Explain when to choose a pattern, why it exists, what must remain true, and where an exception applies. Prefer links to real component APIs and examples over hand-maintained copies of complete signatures or numeric tables.

The renderer should project values from code. Authored metadata can select relevant APIs and validate their source anchors, but it must not silently invent a missing API or substitute a stale value.

Keep each rule in one authoritative place. When a rule changes owners, update its references in the same change rather than leaving two independently editable copies.

Example headings should name a reusable pattern or design decision. Lead with purpose, applicability, and constraints rather than widget anatomy, diagram mechanics, or sample labels. Keep reading aids in the visualization's accessible description and implementation details in optional references. Each pattern's reference example has one primary home; attach optional inspection there instead of duplicating a gallery for validation. Keep task-specific walkthroughs and approval questions in the task conversation. For motion, use terms such as *approach*, *response*, and *curve*; reserve *model* for AI models in product-facing guidance.

### Separate guidance from captions

Read the complete chapter composition before changing its copy. Keep a consistent sequence of decision, guidance, then example across sibling topics; move misplaced guidance to its owning decision rather than appending another paragraph. Captions describe what the example demonstrates, not rules that should have preceded it. Raw motion-token inventories belong in Design tokens; motion guidance teaches scenario selection and connects recommendations to product examples, each with one primary home.

General guidance and captions must remain useful if the example's sample content changes. Explain what to choose, why it helps, which principle it supports, and what to preserve. Do not narrate dummy labels, feature names, or individual choices in the specimen. Captions explain the observable design relationship, not how to operate the player. Put playback help in accessible control names and descriptions, separate from guidance. For example, “Only the selection indicator travels; labels and hit targets remain stable” explains the pattern without depending on a particular set of choices.

Match the example's complexity to the idea. A single-property study should isolate that property; a product pattern should demonstrate the actual component and its complete interaction. Do not use implementation provenance, a successful render, or numerical correctness as a substitute for checking whether the example visibly teaches its stated point.

Duration studies compare the same change and pacing at explicit, source-resolved times. Explain the timing choices and their uses without turning the section into a tutorial on layout, presence, or choreography. Keep product players with those patterns; if no matching product example exists, use a clearly labeled timing study rather than attaching an unrelated component. Distinguish an observed product timing from a starting point for a new behavior.

Use real components for recognizable product controls, not look-alikes built in the book's CSS. Abstract diagrams should be unmistakably diagrams. Foundations explain element-level choices and reusable composition patterns such as layout, presence, and content replacement. Best practices explain the intent-first decision process and reference those foundations instead of repeating their players. Keep expression and delight visible as a deliberate intent, not a collapsed miscellaneous gallery.

## Name files and topics

- Use descriptive lowercase kebab-case for new page, content, module, and script filenames.
- Keep `README.md` as the package entry point and preserve existing product specification names.
- Use a topic's stable semantic ID for its page filename. Do not encode display order, renderer implementation, dates, or draft status in IDs.
- Preserve aliases and old deep links when a topic is renamed or consolidated.
- Group authored content by subject, not by the agent or task that produced it.
- Use ordinary Markdown for prose and JSON for structured catalog data and bindings. Do not hide application code or serialized HTML inside content files.
- Use sentence-case headings that describe the reader's task or decision.
- Do not create placeholder files for topics that have no authored content.

## Compose a chapter

Start with the decision the reader needs to make, demonstrate it, then provide the detailed reference. Use the existing logical renderer kinds and visual blocks; add a new kind only for a genuinely different presentation.

The foundation sequence moves from philosophy to composition (layout, spacing, and typography), visual language (color, theming, shape, elevation, and stroke), detail (size and iconography), motion, and token lookup. Component chapters follow the foundations; guidance ends with the documentation library. Keep topic IDs and deep links stable when changing the reading order.

Use the shared article frame and book typography for explanations: one chapter title, major sections, then nested subheadings. Product specimens retain their source-defined typography and geometry. Keep prose, headings, and examples on the same left edge, with comfortable line lengths and more space between sections than within them. Put prerequisite guidance before the reference it explains; supporting source excerpts can follow the examples. A guidance binding can name a rendered section ID with `before` to place the excerpt there. A missing target fails explicitly. Source links belong after the chapter, not beside its title.

Reference chapters use normal page scrolling, including expanded token domains. Do not constrain the entire article to a viewport height or clip it to make an inventory fit. A bounded catalog such as the icon browser may own a separately labeled, keyboard-focusable scrolling region without constraining the surrounding article. Multi-section chapters have an outline in reading order; links into collapsed reference groups open those groups.

Explanatory lists and extended examples read vertically. Reserve columns for compact, equivalent specimens or explicit comparisons, and let them collapse when the article cannot fit both. Base a specimen's reflow on its available container space rather than assuming a wide window means a wide article.

Reference actual source sections instead of copying their prose into a page definition. Keep source paths repository-relative and use stable headings or supported explicit anchors. Heading-based bindings need unique slugs across the source document; preserve existing slugs when practical, and update page bindings when sections move or change roles. A missing reference should produce an actionable failure, not an empty successful chapter.

A page definition controls composition. It must not become a second token registry, a source-code snapshot, or an arbitrary executable page builder.

### Bind prose to a visual reference

Use an existing chapter as the starting point. For example, [Typography's page](pages/typography.json) selects its renderer and structured content, while [its Markdown](../../src/vs/platform/theme/common/sizes/typography.md) owns the authored specimen explanations.

Structured chapter content declares `version: 1`, its topic `id`, and `status: "book-authored"` (an authorship marker, not a package location or approval status). A `$text` binding reads a named section from a repository-relative Markdown source:

```json
{
	"$text": {
		"file": "src/vs/platform/theme/common/sizes/typography.md",
		"heading": "Hierarchy and reading rhythm",
		"paragraph": 0
	}
}
```

Omit `paragraph` to read the whole section. Use `list: true` for a section containing a Markdown bullet list. Heading references must be unambiguous; paragraph indices are zero-based and must be updated when the referenced section is reorganized. Refer to an existing product or instruction document instead when it already owns the desired text.

[Motion's page](pages/motion.json) demonstrates the richer composition format: it references heading slugs from the product specification and binds them to guidance, paired timing, presets, and examples. Its adapter normalizes authored sections for the shared article frame. Composition must follow the design guidance, not force new concepts into the existing duration, easing, or property galleries. Keep supported block types explicit rather than allowing arbitrary scripts in content.

Authored text and page sources participate in topic refresh. Catalog structure and static fixture metadata currently require an extension reload; do not present a stale navigation index as a successful live catalog update.

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

Reuse the real component and its existing fixture when possible. Keep feature state and behavior in the fixture, not in a canvas imitation. Preserve variants, keyboard interaction, focus, high-contrast behavior, reduced motion, and the component's normal lifecycle.

Explanatory diagrams may remain in the viewer. Parameterize them with source-defined values where appropriate, and do not present their illustrative geometry as a shipped product default.

A book player can pause or reset an example without making those controls part of the product widget's contract.

An example must establish its context before playback: show its trigger, surrounding content, or a representative still state. Use authentic product components or their owned rendering helpers, and choose sample data that reflects an actual product scenario. Abstract diagrams can explain timing or properties, but a fabricated feature is not evidence of product usage. Keep product scenes on a consistent viewport and inset, preserving intentional anchors such as a menu's trigger or a notification's edge.

Check a product specimen against the real product before changing its motion. Reuse an existing full-renderer fixture when layout depends on ancestry, data shape, or neighboring content. Missing gutters, malformed sample data, or a clipped host are fixture defects, not evidence that the product needs a redesign; do not lower the product baseline to fit the example.

## Verify the change

1. Check the owning source and its guidance for consistency.
2. Validate page bindings, topic identities, and source references.
3. Run focused content or reader tests for changed extraction and failure behavior.
4. Open the affected chapter and inspect its actual intended state.
5. Exercise changed interactions, including keyboard and reduced-motion behavior when relevant.
6. Confirm saved content updates without losing the reader's place or unrelated preview state.

Do not use a successful screenshot or an extracted value as proof of product-wide adherence. Keep current guidance usable even when an optional preview cannot run.
