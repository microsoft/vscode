# Testing the custom trajectory-compaction model locally

This branch routes conversation-history compaction to the
`trajectory-compaction-v1` proxy model (Fireworks deployment
`accounts/msft/deployments/ihfptseo`, registered in
[copilot-proxy#5398](https://github.com/github/copilot-proxy/pull/5398)).
The feature is opt-in via two experiment-based settings.

This document walks through running a local dev build of VS Code with the
flight enabled.

## 1. Prerequisites

- **Node.js 22.22.1** (matches `.nvmrc`)
- **Python 3** and a working C/C++ toolchain (`build-essential` on Linux,
  Xcode CLT on macOS, Build Tools for Visual Studio on Windows) — `node-gyp`
  needs them to compile a few native modules
- **git**
- An **active GitHub Copilot subscription** signed in inside the dev build
  (the trajectory-compaction proxy route is auth-gated; see step 5)

VS Code's full prereq list:
<https://github.com/microsoft/vscode/wiki/How-to-Contribute#prerequisites>

## 2. Clone the branch from the fork

```bash
git clone https://github.com/gryan11/vscode.git
cd vscode
git checkout ryangabriel/custom_trajectory_compaction_model
```

Tracking the upstream is useful if you want to rebase later:

```bash
git remote add upstream https://github.com/microsoft/vscode.git
git fetch upstream
```

## 3. Install dependencies

From the repo root:

```bash
npm install
```

The Copilot extension installs its own dependencies as part of `npm install`.

## 4. Build & launch the dev workbench

Open **two terminals** at the repo root.

### Terminal A — TypeScript watch tasks

```bash
npm run watch
```

This starts the parallel watch tasks for both VS Code core and the built-in
extensions (including the Copilot chat extension). Wait until you see both
`[watch-extensions]` and `[watch-client]` print
`[Finished compilation with X errors]` (X should be 0).

### Terminal B — launch the dev build

After Terminal A reports `Finished compilation`:

```bash
./scripts/code.sh              # macOS / Linux
scripts\code.bat               # Windows (PowerShell or cmd)
```

This launches a self-contained "Code - OSS Dev" window running the source
checkout you just built. Leave it open while you test — edits in Terminal A's
watch will be picked up after a reload (`Ctrl/Cmd+Shift+P` → "Developer:
Reload Window").

## 5. Sign in to Copilot in the dev build

Inside the launched **Code - OSS Dev** window:

1. Open the Accounts gear (bottom-left) → **Sign in to use Copilot…**
2. Complete the device-code flow in the browser

The compaction call requires a real Copilot proxy token. Without sign-in the
request will return 401 from `copilot-proxy.githubusercontent.com`.

## 6. Enable the trajectory-compaction flight

Open **User Settings (JSON)** (`Ctrl/Cmd+Shift+P` → "Preferences: Open User
Settings (JSON)") and add:

```jsonc
{
  // Route compaction through the Copilot agentic proxy
  "github.copilot.chat.conversationCompaction.useAgenticProxy": true,

  // Optional: override the model. Defaults to "trajectory-compaction-v1"
  // when useAgenticProxy is true.
  // "github.copilot.chat.conversationCompaction.model": "trajectory-compaction-v1",

  // Keep automatic background compaction on (this is the default — listed
  // here for clarity in case you've disabled it).
  "github.copilot.chat.summarizeAgentConversationHistory.enabled": true
}
```

Reload the window after editing (`Developer: Reload Window`).

## 7. Trigger a compaction

You have two options:

### Option A — fast: use the `/compact` slash command

1. Open the **Copilot Chat** view
2. Switch the mode to **Agent**
3. Have a conversation with at least one tool call (e.g. ask Copilot to
   "read the README and summarise it" — that triggers `read_file`)
4. Type `/compact` and submit

This bypasses the threshold check and forces a foreground compaction
immediately.

### Option B — realistic: hit the auto-compaction threshold

Background compaction kicks in once context usage crosses ~80%. Run a long
agent conversation that gathers a lot of context (file reads, search,
multiple tool calls) until you see the chat panel briefly show "Compacting
conversation…". The PR also adds a foreground path that runs at
`BudgetExceededError`.

## 8. Verify the compaction model

The fastest way to confirm `trajectory-compaction-v1` was actually used:

1. **Open the Chat Debug Log:** `Ctrl/Cmd+Shift+P` → **"GitHub Copilot:
   Open Chat Debug Log"**
2. Look for the most recent entry with `debugName` containing
   `summarizeConversationHistory` (foreground) or
   `summarizeConversationHistory` from the background summarizer
3. Confirm:
   - The request URL ends in `copilot-proxy.githubusercontent.com/chat/completions`
   - The request body's `"model"` field is `"trajectory-compaction-v1"`
   - The response has `"model": "accounts/msft/deployments/ihfptseo"`
     (the proxy reports the downstream Fireworks deployment)
4. Confirm the **telemetry "model" field** on the compaction entry also
   shows `trajectory-compaction-v1` — this PR threads the resolved
   compaction model into the telemetry/return-value pipeline instead of
   reporting the main agent model.

You can also watch the network call live in DevTools
(`Help → Toggle Developer Tools` in the dev build).

## 9. Quick sanity check (proxy reachability, no UI needed)

If you just want to verify the proxy deployment without exercising the full
agent flow, grab a short-lived Copilot proxy token from the debug log
(`Authorization: Bearer tid=…;exp=…`) and run the smoke script:

```bash
COPILOT_PROXY_TOKEN='tid=...;exp=...' \
  node extensions/copilot/script/devTrajectoryCompactionSmoke.js
```

Expected output on a healthy deploy:

```
status: 200
model returned model: accounts/msft/deployments/ihfptseo
finish_reason: stop
content: "<summary>ok</summary>"
usage: { prompt_tokens: ..., completion_tokens: ... }

✅ trajectory-compaction-v1 reachable via proxy.
```

The token is short-lived (typically ~25 minutes) — grab a fresh one if you
see `401 invalid token: token expired`.

### 9b. CAPI reachability via OAuth sign-in (no proxy token needed)

The current default route for trajectory compaction is **CAPI** (model id
`trajectory-compaction`), not the proxy. To validate that path without a
running VS Code instance, use the OAuth smoke. On first run it does a
GitHub device-flow sign-in, caches the GitHub token at
`~/.copilot-capi-smoke-auth.json` (mode 600), and on every run mints a
fresh short-lived Copilot token via `/copilot_internal/v2/token`:

```bash
node extensions/copilot/script/devTrajectoryCompactionCapiSmoke.js
```

Subsequent runs reuse the cached token; clear it with `--logout`. The
script reads the per-account CAPI base URL (`endpoints.api`) directly out
of the token-exchange response, so it hits the same host the extension
would (typically `https://api.individual.githubcopilot.com`). It sends the
**same conversation body** as the proxy smoke, so a green CAPI smoke means
the extension's compaction-applier will also succeed against this route.

## 10. Disable the flight

Either remove the setting or set:

```jsonc
"github.copilot.chat.conversationCompaction.useAgenticProxy": false
```

Compaction reverts to the main agent endpoint.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401 bad request: invalid token: unknown format` from the proxy | Token expired or missing — re-grab from debug log |
| Compaction still uses the main agent model | Reload the window after changing settings; verify the key spelling (`github.copilot.chat.conversationCompaction.useAgenticProxy`) |
| Native module build errors during `npm install` | Missing C/C++ toolchain — see VS Code wiki prereqs |
| Watch task stuck at `Finished compilation with 1+ errors` | Inspect Terminal A — fix the listed TypeScript error before launching |
| "Sign in to Copilot" fails in the dev build | Some browsers block the device-code popup — copy the URL manually |
