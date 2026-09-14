# Testing semantic diff classification

The agent-host `classify_diff_hunks` server tool validates a classification supplied
by the calling model. The model inspects Git using its existing tools; this tool
does not collect changes, call another model, open an editor, or modify files.
Intent grouping and change type are independent. Tests stay with the behavior
they cover, and one file can contribute different hunks to different groups.

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

## Inspect the renderer without an LLM

Open Component Explorer for this checkout and search for **SemanticDiff**.
These fixtures render the actual chat component, not the old HTML mockup.
Select **chat / semanticDiff / chatSemanticDiffResult**. Each scenario has dark
and light variants; Example and BillingDetails also include high-contrast themes.

Using the full example:

1. Confirm there are three intent cards, not separate Logic/Test/Supporting cards.
2. Expand **Prevent negative billing totals**. Expect three files, four hunks,
   and +12/-5. Its test file appears alongside the implementation files.
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
   > Do not open editors or repeat the entire classification as prose.

4. Confirm the agent first inspects Git and then invokes **Classify Diff Hunks**.
   The tool is read-only and should not itself request confirmation. Existing
   Git/file tools still follow the session's normal permissions.

5. Confirm completed tool output becomes intent cards in the response, rather
   than a raw JSON block hidden in the tool log. Exercise the disclosures above.
   Compare hunk membership and source ranges with the selected Git diff.
   Semantic quality requires human checking: schema validity does not establish
   that the model chose the right intent or type.

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
- Editor navigation, code diffs, viewed checkboxes, review-progress persistence,
  and automatic working-tree refresh are intentionally outside this stage.
