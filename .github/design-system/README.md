# Visual Studio Code Design System

This directory is the checkout-owned index and composition data for the design system. It contains no viewer implementation and doesn't require a canvas to read or contribute guidance.

## Content ownership

- Product tokens, APIs, styles, and examples stay in product code and its tests.
- Component usage and accessibility guidance live beside their component, such as [Button guidance](../../src/vs/base/browser/ui/button/button.design.md).
- Foundation guidance lives with its owner, such as [typography](../../src/vs/platform/theme/common/sizes/typography.design.md), [color guidance](../../src/vs/platform/theme/common/colors/colors.design.md), and [motion examples](../../src/vs/platform/theme/common/motion/motion-examples.md). Existing specifications, instructions, and skills remain authoritative within their scope.
- Cross-cutting introductions and guidance without a narrower owner live in [guidance/](guidance/).
- [book.json](book.json), [pages/](pages/), and [content/](content/) select, order, and bind those sources. Structured content holds curation and source bindings, not copied token values or executable rendering code.

The separately installed [design-system explorer](https://github.com/chryw/vscode-design-system) provides the viewer, source adapters, controllers, and headless tools. Access to that private repository is required to install it. It reads this directory from the **selected checkout**, not from its own installation. The same renderer can therefore show different checkout-owned books without copying their content into the extension. A missing book or invalid source binding is an explicit error. These documents remain readable without the viewer.

## Read and contribute

Open the **Visual Studio Code Design System** canvas, or use its headless `documents`, `read-document`, and topic commands. The Documentation library discovers Markdown in the configured scopes, including new documents with no curated chapter.

Edit the owning document once. Pages reference its sections through `$text` or `guidance` bindings; browser, CLI, canvas actions, and portable exports use the same projections. No launcher skill or viewer-source edit is needed to add guidance within an existing scope. Guidance edits refresh live; structural catalog or fixture-binding changes require reopening the provider.

Follow [authoring conventions](authoring.md), [component qualification](components.md), and [token qualification](foundations.md). Discovery and visualization don't make draft or implementation-specific material a product-wide rule.

## Find the owning guidance

Read the relevant specifications before building or updating UI. No canvas installation is required.

| Topic | Authored design guidance | Definitions or workflow |
| --- | --- | --- |
| Component usage and pitfalls | The component directory's `*.design.md`, such as [Button](../../src/vs/base/browser/ui/button/button.design.md) or [Dialog](../../src/vs/base/browser/ui/dialog/dialog.design.md) | The same directory's implementation and tests |
| Typography | [Typography](../../src/vs/platform/theme/common/sizes/typography.design.md) | [Size registrations](../../src/vs/platform/theme/common/sizes/baseSizes.ts) |
| Spacing | [Spacing](../../src/vs/platform/theme/common/sizes/spacing.design.md) | [CSS token instructions](../instructions/design-tokens.instructions.md#spacing) |
| Shape, size, and stroke | [Shape](../../src/vs/platform/theme/common/sizes/shape.design.md), [size](../../src/vs/platform/theme/common/sizes/size.design.md), [stroke](../../src/vs/platform/theme/common/sizes/stroke.design.md) | [Size registrations](../../src/vs/platform/theme/common/sizes/baseSizes.ts) |
| Colors and theming | [Colors](../../src/vs/platform/theme/common/colors/colors.design.md), [theming](../../src/vs/platform/theme/common/theming.design.md) | [Color compatibility](../../src/vs/platform/theme/common/colors/COLORS.md), [theming workflow](../skills/ux-theming/SKILL.md) |
| Elevation | [Elevation](../../src/vs/platform/theme/common/elevation.design.md) | Existing overlay, dialog, and layout owners linked from the specification |
| Iconography | [Iconography](../../src/vs/base/common/iconography.design.md) | [Codicon definitions](../../src/vs/base/common/codicons.ts) |
| Motion | [Motion](../../src/vs/platform/theme/common/motion/motion.design.md) | [Implementation contracts](../../src/vs/platform/theme/common/motion/MOTION.md), [motion workflow](../skills/motion-design/SKILL.md) |
| Illustration | [Illustration](guidance/illustration.design.md) | The consuming feature's media and rendering code |
| Cross-cutting requirements | [Design philosophy](../skills/design-philosophy/SKILL.md), [accessibility](../skills/accessibility/SKILL.md), [layout](../skills/ux-css-layout/SKILL.md), [writing](../instructions/coding-guidelines.instructions.md#ui-labels) | Existing instruction applicability and skill workflows remain in force |

Use `<subject>.design.md` for additional authored intent, not API inventories, generated token tables, technical contracts, or book introductions. One specification can serve several chapters. Adding a file within the configured discovery scopes makes it searchable; composing it into a chapter still requires a source binding.
