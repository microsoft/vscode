# Authoring design specifications

Write useful standalone Markdown, backed by actual specifications, tokens, and components. External viewers may render these documents and their optional presentation metadata; product work does not depend on those viewers.

For intentional guidance work, use the [design-system skill](../SKILL.md) (`/design-system author` or `/design-system review`). These conventions cover content placement and optional presentation metadata, not extra requirements for ordinary UI changes.

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

Keep component specifications beside their implementation and shared foundations and patterns in their respective directories. Discovery derives kinds and readiness from their front matter. One chapter can compose several sources; one source can serve several chapters.

Keep authored choices in the owning specification's front matter: presentation, specimens, section labels, fixture relationships, and design references. Derive topic inventories from that metadata, chapter outlines from the specification's headings, and token values and groups from product sources. Do not maintain a separate registry, topic list, or list of expected headings.

A viewer consumes product-owned guidance and metadata; it does not supply their source of truth. Product documentation must be usable without installing or modifying a viewer.

Existing document boundaries still apply. For example, a feature's state-ownership specification should not acquire row-styling instructions if its change policy excludes them. Add a separate focused document only when there is a real missing body of guidance.

## Write intent, not a parallel implementation

Explain when to choose a pattern, why it exists, what must remain true, and where an exception applies. Prefer links to real component APIs and examples over hand-maintained copies of complete signatures or numeric tables.

The renderer should project values from code. Authored metadata can select relevant APIs and validate their source anchors, but it must not silently invent a missing API or substitute a stale value.

Keep each rule in one authoritative place. When a rule changes owners, update its references in the same change rather than leaving two independently editable copies.

Example headings should name a reusable pattern or design decision. Lead with purpose, applicability, and constraints rather than widget anatomy, diagram mechanics, or sample labels. Keep reading aids in the visualization's accessible description and implementation details in optional references. Each pattern's reference example has one primary home; attach optional inspection there instead of duplicating a gallery for validation. Keep task-specific walkthroughs and approval questions in the task conversation.

### Separate guidance from captions

Read the complete chapter composition before changing its copy. Keep a consistent sequence of decision, guidance, then example across sibling topics; move misplaced guidance to its owning decision rather than appending another paragraph. Captions describe what the example demonstrates, not rules that should have preceded it.

General guidance and captions must remain useful if the example's sample content changes. Explain what to choose, why it helps, which principle it supports, and what to preserve. Do not narrate dummy labels, feature names, or individual choices in the specimen. Captions explain the observable design relationship, not how to operate the player. Put playback help in accessible control names and descriptions, separate from guidance. For example, “Only the selection indicator travels; labels and hit targets remain stable” explains the pattern without depending on a particular set of choices.

Match the example's complexity to the idea. A single-property study should isolate that property; a product pattern should demonstrate the actual component and its complete interaction. Do not use implementation provenance, a successful render, or numerical correctness as a substitute for checking whether the example visibly teaches its stated point.

Use real components for recognizable product controls, not look-alikes built in the book's CSS. Abstract diagrams should be unmistakably diagrams.

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

External readers may compose chapters from specifications: anchored headings can bind visual sections, `$text` references can supply specimen copy, and remaining sections can render as guidance. Product documentation remains complete as Markdown; no separate composition directory is required.

### Component references

External readers may derive their component collection from code-local specifications with `kind: "component"`, including controls composed from other controls. A specification's `component` front matter names its `implementation`, any `relatedSources`, selected `api` members, live `fixtures`, and an optional Figma `designReference`. `aliases` can add search names, such as variants within the family. Classification comes only from the specification; fixtures supply optional examples. No separate component inventory is required.

Keep the specification beside its implementation and select APIs by public `Type.member` names or an exported function name. Product validation checks binding syntax and configured source paths; it does not resolve TypeScript declarations. External renderers may derive types, optionality, declarations, and source locations from TypeScript, including source-inferred types, and may report missing, private, ambiguous, or unsupported selections. An external renderer may also require inherited declarations to be reachable through the listed owners; there is no hand-maintained reference JSON to repair.

Keep non-obvious activation, state, accessibility, and disposal advice in the design document, not a copied API-purpose column. Usage and Accessibility support ordinary Markdown and source-relative links. An external reader may provide a shared component layout that sets Usage, Preview, Accessibility, and API order; documentation remains complete without it. Reader qualification and preview availability are separate from source-document discovery.

### Foundation composition

A foundation's front matter selects a visual `presentation` when its chapter needs one: `typography`, `foundations`, `theming`, `icons`, `motion`, or `tokens`. Without one, external readers may render the chapter as guidance using its Introduction and selected sections. `specimens` holds only structured sample choices and labels, not another introduction or prose section database:

```yaml
presentation: "typography"
specimens:
  composition:
    - - "fontSize.body1"
      - $text: "Hierarchy in practice"
sectionCopy:
  emphasis:
    label: "Emphasis"
```

A visual presentation binds each section it requires through an anchor immediately before the owning heading, such as `<a id="typography-emphasis"></a>` before `## Weight and emphasis`. A missing required section fails explicitly. Markdown order controls composition. `sectionCopy.<key>.label` provides a shorter outline label, and `title` replaces the rendered heading only when necessary. Further anchors before the same heading preserve earlier chapter links. Other level-two headings render as guidance where they appear, except headings consumed as specimen copy. When another heading carries an anchor, only anchored headings become guidance; this keeps reference detail in the specification without adding it to the chapter. Changing paragraphs under an existing heading requires no metadata edit.

Set `tokenDomain: true` when the specification owns a group of product tokens. The Design tokens reference then lists the group whose ID matches the specification's ID. Token values and groups come from product definitions; an undeclared group is reported rather than hidden.

Use `$text: "Heading"` for specimen copy from the same specification. A `$text` object can select another Markdown `file` or a genuinely necessary caption/lead `paragraph`. Elevation retains those deliberate diagram relationships; ordinary sections should not reconstruct prose with paragraph indices. Missing sources and ambiguous headings fail rather than falling back to copied prose.

Keep essential guidance in Markdown when adding optional binding metadata. Support for new presentations belongs to external readers and does not gate product documentation.

## Compose a chapter

For an optional rendered reference, start with the reader's decision, demonstrate it, then provide detail. Renderer implementation and validation follow the external viewer's workflow.

The foundation sequence introduces design principles, accessibility, content, and design tokens, then groups typography and color, layout and geometry, and imagery and motion. Patterns follow Foundations and teach reusable task compositions through the [pattern conventions](pattern-authoring.md). Component chapters follow Patterns in alphabetical order; the Source library remains a separate utility. Use front-matter `order` only when editorial placement must be preserved; keep derived topic IDs and deep links stable when changing the reading order.

Use the shared article frame and book typography for explanations: one chapter title, major sections, then nested subheadings. Product specimens retain their source-defined typography and geometry. Keep prose, headings, and examples on the same left edge, with comfortable line lengths and more space between sections than within them. Put prerequisite guidance before the reference it explains; supporting source excerpts can follow the examples. Guidance sections keep their Markdown position relative to visual sections, so order the specification the way the chapter should read. Source links belong after the chapter, not beside its title.

Reference chapters use normal page scrolling, including expanded token domains. Do not constrain the entire article to a viewport height or clip it to make an inventory fit. A bounded catalog such as the icon browser may own a separately labeled, keyboard-focusable scrolling region without constraining the surrounding article. Multi-section chapters have an outline in reading order; links into collapsed reference groups open those groups.

Explanatory lists and extended examples read vertically. Reserve columns for compact, equivalent specimens or explicit comparisons, and let them collapse when the article cannot fit both. Base a specimen's reflow on its available container space rather than assuming a wide window means a wide article.

Reference actual source sections instead of copying their prose into front matter. Keep source paths repository-relative and use stable headings or supported explicit anchors. Heading-based bindings need unique slugs across the source document; preserve existing slugs when practical, and update anchors and `$text` references when sections move or change roles. A missing reference should produce an actionable failure, not an empty successful chapter.

Front matter selects composition. It must not become a second token registry, a source-code snapshot, or an arbitrary executable page builder.

Define further reading in the specification's `references` front matter. Each ordered `{ title, url, description }` entry needs a credential-free HTTPS URL and a specific reason to read beyond this topic. Prefer one to three authoritative links when useful. Keep contextual links with their owners and never scrape Markdown, skills, imports, or dependencies into reading lists.

### Bind prose to a visual reference

Use an existing chapter as the starting point. For example, [Typography](../foundations/typography.design.md) selects its presentation and specimens in front matter, while its Markdown owns the authored specimen explanations. The adapter produces the normalized authored chapter; contributors do not maintain a separate page or projection file. A `$text` reference reads a named section from the specification:

```yaml
$text:
  heading: "Hierarchy in practice"
```

Whole sections are the default. Use `list: true` only for an explicitly flat list, or `paragraph` only for a deliberate lead/caption whose position is part of the composition. Heading references must be unambiguous. Set `file` to read an existing product or instruction document that already owns the text. Relative links resolve from the specification.

[Elevation](../foundations/elevation.design.md) demonstrates the richer composition format: its anchors and specimens bind the specification's sections to guidance, construction diagrams, and scenario examples. Composition must follow the design guidance, not force new concepts into existing galleries. Keep supported block types explicit rather than allowing arbitrary scripts in content.

Viewer refresh and installation follow the viewer repository's workflow, separately from documentation changes.

Guidance-only chapters, such as [Illustration](../foundations/illustration.design.md), omit `presentation` and use the shared article frame. The Introduction and level-two headings become the chapter without copied prose or page-specific chrome.

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

Check a product specimen against the real product before changing its behavior. Reuse an existing full-renderer fixture when layout depends on ancestry, data shape, or neighboring content. Missing gutters, malformed sample data, or a clipped host are fixture defects, not evidence that the product needs a redesign; do not lower the product baseline to fit the example.

## Verify the change

1. Check the owning source and its guidance for consistency.
2. Check links, anchors, and referenced source sections.
3. When metadata, placement, or source bindings change, run `node .github/skills/design-system/scripts/validate.mts`. Use `--list` only when a specification inventory helps.
4. Read the Markdown to confirm its decisions and examples remain understandable without a viewer.
5. If an interactive example changed, use its existing fixture checks, including keyboard and reduced-motion behavior where relevant.

External viewer checks are optional and separate. Do not use a successful screenshot or an extracted value as proof of product-wide adherence.
