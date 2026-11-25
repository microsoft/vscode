# Visual topic authoring

Use this when adding or changing visual teaching material. Standalone Markdown guidance does not require an external renderer.

## Choose the representation

| Learning need | Useful representation | What to preserve or author |
| --- | --- | --- |
| Recognize a role or scale | Source-backed specimen | Semantic label, authentic sample, current value, and context for choosing it. |
| Understand a composition | Annotated arrangement or realistic scene | Relationships, hierarchy, surrounding context, and explanation of what leads or stays stable. |
| Distinguish alternatives | Matched comparison | Hold unrelated variables constant; state when each alternative fits. |
| Understand interaction or change | Real component fixture or interactive study | Trigger, relevant states, interruption, keyboard behavior, and final/reduced alternative as applicable. |
| Explain an abstract relationship | Clearly labeled diagram | The relationship, meaningful annotations, and separation of illustrative geometry from product defaults. |
| Find exact definitions | Extracted reference | Current registrations/APIs and provenance, without making observed values into new recommendations. |

Choose by the decision, not by the number of available controls or tokens. Do not create every representation for every topic. Comparisons should expose a meaningful difference, not invent a deliberately broken design.

## Connect the artifact set

For each important teaching goal, establish:

1. **Decision:** what should a reader choose or understand?
2. **Demonstration:** what must be visible or operable to teach it?
3. **Source:** which document, registration, component, or fixture owns the facts and behavior?
4. **Explanation:** which guidance, caption, annotations, and text alternative explain the relationship?
5. **Composition:** how does the chapter select and place these artifacts?
6. **Verification:** what observation would show that the lesson is conveyed?

Use this as a working checklist, not a new required metadata schema or planning file. Existing examples may satisfy several goals. Add only missing artifacts, and preserve the useful parts of a topic when changing its prose.

The [authoring conventions](authoring-conventions.md) remain authoritative for file ownership. Read the [renderer composition details](#optional-renderer-composition) only when changing optional bindings. In particular:

- Keep design rules and authored explanations with their owning documents; sample labels and specimen choices belong in the specification's front matter.
- Keep current values and executable behavior in product sources. Resolve them into specimens instead of maintaining copied token tables.
- Keep real product controls in their fixtures; keep explanatory diagram mechanics in the actual viewer implementation.
- Keep chapter identities, aliases, source links, and example relationships consistent. Optional presentation metadata must not replace the guidance in Markdown.
- If an external viewer cannot expose a needed fact, retain its source link and explanation in the document. Viewer adaptation is separate work; do not invent a substitute fact.

For assets, follow the subject's own format, theming, location, and accessibility requirements. For controls, use the corresponding fixture workflow. A static image is not an adequate replacement for a lesson about keyboard behavior or interruption.

## Example artifact chains

Choose the artifact chain that teaches the decision. These examples describe possible approaches, not the contents or implementation of any existing topic.

| Goal | Artifact chain | Evaluation |
| --- | --- | --- |
| See hierarchy in a composition | Selection guidance; curated content/role pairs; current definitions; composed specimen. | The intended element leads and supporting content stays understandable. |
| Distinguish alternatives | Decision rule; representative sample held constant; source-defined variants; matched comparison and caption. | The intended difference is visible without unrelated changes confounding it. |
| Understand a control's behavior | Usage guidance; real component fixture; relevant states and input paths; explanation of transitions. | The example demonstrates authentic keyboard, focus, and state behavior rather than only its resting appearance. |
| Understand contextual variation | Applicability guidance; relevant context data; representative variants and annotations. | Readers understand what changes across contexts and what remains invariant. |
| Distinguish an implementation from a recommendation | Scoped guidance; extracted reference facts; clear applicability labels and source links. | An observed default is not presented as a universal requirement. |
| Apply the guidance accessibly | Accessibility obligations; meaningful text equivalents; semantic structure; relevant interaction checks. | The lesson remains understandable without relying solely on sight, color, or motion. |

Compositions, comparisons, diagrams, and interactive examples are substantive teaching artifacts. Replacing a document must not silently drop useful demonstrations; authoring a new topic must not count them as delivered unless the chapter actually provides them.

Verify source backing per property and behavior. A specimen may resolve one dimension from a registry while fixing another in its renderer. Inspect the current data paths rather than assuming that every property follows the same source.

## Author explanations for visual material

- **Guidance** explains what to choose and why before the reader encounters the example.
- **Captions** explain the observable relationship, such as "Weight changes while the body size stays fixed," not the dummy labels or how to operate the preview.
- **Annotations** identify the parts needed to notice that relationship. Keep them legible and avoid covering what they explain.
- **Text equivalents** communicate the lesson and meaningful differences without sight. Use source-derived tables or descriptions where appropriate rather than duplicating every visual detail.
- **Inspection controls** have their own accessible names and instructions. Do not make playback help the topic's design guidance.

Examples should establish context before interaction and expose a useful resting state. Keep source-defined product typography, geometry, and behavior inside authentic specimens; use shared article styles for explanatory material.

Read the complete chapter composition before changing its copy. Keep reading aids in the visualization's accessible description and implementation details in optional references. Each pattern's reference example has one primary home; attach optional inspection there instead of duplicating a gallery for validation.

General guidance and captions must remain useful if the example's sample content changes. Explain what to choose, why it helps, which principle it supports, and what to preserve. Do not narrate dummy labels, feature names, or individual choices in the specimen. Captions explain the observable design relationship, not how to operate the player. Put playback help in accessible control names and descriptions, separate from guidance. For example, “Only the selection indicator travels; labels and hit targets remain stable” explains the pattern without depending on a particular set of choices.

Match the example's complexity to the idea. A single-property study should isolate that property; a product pattern should demonstrate the actual component and its complete interaction. Do not use implementation provenance, a successful render, or numerical correctness as a substitute for checking whether the example visibly teaches its stated point.

Use real components for recognizable product controls, not look-alikes built in the book's CSS. Abstract diagrams should be unmistakably diagrams.

## Optional renderer composition

Skip this section for standalone Markdown and prose-only changes. Read it only when intentionally adding or changing presentation metadata, API projections, specimens, or renderer-bound sections.

One chapter can compose several sources; one source can serve several chapters. External readers may compose chapters from specifications: anchored headings can bind visual sections, `$text` references can supply specimen copy, and remaining sections can render as guidance. Product documentation remains complete as Markdown; no separate composition directory is required.

Keep authored choices in the owning specification's front matter: presentation, specimens, section labels, fixture relationships, and design references. Derive topic inventories from that metadata, chapter outlines from the specification's headings, and token values and groups from product sources. Do not maintain a separate registry, topic list, or list of expected headings.

The renderer should project values from code. Authored metadata can select relevant APIs and validate their source anchors, but it must not silently invent a missing API or substitute a stale value.

### Component bindings

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

### Compose a chapter

For an optional rendered reference, start with the reader's decision, demonstrate it, then provide detail. Renderer implementation and validation follow the external viewer's workflow.

The foundation sequence introduces design principles, accessibility, content, and design tokens, then groups typography and color, layout and geometry, and imagery and motion. Patterns follow Foundations and teach reusable task compositions through the [pattern conventions](pattern-authoring.md). Component chapters follow Patterns in alphabetical order; the Source library remains a separate utility. Use front-matter `order` only when editorial placement must be preserved; keep derived topic IDs and deep links stable when changing the reading order.

Use the shared article frame and book typography for explanations: one chapter title, major sections, then nested subheadings. Product specimens retain their source-defined typography and geometry. Keep prose, headings, and examples on the same left edge, with comfortable line lengths and more space between sections than within them. Put prerequisite guidance before the reference it explains; supporting source excerpts can follow the examples. Guidance sections keep their Markdown position relative to visual sections, so order the specification the way the chapter should read. Source links belong after the chapter, not beside its title.

Reference chapters use normal page scrolling, including expanded token domains. Do not constrain the entire article to a viewport height or clip it to make an inventory fit. A bounded catalog such as the icon browser may own a separately labeled, keyboard-focusable scrolling region without constraining the surrounding article. Multi-section chapters have an outline in reading order; links into collapsed reference groups open those groups.

Explanatory lists and extended examples read vertically. Reserve columns for compact, equivalent specimens or explicit comparisons, and let them collapse when the article cannot fit both. Base a specimen's reflow on its available container space rather than assuming a wide window means a wide article.

Reference actual source sections instead of copying their prose into front matter. Keep source paths repository-relative and use stable headings or supported explicit anchors. Heading-based bindings need unique slugs across the source document; preserve existing slugs when practical, and update anchors and `$text` references when sections move or change roles. A missing reference should produce an actionable failure, not an empty successful chapter.

Front matter selects composition. It must not become a second token registry, a source-code snapshot, or an arbitrary executable page builder.

Define further reading in the specification's `references` front matter. Each ordered `{ title, url, description }` entry needs a credential-free HTTPS URL and a specific reason to read beyond this topic. Prefer one to three authoritative links when useful. Keep contextual links with their owners and never scrape Markdown, skills, imports, or dependencies into reading lists.

#### Bind prose to a visual reference

Use an existing chapter as the starting point. For example, [Typography](../foundations/typography.design.md) selects its presentation and specimens in front matter, while its Markdown owns the authored specimen explanations. The adapter produces the normalized authored chapter; contributors do not maintain a separate page or projection file. A `$text` reference reads a named section from the specification:

```yaml
$text:
  heading: "Hierarchy in practice"
```

Whole sections are the default. Use `list: true` only for an explicitly flat list, or `paragraph` only for a deliberate lead/caption whose position is part of the composition. Heading references must be unambiguous. Set `file` to read an existing product or instruction document that already owns the text. Relative links resolve from the specification.

[Elevation](../foundations/elevation.design.md) demonstrates the richer composition format: its anchors and specimens bind the specification's sections to guidance, construction diagrams, and scenario examples. Composition must follow the design guidance, not force new concepts into existing galleries. Keep supported block types explicit rather than allowing arbitrary scripts in content.

Viewer refresh and installation follow the viewer repository's workflow, separately from documentation changes.

Guidance-only chapters, such as [Illustration](../foundations/illustration.design.md), omit `presentation` and use the shared article frame. The Introduction and level-two headings become the chapter without copied prose or page-specific chrome.

### Add or update an interactive example

Reuse the real component and its existing fixture when possible. Keep feature state and behavior in the fixture, not in a canvas imitation. Preserve variants, keyboard interaction, focus, high-contrast behavior, reduced motion, and the component's normal lifecycle.

Explanatory diagrams may remain in the viewer. Parameterize them with source-defined values where appropriate, and do not present their illustrative geometry as a shipped product default.

A book player can pause or reset an example without making those controls part of the product widget's contract.

An example must establish its context before playback: show its trigger, surrounding content, or a representative still state. Use authentic product components or their owned rendering helpers, and choose sample data that reflects an actual product scenario. Abstract diagrams can explain timing or properties, but a fabricated feature is not evidence of product usage. Keep product scenes on a consistent viewport and inset, preserving intentional anchors such as a menu's trigger or a notification's edge.

Check a product specimen against the real product before changing its behavior. Reuse an existing full-renderer fixture when layout depends on ancestry, data shape, or neighboring content. Missing gutters, malformed sample data, or a clipped host are fixture defects, not evidence that the product needs a redesign; do not lower the product baseline to fit the example.

## Verify the complete topic

Validate three different outcomes:

1. **Artifact integrity:** sources, bindings, fixture IDs, registrations, captions, and chapter identities resolve correctly. Existing useful examples and relevant states survive the change.
2. **Teaching in the rendered chapter:** guidance appears before dependent examples; matched comparisons are genuinely matched; annotations are readable; examples visibly demonstrate the promised relationship. Check relevant widths, themes, and interactions.
3. **Accessible and headless understanding:** semantic structure and controls work, text alternatives explain the lesson, and source-backed nonvisual output contains the meaningful guidance and comparison facts.

A passing extractor does not prove that the visual explanation works. A screenshot does not prove keyboard behavior. Report any undelivered visual example separately from the usable Markdown; optional viewer support does not block product documentation.
