# Testing semantic diff classification

The agent-host `classify_diff_hunks` server tool validates a classification supplied
by the calling model. The model inspects Git using its existing tools; this tool
does not collect changes, call another model, open an editor, or modify files.
Intent grouping and change type are independent. Tests stay with the behavior
they cover, and one file can contribute different hunks to different groups.
The prompt classifies import-statement edits as Supporting, even in test or
generated files. Import-only hunks have no secondary types. Mixed hunks retain
Logic/Test as primary and Supporting as secondary; unchanged imports in context
do not affect classification. New tool submissions also classify every changed
line exactly once through absolute `changeTypeRanges`, so a mixed hunk can render
its imports and behavioral core with different emphasis while retaining the
hunk's primary type color throughout the gutter. Source resolution verifies those
ranges against the recorded Git patch; older stored reports remain supported.

## Automated checks

Use an existing **VS Code - Build** watch task if one is running. Otherwise run
`npm run transpile-client` from the VS Code repository root to refresh test output.
Then run:

```sh
./scripts/test.sh \
  --run src/vs/platform/agentHost/test/common/semanticDiff.test.ts \
  --run src/vs/platform/agentHost/test/node/semanticDiffServerTool.test.ts \
  --run src/vs/platform/agentHost/test/node/serverToolGroups.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/agentSessions/stateToProgressAdapter.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatSemanticDiffResultSubPart.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/widget/chatContentParts/chatToolProgressPart.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/widget/chatListRenderer.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/accessibility/chatResponseAccessibleView.test.ts \
  --run src/vs/workbench/contrib/chat/test/browser/accessibility/chatAccessibilityHelp.test.ts \
  --reporter dot
```

These tests use fixed data, not a live LLM or the current working tree. They cover
validation, derived counts, server-tool registration, provider schema conversion,
live/history transport, errors, and renderer interactions.

For contract changes, use `npm run typecheck-client` unless the build watch task
already supplies current type diagnostics. Use `npm run valid-layers-check` after
changing imports or module ownership.

## Verify import classification with a live model

Use a fresh classification after restarting the development agent host as described
below. Existing reports retain their originally submitted classifications.

Include these cases in a disposable repository, keeping separate cases far enough
apart to remain distinct Git hunks with the documented context options:

| Changed lines | Expected classification |
|---|---|
| Add, remove, reorder, or rewrite imports in a production file | Supporting only |
| Change module paths, aliases, type-only imports, side-effect imports, or multi-line import declarations | Supporting only; explain behavioral consequences if present |
| Change only imports in a test or generated file | Supporting only, not Test or Generated |
| Change imports and production logic in one hunk | Logic primary, Supporting secondary |
| Change imports and test assertions in one hunk | Test primary, Supporting secondary |
| Change logic with unchanged imports in hunk context | Logic; unchanged imports do not add Supporting |

Run the walkthrough prompt below and inspect the submitted hunk classifications.
Verify that actual Git ranges are preserved, no hunk is split or duplicated, and
each import hunk stays in its intent group rather than a separate imports group.
For every hunk, verify that `changeTypeRanges` covers every changed line on both
sides exactly once and assigns changed imports to Supporting even when the hunk
is primarily Logic or Test.
Automated prompt tests protect this guidance; only live-model inspection assesses
whether a particular classification follows it.

## Inspect the renderer without an LLM

Open Component Explorer for this checkout and search for **SemanticDiff**.
These fixtures render the actual chat component, not the old HTML mockup.
Select **chat / semanticDiff / chatSemanticDiffResult**. Each scenario has dark
and light variants; Example and BillingDetails also include high-contrast themes.

Using the full example:

1. Confirm there are three intent cards, not separate Logic/Test/Supporting cards.
   Each card shows `x files +N -M` in the upper-right disclosure control,
   using the unique file count for that group and singular "1 file" when applicable.
   There is no hunk count, "Observed" prefix, or slash in the visible header summary.
   Additions and deletions use the same green/red theme colors as Agents Window
   diff summaries, including in expanded file and hunk details.
   The header totals have no chevron. Only clicking the upper-right statistics
   toggles the card; clicking the title, summary or card background does nothing.
   Enter/Space on the focused statistics button also toggles the card.
   Partial reports retain their separate partial-analysis notice.
   No duplicate totals appear below the paragraph summary.
2. Expand **Prevent negative billing totals**. Expect three files, four hunks,
   and +12/-5. Its test file appears alongside the implementation files.
   The compact file rows show a themed icon, filename, directory and right-aligned
   green/red totals, without type badges, statuses, hunk counts or chevrons.
   Long labels ellipsize, with full paths in the hover and accessible label.
   Clicking a file still reveals its hunk classifications and explanations.
3. Expand **Standardize the internal quantity field**. Expect two files,
   two hunks, and +2/-2. The calculation file appears here as well, but only
   with its quantity-related hunk.
4. Expand the dependency card. Expect two files, two hunks, and +3/-3.
5. Open **Analysis Details**. Expect six unique files, eight hunks, and +17/-10.
   Per-card file counts sum to seven because the calculation file has two intents.
6. Expand a file and its classification details. Check old/new ranges, primary
   and secondary types, evidence, and confidence.
7. Collapse and reopen a parent. Nested expansion state should be retained.
   Selecting or copying text must not toggle a disclosure.
8. Repeat using only Tab, Shift+Tab, Enter, and Space. Check visible focus and
   accessible expanded/collapsed state.
9. Try light, dark, and high-contrast themes, a narrow 320 CSS-pixel container,
   and 200% text zoom. Paths and descriptions must remain readable and copyable.
   File icons should stay vertically centered with the filename at each text size.
10. Inspect partial, empty, and invalid-result fixtures. Missing evidence and
    uncertainty must be explicit; invalid results must not produce valid-looking
    cards. A partial empty result must not say there are no changes.

No card or file interaction should open an editor, rerun Git, or invoke a model.

## Try the tool with a real agent

1. Run the development build from this checkout, not an installed Insiders build:

   ```sh
   ./scripts/code.sh --agents
   ```

   If a development window was already running before this change, fully restart
   that development instance so its agent-host process loads the new tool.
   Keep any existing build watch task running.

2. In the Agents Window, create an agent-host session for a disposable Git
   repository with a known base commit and a small set of staged changes.
   A useful sample contains a behavior fix and regression tests, a separate
   mechanical rename, and a dependency manifest plus lockfile change.
   Sign in to the selected provider if needed. This path requires a live model.

3. Send this prompt:

   > Give me an intent-based code walkthrough of the staged changes against
   > HEAD. Do not edit or commit anything. Inspect the actual Git diff and any
   > necessary surrounding code using your existing tools, then invoke
   > classify_diff_hunks with the complete observed hunk inventory. Keep tests
   > with the behavior they cover. Classify logic, test, supporting, and generated
   > independently of intent. Report missing evidence and uncertainty honestly.
   > Order the groups as a recommended review walkthrough, explaining prerequisites
   > before dependent changes. Give each group a useful paragraph summary.
   > Do not open editors or repeat the entire classification as prose.

4. Confirm the agent first inspects Git and then invokes **Classify Diff Hunks**.
   The tool is read-only and should not itself request confirmation. Existing
   Git/file tools still follow the session's normal permissions.

5. Confirm completed tool output becomes intent cards in the response, rather
   than a raw JSON block hidden in the tool log. Exercise the disclosures above.
   Compare hunk membership and source ranges with the selected Git diff.
   Semantic quality requires human checking: schema validity does not establish
   that the model chose the right intent or type.
   Each card summary should be a self-contained paragraph explaining its logical
   unit's purpose, concrete mechanism, and resulting behavior, including an
   evidence-supported boundary case, compatibility constraint, or test coverage
   where relevant.
   It should not simply list files, repeat counts or the title, or claim
   unsupported test results.
   Check that prerequisite contracts and foundational changes appear before their
   consumers. Among independent units, higher-impact behavior should precede
   routine cleanup. The cards preserve the submitted group-array order; they do
   not sort by filename, title, diff size, or change type.
   Verify that every observed file/range appears only once, even if the same file
   contributes different hunks to several groups. The model should make a targeted
   completion pass to resolve unassigned groups or unknown primary types before
   submission. Defensible tentative assignments use low confidence and an
   explanation; remaining unknowns must identify a genuine evidence gap or
   ambiguity rather than silently dropping the hunk or forcing a guess.

6. Open another session and return, then reload the development window and reopen
   the conversation. The completed report should still render. Disclosure state
   need not survive a full reload.

7. With chat focused, open Accessibility Help and Accessible View using the
   commands/keybindings for your platform. The help describes the disclosures;
   Accessible View includes the classification details and provenance without
   requiring each visual disclosure to be expanded.

8. Repeat with a working-tree comparison and a two-commit comparison, naming the
   scope explicitly. Try an empty comparison. Cancel while the agent is working:
   pending/cancelled calls must not fabricate completed cards.

9. Repeat with another available agent-host provider. The server tool is registered
   centrally rather than as a Copilot-only tool; transport-prefixed tool names are
   recognized on replay as well as during live completion.

## Boundaries and troubleshooting

- The server host transports tool results as strings. To avoid SDK output
  offloading, this tool returns a compact `semanticDiffClassificationReceipt`
  containing schema version, status, source-verification mode, and summary.
  After successful completion, the adapter validates that same invocation's full
  input and checks its derived report against the receipt before rendering.
  The proposed semantic-diff MIME remains a contract identifier, not a new AHP
  content kind or an MCP-app webview.
- Older full-JSON results remain supported. If an older successful invocation
  contains the SDK's "Output too large to read at once" replacement notice, the
  adapter reconstructs the deterministic report from its validated original input.
  It never reads a file path from the notice. Reload the conversation to recover
  these older cards; missing or invalid input still produces an explicit error.
- Native rendering and the chat accessible/plain-text representation consume the
  same validated report. Pending arguments and failed tool results use the host's
  normal tool presentation. Malformed or unsupported successful reports show an
  explicit invalid-result error.
- If the tool is missing, check that the session is an agent-host session in the
  rebuilt development instance, not an extension-host chat or an ephemeral
  session. Restart the development agent host after changing its tool registry.
- If validation fails, the model should correct the reported JSON Pointer issues
  and resubmit the full analysis. Do not reduce the validator to accept bad output.
- Limits are 1 MiB compact UTF-8 input, 100 groups, 200 files, 500 hunks, and
  200 limitations. Over-limit input is rejected, never silently truncated.
- “Complete” describes only the submitted classification inventory. Source
  metadata is agent-reported, not independently checked against Git. It does not
  mean code was reviewed, approved, safe to skip, or still current.
- The classification tool itself does not open editors. The Agents Window's
  separate **Open Group Diff** action supports the pinned comparisons described below.
  Viewed checkboxes, review-progress persistence, editing/staging, and automatic
  working-tree refresh remain outside this stage.

## Test the semantic group editor

Use a newly classified historical PR or another `commitRange` report with full
base/head commit IDs. The Git repository must belong to the owning agent-host
session and contain those objects. Use the classifier's canonical diff options
(`--unified=3 --inter-hunk-context=0 --no-ext-diff --no-textconv --no-color
--find-renames --src-prefix=a/ --dst-prefix=b/`) so submitted hunk boundaries can
be verified against Git.

1. In the Agents Window, activate the **Open Group Diff** icon immediately after
   the statistics in an intent card's upper-right corner. Its tooltip and accessible
   name identify the action; there is no separate text action beneath the summary.
   Check Tab navigation from statistics to the icon and Enter/Space activation.
   Card statistics still only toggle its file list, and file rows still reveal
   inline classifications.
2. If the owning session has several repositories, select the correct one.
   The display-only repository label is not used as a filesystem path.
3. Check that the new read-only editor shows one diff entry per file, containing
   only this group's hunks. Another group's edits in the same file must not appear.
   Diffs always render inline, even at wide editor sizes or after changing filters.
4. Toggle Logic, Test, Supporting, and Generated as available. Mixed-type hunks
   follow their primary type only. The default shows the highest-priority type
   present, plus Unclassified if present. Enable every type to reveal all group
   hunks; there is no separate Show All action.
   Each type's badge shows its group-wide primary-type hunk count, including while
   unchecked. The default categorical palette is Logic purple, Test teal,
   Supporting brown, Generated blue, and Unclassified gray. Red/green remain
   reserved for the native added/deleted highlights and `+N -M` totals.
   Themes can override `semanticDiff.logicForeground`, `semanticDiff.testForeground`,
   `semanticDiff.supportingForeground`, `semanticDiff.generatedForeground`, and
   `semanticDiff.unclassifiedForeground` independently of diff colors.
   Badges use the same small corner radius as the Changes tab, not circular pills.
   Check that only changed lines have matching type markers; unchanged hunk context
   must not be decorated. Removed and added lines share the far-left gutter,
   forming a continuous bar across adjacent changed rows of the same type, never
   on a surviving unchanged line. Hover a marker or added code for its type and summary.
   Native `+`/`-` gutter signs are hidden. Secondary types
   must not duplicate markers or badge counts, and hidden hunks must lose markers.
   Check inserted/deleted functions adjacent to blank lines: marker boundaries
   must match the native diff highlights, even when Git chooses a different
   equivalent alignment. Component fixtures **InsertedFunction** and
   **DeletedFunction** cover this case. Toggle the filter off/on to check it again.
   Use **ContextLines** and **WrappedReplacement** to check continuous bars across
   replacements, including wrapped removed/added lines and gaps for unchanged context.
5. Turn every filter off and check the explicit empty-filter state. Restore a
   type and confirm that the toolbar keeps focus and the file diffs return.
6. Open the same group again to check reuse; open another group to check independent
   filter and view state. Close/reopen or reload to exercise editor restoration.
7. The editor header contains only the filter toolbar. Inspect source metadata,
   filtered-projection information and canonical hunk ranges in Accessible View.
   Loading, source errors, and empty-filter messages appear in the editor body.
   The modified
   text is the baseline plus selected edits, not necessarily the complete target
   file. Its line numbers must not be treated as target-file coordinates.
8. Try an unavailable revision, a mismatched hunk range, and a working-tree report.
   Each must show a clear error, not current workspace content or an empty success.
9. Open Accessibility Help and Accessible View in the editor. Check filter
   navigation, hidden totals, source/projection information, and selected content.

The editor does not fetch missing Git objects, change branches, or invoke an LLM.
Source reads use Git's `--no-lazy-fetch` option; an older Git that lacks this
option must be updated. UTF-8 source is currently bounded to 1 MiB per file side
and per patch, with a 16 MiB resolved-source budget per group. Staged/working-tree
reports are not opened until immutable snapshot support is available.

Focused checks:

```sh
./scripts/test.sh --runGlob '**/*[sS]emanticDiff*.test.js' --reporter dot
./scripts/test-integration.sh \
  --run src/vs/platform/agentHost/test/node/agentHostGitService.integrationTest.ts \
  --grep 'semantic diff source'
```
