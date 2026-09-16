---
name: dbgjs-runtime-debugging
description: Investigate a running JavaScript, Node.js, browser, or VS Code process with dbgjs using isolated state and bounded runtime evidence. Use when DOM nodes, loaded sources and source maps, values, logs, coverage, breakpoints, CPU profiles, or heap retention must be inspected without reading source from disk.
---

<!-- Copyright (c) Microsoft Corporation. All rights reserved.
     Licensed under the MIT License. See License.txt in the project root for license information. -->

# Runtime Debugging with dbgjs

Answer one specific runtime question with the least intrusive evidence that can distinguish the relevant outcomes. Do not attach merely because the debugger is available, and do not run every technique in this skill.

## Caller interface

- Accept the caller's problem brief, existing screenshots or observations, target constraints, and one precise runtime question. Preserve any tighter authorization or privacy constraints supplied by the caller.
- Use only `dbgjs` for DOM, loaded-source, source-map, runtime-value, log, coverage, profile, breakpoint, and heap evidence. Do not substitute computer-use, browser, integrated-browser, generic UI automation, or a general Playwright program for runtime inspection. Existing caller-supplied screenshots remain valid evidence.
- Runtime-loaded source and source maps inspected through `dbgjs` are runtime evidence. Do not search the workspace, a local checkout, Git history, or source files on disk, and never export runtime source into the workspace.
- Do not search GitHub, edit code, or choose the caller's next support or implementation path. Return a compact evidence handoff containing the runtime question, bounded observations, interpretation and confidence, and capture limitations.

## Availability and case isolation

1. Check whether `dbgjs` is already on `PATH`. On macOS or Linux use `command -v dbgjs`; on Windows use `Get-Command dbgjs`. If it is present, reuse it and record the installed package version with `npm list --global --depth=0 @hediet/dbgjs` when npm is available. Do not upgrade it automatically.
2. If it is absent and the runtime question justifies debugging, explain that the next command installs a prerelease debugger globally and that it can inspect runtime code and values. In that same response invoke the terminal tool with `npm install --global @hediet/dbgjs@next`; the terminal approval card is the consent surface. After installation, record the exact resolved version. If Node 22 or npm is unavailable, return the limitation; do not install a runtime or package manager.
3. Before the first `dbgjs` command, create a unique private temporary directory for the case, ensure only the current user can read it, and point `DBGJS_SERVICE_STATE` at a `service.json` file inside it. Reuse that exact state path and one explicit context ID for every command in the case. Never use the user's default dbgjs state, focus, context, connection, or target.
4. Put captures only in that private case directory. Treat its service endpoint, runtime values, source, screenshots, profiles, and heap data as sensitive diagnostic material.

On macOS or Linux, initialize the case in one persistent terminal with this shape after substituting a short unique ID for `<case-id>`:

```sh
DBGJS_CASE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dbgjs-runtime.XXXXXX")"
chmod 700 "$DBGJS_CASE_DIR"
export DBGJS_SERVICE_STATE="$DBGJS_CASE_DIR/service.json"
dbgjs --json context create :<case-id> "Runtime Debug <case-id>"
```

On Windows, create a unique directory below the current user's temporary directory, restrict its ACL to that user, set `$env:DBGJS_SERVICE_STATE` to its `service.json`, and create the same explicit context. If later terminal calls do not preserve environment, prefix each command with the recorded state value instead of silently falling back to the default service.

Use JSON mode for bounded commands (`dbgjs --json ...`) and preserve stderr plus the exit code when a command fails because failures are not always JSON. Do not use `daemon view` as a machine-readable command.

## Discover and attach deliberately

- Start with passive discovery. For VS Code use `dbgjs --json process list --root vscode --no-cmd-line`. Do not use `--full` unless passive discovery cannot identify an attachable target and activating inspectors is justified.
- Select the exact product, process role, and window. For VS Code prefer the opaque renderer locator `w:<main-pid>/<window-id>` returned by discovery; use `p:<pid>` for an extension host or agent host. Do not guess from a title substring or silently select the first of several matches.
- Before `dbgjs --json process attach <locator> --context :<case-id>`, state which process or window will be inspected, why it is the right target, and that attachment can activate a debugger capable of reading runtime source and values. Invoke the command in that same response.
- Record the returned context, connection, and canonical target IDs. Pass `--context` on every stateful command that accepts it, and add `--target` only to commands in dbgjs's documented target scope. Loaded-source commands are context-scoped and reject `--target`; offline heap queries use an explicit capture name or object reference instead. Pass `--connection` only when a command accepts connection scope. Do not rely on `--set` or ambient focus.
- Never use `--force`; an ownership conflict is evidence to stop or choose another target, not permission to detach another debugger.
- Observational inspection may attach to the affected process. Never pause, step, set breakpoints in, or take a heap snapshot of a process that must keep the calling conversation or control plane responsive. Use a separate or disposable reproduction target for operations that can pause or substantially stall it.

## Choose a technique from the symptom

- **Visible UI, missing rows, duplicates, labels, or layout:** inspect the renderer DOM first with a narrowly scoped, read-only `target eval` expression that returns only the relevant text, attributes, counts, and ancestry. For duplicates, distinguish repeated DOM renderings from distinct backing values or registrations. Then use `source grep`, `source resolve`, `source show`, and `source map` against loaded runtime sources and source maps when the DOM does not explain where the values were produced. If the expression returns a remote object reference, prefer `value --object-id` for bounded property inspection. Use read-only `target cdp Runtime.getProperties` only when the ordinary value preview cannot expose the relevant listener or closure state; do not issue arbitrary or mutating CDP methods. Do not use `target click` or `target type` merely to inspect DOM.
- **Unexpected runtime state or branching:** prefer `value <expression>` because it rejects side effects by default. Bound previews with `--max-preview-length` and `--max-properties`. Use `target eval` or `value --allow-side-effects` only when mutation is necessary, after explaining the exact effect and obtaining a new approval.
- **An action does nothing, runs twice, or reaches the wrong code path:** start a focused coverage capture, reproduce only the original action, stop the capture, and inspect a bounded authored-source view. Coverage and CPU profiling alter performance; say so before starting, name the one action being measured, and always stop an active capture.
- **A specific handler or value transition remains ambiguous:** on a separate reproduction target, set the narrowest breakpoint or logpoint in a source location identified through runtime source maps. Prepare the resume command before waiting for a pause, inspect only the variables needed to test the hypothesis, and resume in a fail-safe cleanup step. Do not scatter breakpoints or pause future targets by default.
- **Slowness or unexpected work:** use one short CPU profile around the triggering action, then inspect bounded function or file summaries. Do not export the raw profile unless the caller approves retaining it.
- **Memory growth, leaked UI, or duplicated retained state:** use heap capture only when a memory or object-retention question cannot be answered more cheaply. Explain that capture can pause the target and can contain credentials, document text, prompts, and source. Prefer `heap strings`, `heap classes`, `heap select`, `heap refs`, `heap retainer-path`, `heap dominators`, or `heap diff` with tight filters and limits. Never expose internals, preserve full strings, or retain a raw heap snapshot by default.
- **Visual evidence from a separate target:** use `screenshot capture` only when existing evidence is insufficient. Review and sanitize it before returning it to the caller.

Useful bounded command shapes after explicit context and target selection include:

```text
dbgjs --json target eval '<read-only DOM expression>' --max-preview-length 4000 --context :<case-id> --target <target-id>
dbgjs --json value '<side-effect-free expression>' --max-preview-length 240 --max-properties 30 --context :<case-id> --target <target-id>
dbgjs --json value --object-id <remote-object-id> --max-preview-length 240 --max-properties 30 --context :<case-id> --target <target-id>
dbgjs --json source grep '<runtime literal>' --ignore-case --max-results 20 --context-lines 2 --context :<case-id>
dbgjs --json log --after 0 --limit 100 --context :<case-id> --target <target-id>
dbgjs --json coverage start --context :<case-id> --target <target-id>
dbgjs --json coverage stop --id <capture-id> --context :<case-id> --target <target-id>
dbgjs --json coverage show <capture-id> --max-lines 100 --context :<case-id>
dbgjs --json profile start --context :<case-id> --target <target-id>
dbgjs --json profile stop --id <capture-id> --context :<case-id> --target <target-id>
dbgjs --json profile show <capture-id> --view files --max-lines 100 --context :<case-id>
dbgjs --json heap capture --id <capture-id> --context :<case-id> --target <target-id>
dbgjs --json heap strings --grep '<literal>' --capture <capture-id> --limit 20
```

These are shapes, not a checklist. Inspect the current top-level `dbgjs --help` when a needed command rejects documented arguments; it identifies which commands accept target scope. Do not improvise repeated variants blindly.

## Interpret, return, and clean up

- An empty console result does not prove that no error occurred: console capture begins after target configuration and does not include every browser, network, or exception event. Preserve capture coverage and truncation information.
- Reconcile runtime counts with the caller's screenshot or description. If evidence explains only part of the observed count or symptom, state the mismatch and do not invent hidden state.
- Return only the minimum runtime evidence needed to answer the question. Never include raw process trees, service state, environment values, access tokens, full source exports, profiles, or heap snapshots automatically.
- When investigation ends, disconnect or release the case connection, delete the explicit context, stop the isolated dbgjs service, and remove only the verified private case directory. If the caller chooses to retain a capture, name exactly what remains and where before skipping cleanup.
