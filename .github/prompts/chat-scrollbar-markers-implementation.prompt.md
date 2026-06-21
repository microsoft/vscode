# Chat Scrollbar Markers Implementation Plan

## Objective
Implement the full chat scrollbar marker taxonomy in production code by extending the existing prompt-marker controller to a typed marker pipeline, applying the finalized lane mapping and styling direction, and validating behavior with focused tests.

This plan explicitly excludes discarded experiments to avoid ambiguity.

## Finalized Contract
- Marker types: prompt, askQuestion, fileChange, compaction, error
- Lane mapping:
  - prompt -> right lane
  - askQuestion -> left lane
  - fileChange -> full lane
  - compaction -> full lane
  - error -> full lane
- Styling direction:
  - expressive violet family for prompt taxonomy
  - distinct per-type colors
  - red for error
- Non-goals:
  - no center-lane mapping for taxonomy markers
  - no dual-path center-lane fallback styles

## Phase 1: Scope Lock
1. Lock the taxonomy, lane mapping, and color direction above.
2. Add explicit exclusions to implementation comments where useful.

## Phase 2: Data Model and Collection Refactor
1. Introduce typed marker descriptors in chat marker logic.
2. Include fields needed for rendering and interaction, such as:
   - id
   - requestId (when applicable)
   - marker type
   - lane
   - tooltip label
   - priority
   - min height
3. Replace the single-source prompt marker collection with taxonomy-aware collection.
4. Preserve current prompt filtering rules:
   - request deduplication
   - system-request exclusions
5. Add producers for askQuestion, fileChange, compaction, and error from available view-model signals.
6. Define overlap ordering contract:
   - error highest priority
   - then compaction and fileChange by recency
   - preserve prompt-first interaction targeting where configured

## Phase 3: Rendering and Interaction
1. Upgrade ChatScrollbarPromptMarkerController to render typed markers.
2. Render per-type classes and lane classes instead of one generic marker class.
3. Lane classes required:
   - lane-left
   - lane-right
   - lane-full
4. Ensure no center-lane assignment path remains for taxonomy markers.
5. Keep current hit behavior but make overlap resolution deterministic.
6. Expand marker tooltip labels by marker type.
7. Keep focused-request active-state behavior and make it type-aware.

## Phase 4: Styling and Theming
1. Add taxonomy marker classes in chat CSS for each marker type.
2. Implement expressive violet family and red error styling.
3. Preserve shared geometry language and minimum marker height.
4. Implement lane widths for left, right, and full lanes.
5. Ensure full lane truly spans the marker width.
6. Verify hover and active visibility in normal and high-contrast themes.

## Phase 5: Config and Documentation
1. Add configuration only if necessary for taxonomy behavior.
2. Prefer minimal, constrained settings over many per-type toggles.
3. Keep the scoping prompt unchanged as historical baseline.

### Visual Documentation Requirements
1. Treat .tmp/scrollbar-marker-comparison.html as the canonical visual reference during implementation and QA sign-off.
2. In the PR description, include representative inline HTML and CSS snippets extracted from .tmp/scrollbar-marker-comparison.html.
3. PR documentation must explicitly state:
   - final lane mapping is right, left, and full
   - center-lane taxonomy mapping was intentionally excluded

## Phase 6: Tests and Verification
1. Extend unit tests for marker collection across all taxonomy types.
2. Verify lane assignment contract in tests:
   - prompt right
   - askQuestion left
   - fileChange, compaction, error full
   - no center-lane expectation for taxonomy markers
3. Add interaction tests for overlap and click resolution.
4. Add type/class state assertions where patterns already exist.
5. Run type-check and targeted chat tests before finalizing.

## Relevant Files
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/widget/chatListWidget.ts
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/actions/chatPromptNavigationActions.ts
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/widget/media/chat.css
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/common/constants.ts
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/test/browser/actions/chatPromptNavigationActions.test.ts
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/test/browser/
- /Users/core/git/matthewcorven/vscode/.github/prompts/chat-scrollbar-markers-scoping.prompt.md
- /Users/core/git/matthewcorven/vscode/.tmp/scrollbar-marker-comparison.html

## Verification Checklist
1. Type-check passes.
2. Targeted chat tests pass.
3. Manual validation confirms:
   - prompt markers render right lane
   - askQuestion markers render left lane
   - fileChange, compaction, and error render full lane
   - error remains visually dominant under overlap
   - click behavior remains aligned with existing reveal and focus behavior
4. Quick Chat and Inline Chat remain unchanged unless explicitly scoped later.

## Exclusions
- Center-lane mapping for fileChange, compaction, and error
- Additional speculative marker types beyond finalized taxonomy
- Broad non-chat framework generalization in this change
