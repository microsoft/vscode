---
name: pr-descriptions
description: Use when writing, rewriting, or reviewing a pull request title or description, including when creating or updating a PR. Produces customer-impact-first, example-driven descriptions with before/after behavior, focused test steps, and concise validation, and removes cruft such as repeated boilerplate, implementation inventories, hedging, and change history.
---

# Write customer-focused PR descriptions

Reviewers read a PR description first, and testers, release-note writers, support, and future maintainers read it later. Most of them need to know what changes for the person using VS Code before they need to know how the code changed. Lead with that, show it with a concrete example, and cut anything that does not help someone review, test, or understand the change.

## Principles

1. **Impact first.** The opening says who is affected, what they experienced before, and what happens now. Use product language (the chat input, the model picker, the Agents window, an administrator's managed settings), not class or file names.
2. **Show, don't summarize.** One concrete example beats a paragraph of abstraction: a settings snippet and the behavior it produces, before/after screenshots, or the exact error a user saw.
3. **Behavior over mechanics.** Describe observable changes. Mention implementation only where a reviewer needs it to judge risk.
4. **Say what did not change.** Name the invariants a reviewer will worry about: enforcement still applies, saved preferences are preserved, no new settings.
5. **Be honest and brief about limits.** Give known gaps, temporary fallbacks, and follow-ups one line each, linked when tracked.
6. **Describe the final state.** The body explains the PR as it is now, not how it got there. Rewrite sections when the PR changes, and put iteration history in comments.
7. **Scale to the change.** A one-line fix needs two or three sentences. A feature gets sections. Never pad, and never drop the impact.

## Structure

When a repository template applies, preserve its headings, comments, checklist items, and ordering unless the user explicitly opts out. Fit the content below into that structure. Otherwise use only the parts that apply, in this order; omit empty sections and don't write "N/A".

````markdown
Fixes #12345

<Impact: who is affected, what happened before, what happens now. 1-3 sentences.>

<Example: input and resulting behavior, or before/after screenshots.>

## Cause
<Bugs and parity gaps only. Plain language, 1-3 sentences.>

## Changes
- <Behavior-level bullets, bold surface labels where behavior differs.>

<Unchanged: invariants reviewers might worry about.>

## Notes
- <Known gaps, follow-ups, rollout caveats, small unrelated fixes. One line each.>

## How to test
1. <Step with exact values.> **Expected:** <observable result>

**Validation:** <one-line summary of what ran and the outcome>

<details><summary>Commands</summary>…</details>
````

### Title

- Follow the repository's `area: outcome` convention, usually lowercase after the prefix, for example `chat: fix failures when organization settings load slowly`.
- Name the user-visible outcome, not the mechanism. `chat: keep long chats available after restart` tells a reader more than `chat: add fallback to session store hydration`.
- Keep it short enough to read in a list, and don't repeat it as a heading in the body.

### Opening and example

Write the opening for someone who has never seen the code. If only one paragraph gets read, it should still explain the change.

Avoid:

> Expose the runtime's startup defaults through the session configuration so the workbench can resolve them before the first turn.

Prefer:

> New chats ignored the organization's default model until the first message was sent, so users briefly saw and could pick a model their administrator had not chosen. New chats now open with the organization's default already selected.

Then show it. For configuration and policy changes, give the input and the resulting behavior on each surface. This example uses a fictional setting that defaults to `true`; replace it with the actual setting, default, and verified behavior:

````markdown
With this managed setting:

```json
{ "chat.example.enabled": false }
```

- **Editor window:** the feature is hidden and its commands explain that an administrator turned it off.
- **Agents window:** the same restriction applies to new and restored sessions.
````

When adding or changing a setting, name its exact identifier, state its default, and show a representative value and resulting behavior. For an experiment, name it and show the control/baseline and treatment behavior, including what happens without an assignment. For telemetry, name the event and show representative emitted fields and values; state when it is emitted and whether that behavior is enabled by default. Keep examples synthetic and free of customer usage data.

For agent and tool behavior, pair the input with a prompt and what happens:

````markdown
With an organization network allowlist of `example.com`, asking the agent to fetch `https://example.com` succeeds and fetching `https://example.org` is denied.
````

When the change translates one format into another, such as a policy into runtime configuration, show the resulting configuration next to the input. Reviewers need it to judge the risk.

For a handful of combinations, a small input-to-outcome table works. Keep it to the cases a tester will actually try, about six rows. The exhaustive matrix belongs in tests.

Make every example copy-pasteable: JSON parses, commands run as written, and placeholders are obvious.

For UI changes, add labeled **Before** and **After** screenshots or a short recording. Crop to the relevant area and replace the default `Screenshot 2026-…` alt text with a description. Caption each screenshot with what it actually shows. If one is missing or doesn't show the change, ask the author in your reply. Don't leave a placeholder or a request in the PR body.

For error fixes, quote the exact message users saw. If a quoted string contains its own quotation marks, put it in a blockquote.

### Cause

For bugs, including gaps where one surface behaves differently from another. Explain the root cause in plain language and in one to three sentences, enough for a reviewer to see why the fix addresses it. Skip this section for features, clarity improvements, and refactors; their opening already describes the earlier behavior.

### Changes

- For a larger change, use a few bullets about behavior, typically three to six, not a list of files. Reviewers already see the diff. Don't pad a small fix to meet a bullet count.
- Bold surface labels when behavior differs: **Editor window**, **Agents window**, **Remote**, **Web**.
- Bold UI labels and quote user-visible strings exactly as shown, for example **Retry** or **"Loading your organization's managed settings"**.
- Include a new API or extension point that other code can adopt, such as an opt-in hook in a shared registry, even when no user sees it directly.
- Follow with what stays the same, for example: "Organization restrictions still apply before a request runs. No new settings or policy bypasses."

### Notes

Use this for known gaps, temporary behavior, follow-up work, rollout caveats, and small unrelated fixes included in the PR, such as a test fix. Give each one line with an issue link if one exists. Surfaces a reader might expect the change to cover, but which it doesn't, belong here rather than under what stays the same. State a limit once, plainly: "Not yet tested on Windows or WSL." Don't write paragraphs explaining what the PR does not claim.

### How to test

Give numbered steps a reviewer can follow without reading the code. Each step names exact settings, values, commands, or UI labels and ends with the expected result. Mention any setup that must be cleared or restored. Leave out steps that only repeat automated tests.

### Validation

- Lead with a one-line summary of what actually ran and the outcome, with counts when available: "3,191 tests passed, 1 skipped; type-check and lint passed."
- Pair each exact command with its result. Put them in a collapsed `<details>` block when there are more than two or three.
- Remove personal toolchain wrappers, absolute local paths, and machine-specific environment tweaks unless a reviewer needs them to reproduce the result.
- Report checks that cover the final state of the PR. Don't list initial and follow-up rounds. Give each check once, with its latest result. Reuse earlier results only when their relevant inputs are unchanged; changes to a test invalidate that test's earlier result.
- Name the important things you know did not run, in one line. Mention unrelated local failures in one line as well, and itemize them only if the change could have caused them.
- If you don't know what ran or what the results were, ask the author. If you can't ask, name the tests the PR adds and mark the results as missing. Never imply a pass you didn't see.
- For documentation-only or skill-only changes, say what you checked (links, frontmatter, `git diff --check`) and that no product tests apply.

### Links

- Put `Fixes #123` first when the PR closes an issue. Otherwise use `Part of #123` for one slice of a tracked effort, or `Relates to #123` or `Follow-up to #123`. If there's no issue, leave the line out.
- Write references to other repositories in full, as `owner/repo#123` or a full URL.
- For a revert or partial revert, link the original PR and say what is reverted, what is kept, and the user impact that motivated it. State the decision, not "following internal discussions".
- Links to private repositories or internal trackers are fine, but the description must make sense to a reader who cannot open them.

## Non-user-facing changes

Refactors, tests, build, CI, documentation, and skills still need an impact sentence. Name who benefits and how, for example "Contributors can validate an upstream fix with existing CI artifacts instead of building locally." State "No product behavior changes" when that is true, so reviewers don't have to infer it.

## Cut the cruft

Check the draft against this list before posting:

- [ ] Applicable repository template preserved and satisfied, unless the user explicitly opted out.
- [ ] Title not repeated as a heading.
- [ ] No file-by-file, class-by-class, or commit-by-commit inventory.
- [ ] No internal jargon in the opening. Terms a reviewer needs are explained once in plain words.
- [ ] No hedging paragraphs or walls of caveats.
- [ ] No exhaustive edge-case tables. Representative cases only.
- [ ] Examples are valid as written: JSON parses, setting names and commands are exact.
- [ ] The description stands on its own without private links or "internal discussions".
- [ ] No "Update:" sections, CI retry history, or narration of earlier iterations.
- [ ] No personal tool wrappers, local paths, or pasted logs in the main body.
- [ ] No added empty sections, "N/A", or boilerplate checklists beyond the repository template.
- [ ] No hard-wrapped prose. Each paragraph stays on one source line.
- [ ] No customer usage data, customer, organization, or tenant names, confidential incident details, credentials, or private data, including in examples, screenshots, and logs. Describe the scenario generically, for example "administrators who restrict network access".

The opposite failure counts too. A bare `Fixes #123` or a single sentence about the mechanism leaves reviewers to work out the impact themselves. Every description needs at least the impact and how it was verified.

## Example

Illustrative rewrite of the authored content; keep any required repository template around it. Verify the timings, commands, test counts, and coverage for the target PR rather than copying these sample results.

Before:

````markdown
# chat: fix failures when organization settings load slowly

This PR replaces the fixed `raceTimeout` in `PolicyGate.awaitReady()` with a deferred observable state and threads a `CancellationToken` through `ChatRequestService` and `ModelSwitchController`. Files changed: `policyGate.ts`, `chatService.ts`, `chatInputPart.ts`, and 14 tests.

To be clear, this is not a claim that every slow-network scenario is handled...

Update: fixed CI by adjusting a test fixture.

fnm exec --using 24 npm run typecheck-client
fnm exec --using 24 ./scripts/test.sh --grep policy
````

After:

````markdown
Fixes #12345

Slow organization-settings checks no longer fail a chat or model change after 3.5 seconds.

- Show **"Loading your organization's managed settings"** only when the check takes longer than 3.5 seconds, then continue automatically when it finishes.
- Offer **Retry** when the check fails, with a 30-second limit rather than an indefinite wait.
- Keep **Stop** responsive while settings load, including when starting a new chat.

Organization restrictions still apply before a request runs. No new settings or policy bypasses.

## How to test

1. Delay the organization-settings response by more than 3.5 seconds, for example with a debugging proxy.
2. Send a chat message. **Expected:** the loading message appears, and the request runs once settings arrive.
3. Make the settings request fail. **Expected:** **Retry** appears, and selecting it resends the request.

**Validation:** 3,191 tests passed, 1 skipped; type-check passed. Not yet tested on Windows or WSL.

- `npm run typecheck-client`: passed.
- `./scripts/test.sh --grep "managed settings"`: 3,191 passed, 1 skipped.
````

## Agent workflow

When writing or updating a description:

1. Gather the diff against the merge base, linked issues, changed user-visible strings and settings, available screenshots, and the validation that actually ran with its results.
2. Inspect `.github/pull_request_template.md` and `.github/PULL_REQUEST_TEMPLATE/` for the applicable template. Preserve its headings, comments, checklist items, and ordering unless the user explicitly opts out; replace placeholders with accurate details.
3. Identify the user-facing change and who it affects. For changes with no user-facing effect, see [Non-user-facing changes](#non-user-facing-changes).
4. Draft with the structure above, then run the cruft checklist.
5. Check every claim. Behavior comes from the diff, and results come from runs that happened. Never invent screenshots, test counts, or platform coverage.
6. When updating an existing PR, rewrite the affected sections to describe the current state. Keep the author's screenshots and wording unless they are now wrong.
7. Follow your own attribution or footer instructions, if any. This skill adds none. Drafting a description is not permission to commit, push, or publish it; keep local-only requests local.
