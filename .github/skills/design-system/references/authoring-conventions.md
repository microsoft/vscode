# Authoring the design-system book

The book is a human-first design reference, not a rendered instruction file. Explain choices through concise guidance and useful visualizations, backed by the actual specifications, tokens, and components. Keep complete source documents available through the document library and source links.

For writing, improving, or reviewing a topic's guidance, use the [design-system skill](../SKILL.md) (`/design-system author` or `/design-system review`). It covers decision-led structure, concise rules, accessibility, and evaluation. This document continues to own content placement and book composition.

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
| Structured curation and source bindings | `.github/skills/design-system/content/`; keep only relationships that cannot be derived from the owning sources |
| Chapter composition and example bindings | `.github/skills/design-system/content/topics/`; each page composes one discovered specification |
| Token values, APIs, and executable behavior | Product code and tests |
| Actual interactive examples | The existing component-fixture infrastructure |
| Layout, playback controls, and explanatory diagram mechanics | The canvas package's `view/`; only renderer implementation documentation belongs in that package |

Keep component specifications beside their implementation and shared foundations and patterns in their respective directories. Discovery derives kinds and readiness from their front matter. One chapter can compose several sources; one source can serve several chapters.

The extension must not own product guidance, chapter data, or fixture curation. Its controllers load a validated repository projection from the selected checkout; views consume that projection rather than importing repository files. A private viewer installation must not supply a fallback book when a checkout is missing its data.

Existing document boundaries still apply. For example, a feature's state-ownership specification should not acquire row-styling instructions if its change policy excludes them. Add a separate focused document only when there is a real missing body of guidance.

### Motion ownership

[motion.design.md](../foundations/motion.design.md) owns motion rationale, pattern selection, token roles, accessibility, integration contracts, measured behavior, and validation. The page composes it with the separately authored [motion examples](../foundations/motion/examples.md). Keep implementation guidance in one owner and avoid maintaining a parallel technical contract.

Keep reusable definitions in the data-only [motionPresets.ts](../../../../src/vs/platform/theme/common/motion/motionPresets.ts) catalog, independent of legacy CSS IDs. [motionPresetBindings.ts](../../../../src/vs/platform/theme/common/motion/motionPresetBindings.ts) maps those definitions to the product-backed semantic duration/easing pairs in [motionRegistry.ts](../../../../src/vs/platform/theme/common/motionRegistry.ts). Physical inputs in [motionResponsePresets.json](../../../../src/vs/platform/theme/common/motion/motionResponsePresets.json) and their compiled [motionResponses.ts](../../../../src/vs/platform/theme/common/motion/motionResponses.ts) are optional authoring studies, not runtime defaults. The book projects these sources rather than maintaining another numerical table. Properties, geometry, semantic state, focus, presence, interruption, and disposal still require component-owned design and implementation.

Use [the chapter's presentation copy](../foundations/motion/examples.md) for short explanations and separately bound captions. Resolve it through the same `$text` bindings used elsewhere in the book. Keep computed values and executable behavior in product sources, not in presentation copy. Technical contracts, validation procedures, agent workflows, and analysis records stay in their source documents rather than becoming primary chapter sections. Product players expose reduced motion beside playback. Explanatory timing and curve diagrams have playback controls, not a product-preference comparison switch.

The [motion-design skill](../../motion-design/SKILL.md) runs the generate, check, and validate workflow. Book controls and slow playback support inspection; they don't establish product-host performance or human suitability. Preserve real persistence, including notification auto-hide, instead of changing lifecycle for easier inspection.

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

Curate motion examples by distinct decisions, not component count. Each product pattern explains when to use it, what must stay immediate or still, and how to evaluate interruption and the reduced alternative. Prefer one complete scenario over several interchangeable controls. Keep parameter studies after the purpose decision, and do not invent five usage categories merely because a ramp has five values. Treat existing choreography as scoped evidence, not a recommendation to reuse its individual effects.

## Name files and topics

- Use descriptive lowercase kebab-case for new page, content, module, and script filenames.
- Use `<subject>.design.md` for authored design specifications, with a descriptive lowercase kebab-case name: `button.design.md`, `input-box.design.md`, `count-badge.design.md`, `motion.design.md`, and `typography.design.md`. Components stay beside their code; shared foundations and patterns live in their respective directories under `.github/skills/design-system/`.
- Keep the repository README and the design-system skill as entry points. Instructions, skills, and authored example explanations retain their existing formats rather than acquiring a design-spec suffix.
- Derive shared topic identity from its stable filename unless a documented compatibility requirement needs an explicit `id`. Do not encode display order, renderer implementation, dates, or draft status in IDs.
- Put readiness, aliases, legacy source paths, and optional editorial order in the specification's front matter. Preserve old deep links when a topic is renamed or consolidated.
- Group authored content by subject, not by the agent or task that produced it.
- Use ordinary Markdown for prose and JSON for structured catalog data and bindings. Do not hide application code or serialized HTML inside content files.
- Use sentence-case headings that describe the reader's task or decision.
- Do not create placeholder files for topics that have no authored content.

### Change guidance with its owner

Explain when to use a component or pattern, the mistakes to avoid, accessibility obligations, and any scoped exceptions that the API alone cannot communicate. Link to implemented values and signatures rather than copying them. Existing repository requirements remain authoritative; a filename does not promote draft or local guidance into a universal rule.

Edit the owning Markdown once and review it with the relevant component or foundation maintainers. A prose edit should not require a viewer change. Update book bindings only when the chapter's selected sections change. Keep agent procedures and decisive instruction rules at their existing entry points, with links to the design specification; do not thin a skill merely to regularize filenames.

When renaming a specification, update inbound Markdown links, JSON bindings, and filename-dependent reader tests together. Keep topic and example IDs stable. Preserve old specification paths through front-matter `legacyPaths`; retain document aliases for non-spec source files in the document-path compatibility data. Do not leave a second editable copy at the old location. Ordinary authoring needs no alias or chapter entry.

The book composes repository Markdown through `$text` or section bindings. Keep `.design.md` sources outside `content/topics/` and `content/`, which contain composition data rather than product guidance.

### Component references

The book declares one component collection. [Component curation](../content/components/curation.json) owns family names, aliases, implementation owners, selected APIs, and fixture relationships. The specification's front matter owns whether a component is a primitive or composite; discovery derives those views from specs rather than requiring a hand-maintained component inventory.

Declare a component's `design` document once and select APIs by public `Type.member` names or an exported function name. The reader takes the title and Overview, Usage, Accessibility, and Preview sections from that Markdown by convention. It derives types, optionality, declarations, and source locations from TypeScript, including source-inferred types. Inherited declarations must be reachable through the listed owners. Missing, private, ambiguous, or unsupported selections fail explicitly; there is no hand-maintained reference JSON to repair.

Keep non-obvious activation, state, accessibility, and disposal advice in the design document, not a copied API-purpose column. Usage and Accessibility support ordinary Markdown and source-relative links. The shared component layout owns Usage, Preview, Accessibility, and API order; its page does not declare a competing section map. Qualification and preview availability remain separate from source-document discovery.

### Foundation composition

A foundation page declares its primary `source` once. The reader uses that document's Introduction and complete selected sections. `content` holds only structured specimen choices and labels, not another introduction or prose section database:

```json
{
	"source": ".github/skills/design-system/foundations/typography.design.md",
	"content": {},
	"sections": [
		{ "id": "typography-emphasis", "key": "emphasis", "heading": "Weight and emphasis" }
	]
}
```

The complete page must retain its renderer's required specimens and section keys. Section order controls composition; `label` can provide a shorter outline label, and `aliases` preserve earlier chapter anchors. Additional prose-only sections use `guidance` bindings, which default to the page's source. Do not copy their order into a second outline map. Changing paragraphs under an existing heading requires no metadata edit.

Use `{ "$text": "Heading" }` for specimen copy from the scoped source. An explicit `$text` object can select another document or a genuinely necessary caption/lead paragraph. Elevation retains those deliberate diagram relationships; ordinary sections should not reconstruct prose with paragraph indices. Structured curation can declare `textSource` for the same shorthand. Missing sources and ambiguous headings fail rather than falling back to copied prose.

Motion retains its richer section, token/preset, and example composition because those relationships are deliberate editorial choices. Its `source` owns design guidance; `textSource` scopes the example explanations. Both use the same source resolver.

When rolling out a new binding form, install a reader that accepts both formats before activating product metadata. Keep live topics and old books readable during the transition.

## Compose a chapter

Start with the decision the reader needs to make, demonstrate it, then provide the detailed reference. Use the existing logical renderer kinds and visual blocks; add a new kind only for a genuinely different presentation.

The foundation sequence introduces philosophy, accessibility, content, and design tokens, then groups typography and color, layout and geometry, and imagery and motion. Patterns follow Foundations and teach reusable task compositions through the [pattern conventions](pattern-authoring.md). Component chapters follow Patterns in alphabetical order; the Source library remains a separate utility. Use front-matter `order` only when editorial placement must be preserved; keep derived topic IDs and deep links stable when changing the reading order.

Use the shared article frame and book typography for explanations: one chapter title, major sections, then nested subheadings. Product specimens retain their source-defined typography and geometry. Keep prose, headings, and examples on the same left edge, with comfortable line lengths and more space between sections than within them. Put prerequisite guidance before the reference it explains; supporting source excerpts can follow the examples. A guidance binding can name a rendered section ID with `before` to place the excerpt there. A missing target fails explicitly. Source links belong after the chapter, not beside its title.

Reference chapters use normal page scrolling, including expanded token domains. Do not constrain the entire article to a viewport height or clip it to make an inventory fit. A bounded catalog such as the icon browser may own a separately labeled, keyboard-focusable scrolling region without constraining the surrounding article. Multi-section chapters have an outline in reading order; links into collapsed reference groups open those groups.

Explanatory lists and extended examples read vertically. Reserve columns for compact, equivalent specimens or explicit comparisons, and let them collapse when the article cannot fit both. Base a specimen's reflow on its available container space rather than assuming a wide window means a wide article.

Reference actual source sections instead of copying their prose into a page definition. Keep source paths repository-relative and use stable headings or supported explicit anchors. Heading-based bindings need unique slugs across the source document; preserve existing slugs when practical, and update page bindings when sections move or change roles. A missing reference should produce an actionable failure, not an empty successful chapter.

A page definition controls composition. It must not become a second token registry, a source-code snapshot, or an arbitrary executable page builder.

Define further reading in the specification's `references` front matter. Each ordered `{ title, url, description }` entry needs a credential-free HTTPS URL and a specific reason to read beyond this topic. Prefer one to three authoritative links when useful. Keep contextual links with their owners and never scrape Markdown, skills, imports, or dependencies into reading lists.

### Bind prose to a visual reference

Use an existing chapter as the starting point. For example, [Typography's page](../content/topics/typography.json) selects its renderer and structured content, while [its Markdown](../foundations/typography.design.md) owns the authored specimen explanations.

A page declares `version: 1`, its stable topic `id`, and its logical `renderer`. The adapter produces the normalized authored chapter; contributors do not maintain a separate `content/foundations/<topic>.json` projection. A `$text` binding reads a named section from the scoped Markdown source:

```json
{
	"$text": {
		"heading": "Hierarchy in practice"
	}
}
```

Whole sections are the default. Use `list: true` only for an explicitly flat list, or `paragraph` only for a deliberate lead/caption whose position is part of the composition. Heading references must be unambiguous. Refer to an existing product or instruction document when it already owns the text. The adapter derives `markdownSource` for relative links from the page's `source`; additional contributing documents belong in `sources`.

[Motion's page](../content/topics/motion.json) demonstrates the richer composition format: it references heading slugs from the specification and binds them to guidance, paired timing, presets, and examples. Its adapter normalizes authored sections for the shared article frame. Composition must follow the design guidance, not force new concepts into the existing duration, easing, or property galleries. Keep supported block types explicit rather than allowing arbitrary scripts in content.

Authored text and page sources participate in topic refresh. Catalog structure and static fixture metadata currently require an extension reload; do not present a stale navigation index as a successful live catalog update.

Guidance-only chapters, such as [Illustration](../content/topics/illustration.json), use the shared article frame and `guidance` section bindings. Keep the introduction in its owning Markdown, bind it through `$text`, and select the remaining sections without copying prose or adding page-specific chrome.

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
2. Run `node .github/skills/design-system/scripts/validate.mts --list` to inspect derived paths, titles, kinds, and readiness; run the validator without `--list` to validate metadata, composition, and source references.
3. Run the viewer's focused rendering check when changing chapter composition or reader behavior.
4. Run focused content or reader tests for changed extraction and failure behavior.
5. Open the affected chapter and inspect its actual intended state.
6. Exercise changed interactions, including keyboard and reduced-motion behavior when relevant.
7. Confirm saved content updates without losing the reader's place or unrelated preview state.

Do not use a successful screenshot or an extracted value as proof of product-wide adherence. Keep current guidance usable even when an optional preview cannot run.
