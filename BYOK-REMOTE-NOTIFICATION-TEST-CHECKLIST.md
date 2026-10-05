# Remote Copilot BYOK warning: test checklist

Use this checklist to verify the warning in Code OSS. Check a case only after observing its expected result. Record unavailable environments as **not tested**, not passed.

## Expected behavior

The warning appears only when all of these are true:

- At least one actual BYOK model is available from a resolved provider. A saved provider group alone is not enough.
- The selected harness is **Copilot**.
- The input is in the **editor window**, not the Agents window.
- The selected remote host or remote workspace is **connected**.
- This editor-window instance has not already shown the warning in another input/session or dismissed it.
- **Don't Show Again** has not been selected for this profile.

Expected text:

> Bring your own key (BYOK) models aren't supported in remote Copilot sessions.
>
> Use a GitHub Copilot model for this session, or switch to the local agent harness to use your own models.

The selected model does **not** need to be BYOK. The warning is about configured BYOK models being unavailable in the selected remote Copilot harness.

## 0. Prepare and avoid false results

- [x] Build the latest changes in this worktree. Ensure built-in extensions are compiled as well as the client.
- [x] Launch the **editor**, without `--agents`, using a dedicated test profile:

  ```bash
  ./scripts/code.sh --new-window \
    --user-data-dir "$HOME/.vscode-oss-byok-test" \
    --shared-data-dir "$HOME/.vscode-oss-byok-test-shared"
  ```

- [x] Confirm the window is running this checkout, not an existing OSS process from another worktree. An existing process using the same user-data directory can receive the launch request. On macOS, fully quit it with **Cmd+Q**, or use a different user-data directory.
- [x] Sign in and prepare a working remote workspace or a remote Agent Host session supported by the editor. Verify it is connected, not just listed.
- [x] Identify the harness selector separately from the model selector. Choose **Copilot**, not Claude, Codex, or the extension-based local chat harness.
- [x] Identify **Chat: Manage Language Models** for adding/removing BYOK models. Hiding a model in the picker is not the same as removing its configuration.
- [x] Use a trusted test workspace. Do not send a prompt unless a case calls for one.

### Reset rules

- **Fresh instance:** run **Developer: Reload Window**. This resets the once-per-instance state, but does **not** reset permanent muting.
- **Fresh unmuted profile:** use a new dedicated user-data directory and configure the required model/connection there. Do not delete your normal profile or edit its storage database.
- **Same-instance cases:** do not reload between their steps.
- Run section 6, permanent muting, **last**.
- A case that displays the warning consumes that instance's first display. Start a fresh instance before the next independent positive case.
- If a different notification occupies the input, resolve or dismiss it before judging this warning. Only one chat-input notification is displayed at a time.

## 1. No BYOK models means no warning

Start in a fresh, unmuted instance with a connected remote Copilot input.

- [x] **1A — No models configured:** remove all BYOK models/provider configurations and wait for model discovery to settle. **Expected:** no BYOK warning.
- [x] **1B — Copilot models only:** retain only built-in Copilot models. **Expected:** no BYOK warning.
- [x] **1C — Provider group without models:** where supported, leave a saved provider group that supplies no models. **Expected:** no BYOK warning.
- [ ] **1D — Remote catalog only:** connect to a host that publishes models, with no client-side BYOK models configured. **Expected:** the host's model catalog alone does not trigger the warning.
- [ ] **1E — Stale cache:** remove BYOK configuration, reload, and allow providers to resolve. **Expected:** no transient warning based only on old cached BYOK models.

## 2. First BYOK model added

Start fresh, unmuted, with zero BYOK models and a connected remote Copilot input.

- [ ] **2A — Add the first model:** add a working BYOK model and wait for its provider to resolve, without reloading. **Expected:** the warning appears in the existing remote Copilot input.
- [ ] **2B — Selected model independence:** in a fresh instance with BYOK configured, select a built-in GitHub Copilot model in the remote Copilot input. **Expected:** the warning still appears; no BYOK selection or prompt is required.
- [ ] **2C — Third-party model source:** if available, repeat with a BYOK extension that registers models without a saved provider group. **Expected:** its resolved BYOK model also qualifies.
- [ ] **2D — Startup resolution:** reload with BYOK already configured. **Expected:** no warning until a BYOK provider has resolved and the selected remote connection is established; then the warning appears.

## 3. Harness and window restrictions

Use an unmuted profile with at least one resolved BYOK model.

- [ ] **3A — Local Copilot:** in a fresh editor instance without a remote workspace, select a local Copilot session. **Expected:** no warning.
- [ ] **3B — Another remote harness:** select Claude or Codex on a connected remote host. **Expected:** no warning.
- [ ] **3C — Extension-based/local chat:** select the local chat harness instead of the Agent Host Copilot harness, including in a remote workspace if available. **Expected:** no warning.
- [ ] **3D — Switch to remote Copilot:** after a negative case above, select a connected remote Copilot session without reloading. **Expected:** the warning appears; an ineligible session did not consume it.
- [ ] **3E — Switch away:** while the warning is visible, select another harness or a local session. **Expected:** the BYOK warning is not visible there.
- [ ] **3F — Agents window:** open the Agents window with BYOK configured and select a connected remote Copilot session. **Expected:** no warning.
- [ ] **3G — Add a model in Agents:** start the Agents window with no BYOK models, then add one while remote Copilot is selected. **Expected:** still no warning.
- [ ] **3H — AI disabled:** disable AI features in the test profile and reload. **Expected:** no BYOK warning or new AI UI. Restore the setting before continuing.

## 4. Only a connected remote session qualifies

Start a fresh instance before each independent connection case. Keep BYOK configured.

- [ ] **4A — Configured but disconnected:** select a saved remote Copilot session whose host is offline. **Expected:** no warning.
- [ ] **4B — Connecting:** initiate a connection and observe the input during connection setup. **Expected:** no warning before the connection is established.
- [ ] **4C — Connection succeeds:** allow 4B to connect without changing the input. **Expected:** the warning appears.
- [ ] **4D — Reconnecting before first display:** lose the connection before the warning has appeared. **Expected:** no warning during reconnection; it can appear when the connection succeeds.
- [ ] **4E — Incompatible host:** if a protocol-incompatible host is available, attempt to connect. **Expected:** no BYOK warning; the connection error can still be shown.
- [ ] **4F — Wrong host connected:** with host A connected and host B disconnected, select a Copilot session belonging to B. **Expected:** no warning; A's connection must not qualify B.
- [ ] **4G — Remote workspace versus another host:** in a connected remote editor workspace, select a disconnected session belonging to a separate host. **Expected:** no warning for that disconnected session.
- [ ] **4H — Connection drops after display:** show the warning, then disconnect its host. **Expected:** the warning disappears and does not return on reconnect in that instance.

### Remote workspace coverage

For each available environment, start a fresh instance with BYOK configured, connect the editor, and select its Agent Host **Copilot** harness. Check both first connection and loss/reconnection behavior.

- [ ] SSH workspace.
- [ ] WSL workspace, on Windows.
- [ ] Dev Container workspace.
- [ ] Codespaces workspace.
- [ ] A separately connected remote Agent Host session exposed in the editor.

## 5. Once per editor-window instance

For each case, start fresh and show the warning in session A. Do not choose **Don't Show Again** yet.

- [ ] **5A — No repetition in another session:** leave A's warning undismissed and open remote Copilot session B. **Expected:** no second warning in B.
- [ ] **5B — Same input, new session:** start a new remote Copilot chat in the same input surface. **Expected:** no new warning.
- [ ] **5C — Multiple inputs:** open another chat input/editor showing an eligible remote Copilot session. **Expected:** only the first eligible input owns the warning, not every input.
- [ ] **5D — Hidden input:** if possible, create an eligible chat input in a background editor before exposing a foreground eligible input. **Expected:** the hidden input does not consume the first visible warning.
- [ ] **5E — Ordinary dismissal:** click **Dismiss notification** (X), then switch sessions and models. **Expected:** no warning for the rest of that instance.
- [ ] **5F — More BYOK models:** after dismissing, add another BYOK model or update an existing model. **Expected:** no repeat.
- [ ] **5G — Remove and re-add:** after the warning has appeared, remove all BYOK models, then add one again without reloading. **Expected:** no repeat, even if the original warning was not manually dismissed.
- [ ] **5H — Disconnect and reconnect:** after the warning has appeared, disconnect and reconnect the host. **Expected:** no repeat.
- [ ] **5I — Reload after ordinary dismissal:** dismiss with X, then run **Developer: Reload Window**, restore the connected remote Copilot input, and wait for BYOK models to resolve. **Expected:** the new instance can show the warning again.
- [ ] **5J — Sending is not permanent muting:** from an eligible input showing the warning, send a harmless prompt if needed. **Expected:** sending does not select **Don't Show Again** or change model configuration; no new warning appears in subsequent sessions.

## 6. Don't Show Again — run last

Start fresh and unmuted with the warning visible.

- [ ] **6A — Mute:** activate the bell-slash button, **Don't Show Again**. **Expected:** the warning disappears immediately.
- [ ] **6B — New sessions:** open other remote Copilot sessions in the same window. **Expected:** no warning.
- [ ] **6C — Configuration changes:** remove/re-add BYOK models and add another model. **Expected:** no warning.
- [ ] **6D — Reload:** run **Developer: Reload Window** and reopen the eligible remote input. **Expected:** no warning.
- [ ] **6E — Full restart:** fully quit OSS, restart with the same test profile, reconnect, and select Copilot. **Expected:** no warning.
- [ ] **6F — Same-profile windows:** if two editor windows use the same profile, mute in one while the other has the warning visible. **Expected:** it disappears in the other window as well and stays muted.
- [ ] **6G — Profile isolation:** open a fresh test profile, configure BYOK, and connect remote Copilot. **Expected:** the warning can appear there; muting the previous profile did not globally disable it.

## 7. Accessibility and presentation

Use an unmuted instance and test before dismissing the warning.

- [x] Warning text matches the copy above and does not claim the selected model itself is BYOK.
- [x] Both **Dismiss notification** and **Don't Show Again** are keyboard reachable and work with Enter/Space.
- [x] The bell-slash control exposes **Don't Show Again** as its tooltip and accessible label.
- [x] A screen reader announces the visible warning without repeatedly announcing it on ordinary model-list updates.
- [x] Dismissing a keyboard-focused warning returns focus to a usable chat input.
- [x] Chat accessibility help in the editor explains temporary dismissal, permanent muting, and once-per-window behavior.
- [x] Agents-window accessibility help does not describe this editor-only warning.
- [x] Warning text wraps and both controls remain usable in narrow chat, light/dark themes, and high contrast.
- [x] No new renderer errors occur while showing, hiding, switching sessions, or muting the warning.

## Optional automated checks

These supplement the manual checklist; they do not establish that an actual remote environment works.

- [ ] Run the focused tests against fresh output:

  ```bash
  npm run transpile-client
  ./scripts/test.sh \
    --run src/vs/workbench/contrib/chat/test/browser/agentSessions/agentHostRemoteByokNotification.test.ts \
    --run src/vs/workbench/contrib/chat/test/browser/widget/input/chatInputNotificationWidget.test.ts \
    --run src/vs/workbench/contrib/chat/test/browser/accessibility/chatAccessibilityHelp.test.ts
  ```

- [ ] Record the test result and any untested remote environments below.

## Results

- Build/commit:
- OS:
- Test profile:
- Remote environments tested:
- Failed case IDs and reproduction steps:
- Cases not tested and why:
- Screenshot/log evidence:
