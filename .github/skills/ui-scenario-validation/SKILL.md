---
name: ui-scenario-validation
description: Use when reproducing a UI bug or verifying a fix by driving a real VS Code window end to end and capturing evidence. Launches VS Code through the automation MCP, performs the scenario as a user would, and produces a video, per-step screenshots, a Playwright trace, and an HTML report to attach to an issue or pull request.
---

# UI Scenario Validation

Drives a real VS Code instance through a scenario and records reproducible evidence.

Use this to reproduce a reported bug, to show that a fix works, or to attach a recording to a
test-plan item. For deterministic regression coverage that runs on every build, write a smoke test
instead (see the `smoke-tests` skill) — this skill is for one-off, issue-derived validation.

## Prerequisites

```bash
npm install                 # once
npm run electron            # download the Electron runtime
npm run transpile-client    # or `npm run watch` in another terminal
npm --prefix test/mcp run compile
```

The automation MCP server is `test/mcp` (`out/stdio.js`). Add it to your MCP configuration so the
`vscode_automation_*` tools are available; append `--web --headless` to the args to record the web
build instead of Electron.

## Record a clean capture

Set `VSCODE_EVIDENCE_CLEAN_CAPTURE=1` in the MCP server environment.

Evidence capture can draw a step banner into the window it is recording. That banner is part of the
DOM of the product under test, so it can shift layout and affect focus and selectors. With clean
capture enabled the recording shows unmodified UI, and step boundaries are still recorded in
`manifest.json` with timestamps and screenshots.

## Run a scenario

1. Choose a **disposable** workspace folder. Never point a scenario at real work: the run types,
   clicks, and may modify files. Nothing in the recording should contain credentials, tokens, or
   private conversations.
2. Call `vscode_automation_evidence_start` **before** any other automation tool, passing the
   scenario id, title, the source issue URL, and the workspace path. It launches VS Code with an
   isolated profile and starts video plus tracing.
3. For each step:
   - call `vscode_automation_evidence_step` with `status: started` and a one-line intent;
   - inspect the accessibility snapshot before choosing a selector;
   - prefer feature-specific automation tools, then semantic selectors, then coordinates;
   - perform the action the way a user would;
   - **validate through a separate observable signal** — an action completing is not a result;
   - call the step again with `passed`, `failed`, or `skipped` plus concise details.
4. Call `vscode_automation_evidence_finish` with the overall outcome. This stops VS Code and
   finalizes the video, trace, screenshots, `manifest.json`, and `report.html`.

Stop at the first failed required step unless the scenario says otherwise, and mark steps that need
unavailable hardware, accounts, or services as `skipped` rather than passed.

## What makes evidence trustworthy

- Assert on DOM state, accessibility, focus, or text — screenshots support a claim, they do not
  establish one.
- If the bug is a race, make the timing explicit (for example a forced delay or a repeated loop) so
  the recording shows the window in which it occurs rather than relying on luck.
- Record the failing behavior before the fix when you can. A passing run alone does not show that
  the scenario would have caught the bug.

## Report

Evidence is written to `.build/vscode-playwright-mcp/evidence/<run-id>/`:

| File | Contents |
|------|----------|
| `report.html` | Step table, outcome, embedded video |
| `manifest.json` | Step timestamps, statuses, artifact paths, environment |
| `videos/` | Screen recording of the run |
| `*.png` | Per-step screenshots |
| `logs/` | Playwright trace, window and server logs |

Summarize the outcome, list failed or skipped steps, link `report.html`, and state the OS, VS Code
commit, and source issue. Attach the video to the issue or pull request by dragging it into the
comment box.

## Automated validation on a pull request

`microsoft/vscode-engineering` runs the same harness in CI: labelling a pull request
`~requires-ui-validation` researches the change, runs a checked-in scenario adapter against the
exact merge candidate, and posts the per-step result with chaptered video. Use this skill when a
scenario is not yet covered there, or to iterate locally before proposing one.
