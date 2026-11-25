# Specification integration

Use this when intentionally adding or changing a specification's metadata or source bindings. Documents belong to the product checkout; external viewers are optional consumers.

## Place and classify a specification

| Guidance | Owner |
| --- | --- |
| Shared design foundations | `.github/skills/design-system/foundations/<subject>.design.md` |
| Reusable interaction or task patterns | `.github/skills/design-system/patterns/<subject>.design.md` |
| Component contracts | Beside the reusable implementation |
| Product values, APIs, and behavior | Product code and tests |
| Authoring procedures | Existing skills and instructions |
| Chapter presentation, specimens, and component relationships | The specification's front matter |
| Presentation, navigation, and interaction | The design-system viewer |

Declare the title and kind, and mark provisional guidance as a draft:

```yaml
title: "Example"
kind: "foundation"
isDraft: true
```

`kind` is `foundation`, `pattern`, or `component`. `isDraft` is an optional boolean: `true` keeps guidance visible and explicitly provisional; `false` or omission means it is not a draft. Use `replacedBy` to retire a specification in favor of an existing, non-retired specification. A redirect cannot also be a draft.

The stable filename supplies the default topic ID. Use an explicit `id` only to preserve a demonstrated existing topic identity; document that compatibility reason. `order` is optional and only needed to preserve editorial placement. Search aliases, `replacedBy` redirects, and references belong with the owning specification, not in a second catalog.

Do not create a specification for every implementation folder. Derive component topics solely from code-local specifications with `kind: "component"`. This includes composed controls and specifications without fixtures.

## Discover and validate

The supported product discovery command is:

```sh
node .github/skills/design-system/scripts/validate.mts --list
```

It returns specification paths, titles, kinds, and readiness without loading every body. The command without `--list` validates front matter, placement, IDs, deprecated redirects, and configured source paths without a viewer.

Repository search and direct Markdown reading also work without running discovery. External readers own their compatibility support and refresh behavior.

## Compose only deliberate presentation

Plain Markdown guidance needs no presentation, specimens, or renderer-specific anchors. Read the [optional composition rules](visual-topic-authoring.md#optional-renderer-composition) only when intentionally adding or changing those bindings.

A prose edit normally changes only the owning Markdown. Change front matter or anchors when the selected sections or examples change.

Use source-relative Markdown links to the product implementation and behavior. Verify both visible label and resolved destination. In particular, the Colors chapter's primary contributor resource points to `foundations/colors.design.md`, and the Colors specification retains a source link to `src/vs/platform/theme/common/colors/baseColors.ts`.

A component specification's `component` front matter records only relationships that cannot be derived from source: implementation ownership, selected APIs, fixtures, and design references. Fixture bindings select examples and do not determine classification.

## Preserve reader identity and navigation

- Keep existing topic IDs and section addresses stable when possible.
- When a document moves, update its inbound links instead of adding a path alias. Carry renamed section anchors through validated section aliases; aliases resolve directly to an existing canonical target and cannot form cycles.
- Keep drafts browsable, visibly provisional, and out of established-policy language.
- Ensure deprecated links redirect to their replacement without displaying obsolete advice as current.
- Keep guidance complete in Markdown regardless of whether an external reader supports its optional presentation.

## Verify the integration

From the product checkout:

```sh
node .github/skills/design-system/scripts/validate.mts --list
node .github/skills/design-system/scripts/validate.mts
```

Verify that repository search finds the guidance and its links reach the owning code. Check metadata, replacement targets, selected source sections, and examples when those change.
