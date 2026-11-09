# Visual Studio Code Design System

This directory is the checkout-owned index and composition data for the design system. It contains no viewer implementation and doesn't require a canvas to read or contribute guidance.

## Content ownership

- Product tokens, APIs, styles, and examples stay in product code and its tests.
- Component usage and accessibility guidance live beside their component, such as [Button guidance](../../src/vs/base/browser/ui/button/button-design.md).
- Foundation guidance lives with its owner, such as [typography](../../src/vs/platform/theme/common/sizes/typography.md), [color guidance](../../src/vs/platform/theme/common/colors/color-guidance.md), and [motion examples](../../src/vs/platform/theme/common/motion/motion-examples.md). Existing specifications, instructions, and skills remain authoritative within their scope.
- Cross-cutting introductions and guidance without a narrower owner live in [guidance/](guidance/).
- [book.json](book.json), [pages/](pages/), and [content/](content/) select, order, and bind those sources. Structured content holds curation and source bindings, not copied token values or executable rendering code.

The separately installed [design-system explorer](https://github.com/chryw/vscode-design-system) provides the viewer, source adapters, controllers, and headless tools. Access to that private repository is required to install it. It reads this directory from the **selected checkout**, not from its own installation. The same renderer can therefore show different checkout-owned books without copying their content into the extension. A missing book or invalid source binding is an explicit error. These documents remain readable without the viewer.

## Read and contribute

Open the **Visual Studio Code Design System** canvas, or use its headless `documents`, `read-document`, and topic commands. The Documentation library discovers Markdown in the configured scopes, including new documents with no curated chapter.

Edit the owning document once. Pages reference its sections through `$text` or `guidance` bindings; browser, CLI, canvas actions, and portable exports use the same projections. No launcher skill or viewer-source edit is needed to add guidance within an existing scope. Guidance edits refresh live; structural catalog or fixture-binding changes require reopening the provider.

Follow [authoring conventions](authoring.md), [component qualification](components.md), and [token qualification](foundations.md). Discovery and visualization don't make draft or implementation-specific material a product-wide rule.
