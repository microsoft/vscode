---
description: 'Find source-backed Visual Studio Code design guidance and product examples when building or changing UI.'
applyTo: "{src/vs/**/browser/**/*.{ts,css},**/*.design.md}"
---

# Design-system reference

The [Visual Studio Code Design System](../design-system/README.md) is the central index of design guidance, tokens, reusable components, and examples for this checkout. Its [book definition](../design-system/book.json) identifies the relevant topics and source bindings. The separately installed [design-system explorer](https://github.com/chryw/vscode-design-system) provides the viewer and headless tools; it does not own the guidance. The source documents remain usable without access to the private viewer.

For UI work, consult the relevant topic and follow its owning product definitions and guidance. A visible canvas is optional: repository source documents and the package's headless interface provide the same underlying references.

Before using or changing a component, read the `*.design.md` in its implementation directory. Before choosing shared typography, spacing, shape, color, or motion, read that topic's owner in the [topic map](../design-system/README.md#find-the-owning-guidance). Do not guess the document name from a class name: a directory can contain several related controls and specifications.

Design specifications explain intended usage, mistakes to avoid, and scoped accessibility obligations. They supplement existing instructions; they do not redefine API signatures, copy registered values, or override repository requirements. Preserve applicable skill workflows and instruction rules when adding source-local guidance.
For authored guidance or feature specifications, search the book's Documentation library or use `scripts/book.mjs documents` and `read-document` from the canvas package. Discovery covers the configured repository locations, including documents without a curated chapter. Read the selected document's applicability and source section before applying it; do not infer approval from its presence in search results.

Keep recommendations distinct from draft guidance and observed implementation examples. Respect each rule's applicability and existing instruction precedence; neither a local document nor a catalog entry silently overrides a broader rule.

When adding guidance or examples, follow the [authoring conventions](../design-system/authoring.md). Update the existing owner rather than copying its content into another instruction, renderer, or document. Keep component and foundation prose beside its owning implementation; use `.github/design-system/guidance/` only for cross-cutting material without a narrower owner. Never put product guidance in the canvas extension.

For writing, improving, or reviewing design-system topics, use the on-demand [design-system-topic-writing skill](../skills/design-system-topic-writing/SKILL.md).

For motion design, tuning, or validation, use the on-demand [motion-design skill](../skills/motion-design/SKILL.md).
