---
agent: agent
description: Implement and validate chat user prompt scrollbar markers in the active chat transcript
---

## Plan: Chat User Prompt Scrollbar Markers

Implement a chat-specific scrollbar marker overlay in the transcript list pipeline, reusing existing user prompt navigation semantics and dynamic row-height data. Start with a chat-local implementation in the chat widget/list layer, add the minimal list/tree API surface needed to anchor an overlay beside the vertical scrollbar, and keep scope to non-Quick, non-Inline Chat View transcripts.

**Steps**
1. Phase 1: Lock scope and selection semantics.
2. Confirm marker candidates are request rows only, excluding system-initiated requests and superseded rerun/edit rows when newer logical attempts exist for the same logical prompt (latest-only behavior).
3. Confirm host gating in widget construction: include standard Chat View transcript hosts, exclude Quick Chat and Inline Chat (depends on 1).
4. Confirm marker click behavior setting contract: add a chat setting with default Reveal + Focus, alternate Reveal-only (depends on 1).
5. Phase 2: Expose minimal scrollbar-overlay layout API from list/tree stack.
6. Add a small pass-through API from list internals to surface overview-ruler placement metadata based on existing ScrollableElement.getOverviewRulerLayoutInfo (parent container + insertBefore node).
7. Thread that API through tree abstractions so ChatListWidget can obtain layout info without DOM-query hacks (depends on 6).
8. Keep API additions narrow and read-only to avoid broad ownership changes; run layer validation because this touches base list/tree abstractions (depends on 6-7).
9. Phase 3: Build chat-local marker controller in transcript list widget.
10. In ChatListWidget, add an internal marker overlay/controller that:
11. Creates an absolutely positioned overlay adjacent to the vertical scrollbar using the new layout-info API.
12. Tracks the rendered request rows and computes marker geometry from row top/height relative to total scroll height (pixel-based mapping, not index-only).
13. Recomputes marker layout on content changes, item height changes, list scroll, and container/layout changes.
14. Maintains a current/focused marker style by correlating with focused request item.
15. Adds click hit-testing to resolve marker to target request row and executes reveal/focus according to the new setting (depends on 4, 10-14).
16. Adds simple tooltip text for marker hover in v1.
17. Keep lane model single-lane; no additional marker types in this slice.
18. Phase 4: Wire host scoping and configuration.
19. Add configuration enum key and register setting in chat configuration contribution with localized descriptions and default value for Reveal + Focus.
20. Instantiate/enable marker overlay only for allowed chat hosts (non-Quick, non-Inline chat transcript hosts) in ChatWidget list setup (depends on 3, 10-17).
21. Ensure feature stays within existing chat enablement patterns and does not introduce standalone commands/UI contributions requiring new context-key wiring.
22. Phase 5: Styling, theming, and accessibility fit.
23. Add CSS for marker overlay container and marker blocks in chat stylesheet using theme tokens where possible; include active marker state style.
24. Ensure marker interaction remains additive (keyboard prompt navigation remains primary path), with pointer targets and tooltip text that are discoverable.
25. Validate high-contrast readability and focus compatibility; avoid making markers the sole discoverable path.
26. Phase 6: Test and verify.
27. Add focused unit coverage for marker candidate filtering and latest-logical-prompt collapsing behavior.
28. Add unit coverage for click behavior setting outcomes (Reveal + Focus vs Reveal-only) and active marker selection logic.
29. Add unit or focused integration coverage for recompute triggers (content-height change + item-height change + scroll) where practical.
30. Run typecheck and layer validation, then run targeted chat tests.

**Relevant files**
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/actions/chatPromptNavigationActions.ts — Reuse filtering/navigation semantics and ensure behavior parity with keyboard prompt navigation.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/widget/chatWidget.ts — Host scoping and list-widget wiring point; enable markers only for allowed hosts.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/widget/chatListWidget.ts — Primary implementation site for marker overlay lifecycle, geometry recompute, and click handling.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/widget/chatListRenderer.ts — Source of dynamic row-height behavior/events that drive marker drift correction.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/common/model/chatViewModel.ts — Type predicates and request metadata used for marker candidate rules.
- /Users/core/git/matthewcorven/vscode/src/vs/base/browser/ui/scrollbar/scrollableElement.ts — Existing overview-ruler layout hook to reuse for overlay anchoring.
- /Users/core/git/matthewcorven/vscode/src/vs/base/browser/ui/list/listView.ts — Minimal API exposure from list view to layout-info hook.
- /Users/core/git/matthewcorven/vscode/src/vs/base/browser/ui/list/listWidget.ts — Public list API pass-through for layout info and/or scroll metrics.
- /Users/core/git/matthewcorven/vscode/src/vs/base/browser/ui/tree/abstractTree.ts — Tree-level pass-through used by WorkbenchObjectTree consumers.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts — Register new click behavior setting.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/common/constants.ts — Add ChatConfiguration key for marker click behavior.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/browser/widget/media/chat.css — Marker overlay and marker visual styles.
- /Users/core/git/matthewcorven/vscode/src/vs/workbench/contrib/chat/test/browser/** — Add targeted tests for marker filtering/collapse/behavior logic in appropriate existing suites.

**Verification**
1. Type-check source changes with npm run typecheck-client.
2. Run npm run valid-layers-check because list/tree API surface is extended.
3. Run targeted chat tests covering marker filtering, click behavior mode, and recompute-trigger logic.
4. Manual validation in a long chat transcript:
5. Markers render in Chat View transcript hosts and do not appear in Quick Chat or Inline Chat.
6. Marker positions remain aligned as responses grow/shrink and as content is appended.
7. Clicking marker reveals target prompt and either focuses or only reveals based on setting value.
8. Focused request marker style updates correctly during keyboard navigation using existing next/previous user prompt commands.
9. Hover tooltip appears on markers.
10. Accessibility/HC check: markers remain visible in HC themes and keyboard navigation behavior is unchanged.

**Decisions**
- Included scope: Chat View transcript hosts; excluded scope: Quick Chat and Inline Chat.
- Marker click behavior is controlled by a new feature-specific setting.
- Default click behavior: Reveal + Focus.
- Alternate setting mode: Reveal-only.
- Focused user prompt marker gets distinct styling in v1.
- Rerun/edited prompts: latest logical prompt only gets a marker.
- v1 includes basic hover tooltip.
- Not included now: first/last user prompt commands, extra marker lanes/types, generalized reusable marker framework beyond minimal list/tree API exposure.

**Further Considerations**
1. If latest-logical-prompt collapsing is expensive to compute per frame, precompute a logical-prompt map during view-model refresh and reuse during scroll/layout updates.
2. If layer/API review pushes back on list/tree pass-throughs, fallback is a chat-local anchoring strategy, but only as a temporary bridge because DOM-coupled placement is brittle.
3. If marker density becomes high in very long sessions, apply minimum height + merge-nearby zones strategy adapted from overview zone management to preserve clickability.
