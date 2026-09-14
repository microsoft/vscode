---
title: Issue Wizard
status: ready-for-agent
labels:
  - ready-for-agent
---

# Issue Wizard

## Problem Statement

When something goes wrong in VS Code, the user has to decide whether the cause is a setting, an outdated build, an extension, or a VS Code bug before they know which support path to follow. That is hardest for ordinary users, who may not have Git, the VS Code command-line launcher, a GitHub account, or any contributor tooling installed. Even experienced VS Code contributors must manually gather product information and logs, search for existing issues, reproduce the problem in a clean environment, prepare a useful report, and set up the correct repository and branch before they can test a fix.

This fragmented path costs users time and produces incomplete or duplicate reports for maintainers. It also asks users to find and provide diagnostic data that VS Code can locate itself. At the same time, logs and other diagnostics can contain sensitive information, so collecting or publishing them without clear consent is unacceptable. A useful solution must adapt quietly to the user's existing capabilities, preserve user control over sensitive reads and public posts, and work across the full range from a first-time user to a VS Code team member.

## Solution

Issue Wizard is a support-agent workflow hosted in a normal Agent Host session. A user starts it from a new command, the Help menu, the editor status bar, or the Agents Window title bar. It opens a fresh issue-specific session in the surface where it was invoked and sends a short, visible bootstrap prompt that invokes the bundled Issue Wizard skill. If the invocation does not include a symptom, the agent begins by asking, “What’s going wrong?”

The agent behaves like a concise support engineer. It diagnoses the symptom, checks available dependencies and contributor setup in the background, asks permission before accessing potentially sensitive diagnostics, and uses approval-gated tools to retrieve minimal VS Code product metadata or scoped logs without requiring the user to find files. It then leads the user to one of five MVP outcomes: change a setting, update VS Code, disable or report an extension, prepare a high-quality VS Code issue, or verify and prepare a fix as a draft pull request.

The same flow serves novices and contributors without a persona selector. It takes the fast path when the necessary tools and source checkout already exist, and otherwise performs safe setup work itself or gives concise guidance. It searches for matching GitHub issues before proposing publication, uses existing authenticated capabilities when available, and falls back to anonymous GitHub search or a browser-ready draft when they are not. Before any issue, comment, attachment, branch, or draft pull request is published, the user sees and acknowledges the exact sanitized payload. A draft pull request is offered only after the user explicitly confirms that the original symptom is gone.

## User Stories

1. As a VS Code user with a problem, I want one guided support flow, so that I do not need to know the root cause before asking for help.
2. As an ordinary VS Code user without Git installed, I want Issue Wizard to troubleshoot my problem, so that contributor tooling is not a prerequisite for support.
3. As a VS Code contributor with a ready development environment, I want Issue Wizard to use my existing setup, so that I reach diagnosis and verification quickly.
4. As a user with some but not all contributor dependencies, I want Issue Wizard to adapt to what is already available, so that I do not repeat setup work.
5. As any Issue Wizard user, I want capability detection instead of a novice-versus-expert selector, so that I do not have to classify myself.
6. As a user opening the Command Palette, I want a “Help: Troubleshoot with Issue Wizard...” command, so that I can discover and start the workflow by name.
7. As a user browsing the Help menu, I want an Issue Wizard entry, so that troubleshooting is available where I expect support actions.
8. As a user working in an editor window, I want a bug-icon “Issue Wizard” status bar entry, so that support is always close at hand.
9. As a user in the Agents Window, I want a bug-icon action immediately to the left of the account action, so that I can start troubleshooting without leaving that window.
10. As a keyboard or screen-reader user, I want every Issue Wizard entry point to have an accessible name and explanatory tooltip, so that the icon is not the only way to understand the action.
11. As a user invoking Issue Wizard in an editor window, I want the support session to open in that editor window, so that I am not unexpectedly moved into the Agents Window.
12. As a user invoking Issue Wizard in the Agents Window, I want the support session to open or focus there, so that the workflow remains in my current surface.
13. As a user starting a new investigation, I want each invocation to create a fresh issue-specific session, so that unrelated troubleshooting context does not leak into it.
14. As a user reviewing an agent session, I want the bootstrap prompt to be visible, so that I understand why the agent entered the Issue Wizard workflow.
15. As a user who supplied a symptom at launch, I want that symptom included in the bootstrap prompt, so that I am not asked to repeat myself.
16. As a user who did not supply a symptom, I want the agent to ask what is going wrong, so that the investigation starts with my experience.
17. As a user with screenshots or other context, I want to add them to the normal agent session, so that the agent can use the standard session experience.
18. As a user seeking help, I want the agent to behave like a support engineer, so that it investigates and acts instead of handing me a generic checklist.
19. As a novice user, I want concise explanations of consequential actions, so that I can follow the investigation without being overwhelmed.
20. As an experienced contributor, I want irrelevant capability checks to stay in the background, so that the fast path remains fast.
21. As a user whose environment lacks a required dependency, I want the agent to do safe setup work where possible and explain only what I need to know, so that setup does not become a separate project.
22. As a user whose problem can be resolved without source code, I want the agent to avoid installing contributor dependencies, so that troubleshooting remains proportionate.
23. As a user without a VS Code launcher on PATH, I want the agent to obtain the running product's version and commit reliably, so that command-line setup is not required.
24. As a user running Stable, Insiders, or Code OSS, I want the agent to identify the product quality and commit, so that advice and issue context match the build I am using.
25. As a privacy-conscious user, I want no logs or product diagnostics read or attached automatically, so that I retain control of the information shared with the agent.
26. As a user whose diagnostics may contain sensitive data, I want the agent to ask before reading logs and require approval for every dedicated diagnostic tool, so that diagnostic access is intentional.
27. As a user approving a diagnostic read, I want the host's normal tool approval to remain visible, so that the actual data-access boundary is enforceable.
28. As a user declining a diagnostic read, I want the investigation to continue with the information already available, so that consent is meaningful.
29. As a user granting log access, I want Issue Wizard to locate the relevant VS Code logs itself, so that I do not need to search the file system.
30. As a user granting log access, I want only scoped and relevant log content read, so that unnecessary data is not exposed.
31. As a user sharing diagnostics publicly, I want sensitive values redacted before publication, so that support does not disclose private information.
32. As a user whose symptom is caused by a setting, I want Issue Wizard to identify the setting and explain the change, so that I can resolve the problem immediately.
33. As a user whose symptom is fixed in a newer VS Code build, I want Issue Wizard to recommend the appropriate update, so that I do not file an obsolete bug.
34. As a user whose symptom is caused by an extension, I want Issue Wizard to identify and help disable the extension, so that I can return VS Code to a working state.
35. As a user facing an extension bug, I want Issue Wizard to prepare the right extension-repository report when appropriate, so that the issue reaches the responsible maintainer.
36. As a user facing a likely VS Code bug, I want Issue Wizard to assemble reproduction steps and relevant context, so that maintainers can act on the report.
37. As a user unsure whether my profile causes the symptom, I want Issue Wizard to reproduce in an isolated profile, so that settings and extensions can be ruled in or out.
38. As a user with an active support session, I want isolated reproduction to use a second disposable VS Code process, so that the original session remains available.
39. As a user testing an isolated process, I want Issue Wizard to explain which instance I should interact with, so that the two windows are not confusing.
40. As a user finishing isolated reproduction, I want temporary profiles and processes handled safely, so that troubleshooting does not pollute my normal environment.
41. As a user of installed VS Code rather than Code OSS, I want supported desktop automation techniques to work with my product, so that source builds are not required for diagnosis.
42. As a user reporting a possible bug, I want Issue Wizard to search existing microsoft/vscode issues first, so that I can reuse an existing discussion when one matches.
43. As a user with an installed and authenticated GitHub CLI, I want Issue Wizard to use it for search and publication, so that my established workflow is reused.
44. As a user without the GitHub CLI, I want Issue Wizard to search the anonymous GitHub REST API, so that search does not require installation or sign-in.
45. As a user without a GitHub account, I want diagnosis and duplicate search to continue, so that account creation is not a support prerequisite.
46. As a user shown a potential duplicate, I want a concise explanation of why it matches, so that I can decide whether to join it.
47. As a user with a matching existing issue, I want Issue Wizard to prefer a useful comment over creating a duplicate, so that information stays consolidated.
48. As a user considering an issue comment, I want to approve the exact sanitized comment before posting, so that nothing is published unexpectedly.
49. As a user preparing a new issue, I want to review the exact sanitized title and body, so that the public report accurately represents my experience.
50. As a user preparing a new issue, I want to review and acknowledge every attachment, so that no diagnostic artifact is silently published.
51. As a user who changes my mind during review, I want to decline publication without losing the draft, so that approval is reversible.
52. As a user publishing an Issue Wizard report, I want an invisible Issue Wizard marker included, so that future automation can recognize the workflow without adding visual noise.
53. As an external contributor, I want the report to avoid labels and assignees I cannot apply, so that publication does not fail on repository permissions.
54. As a user authenticated through the GitHub CLI or VS Code, I want Issue Wizard to use the available authenticated route, so that approved publication can be completed for me.
55. As a user without an authenticated posting route, I want a browser-ready draft and clear final action, so that I can publish it myself without installing the GitHub CLI.
56. As a VS Code maintainer reading an Issue Wizard issue, I want clear reproduction steps, environment details, expected behavior, and actual behavior, so that I can triage it efficiently.
57. As a VS Code maintainer reading an Issue Wizard issue, I want only relevant sanitized diagnostics, so that the report is useful without becoming a raw log dump.
58. As a user investigating a real VS Code bug, I want the agent to help reproduce it in Code OSS, so that a source fix can be tested.
59. As a contributor with a local vscode checkout, I want Issue Wizard to detect and reuse it, so that I do not clone the repository again.
60. As a contributor with a partially configured checkout, I want Issue Wizard to use the documented contribution prerequisites to complete setup, so that the environment is reproducible.
61. As a new contributor without a checkout, I want the agent to ask before cloning or creating a fork, so that external changes and disk use remain under my control.
62. As a user whose setup work can run separately, I want the normal session model to permit a grouped subagent or sibling session, so that the support conversation can remain focused.
63. As a VS Code team collaborator, I want Issue Wizard to detect that I can push a branch directly to microsoft/vscode, so that a draft pull request uses the shortest valid path.
64. As an outside contributor, I want Issue Wizard to use an existing local fork when one is available, so that it does not create redundant repositories or remotes.
65. As an outside contributor without a fork, I want Issue Wizard to ask before creating one, so that GitHub-side changes are explicit.
66. As an outside contributor, I want the draft pull request to use a branch from my fork, so that the microsoft/vscode permission model is respected.
67. As a contributor, I want background permission and remote checks summarized only when they affect my next action, so that the agent is informative without narrating implementation detail.
68. As a user testing a proposed code fix, I want the agent to ask me whether the original symptom is gone, so that human verification controls the outcome.
69. As a user who has not confirmed the fix, I want Issue Wizard to withhold pull-request creation, so that an unverified change is not presented as a solution.
70. As a user who confirms the symptom is gone, I want to review the exact sanitized draft pull-request title, body, commits, and attachments, so that I know what will be published.
71. As a user approving a draft pull request, I want Issue Wizard to create it as a draft rather than ready for review, so that the result is clearly marked as preliminary.
72. As a user declining a draft pull request, I want the local fix preserved, so that I can continue iterating without publishing.
73. As a hackathon demonstrator, I want a scenario that ends in a setting recommendation, so that Issue Wizard's simplest support path is visible.
74. As a hackathon demonstrator, I want a scenario that ends in a VS Code update recommendation, so that obsolete-bug detection is visible.
75. As a hackathon demonstrator, I want a scenario that identifies an extension problem, so that ownership routing is visible.
76. As a hackathon demonstrator, I want a scenario that prepares a high-quality issue with reproduction context, so that the maintainer-value path is visible.
77. As a hackathon demonstrator, I want a visual regression scenario based on a historical issue and fix with before-and-after screenshots, so that the end-to-end draft pull-request path is credible.
78. As a demo user verifying the visual-regression fix, I want to be the person who confirms the issue is gone, so that the demo shows the human publication gate.
79. As a provider user, I want Issue Wizard's workflow to be provider-neutral, so that the product is not architecturally coupled to the Copilot provider used in the demo.
80. As a user whose organization disables agent features, I want an explanatory unavailable state instead of a broken launch, so that policy is respected.
81. As a user watching the investigation, I want tool calls and approvals to appear in the normal session transcript, so that the agent's access and actions are auditable.
82. As a user returning to an Issue Wizard session, I want its issue-specific context to remain in session history, so that I can continue the support conversation.
83. As a user encountering a failed setup, search, launch, or publication action, I want the draft and investigation state preserved with a useful recovery action, so that a transient failure does not erase progress.
84. As a user publishing any Issue Wizard artifact, I want the final approval to cover all sanitized text and attachments together, so that the consent boundary is unambiguous.

## Implementation Decisions

- **MVP platform and products:** Implement the hackathon path for macOS desktop first. It must support an installed VS Code product as well as a Code OSS development build. Product discovery must not assume that code, code-insiders, Git, or the GitHub CLI is on PATH.
- **Independent entry point:** Add a new Issue Wizard command rather than taking over or embedding in the existing Issue Reporter. The command label is “Help: Troubleshoot with Issue Wizard...”.
- **Workbench contributions:** Contribute the command to the Command Palette, the Help menu, and an editor status bar entry rendered as “$(bug) Issue Wizard”. Contribute a bug-icon action to the Agents Window title bar immediately to the left of the account action in the bar that also contains “Open in Editor”. Icon-only actions require an explanatory tooltip and accessible label.
- **Surface-local launch:** Route every entry point through one shared launcher orchestration layer. An editor invocation creates and opens the session in the editor workbench; an Agents Window invocation creates or focuses it in the Agents Window. Launching must not redirect the editor user into the Agents Window.
- **Fresh normal session:** Create a fresh issue-specific Agent Host session for each invocation. Do not introduce a separate wizard UI or a user-facing persona selector. Standard session history, attachments, tool calls, approvals, and session grouping remain available.
- **Visible bootstrap:** Send a short visible user message that tells the selected agent to use the bundled Issue Wizard skill. Include an available symptom in that message; otherwise the skill asks “What’s going wrong?” as its first user-facing question.
- **Screenshot capture:** After the conversation starts, show the reusable Issue Reporter capture bar with only its screenshot controls. Keep its highlighted-screenshot flow and Cmd/Ctrl+Shift+S shortcut, attach captures to the exact Issue Wizard session that opened the bar, and do not expose video recording in Issue Wizard.
- **Provider neutrality:** Keep launcher, skill, and tool contracts independent of a particular model provider. Use Copilot for the hackathon demos, but do not encode Copilot-specific behavior in the product flow.
- **Support-agent contract:** The bundled skill owns the investigation behavior. It should act like a support engineer: gather the minimum missing facts, perform safe actions, explain consequential work concisely, keep irrelevant capability probing in the background, and avoid asking the user to locate data the product can obtain itself.
- **Adaptive routing:** Detect available product installations, source checkouts, Git, GitHub CLI authentication, VS Code GitHub authentication, repository remotes, contributor dependencies, and push permissions as they become relevant. Use capabilities to select a path rather than asking the user to choose an expertise level.
- **Proportionate setup:** Do not install contributor tools for setting, update, extension, search-only, or issue-drafting paths. If a confirmed product bug advances toward a source fix, reuse an existing checkout and dependencies; otherwise perform safe setup steps or guide the user according to the VS Code contribution documentation. Ask before cloning, forking, signing in, or making other external changes.
- **Minimal new tools:** Build only two dedicated language-model tool contracts for the MVP: one for running-product metadata and one for scoped VS Code log access. Continue to use existing terminal, file, Git, GitHub, session, and UI capabilities for other work. A dedicated screenshot, CDP, or heap-snapshot tool is not required for the MVP.
- **Product metadata contract:** The metadata tool returns the running product's version, quality, and commit directly from VS Code-owned services. It must not depend on a shell launcher and must not include workspace contents or logs.
- **Scoped log contract:** The log tool resolves the current product's log root through the environment service, exposes only files under that root, supports bounded discovery and reads, and rejects traversal or arbitrary paths. The agent chooses relevant logs rather than requesting a bulk attachment.
- **Diagnostic consent:** Read or attach no diagnostics automatically. Both dedicated diagnostic tools require the Agent Host's normal approval gate. Before potentially sensitive log access, the skill also asks the user for conversational consent. A denied request returns no diagnostic content and must not terminate the support flow.
- **Publication privacy:** Treat diagnostic reads and public publication as separate consent boundaries. Redact secrets, tokens, personal paths, machine identifiers, and unrelated content from proposed public artifacts. Before any issue, issue comment, or pull request is posted, show the exact sanitized text and enumerate every attachment for one explicit user acknowledgement.
- **Investigation lifecycle:** Guide the session through intake, diagnosis, verification, outcome selection, review, and optional publication. The five supported outcomes are a setting change, a VS Code update, an extension disablement or extension report, a VS Code issue or issue comment, and a confirmed code fix followed by a draft pull request.
- **Consequential local changes:** The agent may perform safe read-only checks silently. It must explain and obtain the applicable approval before changing settings, disabling extensions, installing dependencies, creating profiles, cloning repositories, changing remotes, creating forks, pushing branches, or publishing GitHub artifacts.
- **Isolated reproduction:** When a clean environment is needed, launch a second disposable macOS desktop process with an isolated user-data directory and extensions directory while keeping the original support session alive. Clearly distinguish the test instance, use the correct installed-product or Code OSS executable, and clean up temporary state safely when it is no longer needed.
- **Desktop automation:** CDP and Playwright can operate an installed VS Code desktop process or Code OSS when that process is launched with the required remote-debugging configuration. The MVP may use existing terminal and automation capabilities for this; richer dedicated tooling is deferred.
- **Duplicate search:** Search microsoft/vscode issues before proposing a new issue. Prefer the authenticated GitHub CLI when it is installed and signed in. Otherwise call the anonymous GitHub Search Issues REST endpoint with a query equivalent to “is:issue repo:microsoft/vscode <entered title and useful symptom terms>”. Searching must not require a GitHub account.
- **Duplicate handling:** Present likely matches with a short relevance explanation. Reuse a matching issue and propose a comment when it can carry new evidence. Never create an issue or post a comment without reviewing the payload and receiving explicit approval.
- **Publishing fallback:** Use an authenticated GitHub CLI or VS Code GitHub authentication when an approved posting path is available. If neither is available, preserve the prepared text and attachments, open or point to the appropriate browser flow, and tell the user to post it themselves. Do not require installing the GitHub CLI or creating an account merely to complete diagnosis or search.
- **Issue payload:** A new report includes a concise title, expected and actual behavior, reproducible steps, relevant sanitized environment data, and only the approved diagnostics or screenshots. Include an invisible HTML marker such as “<!-- issue-wizard -->” in the body. Do not attempt to set labels or assignees.
- **Pull-request verification gate:** Treat the user's explicit confirmation that the original symptom is gone as a hard gate. The agent may continue testing or refining before confirmation, but it must not create or offer to publish a draft pull request until the user confirms the fix.
- **Pull-request preview:** Before publishing, show the proposed draft pull-request title and body, the commits or diff summary being submitted, and every sanitized attachment. Create a draft only after explicit approval.
- **Collaborator and fork routing:** Detect repository permissions quietly. A microsoft/vscode collaborator may push an approved feature branch directly and open a draft from it. An outside contributor must use a branch on a fork; reuse an existing local fork when possible, ask about a local fork only when it cannot be discovered, and ask permission before creating a new fork. Report only the path that affects the user.
- **Session extensibility:** Use normal Agent Host sessions so the investigation can later delegate lengthy environment setup or independent research to grouped sessions or subagents without inventing a parallel conversation system. The MVP does not depend on automatic delegation.
- **Failure behavior:** Preserve the session, drafts, and local work when diagnostics are denied or when setup, search, authentication, launch, push, or publication fails. Explain the blocking fact and offer the narrowest useful recovery path.
- **Accessibility and policy:** Use existing workbench action, status bar, title bar, focus, keyboard, and screen-reader conventions. Respect Agent Host availability, authentication state, trust boundaries, and managed policy. When the workflow cannot run, expose an understandable unavailable state.
- **Demo fixture strategy:** Prepare five distinct demonstrations, one per outcome. The draft-pull-request demonstration should use a recently fixed visual regression by reverting its fix in the demo branch and should be backed by an original issue and pull request that contain clear before-and-after screenshots. A small purpose-built visual bug is the fallback if no stable historical fixture is suitable.
- **Shared hackathon branch:** Land planning and implementation work through normal, non-force pushes to the shared issue-wizard-hackathon branch. Contributors must account for concurrent changes and pull or rebase safely before pushing.

## Testing Decisions

- Tests should assert externally visible behavior at the highest stable seam. They should not assert private launcher structure, prompt-construction helpers, specific model reasoning, exact incidental agent prose, or the sequence of background capability checks.
- The primary automated seam is the shared Issue Wizard launcher invoked through its command. Exercise it through both surface adapters and verify that it creates a fresh session in the originating surface, focuses that session, and places the visible Issue Wizard bootstrap message with or without a supplied symptom.
- Add lightweight contribution assertions or smoke coverage for the Command Palette, Help menu, editor status bar, and Agents Window title-bar action. Verify accessible names, tooltips, keyboard invocation, and the Agents Window action's placement immediately before the account action.
- Verify that launch reveals the screenshot-only capture bar, the screenshot shortcut targets the exact created Issue Wizard session after focus changes, closing that session removes the bar, and the existing Issue Reporter retains its recording control.
- Follow existing editor chat-session launch prior art around openChatSession and existing Agents Window session-management prior art around ISessionsManagementService. Follow the existing Agent Host delegation pattern where one command has surface-specific presentation behavior.
- Test the product-metadata and scoped-log tool contracts directly through the language-model tool service. Verify that tool execution is approval-gated, denied calls expose no data, metadata works without a shell launcher, and returned metadata is limited to version, quality, and commit.
- For log access, verify that only the environment service's logs root is addressable, traversal and unrelated absolute paths are rejected, discovery and reads are bounded, and no content is returned before approval. Use existing ILanguageModelToolsService approval conventions and IEnvironmentService.logsHome as prior art.
- Test launcher and tool failures as user-visible outcomes: unavailable Agent Host support, denied approval, missing logs, invalid log targets, failed session creation, and unsupported policy should preserve the current workbench state and provide a recovery path.
- Validate the five agent-driven outcomes with end-to-end hackathon scenarios and a manual demonstration rubric rather than brittle assertions about model internals. Each scenario begins with a user-observable symptom and succeeds only when the resulting setting, update, extension action, issue draft, or code fix resolves or faithfully represents that symptom.
- The issue scenario must demonstrate duplicate search, sanitization, an exact payload-and-attachment review, the hidden marker, and either approved publication or the unauthenticated browser fallback. It must not add labels or assignees.
- The draft-pull-request scenario must exercise isolated reproduction, a Code OSS fix, user confirmation that the symptom is gone, exact draft review, and the correct collaborator-or-fork publication path. The agent's own test result is not a substitute for the user's confirmation.
- Run the draft-pull-request demo against a controlled historical visual regression whose original issue and fix contain before-and-after screenshots. Compare the proposed repair with the known fix for demo evaluation, but do not expose that answer to the investigating agent.
- Manually exercise both capability extremes: a clean ordinary-user macOS profile without Git, GitHub CLI, or a launcher on PATH, and a VS Code contributor profile with an existing checkout and authenticated tooling. Confirm that both enter the same workflow while taking appropriately different paths.
- Include a privacy review in demo rehearsal. Inspect all proposed issue and pull-request payloads and attachments to confirm that sensitive paths, tokens, identifiers, and irrelevant log lines are removed and that nothing is published before acknowledgement.

## Out of Scope

- VS Code for the Web, browser-only workbenches, remote windows, containers, Codespaces, and SSH-specific diagnostic paths.
- Automatic detection of frustration signals or unsolicited Issue Wizard launch suggestions.
- A language-model tool that lets any agent start Issue Wizard on the user's behalf; the explicit command and skill bootstrap are sufficient for the MVP.
- Dedicated screenshot capture, CDP lifecycle, heap-snapshot capture, heap analysis, CPU profiling, or crash-dump tools. Existing capabilities may be used when already available, but productized diagnostic tooling is later work.
- Automatic triage, routing, labeling, assignment, or bot processing based on the invisible Issue Wizard marker.
- Taking over or embedding the existing Issue Reporter flow, or exposing video recording in Issue Wizard. The screenshot capture-bar UI may be shared as long as existing Issue Reporter behavior is preserved.
- A user-facing expertise, access-level, or novice-versus-contributor selector.
- Installing the GitHub CLI, requiring GitHub sign-up, or requiring authentication solely for issue search.
- Publishing any issue, comment, branch, attachment, or pull request without explicit review and approval.
- Creating a pull request before the user confirms that the original symptom is gone.
- Automatically assigning @giuspepe or adding microsoft/vscode labels, because outside contributors cannot reliably perform those actions.
- Provider-specific launcher logic or a Copilot-only product architecture.
- Fully eliminating the two-step experience of conversational consent followed by host tool approval; reducing that friction is post-hackathon polish.
- Fully automated multi-session delegation for contributor-environment setup.
- Deterministic unit tests of open-ended model diagnosis or prose.

## Further Notes

- The product vision is broader than bug filing: Issue Wizard should close the loop at the cheapest correct resolution and create public artifacts only when they add value.
- The five successful demo endings are: the user applies a setting change; the user updates VS Code; the user disables or reports an extension; the user approves a complete sanitized issue or comment; and the user verifies a source fix and then approves a draft pull request.
- For the draft-pull-request demo, “tests pass” is necessary but not sufficient. The user must say that the original issue is gone before publication is proposed.
- Historical demo candidates should be recent enough to build reliably, simple enough to understand live, and documented with screenshots in both the original problem and its fix. The demo branch can revert the known fix to seed the investigation.
- The VS Code [How to Contribute](https://github.com/microsoft/vscode/wiki/How-to-Contribute) guide is the source of truth for contributor prerequisites and source-build setup.
- The invisible marker is intentionally inert during the hackathon. A later microsoft/vscode automation may use it to identify Issue Wizard reports without creating notification noise.
- The normal Agent Host session is a deliberate architectural choice: users can see diagnostic reads and approvals, attach screenshots naturally, revisit the investigation, and eventually use grouped sessions or subagents for longer setup and research tasks.
