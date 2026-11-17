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

Keep the base parameters, generated response pairs, semantic behavior bindings, and shared activity cadence distinct. A purpose default can be a literal or an alias; neither creates another base-ramp step. Response durations belong with their generated curves, not in the ordinary duration scale. Generic spinner and progress cycles are shared activity decisions, not additional transition speeds.

The [motion naming contract](../../src/vs/platform/theme/common/motion/motion.design.md#token-roles-and-naming) uses behavior, phase or track, then parameter. This draft migrates its existing in-tree names together; adopted contracts require compatibility planning. Do not retain duplicate naming families or create a token for each example.

Component-local matrix choreography, voice breathing, logo drawing, find-option signaling, and confetti parameters stay out of the design-token reference. Their typed options or CSS override hooks are implementation contracts, not shared design choices. Reuse the complete component; do not offer its internal tuning as a global scale.

Project actual saved values and per-property tracks from the motion registry and recipe catalog. Do not replace a shorter press track with the selection duration or copy numbers into the renderer. Motion owns the purpose decision table, entry and exit relationships, reduced-motion contracts, and composition guidance. Its abstract comparisons isolate parameters; the existing component fixture owns the control examples.

Design audits and external references inform guidance, not token values or claims of product-wide adoption. Counts of animation declarations are not counts of simultaneous animations or defects. Check actual state, scope, preference gates, and visibility before treating a composition as redundant.

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
