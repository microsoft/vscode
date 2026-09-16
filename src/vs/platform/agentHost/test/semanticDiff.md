# Testing semantic diff classification

The agent-host `classify_diff_hunks` tool validates a classification supplied by the calling model. The model inspects Git with existing tools; the semantic-diff tool does not collect changes, call another model, open an editor, or modify files.

Semantic diffs have two independent axes:

- Each Git hunk has exactly one type: `logic`, `test`, or `supporting`. This controls whole-hunk filtering, badge counts, labels, and the base decoration color.
- Every changed line belongs to exactly one `attentionBlock` with `hot`, `warm`, or `cold` attention. This controls emphasis within the hunk type color and never affects filtering.

Mixed hunks choose one type by intent precedence: Logic, then Test, then Supporting. Import-only and generated-only hunks are Supporting. Imports or generated lines inside a Logic or Test hunk keep that hunk's type; they normally receive Cold attention rather than a separate category.

Attention blocks use canonical absolute `oldRanges` and `newRanges`, cover every deletion and addition exactly once, and never include unchanged context. Hot marks the behavioral or contractual core, Warm marks meaningful implementation needed to understand it, and Cold marks routine wiring, formatting, comments, imports, or generated material. A hunk need not use every level, and attention never means safe, approved, or skippable.

Regular themes render Hot at full emphasis, Warm at a moderate shade, and Cold at a quiet shade. High contrast themes distinguish the same levels with solid, dashed, and dotted markers while retaining the hunk type color. Hover and Accessible View state the hunk type, attention level, reason, and ranges without relying on color.

## Automated checks

Use an existing **VS Code - Build** watch task if one is running. Otherwise refresh test output:

```sh
npm run transpile-client
```

Then run:

```sh
./scripts/test.sh \
  --run src/vs/platform/agentHost/test/common/semanticDiff.test.ts \
  --run src/vs/platform/agentHost/test/common/semanticDiffProjection.test.ts \
  --run src/vs/platform/agentHost/test/node/semanticDiffServerTool.test.ts \
  --run src/vs/platform/agentHost/test/node/serverToolGroups.test.ts \
  --run src/vs/sessions/contrib/semanticDiff/test/browser/semanticDiffEditorInput.test.ts \
  --run src/vs/sessions/contrib/semanticDiff/test/browser/semanticDiffEditor.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatSemanticDiffResultSubPart.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/accessibility/chatAccessibilityHelp.test.ts \
  --reporter dot
```

These tests use fixed data rather than a live model or working tree. They cover schema validation, exhaustive attention coverage, source projection, filtering, renderer interactions, accessible text, server-tool registration, and transport.

For contract changes, run `npm run typecheck-client` unless an existing build task already supplies current diagnostics.

## Component fixtures

Use the semantic diff editor fixtures to inspect:

- **AllTypes**: Logic, Test, and Supporting hunk filters and colors.
- **AttentionContrast**: Warm and Hot emphasis within one Logic hunk.
- **MixedImportAndLogic**: Cold imports and Hot behavior retaining one Logic type.
- **BlockAttention**: Cold, Warm, and Hot ranges in one Logic hunk.
- **ContextLines**, **InsertedFunction**, and **DeletedFunction**: exact changed-line alignment.
- **EmptyFilters**, **SourceUnavailable**, and **Partial**: non-success and incomplete states.

Check regular, dark high contrast, and light high contrast themes. Native added/deleted highlights and line totals must remain independent of semantic type colors.

## Live-model classification scenarios

Restart the development agent host after changing the built-in tool description or walkthrough skill. Use a fixed commit range and inspect the actual tool payload.

| Changed lines | Expected hunk type and attention |
|---|---|
| Only imports in production, test, or generated files | Supporting; attention based on the hunk's review relevance |
| Imports plus production behavior in one Git hunk | Logic; imports normally Cold and behavioral core Hot |
| Imports plus test assertions in one Git hunk | Test; imports normally Cold and assertions Hot |
| Reproducible lockfile output only | Supporting, normally Cold unless the lockfile hunk itself is the key review unit |
| Public API or dependency manifest contract | Logic |
| Formatting or comments only | Supporting, normally Cold |

Verify:

1. Actual Git hunk boundaries and canonical old/new ranges are preserved.
2. No hunk is split, duplicated, or assigned to multiple groups.
3. The single hunk type controls visibility and badge counts.
4. Attention ranges cover every changed line exactly once on both sides.
5. Every range endpoint lands on a changed line, not context.
6. All attention markers in a hunk retain the same hunk type color and label.
7. Hover and Accessible View state both axes and the attention reason.
8. Disabling a hunk type hides the entire hunk regardless of its attention blocks.

## TypeScript and JavaScript enrichment

When available, the walkthrough invokes `classify_typescript_changes` for every eligible changed TypeScript or JavaScript file before semantic grouping. The call must use original and modified snapshots from the exact comparison, exclude unchanged context, and convert one-based Git runs to zero-based end-exclusive ranges.

Replaced baseline lines belong in `original.deleted`; pure additions belong in `modified.added`; replacement additions belong in `modified.changed`. Do not invent one-to-one replacement pairs. AST entity ranges are context only: they do not replace Git hunks, assign hunk types, or define attention blocks.

The classifier reports `declaration`, `signature`, `statement`, `import`, and `other` syntax roles with exact coverage subranges and optional `test` tags. Verify that the walkthrough converts coverage back to one-based Git coordinates and uses it to seed, not dictate, hunk type and attention:

| Classifier evidence | Expected use |
|---|---|
| Import coverage only | Supporting hunk; attention based on review relevance, normally Cold |
| Import plus statement coverage | Preserve the hunk's Logic/Test intent; normally separate Cold import and Hot/Warm behavior |
| Consumer-visible signature coverage | Inspect visibility and callers; use Logic and Hot when the contract changes |
| Statement coverage with a `test` tag | Test hint for hand-authored assertions or setup; never a claim that tests passed |
| Other coverage | Inspect the actual syntax; do not automatically assign Supporting or Cold |
| Complete declaration addition/deletion | Inspect executable contents and subdivide attention despite the single declaration classification |
| Different original and modified roles | Classify each side independently and reconcile both into exhaustive attention blocks |

Attention ranges are selected source-first, then assigned mechanically derived coordinates. Every range records exact `firstLineContent` and `lastLineContent` without line terminators, and the walkthrough audits those endpoints in a line-numbered ledger before publishing; single-line ranges repeat the same content and blank endpoints use an empty string. Classification receipt warnings require correcting and resubmitting the full payload.

If the classifier is unavailable or cannot resolve a file, ordinary source inspection remains the fallback. The walkthrough must not silently skip an eligible file or create working-tree files to force classification.

## Partial and invalid submissions

Submitted hunks require concrete group IDs, hunk types, and confidence values. When evidence is insufficient to classify a hunk, omit it from an explicitly incomplete inventory and add a scoped limitation. Low confidence requires an uncertainty explanation but does not alone make a report partial.

Exercise these failures:

- Missing, empty, overlapping, unordered, out-of-hunk, or non-exhaustive attention blocks.
- Invalid attention values or zero-length attention ranges.
- Legacy `secondaryChangeTypes`, `changeTypeRanges`, `reviewBlocks`, or `reviewFocus` fields.
- Unknown group/file references, duplicate IDs, overlapping Git hunks, and inconsistent counts.
- Incomplete inventory without `incompleteInventory`.
- Files without hunks and without a scoped limitation.
- Stale or truncated source evidence.

Validation errors must use the host error path and must not produce success-shaped semantic cards.

## Semantic card rendering

A successful `/create-code-walkthrough` ends with the `classify_diff_hunks` invocation. The agent must not emit a follow-up assistant message because that can make the custom semantic result appear as a collapsed secondary tool call. Prose is appropriate only when publication fails or the user explicitly requests an additional textual summary.
