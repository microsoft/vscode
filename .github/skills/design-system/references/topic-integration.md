# Specification integration

Connect one authored specification to its discovery, chapter composition, source links, and compatibility requirements. The specification remains the source catalog; the viewer owns presentation.

## Place and classify a specification

| Guidance | Owner |
| --- | --- |
| Shared design foundations | `.github/skills/design-system/foundations/<subject>.design.md` |
| Reusable interaction or task patterns | `.github/skills/design-system/patterns/<subject>.design.md` |
| Primitive or composite component contracts | Beside the reusable implementation |
| Product values, APIs, and behavior | Product code and tests |
| Authoring procedures | Existing skills and instructions |
| Page composition and curated example relationships | `.github/skills/design-system/content/` |
| Presentation, navigation, and interaction | The design-system viewer |

Use the required front matter:

```yaml
title: "Example"
kind: "foundation"
status: "draft"
```

`kind` is `foundation`, `pattern`, `primitive`, or `composite`. `status` is `draft`, `stable`, or `deprecated`; draft remains visible and explicitly provisional. Deprecated guidance must name an existing nondeprecated `replacedBy` specification.

The stable filename supplies the default topic ID. Use an explicit `id` only to preserve a demonstrated existing topic identity; document that compatibility reason. `order` is optional and only needed to preserve editorial placement. Aliases, replaced paths, and references belong with the owning specification, not in a second catalog.

Do not create a specification for every implementation folder. A fixture is not evidence that a component is a primitive. Keep primitive/composite classification in code-local front matter and derive those collections from discovered specifications.

## Discover and validate

The supported product discovery command is:

```sh
node .github/skills/design-system/scripts/validate.mts --list
```

It returns specification paths, titles, kinds, and readiness without loading every body. The command without `--list` validates front matter, placement, IDs, deprecated redirects, configured source paths, and chapter compositions.

The viewer must discover the same specification set and apply the same metadata rules. Do not copy the catalog into a viewer-owned list. During migration, preserve compatibility for older supported checkouts in the viewer's reader, then remove transitional parsing only when its compatibility window ends.

## Compose only deliberate presentation

Per-chapter files under `content/topics/` select the renderer, source sections, examples, and references needed to teach the subject. They do not enumerate specifications or define a competing title, kind, status, or readiness. A prose edit normally changes only the owning Markdown; change composition when its selected sections or examples change.

Use source-relative Markdown links to the product implementation and behavior. Verify both visible label and resolved destination. In particular, the Colors chapter's primary contributor resource points to `foundations/colors.design.md`, and the Colors specification retains a source link to `src/vs/platform/theme/common/colors/baseColors.ts`.

Keep component curation only for relationships that cannot be derived from its specification and source: selected APIs, implementation ownership, fixtures, and family presentation. The component specification's kind is authoritative for primitive/composite filtering.

## Preserve reader identity and navigation

- Keep topic IDs and established navigation order where existing saved views depend on them.
- Carry legacy document paths and section anchors through validated aliases; aliases resolve directly to an existing canonical target and cannot form cycles.
- Keep drafts browsable, visibly provisional, and out of established-policy language.
- Ensure deprecated links redirect to their replacement without displaying obsolete advice as current.
- Do not activate new source metadata before the viewer reads it and its compatibility tests pass.
- Do not edit the installed viewer, hand-edit generated files, or change another owner's README or saved-view data.

## Verify the integration

From the product checkout:

```sh
node .github/skills/design-system/scripts/validate.mts --list
node .github/skills/design-system/scripts/validate.mts
```

From the viewer source checkout, use its documented CLI and focused tests with the product root explicitly selected:

```sh
node <viewer>/scripts/book.mjs list --root <checkout>
node <viewer>/scripts/book.mjs validate --root <checkout>
node <viewer>/scripts/book.mjs read --root <checkout> --topic <topic-id>
node <viewer>/scripts/book.mjs search --root <checkout> --topic <topic-id> --query "<reader's task>"
```

Verify a task-oriented lookup and a contributor path from chapter to code. Check draft visibility, replacement behavior, primitive/composite filtering, and that fixture-only components do not appear as primitives. Render the relevant topics, verify source-link destinations and examples, and confirm saved views retain their identity and position.

Keep source validation, headless reading, portable rendering, and native-canvas validation distinct. For shared canvas changes, coordinate with the canonical owner; do not open a duplicate panel or reload an installation independently.
