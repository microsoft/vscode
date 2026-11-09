# Design token qualification

The index is a reference for choosing design decisions, not a census of styling inputs. A token must express an intentional reusable scale, semantic role, or explicitly shared design parameter. Being a constant, CSS variable, registry entry, or repeated value is not sufficient.

The qualification comes from the repository's [design philosophy](../skills/design-philosophy/SKILL.md), [design-token guidance](../instructions/design-tokens.instructions.md), [layout skill](../skills/ux-css-layout/SKILL.md), [theming skill](../skills/ux-theming/SKILL.md), and the product's color and motion documentation. These sources distinguish design scales from structural measurements and implementation APIs.

## What belongs here

- The spacing ramp for padding, margins, gaps, and spacers
- Named type roles and the regular/semibold weight pair, not every font default or platform fallback
- Radius tiers chosen by surface role, including fully rounded shapes
- The base and compact icon sizes, not individual glyphs
- The standard boundary stroke, not every component's outline or scrollbar dimension
- Shared semantic color roles from `semanticColors.ts`; the complete component-color token contract remains available in Colors
- The shared surface-shadow scale, with its high-contrast and shadow-setting caveats
- Declared motion primitives and semantic parameter aliases; choreography and recipes remain in Motion
- Explicitly registered scoped layout decisions

Deprecated size names remain available in a collapsed compatibility section with their replacements. They do not enlarge the recommended scale. Motion aliases express purpose and are not deprecated merely because they reference a primitive.

## Motion parameters

Keep three categories distinct: the ordinary duration ramp, purpose parameters that preserve component defaults, and long compatibility cycles. A purpose default can be a literal or an alias; a literal switch or selection duration does not add a ramp step. Normal, gentle, and slow are starting points for restrained opt-in recipes, not a mandate to retime shipped feedback. Shared easing, distance, scale, opacity, delay, and iteration parameters retain their own property roles.

Project actual saved values and per-property tracks from the motion registry and recipe catalog. Do not replace a shorter press track with the selection duration or copy numbers into the renderer. Motion owns the purpose decision table, entry and exit relationships, reduced-motion contracts, and composition guidance. Its abstract comparisons isolate parameters; the existing component fixture owns the control examples.

Olivia’s Phase2 audit and Fluent 2, Windows, and Atlassian inform guidance, not token values. Recommendations for fewer concurrent status signals remain future adoption guidance unless a product change has actually shipped.

Keep design evidence distinct from current reproduction. The main source audit at `8fb60541` already records spinner and shimmer suppression and an off-by-default, reduced-motion-gated composer comet. Audit declaration counts are not counts of simultaneous animations or defects. Recheck actual state, scope, preference gates, and visibility before interpreting a composition as redundant.

## Scoped layout tokens

`agents.layout.floatingPanelGap` is an explicitly registered shared design parameter for the Agents window, so it remains visible with that scope. Status-bar height, editor-tab geometry, sash hit areas, centered-content limits, zoom calculations, and arbitrary min/max dimensions are component or structural measurements—not additional foundation tokens.

## What does not belong here

Glyph catalogs, file-icon associations, semantic syntax taxonomies, z-index registrations, widget-style object fields, font fallback lists, runtime expressions, and feature geometry are not promoted into token rows. Some are important consistency mechanisms, but they serve different reference tasks.

Component-specific color registrations remain genuine theme tokens. They are not deprecated or removed; the Colors article owns that complete reference and its theme resolution. Shared widget-style APIs remain the preferred way to construct existing widgets, not a parallel token inventory.

Figma specimens and historical palette labels are design evidence, not automatically current product tokens. Keep unverified metrics in their relevant topic's evidence or TBD content; do not infer a token from a bounding box, a matching value, or a component variant. Do not equate older toolkit type labels with the modern role scale.

## Reader and presentation contract

Read qualified size, semantic-color, motion, and elevation sources directly, reusing their existing adapters. Do not scan every registration mechanism or flatten every style object. The index must not load icon catalogs, file-association data, or the complete color-registration scan merely to show foundation tokens.

Group choices by the documented design domains and explain when to use them. Show source evidence and actual theme-aware values; preserve semantic references and legacy replacements. Copy controls use only the real CSS variable. Search covers this curated reference, with contextual links to complete color keys, glyph catalogs, and motion recipes.

Regression tests cover both inclusion and exclusion. A smaller row count alone does not demonstrate correct qualification.
