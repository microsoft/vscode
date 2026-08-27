# Chat Recovery Detection Demo

This runbook demonstrates chat recovery detection through the information notification shown by VS Code. No debugger or output channel is required for the main demo.

## What the Demo Shows

- A recovery signal is detected from a Copilot interaction or response action.
- After the recovery response finishes, VS Code shows an information notification containing the detected signals and total score.
- Signal properties are sparse: detected signals are present as `true`, while undetected signals are absent.
- A signal contributes its weight only once, even when it applies to multiple files.
- First-turn, Autopilot, subagent, and system-initiated requests are excluded.

The current threshold is `0.2`, so every signal in the following table is sufficient to show a notification.

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

## Create the Demo Workspace

Run the following PowerShell block once. It creates a disposable JavaScript workspace under `%TEMP%` with all files needed by the demo. The local extension exposes `calculator.test.js` through VS Code's Testing API so Copilot can use the `runTests` tool without installing another extension.

```powershell
$demoWorkspace = Join-Path $env:TEMP 'chat-recovery-demo'
Remove-Item $demoWorkspace -Recurse -Force -ErrorAction SilentlyContinue
New-Item $demoWorkspace -ItemType Directory | Out-Null
New-Item (Join-Path $demoWorkspace '.vscode/javascript-test-provider') -ItemType Directory | Out-Null

@'
# Chat Recovery Demo

A small JavaScript calculator used to demonstrate Copilot chat recovery signals.
'@ | Set-Content (Join-Path $demoWorkspace 'README.md') -Encoding utf8

@'
{
  "name": "chat-recovery-demo",
  "private": true,
  "scripts": {
    "test": "node --test calculator.test.js"
  }
}
'@ | Set-Content (Join-Path $demoWorkspace 'package.json') -Encoding utf8

@'
function add(left, right) {
  return left + right;
}

module.exports = { add };
'@ | Set-Content (Join-Path $demoWorkspace 'calculator.js') -Encoding utf8

@'
const assert = require('node:assert/strict');
const test = require('node:test');
const { add } = require('./calculator');

test('add returns the sum', () => {
  assert.equal(add(2, 3), 5);
});
'@ | Set-Content (Join-Path $demoWorkspace 'calculator.test.js') -Encoding utf8

@'
{
  "name": "chat-recovery-demo-test-provider",
  "displayName": "Chat Recovery Demo Test Provider",
  "version": "0.0.1",
  "publisher": "demo",
  "engines": {
    "vscode": "^1.133.0"
  },
  "activationEvents": [
    "onStartupFinished"
  ],
  "main": "./extension.js"
}
'@ | Set-Content (Join-Path $demoWorkspace '.vscode/javascript-test-provider/package.json') -Encoding utf8

@'
const { spawn } = require('node:child_process');
const path = require('node:path');
const vscode = require('vscode');

function activate(context) {
  const controller = vscode.tests.createTestController('chat-recovery-demo-tests', 'Chat Recovery Demo Tests');

  const discoverTests = async () => {
    const files = await vscode.workspace.findFiles('**/*.test.js', '**/node_modules/**');
    controller.items.replace(files.map(uri => controller.createTestItem(uri.toString(), path.basename(uri.fsPath), uri)));
  };

  controller.refreshHandler = discoverTests;
  const profile = controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, async (request, token) => {
    const run = controller.createTestRun(request);
    const tests = request.include ?? [...controller.items].map(([, item]) => item);

    for (const item of tests) {
      if (!item.uri || token.isCancellationRequested) {
        run.skipped(item);
        continue;
      }

      run.enqueued(item);
      run.started(item);
      const result = await runNodeTest(item.uri.fsPath, token);
      run.appendOutput(result.output.replace(/\r?\n/g, '\r\n'), undefined, item);
      if (result.exitCode === 0) {
        run.passed(item);
      } else {
        run.failed(item, new vscode.TestMessage(result.output || `node --test exited with code ${result.exitCode}`));
      }
    }

    run.end();
  }, true);

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.test.js');
  watcher.onDidCreate(discoverTests, undefined, context.subscriptions);
  watcher.onDidDelete(discoverTests, undefined, context.subscriptions);
  context.subscriptions.push(controller, profile, watcher);
  void discoverTests();
}

function runNodeTest(file, token) {
  return new Promise(resolve => {
    const child = spawn('node', ['--test', file], { cwd: path.dirname(file), windowsHide: true });
    let output = '';
    child.stdout.on('data', data => output += data.toString());
    child.stderr.on('data', data => output += data.toString());
    const cancellation = token.onCancellationRequested(() => child.kill());
    child.on('close', exitCode => {
      cancellation.dispose();
      resolve({ exitCode, output });
    });
    child.on('error', error => {
      cancellation.dispose();
      resolve({ exitCode: 1, output: error.message });
    });
  });
}

exports.activate = activate;
'@ | Set-Content (Join-Path $demoWorkspace '.vscode/javascript-test-provider/extension.js') -Encoding utf8

Push-Location $demoWorkspace
try {
  node --test calculator.test.js
} finally {
  Pop-Location
}

Write-Output "Demo workspace: $demoWorkspace"
```

The generated workspace contains:

```text
chat-recovery-demo/
|-- README.md
|-- package.json
|-- calculator.js
|-- calculator.test.js
`-- .vscode/
    `-- javascript-test-provider/
        |-- package.json
        `-- extension.js
```

The setup command must finish with one passing test.

## Launch the Demo

1. Build the client and Copilot extension from the VS Code repository root:

   ```powershell
   npm run compile
   ```

2. In the same PowerShell session used to create the workspace, launch the development instance:

   ```powershell
   .\scripts\code.bat --extensionDevelopmentPath="$demoWorkspace\.vscode\javascript-test-provider" $demoWorkspace
   ```

3. Trust the disposable workspace if prompted.
4. Sign in to GitHub Copilot.
5. Open Chat and select Agent mode with **Default permissions**.
6. Confirm that the Testing activity icon is present. No manual test run is needed.
7. Dismiss any existing notifications so the recovery notification is easy to see.

## Read the Notification

Each scenario starts with **New Chat** to avoid carrying signals from another scenario. The first request establishes history and does not show a recovery notification. The next interaction produces one or more recovery signals.

Wait for the recovery response to finish. VS Code then shows an information notification in this form:

```text
[ChatAgentService/FailedRequest] Detected a chat recovery attempt. {"modelId":"...","scoringVersion":"2","totalScore":0.5,"requestRetried":true,"lastRequestRepeated":true}
```

For each notification, verify:

- `scoringVersion` is `"2"`.
- `totalScore` equals the sum of all signal properties shown.
- Every shown signal is `true`.
- Signals that were not detected are absent, not `false`.

Normal Copilot actions can add valid signals. For example, **Retry** normally adds both `requestRetried` and `lastRequestRepeated`. Verify the signals that are present rather than requiring the payload to contain only the minimum expected signals.

## Recommended Demo

The first three scenarios are enough for a short presentation. They require only Copilot Chat prompts and controls.

### 1. Retry a Response

1. Select **New Chat**.
2. Submit:

   ```text
   Read README.md and reply with the project name only. Do not change files.
   ```

3. Wait for the response to finish. Confirm that no recovery notification appears for this first turn.
4. Select **Retry** in the response footer.
5. Wait for the retried response to finish.
6. Verify that the notification contains at least:

   ```json
   {
     "requestRetried": true,
     "lastRequestRepeated": true,
     "totalScore": 0.5
   }
   ```

### 2. Edit a Request

1. Select **New Chat**.
2. Submit:

   ```text
   Read calculator.js and describe it in one sentence. Do not change files.
   ```

3. Wait for the response to finish.
4. Open the request's **More Actions** menu and select **Edit Request**.
5. Replace the request with:

   ```text
   Read package.json and reply with the test command only. Do not change files.
   ```

6. Submit the edited request and wait for its response to finish.
7. Verify that the notification contains:

   ```json
   {
     "requestEdited": true,
     "totalScore": 0.5
   }
   ```

### 3. Change the Model

1. Select **New Chat** and choose a specific model rather than **Auto**.
2. Submit:

   ```text
   Read README.md and reply with its heading only. Do not change files.
   ```

3. Wait for the response to finish.
4. Choose a different model from the model picker.
5. Submit this dissimilar follow-up:

   ```text
   List the names of the top-level workspace files. Do not change files.
   ```

6. Wait for the response to finish.
7. Verify that the notification contains:

   ```json
   {
     "requestChangedModel": true,
     "totalScore": 0.25
   }
   ```

## Additional Copilot-Driven Scenarios

### 4. Reduce Permissions

1. Select **New Chat** and set the permission picker to **Allow all**.
2. Submit:

   ```text
   Read README.md and reply with its heading only. Do not change files.
   ```

3. Wait for the response to finish.
4. Change the permission picker to **Default permissions**.
5. Submit:

   ```text
   Read package.json and reply with the package name only. Do not change files.
   ```

6. Wait for the response to finish.
7. Verify that the notification contains `"requestReducedPermissions": true` and a minimum `totalScore` of `0.5`.

Permission reductions follow this order:

```text
Autopilot -> Allow all -> Assisted permissions -> Default permissions
```

Do not use Autopilot as the current permission level for the recovery request because current Autopilot requests are excluded.

### 5. Reject a Generated Change

1. Select **New Chat** in Agent mode.
2. Submit:

   ```text
   Create rejected-demo.js exporting a function named rejectedDemo. Do not change any other file.
   ```

3. Wait for the generated edit controls to appear.
4. Reject the generated change from the response.
5. Select **Retry** in the response footer.
6. Wait for the response to finish.
7. Verify that the notification contains at least:

   ```json
   {
     "requestRetried": true,
     "documentUserRejected": true
   }
   ```

`lastRequestRepeated` can also be present. The expected minimum score is `1.0`.

### 6. Fail a Generated Test

1. Select **New Chat** in Agent mode.
2. Submit:

   ```text
   Change calculator.test.js to expect add(2, 3) to equal 6. Run that specific file with the test tool and leave the failing assertion in place.
   ```

3. Allow the edit and test run if Copilot asks for confirmation.
4. Wait for the response to show a test result with a nonzero failed count.
5. Select **Retry** in the response footer.
6. Wait for the response to finish.
7. Verify that the notification contains at least:

   ```json
   {
     "requestRetried": true,
     "documentGeneratedTestsFail": true
   }
   ```

The expected minimum score is `1.0`. `lastRequestRepeated` can raise it to `1.25`.

8. Reset the workspace for another run by asking Copilot:

   ```text
   Restore calculator.test.js so add(2, 3) is expected to equal 5, then run that test file and confirm it passes.
   ```

Only the latest relevant test run counts. After the passing run, a later recovery request should not include `documentGeneratedTestsFail` for the earlier failure.

### 7. Leave a Generated Diagnostic

1. Select **New Chat** in Agent mode.
2. Submit:

   ```text
   Create recovery-problem.ts containing exactly: export const count: number = "wrong"; Leave the type error in place and do not change other files.
   ```

3. Wait for the response and generated edit to finish.
4. Select **Retry** in the response footer.
5. Wait for the response to finish.
6. Verify that the notification contains `"documentGeneratedProblems": true`. A retry and repeated request can add `requestRetried` and `lastRequestRepeated`.

### 8. Reject a Plan

1. Select **New Chat** and switch to Plan mode.
2. Submit:

   ```text
   Plan how to add subtraction to calculator.js and calculator.test.js. Do not implement the plan.
   ```

3. When the plan review appears, select **Reject**.
4. Select **Retry** in the response footer.
5. Wait for the response to finish.
6. Verify that the notification contains `"planReviewRejected": true`. A retry and repeated request can add other signals.

## Exclusion Check

The simplest exclusion to demonstrate does not require debugging:

1. Select **New Chat**.
2. Submit any first request.
3. Confirm that no recovery notification appears. A first turn has no previous request or response to recover from.

Autopilot, subagent, and system-initiated requests are also excluded, but they are not part of the recommended notification demo because they require product-specific workflows or debugger inspection.

## Troubleshooting

- If Testing does not appear, confirm the launch command includes `--extensionDevelopmentPath` and reload the development instance.
- If Copilot uses a terminal command instead of the test tool, repeat the prompt with: `Use the VS Code test tool and pass the absolute path to calculator.test.js.`
- If no notification appears, confirm this is not the first turn, the current request is not using Autopilot, and the recovery response has completely finished.
- If a notification includes extra signals, add their weights to `totalScore`; extra valid signals are not a failure.
- The same payload is written to the **GitHub Copilot Chat** output channel, which can be used as a fallback if the notification disappears before it can be read.
