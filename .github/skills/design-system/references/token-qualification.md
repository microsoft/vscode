# Design token qualification

The index is a reference for choosing design decisions, not a census of styling inputs. A token must express an intentional reusable scale, semantic role, or explicitly shared design parameter. Being a constant, CSS variable, registry entry, or repeated value is not sufficient.

The qualification comes from the repository's [design principles](../foundations/principles.design.md), [design-token guidance](../../../instructions/design-tokens.instructions.md), [layout skill](../../ux-css-layout/SKILL.md), [theming skill](../../ux-theming/SKILL.md), and the product's color documentation. These sources distinguish design scales from structural measurements and implementation APIs.

## What belongs here

- The spacing ramp for padding, margins, gaps, and spacers
- Named type roles and the regular/semibold weight pair, not every font default or platform fallback
- Radius tiers chosen by surface role, including fully rounded shapes
- The base and compact icon sizes, not individual glyphs
- The standard boundary stroke, not every component's outline or scrollbar dimension
- The shared surface-shadow scale, with its high-contrast and shadow-setting caveats
- Explicitly registered scoped layout decisions

Deprecated size names remain available in a collapsed compatibility section with their replacements. They do not enlarge the recommended scale.

Design audits and external references inform guidance, not token values or claims of product-wide adoption.

## Scoped layout tokens

`agents.layout.floatingPanelGap` is an explicitly registered shared design parameter for the Agents window, so it remains visible with that scope. Status-bar height, editor-tab geometry, sash hit areas, centered-content limits, zoom calculations, and arbitrary min/max dimensions are component or structural measurements—not additional foundation tokens.

## What does not belong here

Glyph catalogs, file-icon associations, semantic syntax taxonomies, z-index registrations, widget-style object fields, font fallback lists, runtime expressions, and feature geometry are not promoted into token rows. Some are important consistency mechanisms, but they serve different reference tasks.

Component-specific color registrations remain genuine theme tokens. They are not deprecated or removed; the Colors article owns that complete reference and its theme resolution. Shared widget-style APIs remain the preferred way to construct existing widgets, not a parallel token inventory.

Figma specimens and historical palette labels are design evidence, not automatically current product tokens. Keep unverified metrics in their relevant topic's evidence or TBD content; do not infer a token from a bounding box, a matching value, or a component variant. Do not equate older toolkit type labels with the modern role scale.

## Reader and presentation contract

Read qualified size and elevation sources directly, reusing their existing adapters. Do not scan every registration mechanism or flatten every style object. The index must not load icon catalogs, file-association data, or the complete color-registration scan merely to show foundation tokens.

Coverage is limited to the inspected sources. A computed or unresolved value is not proof that the product lacks a token; component geometry, font defaults, and observed CSS are not automatically shared design scales. Source-backed examples establish provenance, not product-wide adoption or accessibility compliance.

Group choices by the documented design domains and explain when to use them. Show source evidence and actual theme-aware values; preserve semantic references and legacy replacements. Copy controls use only the real CSS variable. Search covers this curated reference, with contextual links to complete color keys and glyph catalogs.

Regression tests cover both inclusion and exclusion. A smaller row count alone does not demonstrate correct qualification.
