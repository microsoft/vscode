---
name: create-test-plan-item
description: 'Create, draft, review, or improve a VS Code test plan item (TPI) GitHub issue. Use when asked for a testplan-item, test plan issue, release testing instructions, verification plan, or TPI. Covers the current microsoft/vscode format, tester matrix, complexity, authors, setup, action-and-outcome checks, platform coverage, edge cases, exploratory testing, and issue metadata.'
argument-hint: '[feature or change to test]'
---

# Creating a Test Plan Item

A test plan item is an executable release-testing issue, not feature documentation. A tester who did not implement the feature should be able to set it up, exercise it, recognize success and failure, and file a useful bug without asking the author for missing context.

## Workflow

### 1. Verify the feature surface

Read the implementation, related issue or pull request, settings registration, and nearby tests before drafting. Build a private inventory of:

- The user-visible change and its intended value
- How the feature is enabled, including exact setting names, defaults, experiments, and release channels
- Supported and unsupported platforms or environments
- Primary workflows, state transitions, and persistence behavior
- Integrations with adjacent features
- Negative, fallback, and error behavior
- Known limitations that testers should not report again

Do not invent behavior from a feature name. Use the product's precise terminology and verify defaults in source.

For editor and source-control features, distinguish these concepts:

- **Source-control quick diff indicators** show added, modified, and deleted ranges in the gutter.
- **Git blame indicators** show author, commit, or age attribution. Do not call quick diff "blame" unless attribution is actually implemented.
- **Agent feedback comments** need lifecycle coverage: eligibility to add feedback, selection and submission, rendered range and card, author/body display, deletion, persistence, and synchronization with other editor surfaces.

### 2. Choose coverage and complexity

Use the tester matrix to express meaningful coverage, not ceremony. Use `anyOS` only when behavior and dependencies are genuinely platform-independent. Otherwise list the required platforms and important configuration combinations.

Treat `Complexity` as total testing time rather than implementation size:

| Complexity | Expected testing time |
|---|---|
| 1 | 1–5 minutes |
| 2 | 5–10 minutes |
| 3 | 10–20 minutes |
| 4 | 20–30 minutes |
| 5 | 30–50 minutes |

Include the time needed to read the TPI, complete setup, and handle likely troubleshooting. Leave some margin for unforeseen problems.

Prefer the smallest coverage matrix that can expose distinct failures. If two platforms use the same path, do not multiply assignments without a reason. If models, providers, architectures, or modes use different paths, make those combinations explicit.

### 3. Draft the issue header

Prefer `Test: <concise feature name>` as the GitHub issue title. In the ten-issue sample, nine titles use `Test:` and one uses lowercase `test:`.

The existing issues use a recognizable header cluster, but not a rigid field order. All ten include tester assignments and `Complexity`; six include `Authors`, five include `Refs`, and nine include at least one **Create Issue** link. The newest issue places its tester matrix after `Complexity` and `Authors`, while most place it first. Use the following normalized order for new TPIs:

```markdown
Refs: #<issue>, #<pull-request>

- [ ] macOS @tester
- [ ] Windows @tester
- [ ] Linux @tester

Complexity: <1-5>

Authors: @author

[Create Issue](https://github.com/microsoft/vscode/issues/new?template=blank&body=Testing+%23<ISSUE_NUMBER>%0A%0A&assignees=<AUTHOR>)

---
```

Guidance:

- Use unchecked tester boxes in a new draft. Preserve existing completion state when revising an issue.
- Use real assignees only when known. Leave an explicit placeholder instead of inventing a username.
- `Refs`, `Authors`, and the **Create Issue** link are optional in observed TPIs, but include them whenever the information is available.
- Add the **Create Issue** link after the TPI has an issue number. It should prefill `Testing #<TPI number>` and assign the feature author.
- Include only one correct **Create Issue** link. Some existing issues contain duplicate or malformed generated links; those are defects, not a convention to copy.
- Do not duplicate the issue title as an H1 unless a body heading materially improves a long plan.

### 4. Explain context and setup

After the separator, give a short description of what changed and what the tester should pay attention to. Then put feature-specific prerequisites before test steps.

Do not restate common release-testing setup such as using the latest Insiders build or signing in to standard services. Call out only unusual requirements and explicit state changes that are part of the test, such as testing both signed-in and signed-out behavior.

Include when applicable:

- Required Insiders or Stable build
- Agents window, desktop, web, or remote context
- Repository, account, policy, service, hardware, or test-data requirements
- Exact settings and their defaults
- Commands or launch flags
- How to create the initial state needed by the test
- Unsupported configurations and what should be absent or disabled there

Make non-trivial setup easy to delegate to AI when practical. For example, ask an agent to create a temporary private repository with the issues, branches, or pull requests needed by the scenarios instead of requiring the tester to prepare each item manually.

The tester should be able to reach the first scenario in roughly ten minutes. Link to specialized setup instructions if reproducing the environment cannot reasonably fit in the issue.

### 5. Write independently verifiable scenarios

Group checks by user workflow or behavior. Existing TPIs mix numbered steps, bullets, and checkboxes. Prefer checkboxes for independently verifiable outcomes, and pair each action with an observable result:

```markdown
- [ ] Set `<setting>` to `<value>` and open `<surface>`. Verify `<specific visible or behavioral result>`.
```

Cover the applicable categories:

- Default behavior before changing settings
- Main user workflow
- Each materially different mode or provider
- State changes and persistence across navigation, reload, or restart
- Multiple instances or cross-surface synchronization
- Negative and unsupported cases
- Errors, cancellation, fallback, and recovery
- Accessibility and keyboard operation for new UI
- Visual feedback, labels, affordances, and empty/loading states
- Performance only when there is a concrete expectation to verify

Use tables or a compact matrix when a cross-product matters. Do not repeat identical prose for every combination.

Keep TPIs short. Prefer a few high-value checks that fit the assigned complexity over exhaustive coverage; reading time is part of the testing budget.

For complexity 3 or greater, usually include a short end-to-end exploratory scenario after the deterministic checks. Focus it on a realistic workflow and name the areas where judgment is useful, such as navigation, state continuity, clarity, or unexpected friction.

### 6. Add caveats and diagnostics proportionally

Add **Known Limitations** when testers need to distinguish expected constraints from bugs. Add **Diagnostics** only when it helps turn a failure into an actionable report, for example:

- Relevant output or log channel
- Diagnostic command
- Expected error message
- State or configuration to capture
- Minimal information needed in a follow-up issue

Do not bury required setup in notes. Do not turn the TPI into an implementation design document.

### 7. Review and publish

Before publishing, check that:

- The title preferably starts with `Test:` and describes user behavior
- `testplan-item` is applied and the release milestone is set
- Tester assignments cover distinct implementation paths
- `Complexity` reflects testing effort
- `Authors` names the person who can answer questions when known
- Every required setting includes its exact key and default
- Every test says both what to do and what to observe
- Defaults, negative cases, persistence, and unsupported environments are covered where relevant
- Terminology matches the implementation
- Known limitations are separated from expected behavior
- The plan is proportional and can be completed in one coherent testing session
- Links and Markdown render correctly

## Reusable Template

Delete sections that do not apply. Do not leave bracketed prompts in a published issue.

```markdown
Refs: [related issues, pull requests, or specification]

- [ ] [platform or configuration] @[tester]
- [ ] [platform or configuration] @[tester]

Complexity: [1-5]

Authors: @[author]

[Create Issue](https://github.com/microsoft/vscode/issues/new?template=blank&body=Testing+%23[ISSUE_NUMBER]%0A%0A&assignees=[AUTHOR])

---

This iteration, [briefly describe the user-visible change, why it matters, and the behavior that deserves attention].

### Setup

1. Use [build/channel/environment].
2. [Enable the feature or create the required state].
3. [Prepare account, repository, data, or service dependencies].

### Settings

- `[setting.key]`: [purpose, accepted values, and default]

### Testing

#### [Primary workflow]

- [ ] [Action]. Verify [specific observable result].
- [ ] [Action that changes state]. Verify [new state and any persistence expectation].

#### [Integration or alternate mode]

- [ ] [Action]. Verify [integration result].
- [ ] [Negative or unsupported action]. Verify [absence, fallback, or error behavior].

### Exploratory

- [ ] Complete [realistic end-to-end workflow]. Pay attention to [specific UX or state-continuity concerns] and file anything confusing or inconsistent.

### Known Limitations

- [Expected limitation and affected configuration]

### Diagnostics

- If [failure] occurs, capture [log/channel/state] and include it in the follow-up issue.
```

## Common Failure Modes

- "Make sure it works" without a measurable expected result
- Setup that assumes team-specific knowledge or inaccessible infrastructure
- `anyOS` used despite native or platform-specific code paths
- A long feature tour with no defaults, boundaries, or failure cases
- UI checks described only with subjective words such as "nice" or "correct"
- Checkboxes that combine several unrelated outcomes and cannot be completed independently
- Implementation details presented as user expectations
- Matrices that multiply work without covering distinct behavior
- Known bugs mixed into expected results
- Stale setting names, defaults, labels, or feature terminology

## Format Basis

This workflow was derived from the full bodies of the ten most recently created public `microsoft/vscode` issues labeled `testplan-item`, inspected on 2026-07-20: [#326388](https://github.com/microsoft/vscode/issues/326388), [#325512](https://github.com/microsoft/vscode/issues/325512), [#325500](https://github.com/microsoft/vscode/issues/325500), [#325499](https://github.com/microsoft/vscode/issues/325499), [#325498](https://github.com/microsoft/vscode/issues/325498), [#325496](https://github.com/microsoft/vscode/issues/325496), [#325466](https://github.com/microsoft/vscode/issues/325466), [#325450](https://github.com/microsoft/vscode/issues/325450), [#325431](https://github.com/microsoft/vscode/issues/325431), and [#324438](https://github.com/microsoft/vscode/issues/324438).

The issues share conventions, not a rigid schema. Keep the metadata and action-outcome discipline, then scale sections to the feature under test.