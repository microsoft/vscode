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

The [book authoring conventions](../../../design-system/authoring.md) remain authoritative for file ownership and supported bindings. In particular:

- Keep design rules and authored explanations with their owning documents; sample labels and curation can use the existing structured format.
- Keep current values and executable behavior in product sources. Resolve them into specimens instead of maintaining copied token tables.
- Keep real product controls in their fixtures; keep explanatory diagram mechanics in the actual viewer implementation.
- Keep chapter identities, aliases, source links, and example relationships consistent. Support a binding in the consuming reader before activating it in topic metadata.
- If an adapter does not expose a needed fact, implement and validate its extraction in the owning viewer source rather than hardcoding a substitute in content.

For assets, follow the subject's own format, theming, location, and accessibility requirements. For controls and motion, use the corresponding fixture and motion workflows. A static image is not an adequate replacement for a lesson about keyboard behavior or interruption.

## Worked foundation: typography

The existing [Typography page](../../../design-system/pages/typography.json) and [content](../../../design-system/content/foundations/typography.json) compose more than the [design specification](../../../../src/vs/platform/theme/common/sizes/typography.design.md). A complete authoring pass accounts for these teaching relationships:

| Goal | Artifact chain | Evaluation |
| --- | --- | --- |
| See hierarchy in a composition | Role-selection guidance; curated role/sample pairs; registered role sizes; composed-text specimen and its weight treatment. | The intended line leads and supporting text stays readable; verify the weight source separately from the size source. |
| Distinguish emphasis from size | Emphasis guidance; the same sample and body role at registered regular/semibold weights; paired specimen. | Weight changes while size and sample remain matched. |
| Recognize available roles | Role rules; registrations with semantic descriptions; role specimens. | Readers can connect the rendered difference to the role's job, including roles that share a size. |
| Understand platform and language choices | Font-family guidance; extracted platform/language stacks; representative previews and fallback reference. | Labels explain platform/language scope; an unavailable font is not presented as guaranteed installed. |
| Understand metric boundaries | Workbench baseline from source CSS; explanatory copy; reading-metrics guidance. | An implementation baseline is not mistaken for a registered, universal line-height or tracking scale. |
| Apply the guidance accessibly | Topic accessibility rules and review checks; readable examples; semantic structure and text equivalents. | Visual styling is not confused with heading semantics or accessible control names. |

The composition samples, matched-weight study, role examples, and family previews are substantive teaching artifacts. Replacing the document must not drop them; writing the document for a new topic must not count them as delivered unless the chapter actually provides them.

Source backing needs verification per property: the existing composition resolves sizes from registrations but fixes its heading/body weights in the viewer, while the emphasis study resolves registered weights. The composition is therefore not a fully token-resolved example. When authoring or revising a specimen, check its actual data path rather than assuming that every property follows the same source.

These are examples of artifact relationships, not a required Typography template. A menu topic may instead require open/focused/disabled states and real keyboard interaction; a spacing topic may need grouping comparisons and resizing behavior.

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
