# Visual topic authoring

A topic teaches through the relationship between guidance, examples, and reference material. Plan those together; a specification alone does not reproduce a chapter's teaching.

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

The [book authoring conventions](authoring-conventions.md) remain authoritative for file ownership and supported bindings. In particular:

- Keep design rules and authored explanations with their owning documents; sample labels and curation can use the existing structured format.
- Keep current values and executable behavior in product sources. Resolve them into specimens instead of maintaining copied token tables.
- Keep real product controls in their fixtures; keep explanatory diagram mechanics in the actual viewer implementation.
- Keep chapter identities, aliases, source links, and example relationships consistent. Support a binding in the consuming reader before activating it in topic metadata.
- If an adapter does not expose a needed fact, implement and validate its extraction in the owning viewer source rather than hardcoding a substitute in content.

For assets, follow the subject's own format, theming, location, and accessibility requirements. For controls and motion, use the corresponding fixture and motion workflows. A static image is not an adequate replacement for a lesson about keyboard behavior or interruption.

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

## Verify the complete topic

Validate three different outcomes:

1. **Artifact integrity:** sources, bindings, fixture IDs, registrations, captions, and chapter identities resolve correctly. Existing useful examples and relevant states survive the change.
2. **Teaching in the rendered chapter:** guidance appears before dependent examples; matched comparisons are genuinely matched; annotations are readable; examples visibly demonstrate the promised relationship. Check relevant widths, themes, and interactions.
3. **Accessible and headless understanding:** semantic structure and controls work, text alternatives explain the lesson, and source-backed nonvisual output contains the meaningful guidance and comparison facts.

A passing extractor does not prove that the visual explanation works. A screenshot does not prove keyboard behavior. If a necessary example, adapter, rendering block, or delivery step remains missing, identify that specific gap rather than reporting the topic complete.
