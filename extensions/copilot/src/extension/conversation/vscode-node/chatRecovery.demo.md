# Chat Recovery Detection Demo

This runbook exercises the recovery signals implemented in `chatRecovery.ts`. It is written for a live demo, but it can also be used as a manual regression checklist.

## What the Demo Proves

- Recovery evidence is collected from the current request and the previous response.
- Each detected signal appears as a sparse boolean property.
- Signal weights are added once per signal.
- A recovery attempt is reported only when its total score is at least `1`.
- Autopilot, subagent, system-initiated, and first-turn requests are excluded.
- Telemetry is not sent. Results are visible in the debugger and Copilot Chat log only.

## Before the Demo

1. Build the client and Copilot extension.
2. Launch the development instance of VS Code.
3. Open a small disposable workspace with source code and at least one test command that the agent can run.
4. Sign in to Copilot and confirm that Agent mode works.
5. Open `extensions/copilot/src/extension/conversation/vscode-node/chatRecovery.ts` in the source window.
6. Set a breakpoint on the final line of `addSignal`, after `totalScore` is updated.
7. Set another breakpoint immediately after `addResponseSignals` in `getChatRecoveryAttempt`.
8. Open the **GitHub Copilot Chat** output channel in the development instance.
9. Keep the source debugger and the development instance visible side by side.

At the `addSignal` breakpoint, inspect:

```text
signal
recoveryAttempt
recoveryAttempt.totalScore
```

At the breakpoint after `addResponseSignals`, inspect the complete sparse result. Continue execution and wait for the current response to finish. If the score reached `1`, the GitHub Copilot Chat output contains:

```text
[ChatAgentService/FailedRequest] Detected a chat recovery attempt. {...}
```

The log is written after the recovery request finishes. No log is expected for a score below `1`.

The result snippets below list the signals required by each scenario. Normal UI actions can produce additional valid signals. For example, **Retry** usually adds `lastRequestRepeated` because it resubmits the same prompt. When extra signals appear, verify that `totalScore` is the sum of all properties actually present.

## Signal Weights

| Signal | Weight |
| --- | ---: |
| `requestRetried` | 0.25 |
| `requestEdited` | 0.5 |
| `requestChangedModel` | 0.25 |
| `requestReducedPermissions` | 0.5 |
| `lastRequestRepeated` | 0.25 |
| `lastResponseErrored` | 0.75 |
| `documentUserDeleted` | 0.75 |
| `documentUserRejected` | 0.75 |
| `documentUserModified` | 0.5 |
| `documentGeneratedProblems` | 0.5 |
| `documentHasMergeConflicts` | 0.75 |
| `documentGeneratedTestsFail` | 0.75 |
| `planReviewRejected` | 0.75 |

## Recommended Live Demo

These scenarios use ordinary UI actions and are the most suitable for a short presentation. Start each scenario with **New Chat** so state from an earlier scenario does not affect the result.

### 1. Threshold and Sparse Signals

1. Start a new chat with **Default permissions**.
2. Submit: `Create a file named recovery-demo.ts that exports the number 1.`
3. Wait for the response to finish.
4. Change the model in the model picker.
5. Submit a dissimilar follow-up: `List the names of the top-level workspace folders.`
6. At the breakpoints, confirm:

```json
{
  "requestChangedModel": true
}
```

7. Confirm `totalScore` is `0.25` and no recovery log is emitted.
8. Start another new chat and select a model.
9. Submit: `Explain what the scripts folder contains.`
10. Wait for the response to finish.
11. Select **Edit Request**, switch to a different model, and resubmit as: `  EXPLAIN   what the scripts folder contains.  `
12. Confirm `requestEdited`, `requestChangedModel`, and `lastRequestRepeated` are present.
13. Confirm `totalScore` is `1`.
14. After the response finishes, show the recovery log and point out that only detected signal properties are present.

### 2. Reduced Permissions

1. Start a new chat.
2. Set the permission picker to **Allow all**.
3. Submit: `Inspect package.json and tell me the package name.`
4. Wait for the response to finish.
5. Select **Edit Request**.
6. Set the permission picker to **Default permissions**.
7. Replace the prompt with the dissimilar request `List the names of the top-level workspace folders.` and submit.
8. Confirm:

```json
{
  "requestEdited": true,
  "requestReducedPermissions": true,
  "totalScore": 1
}
```

9. Show the recovery log after the response finishes.
10. Repeat in a new chat from **Default permissions** to **Allow all**.
11. Confirm `requestReducedPermissions` is absent for the increase.

Valid reductions are:

```text
Autopilot -> Allow all -> Assisted permissions -> Default permissions
```

The exact options shown depend on product configuration. Do not use Autopilot as the current level when demonstrating the result because current Autopilot requests are intentionally excluded.

### 3. Repeated Request and Model Change

1. Start a new chat.
2. Submit: `Explain what the scripts folder contains.`
3. Wait for the response to finish.
4. Select **Edit Request**.
5. Switch to a different model.
6. Resubmit as: `  EXPLAIN   what the scripts folder contains.  `
7. Confirm:

```json
{
  "requestEdited": true,
  "requestChangedModel": true,
  "lastRequestRepeated": true,
  "totalScore": 1
}
```

8. Show that prompt comparison ignores case and repeated whitespace.
9. Show the recovery log after the response finishes.

### 4. Rejected Generated Change

1. Start a new chat in Agent mode.
2. Submit: `Create recovery-rejected.ts with an exported function named rejectedDemo.`
3. Wait for the file edit controls to appear.
4. Reject the generated change.
5. Select **Retry** on the response.
6. Confirm the required signals:

```json
{
  "requestRetried": true,
  "documentUserRejected": true
}
```

7. Confirm the minimum score is `1`. A repeated-request signal can raise it to `1.25`.
8. Show the recovery log after the retry finishes.

### 5. Generated Error Diagnostic

1. Start a new chat in Agent mode.
2. Submit: `Create recovery-problem.ts containing: export const count: number = "wrong"; Do not fix the type error.`
3. Wait until the generated file has an error in the Problems view.
4. Select **Edit Request** on the request.
5. Replace the prompt with the dissimilar request: `Without changing files, summarize README.md.`
6. Submit the edited request while the error diagnostic is still present.
7. Confirm:

```json
{
  "requestEdited": true,
  "documentGeneratedProblems": true,
  "totalScore": 1
}
```

8. Show the recovery log after the response finishes.

Possible incidental signal: `documentUserModified` if the generated file was manually changed.

## Extended Manual Coverage

Run these scenarios when time and environment permit. They depend more heavily on editor state, model behavior, or tool availability.

### 6. Retried Request

1. Start a new chat.
2. Submit any request and wait for its response.
3. Select **Retry** in the response footer.
4. At `addSignal`, confirm `requestRetried` is added with weight `0.25`.
5. Confirm a retry may also produce `lastRequestRepeated`.
6. If the combined score is below `1`, confirm no recovery log is emitted.

### 7. Previous Response Error

1. Start a new chat using a repeatable setup that produces a real request error, such as a test model configured to fail or a known unavailable endpoint.
2. Submit a request and confirm the response ends in an error rather than a normal refusal or unsuccessful answer.
3. Select **Retry**.
4. Confirm the required signals:

```json
{
  "requestRetried": true,
  "lastResponseErrored": true
}
```

5. Confirm the minimum score is `1`; `lastRequestRepeated` can raise it to `1.25`.
6. Show the recovery log after the retry finishes.

Do not rely on an incorrect answer to trigger this signal. The previous response must contain `errorDetails`.

### 8. User-Modified Generated File

1. Start a new chat in Agent mode.
2. Submit: `Create recovery-modified.ts exporting const original = 1.`
3. Wait for the generated edit to finish.
4. Manually change `1` to `2` in the generated file and save it.
5. Select **Edit Request** on the previous request.
6. Change `original` to `updated` in the prompt and submit.
7. Confirm `documentUserModified` and `requestEdited` are present.
8. Confirm their combined score is `1`.

### 9. Merge Conflict

1. Start a new chat in Agent mode.
2. Ask the agent to create or edit `recovery-conflict.ts`.
3. After the edit, replace its contents with:

```text
<<<<<<< HEAD
export const value = 1;
=======
export const value = 2;
>>>>>>> demo
```

4. Save the file and keep it open.
5. Select **Retry** on the previous response.
6. Confirm `documentHasMergeConflicts` and `requestRetried` are present.
7. Confirm their minimum combined score is `1`. The manual edit and repeated prompt can add other signals.

### 10. Failed Tests for a Generated Change

1. Prepare a small test file whose test command is available to the chat test tool.
2. Start a new chat in Agent mode.
3. Ask the agent to change that test file so one assertion fails, run that specific test, and leave the failure in place.
4. Confirm the response includes a test-tool result with a nonzero failed count.
5. Select **Retry** on the response.
6. Confirm `documentGeneratedTestsFail` and `requestRetried` are present.
7. Confirm their minimum combined score is `1`. A repeated-request signal can raise it to `1.25`.
8. Run a follow-up variant in which a failed run is followed by a passing run for the same changed file.
9. Confirm `documentGeneratedTestsFail` is absent because only the latest relevant test run counts.

The test run must target a file recorded in the previous generated working set. A failure for an unrelated file is ignored.

### 11. Rejected Plan Review

1. Start a new chat in Plan mode.
2. Submit a task that causes the agent to produce a plan for review.
3. Select **Reject** in the plan review UI.
4. Select **Retry** on the associated response.
5. Confirm `planReviewRejected` and `requestRetried` are present.
6. Confirm their minimum combined score is `1`. A repeated-request signal can raise it to `1.25`.
7. In a second run, accept the latest plan review.
8. Confirm `planReviewRejected` is absent even if an earlier review was rejected.

### 12. Generated Document No Longer Open

1. Start a new chat in Agent mode.
2. Ask the agent to generate two files.
3. Wait for the response to finish, then close one generated file without deleting it from disk.
4. Select **Retry** on the response.
5. Confirm `documentUserDeleted` and `requestRetried` are present.
6. Confirm their minimum combined score is `1`. A repeated-request signal can raise it to `1.25`.

Important: the current implementation treats a changed document missing from `vscode.workspace.textDocuments` as deleted. This scenario demonstrates the implemented behavior, not reliable filesystem deletion detection. Call out this limitation during the demo.

## Exclusion Checks

Use the breakpoint at the start of `getChatRecoveryAttempt` for these checks. Each scenario must return `undefined` before signal collection.

### First Turn

1. Start a new chat.
2. Submit the first request.
3. Confirm both previous-turn arguments are absent and the function returns `undefined`.

### Current Autopilot Request

1. Submit one request using a non-Autopilot permission level.
2. Change the current permission level to **Autopilot (Preview)**.
3. Submit another request.
4. Confirm the function returns `undefined`.

### Subagent and System-Initiated Requests

1. Run an agent workflow that delegates to a subagent.
2. Confirm requests with `subAgentInvocationId` return `undefined`.
3. Run a workflow that produces a system-initiated continuation.
4. Confirm requests with `isSystemInitiated` return `undefined`.

These two scenarios are easiest to verify in the debugger because they may not have a direct user-facing control.

## Final Result Checklist

For every reported recovery attempt, verify:

```json
{
  "modelId": "<current model id>",
  "scoringVersion": "2",
  "totalScore": "<sum of unique detected signal weights>",
  "<detected signal>": true
}
```

- The score is at least `1`.
- Every present signal property is `true`.
- Signals that were not detected are absent rather than `false`.
- A signal affecting multiple files contributes its weight only once.
- Unknown permission-level strings do not produce `requestReducedPermissions`.
- The log appears only after the recovery response completes.
- No `chatRecoveryAttempt` telemetry event is sent.

## Suggested Presentation Order

For a 10-minute demo, use this order:

1. Explain sparse signals, weights, and the threshold using the weights table.
2. Run **Threshold and Sparse Signals**.
3. Run **Reduced Permissions**.
4. Run **Repeated Request and Model Change**.
5. Run **Rejected Generated Change**.
6. Show the generated-error scenario if time permits.
7. Finish with the exclusion checks and the note that telemetry remains disabled.

Before presenting, rehearse with the exact model and workspace intended for the demo. Model-generated file and test behavior can vary, while the request-edit, model-change, permission-change, retry, and rejection UI actions are deterministic.
