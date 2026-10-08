# Mission Control gaps, explained

This is a plain-language companion to the [security requirements](./MISSION_CONTROL_SECURITY_REQUIREMENTS.md). It covers only the requirements that are not fully implemented. Each section explains:

- what the requirement means and why it exists;
- where VS Code stands;
- what the upstream Copilot Host (`copilotd`) does;
- what the GitHub Copilot desktop app does;
- roughly what VS Code would have to build.

## The short version

| Gap | One-line summary | `copilotd` has it? | Copilot app has it? | Suggested priority |
| --- | --- | --- | --- | --- |
| [S30 Per-session sharing opt-out](#s30-per-session-sharing-opt-out) | Turning Mission Control on uploads *every* session; you can't keep one private. | Yes | Yes | High |
| [S04 Credential expiry](#s04-credential-expiry) | A remote device keeps access after its GitHub token expires or is revoked. Fix in review: [#340411](https://github.com/microsoft/vscode/pull/340411). | Yes, mostly | Yes (via `copilotd`) | High |
| [S17/S28 Local policy and limits](#s17s28-local-policy-and-limits) | Nothing on your machine limits what Mission Control can ask it to do. | Yes (opt-in) | Available but not turned on | Medium |
| [S15 GitHub Enterprise endpoints](#s15-github-enterprise-endpoints) | Enterprise accounts aren't supported, and one path sends a github.com token to the enterprise server. | Yes | Yes | Medium (fix the token bug now) |
| [S03 Per-device credentials](#s03-per-device-credentials) | All connected devices share one credential pool instead of each using its own. | Yes | Yes (via `copilotd`) | Low–medium |
| [S08 Connection binding](#s08-connection-binding) | A captured sign-in message could be replayed. | Off by default | Off for this machine; on for SSH hosts | Low |
| [S09 Credential hygiene](#s09-credential-hygiene) | Tokens can linger in memory; there's no universal secret scrubber. | Better (Rust) | Mixed | Low |
| [S21 OS sandboxing](#s21-os-sandboxing) | Remote clients are limited by our checks, not by the operating system. | No | No | Defer |
| [S31 Mirror survives restart](#s31-mirror-survives-restart) | Restarting VS Code can leave gaps in the copy Mission Control stores. | Further along | Same as `copilotd` | Defer |
| [S33 Reconnect continuity](#s33-reconnect-continuity) | After a dropped connection, some state may not line up perfectly. | Also partial | Same as `copilotd` | Defer |
| [S29 Privacy approval](#s29-privacy-approval) | Uploading conversations needs a formal privacy/product sign-off. | n/a | Feature is still experimental | Required before release |
| [S34 Release qualification](#s34-release-qualification) | Only one packaged build on one platform has been tested end to end. | n/a | n/a | Required before release |

The two "has it?" columns tell you whether a gap is an accepted limitation of the overall design, or something VS Code simply hasn't caught up on yet. `copilotd` results were checked at the revision the requirements doc pins. Copilot app results were checked at `github/github-app` `main` on 2026-10-08, together with the `copilotd` 0.9.4 binary that the app pins. Nothing was built or run.

## How the Copilot app compares

The Copilot desktop app (`github/github-app`, built with Tauri, React and Rust) is the closest product to what VS Code is building. Its architecture differs in two ways, and that changes how to read the comparison.

1. **Your normal app sessions are separate from "expose this machine".** Sessions you start in the app run in-process through the Copilot CLI runtime. Their sharing is controlled by the runtime's own `remoteSession` mode: Disabled, View only (export to GitHub), or Remote control. Exposing the machine to Mission Control is a separate, experimental switch (Settings → Experimental → Environments). When it's on, the app downloads a pinned `copilotd` 0.9.4 binary, checks its checksum, runs it as a child process, and connects to it as one more host. Turning that switch on does **not** publish your existing app sessions; only sessions created on that daemon live there.
2. **The hosting side is `copilotd` itself.** The app doesn't reimplement the host the way VS Code does, so most security behaviour comes from `copilotd` automatically. What the app controls is how it launches the daemon: `--relay`, `--require-sealed-auth`, the Mission Control token in a private config file, and `COPILOT_GH_HOST` set to the signed-in account's host. It does **not** pass `--require-connection-binding` or any `--policy-*` flags.

VS Code has an equivalent of point 1. The `chat.sessionSync.enabled` setting, which an organization policy can also control and which has an exclude-repositories list, sets `remoteSession: 'export'` for Copilot sessions. VS Code's Mission Control mirror is a separate, second channel on top of that.

## Background: the moving parts

You need a handful of terms to follow the rest of this document.

- **Agent Host.** The background process in VS Code that runs chat agent sessions (Copilot, Claude, and so on). Local VS Code windows talk to it over local IPC.
- **Mission Control (MC).** A GitHub service that keeps a list of your machines ("environments") and lets other devices, such as the Copilot app on your phone or another computer, find and drive them.
- **Registration.** When you set `chat.agentHost.remoteConnections` to `missionControl` and turn on **Allow Remote Connections**, the Agent Host tells MC "I'm here, I belong to this GitHub user", and then sends a heartbeat regularly.
- **Web PubSub (WPS).** An Azure message relay. Remote devices and your Agent Host never connect directly; both connect *out* to WPS, and WPS forwards messages between them. Because MC and WPS sit in the middle, they can see whatever isn't encrypted.
- **AHP (Agent Host Protocol).** The message format both local windows and remote devices use to list sessions, send prompts, read files, open terminals, and so on.
- **Lane.** One remote device's connection through the relay. Each lane has to prove who it is before it can do anything.
- **Sealed token.** When a remote device signs in, it encrypts its GitHub token so that only your Agent Host can decrypt it. MC and WPS just pass along an opaque blob.
- **Signed control message.** Some instructions come from MC itself, for example "a new device wants to connect". MC digitally signs these so the Agent Host can tell they're genuine.
- **Session mirror.** A copy of your session activity that the Agent Host uploads to MC so remote devices can see history.

What a remote device can do: once it proves it is the same GitHub user as the machine's owner, it gets roughly what the owner has. That includes chat sessions, tool calls, files in the granted workspace folders, and **terminals**. That level of access is the reason several of the items below matter.

## S30: Per-session sharing opt-out

> **In short:** Turning Mission Control on uploads *every* session, and you can't keep one private. Both `copilotd` and the Copilot app let you opt out per session. **Priority: high.**

**What it is.** A way to mark an individual session as "don't share this with Mission Control", and have that choice stick, even after VS Code restarts and the session is reloaded from disk (a "cold resume").

**Why it's needed.** MC stores what the mirror sends, and that content is not end-to-end encrypted, so GitHub's service can read it. People often have one sensitive conversation (credentials, a private customer repo, personal notes) on an otherwise shareable machine. Without a per-session switch, the only choice is all or nothing.

**Where VS Code is.** Today the switch is host-wide. Once Mission Control is on, the mirror listens to *every* session event in the Agent Host ([missionControlHost.ts](./missionControlHost.ts)). That covers:

- sessions you started locally in a VS Code window, not just ones started remotely;
- sessions from every agent provider, not just Copilot;
- older sessions, as soon as they produce any new activity.

The only exclusion is new, empty drafts: they aren't mirrored until their first message.

**Upstream.** Implemented. Every session has a `remoteSession` setting of `off`, `export` or `on`. When MC is connected the default is `on`, but an explicit `off` is always honored and is saved with the session so it survives a cold resume.

**Copilot app.** Yes, in both of its roles.

- *Normal app sessions.* Settings → Sessions → "New sessions remote access" picks the default for new sessions: Disabled, View only, or Remote control. A project-level "Remote control" switch, the `/remote` command, and a "Set remote control" command all adjust it. Each session's choice is saved in the app's database (`sessions.remote_session_mode`) and reapplied when the session is resumed.
- Two caveats. First, the default is **View only**, so a new user's session transcripts *are* exported to GitHub unless they change the setting (accounts without Copilot access are switched to Disabled). Second, mid-session the toggle only moves between View only and Remote control. Fully "Disabled" is chosen when the session is created, through the default.
- *Sessions on the exposed machine.* These run on `copilotd`, so they get the `copilotd` behaviour described above.
- The bigger difference is architectural. Exposing the machine in the app doesn't upload the app's existing sessions at all, whereas VS Code's mirror covers every session in its Agent Host.

**What VS Code would need to do.**

1. Add a per-session "share with Mission Control" value. It is decided when the session is created, saved in the session database, and restored on resume.
2. Give the user a way to set it: a default setting plus a per-session toggle in the chat UI.
3. Check it in the mirror *before* admitting anything for that session. That covers the AHP mirror in [missionControlHost.ts](./missionControlHost.ts), the SDK metadata source in [missionControlSdkEventSource.ts](./missionControlSdkEventSource.ts), and lifecycle events.
4. Add tests showing that an opted-out session publishes nothing, including after a cold resume.

Note that the Copilot SDK already has its own `remoteSession: 'export'` option for its *own* session sync. That is a separate channel and does not control this mirror.

**Priority: high.** This is the clearest privacy gap, and upstream already solved it. At minimum, the description of the `missionControl` option of `chat.agentHost.remoteConnections` should say that turning on sharing mirrors *all* sessions on the machine. Today it only says "native session actions are mirrored".

## S04: Credential expiry

> **In short:** On `main`, a remote device keeps access after its GitHub token expires or is revoked. The fix is in review in [#340411](https://github.com/microsoft/vscode/pull/340411), which matches what `copilotd` (and so the Copilot app) does. **Priority: high — land #340411.**

**What it is.** When GitHub issues a token, it can say when that token expires, using the `GitHub-Authentication-Token-Expiration` response header. The requirement is that once that time passes, or the token is revoked, the connection stops being treated as signed in. The host then tells that device "please sign in again" with an AHP `auth/required` notification.

**Why it's needed.** A remote lane is checked once, when it connects. After that it stays trusted until it disconnects. So if you sign out on your phone, revoke a token in GitHub settings, or the token simply expires, that phone may keep steering your machine, and since lanes can open terminals, that means keeping shell access. Expiry is how a revocation actually takes effect.

**Where VS Code is.** On `main`, not implemented. The host checks the remote device's identity against GitHub ([missionControlAuthentication.ts](./missionControlAuthentication.ts)) but ignores the expiry header, so the lane stays authorized until it reconnects or closes. The *client* side already handles an "expired, please re-authenticate" notification (see `cloudSandboxConnectionCustomization.ts`), so only the host side is missing.

Draft PR [#340411](https://github.com/microsoft/vscode/pull/340411) implements the host side:

- **Reading the deadline.** It reads the deadline from GitHub's header and rejects malformed or already-passed deadlines.
- **At the deadline.** It drops the lane's subscriptions and active-client/tool ownership, rejects requests still waiting for the client, and sends exactly one `auth/required` (reason `expired`) to that lane.
- **Late results.** Requests that were already in flight can't return protected results after expiry.
- **Scope.** It applies only to Mission Control lanes.

After it merges, the remaining limits match upstream: no early-renewal warning, and provider work that already started isn't rolled back.

**Upstream.** Mostly implemented. It reads the header, refuses new protected work after the deadline, and sends `auth/required` to the one affected connection. Two parts are still open upstream: renewing *before* expiry, and cutting off things that are already subscribed.

**Copilot app.** Yes. The app's hosting is the `copilotd` 0.9.4 binary, and the expiry watcher (`credential_expiry.rs`) is present in 0.9.4. The app gets this behaviour without doing anything itself.

**What VS Code needs to do.** Review and merge [#340411](https://github.com/microsoft/vscode/pull/340411), which covers:

1. Recording the expiry from GitHub's response headers when validating a lane's token.
2. Checking that deadline before protected actions and when awaited work returns.
3. Revoking the lane at the deadline and sending `auth/required` (reason `expired`) to *that* lane only, exactly once.

Two things still won't be covered after it lands: a mixed local + Mission Control provider setup hasn't been tested against the live service, and there's no warning before expiry.

**Priority: high.** The impact is a revoked device keeping access to a machine with a shell. The fix exists; it needs to land.

## S17/S28: Local policy and limits

> **In short:** Nothing on your machine limits what Mission Control can ask it to do. `copilotd` supports local rules, but the Copilot app doesn't turn them on either. **Priority: medium.**

**What it is.** Rules that live on *your* machine and that Mission Control cannot override. For example: "only allow these repos", "never more than 3 active sessions", "at most 5 new sessions a minute". A separate, smaller part is reporting your organization's device policy to MC; that part is done.

**Why it's needed.** The upstream design treats MC as "a peer, not a trusted controller". If MC were compromised or buggy, your machine should still refuse things you never allowed. This matters more because MC can see a remote device's GitHub token at one point in the flow (when it re-encrypts it for your host). So a compromised MC could, in principle, connect as you.

**Where VS Code is.** We have fixed technical limits that protect against flooding: number of lanes, message sizes, queue sizes ([missionControlProtocolServer.ts](./missionControlProtocolServer.ts)). There is no user- or admin-configurable policy about *what* remote clients may do.

**Upstream.** Implemented, but opt-in. Allowed session types, allowed and denied repos, maximum active sessions, and a spawn-rate limit can all be set from flags or a policy file. The local policy always wins over anything MC sends.

**Copilot app.** It has the capability but doesn't turn it on. The `copilotd` 0.9.4 binary supports the policy flags, but the app launches it without any `--policy-*` flags and offers no UI for them. In practice, the app is in the same position as VS Code today: fixed technical limits, and no user- or admin-configurable rules. That makes this gap less unusual than it first looks, but it's still a gap in both products.

**What VS Code would need to do.**

1. Define a small set of settings, ideally ones that can be enforced by enterprise policy: maximum active remote sessions, a new-session rate limit, and allowed/denied repositories or folders. Possibly also "allow remote terminals: yes/no".
2. Enforce them in the Agent Host when a request comes over the relay, for example in `createSession`, `createTerminal`, and changes to a session's working directory ([protocolServerHandler.ts](../protocolServerHandler.ts)).
3. Never let MC-provided values loosen them.

**Priority: medium.** It is reasonable to defer while the feature is off by default and experimental. It should exist before a broad release, and a "no remote terminals" switch would be the most valuable single control.

## S15: GitHub Enterprise endpoints

> **In short:** Enterprise accounts don't work, and one path sends a github.com token to the enterprise server. The Copilot app keeps token, identity and Mission Control on one GitHub. **Priority: medium; fix the token bug now.**

**What it is.** Companies using GitHub Enterprise sign in to their own GitHub server, not github.com. The requirement is that Mission Control uses the GitHub server the user actually signed in to by default. If someone deliberately points it elsewhere, the user should be told where their conversations will be stored.

**Why it's needed.** Two reasons:

- *Correctness:* identity has to be checked against the same GitHub that issued the token.
- *Data residency:* enterprises often require their data to stay in their own tenant.

**Where VS Code is.** The Mission Control address is hard-coded to `https://api.github.com`, and the token always comes from the github.com sign-in. In practice, Enterprise is not supported; it fails instead of working.

**Bug to fix now:** if your main account is a GitHub Enterprise account, VS Code tells the Agent Host to check identities against your enterprise server. But it still hands over the *github.com* token. That github.com token is then sent to the enterprise server's `/user` endpoint ([missionControlEnvironment.ts](./missionControlEnvironment.ts)). The check fails, so nothing gets registered, but a token has been sent somewhere it doesn't belong.

**Upstream.** Implemented. The MC address defaults to the resolved GitHub host. You can override it, and if the override points somewhere different, `copilotd` logs a warning.

**Copilot app.** Yes. When it launches the daemon, the app sets `COPILOT_GH_HOST`/`GH_HOST` to the host of the account that's signed in. It also passes that same account's token, and strips any inherited environment variables that could redirect the Mission Control address or the GitHub API. Token, identity check, and Mission Control address therefore always point at the same GitHub. This is the model VS Code should copy.

**What VS Code would need to do.**

1. Immediately: refuse to register (or skip the identity call) whenever the token's origin and the identity server don't match.
2. To support Enterprise: choose the right sign-in provider (`github` or `github-enterprise`) based on the user's account, and derive the MC address from the same GitHub host.
3. If an override is ever offered again, show a clear warning when it differs from the user's GitHub host.

**Priority: medium overall. Fix the token-mismatch bug now.** Full Enterprise support can be explicitly marked unsupported for this release.

## S03: Per-device credentials

> **In short:** All connected devices share one credential pool instead of each using its own. `copilotd` keeps them separate; risk is low because every device must be the same GitHub user. **Priority: low–medium.**

**What it is.** Each connected device should use *its own* GitHub credential for the work it starts. The credential is tracked per device and per connection, and when a device signs out, only that device's credentials should be discarded.

**Why it's needed.** It keeps things accountable and contained. If your phone signs out, sessions it started shouldn't keep running on its token. And a token with narrow permissions from one device shouldn't get quietly upgraded by another device's broader token.

**Where VS Code is.** The Agent Host keeps one shared store of credentials, keyed by "which GitHub resource and which permissions", not by device ([agentHostAuthenticationService.ts](../agentHostAuthenticationService.ts)). A remote device's `authenticate` call feeds that shared store.

There is also a deliberate exception for testing. The hidden, default-off setting `chat.agentHost.experimentalMissionControl.useLocalCredentials` makes the host use the *desktop's own* GitHub credential for Copilot work started from a remote device. The remote device still has to prove it is the owner, and the desktop token never leaves the machine. But Copilot work then runs on the desktop's credential rather than the device's. That is the opposite of per-device sponsorship, so it should stay a testing-only override (see [operation and configuration](./MISSION_CONTROL.md#explicit-local-credential-delegation)).

**Upstream.** Implemented. Credentials are stored per device ID, per connection generation, and per resource.

**Copilot app.** Yes, through `copilotd` 0.9.4, which has the same per-device credential store.

**What VS Code would need to do.** Redesign the shared credential store so each credential records which client and connection supplied it. Pin each session to the credential of the device that started it. Define when that pin may move (for example, when the same device reconnects with a new token). Drop a device's credentials on explicit sign-out. This touches the core authentication service, not just Mission Control, which is why it was deferred.

**Priority: low–medium.** VS Code already requires every remote device to be the *same GitHub user* as the machine's owner (S01). So the worst case is "your own other device's token was used", not "someone else's". It is reasonable to defer, but it is a VS Code gap rather than something upstream lacks.

## S08: Connection binding

> **In short:** A captured sign-in message could be replayed on another connection. Optional everywhere for now; VS Code currently can't turn it on. **Priority: low.**

**What it is.** When a remote device sends its sealed token, it can also include the current connection's one-time "challenge". That ties the token to this one connection, so it can't be reused.

**Why it's needed.** Without binding, someone who captures the sealed blob could replay it later on a different connection and get signed in. Realistically that "someone" is whoever controls the relay. They still can't *read* the token, but they could reuse it as-is.

**Where VS Code is.** The host checks a binding whenever the client includes one, but accepts sealed tokens without a binding. That's because the Mission Control clients in use today don't send one. There is no longer a setting to require it.

**Upstream.** The same default: transition mode, off by default. It has a `--require-connection-binding` flag to turn it on.

**Copilot app.** For "expose this machine", it's the same as VS Code: the app passes `--require-sealed-auth` but not `--require-connection-binding`, so unbound tokens are accepted. Daemons the app installs on remote machines over SSH *do* get `--require-connection-binding`. So the app's team considers binding workable where it controls both ends, and VS Code could reasonably turn it on in the same situations.

**What VS Code would need to do.** Once MC's clients support binding, require it. Until then, optionally restore an advanced setting to require it, for people testing with compatible clients. The checking code already exists.

**Priority: low.** This matches upstream's current posture, so it is an acceptable deferral.

## S09: Credential hygiene

> **In short:** Tokens can linger in memory, and nothing scrubs secrets from all output. Mostly a JavaScript limitation. **Priority: low.**

**What it is.** Tokens should never be written to logs or disk, and should be wiped from memory when no longer needed.

**Why it's needed.** Logs get attached to bug reports, and disk contents get backed up and synced. Leftover secrets in memory can end up in crash dumps.

**Where VS Code is.** The important paths are covered. The relay redacts tokens before logging, the encryption keys and decrypted buffers we own are wiped, and the discovery files contain no credentials. What isn't guaranteed:

- JavaScript strings can't be wiped; they stay in memory until garbage-collected.
- Other parts of VS Code's authentication may keep their own copies.
- A tool or agent that prints a secret into chat output isn't filtered.

**Upstream.** It uses Rust types that zero memory on drop, plus a runtime "secret filter" that scrubs known secrets from agent output.

**Copilot app.** Mixed.

- Better than VS Code: the daemon is Rust, so it uses the zeroizing types, and the app redacts the tokens from the daemon's log output.
- Worse than VS Code: to start the daemon, the app writes the Mission Control token into a private temporary config file. That file stays on disk for as long as the daemon runs. VS Code keeps that credential in memory only.

**What VS Code would need to do.** Keep secrets in `Buffer`s where practical and zero them on disposal. Audit logging and telemetry on the credential paths. Consider a secret-scrubbing pass on content headed to the mirror. Complete zeroization isn't possible in JavaScript.

**Priority: low.** Acceptable to defer; most of it is a language limitation.

## S21: OS sandboxing

> **In short:** Remote clients are limited by VS Code's own checks, not by the operating system. Nobody upstream has this either. **Priority: defer.**

**What it is.** Making the *operating system* enforce what a remote client or agent can touch, using things like the macOS sandbox, Linux namespaces, or Windows restricted tokens. VS Code's own checks are the other half.

**Why it's needed.** Code-level checks are only as good as their coverage. VS Code checks that file requests stay inside granted folders, but:

- a symlink swapped between the check and the use can slip through;
- a terminal is a full shell running as you, so once a remote client has a terminal, folder checks no longer apply.

**Where VS Code is.** VS Code checks every file request, watch, and terminal starting folder from the relay against the granted workspace folders ([protocolServerHandler.ts](../protocolServerHandler.ts)). Nothing is OS-enforced.

Remote clients can also add or clone projects through the [Copilot Host extension methods](./copilotExtensions.md). A ready project extends the grants to its own folder only, not the whole home directory. That adds to the set of folders a remote device can reach, still enforced only by code.

**Upstream.** Not implemented either. Its docs describe it as a goal.

**Copilot app.** No. It passes workspace and project folders to `copilotd`, which restricts file access to them in code, the same kind of check VS Code does. Nothing is enforced by the OS.

**What VS Code would need to do.** This is a large, platform-specific project. It might build on the sandboxing the Copilot CLI already supports for shell tools. A cheaper interim step is the "allow remote terminals" switch suggested under S17/S28.

**Priority: defer.** This is parity with upstream.

## S31: Mirror survives restart

> **In short:** Restarting VS Code can leave gaps in the copy Mission Control stores. A data-completeness issue, not a security hole. **Priority: defer.**

**What it is.** Each mirrored message carries a sequence number, so MC can detect gaps and ask for missing pieces (a "backfill"). The requirement is that these numbers and the not-yet-acknowledged messages survive a restart of the Agent Host.

**Why it's needed.** Without it, a restart can leave holes in MC's copy of a session, or make MC unsure whether it has everything.

**Where VS Code is.** It works while the process is running: acknowledgements, backfill, and bounded queues are all implemented ([missionControlSessionMirror.ts](./missionControlSessionMirror.ts)). Sequence state for the separate SDK metadata channel is saved to disk. The main AHP mirror's counters and queue are in memory only. History from before Mission Control was turned on isn't uploaded as a complete baseline.

**Upstream.** Further along. It has tests for the mirror across cold resume, though the protocol spec itself is still a draft.

**Copilot app.** Same as `copilotd` for sessions on the exposed machine. For its normal sessions, the app relies on the Copilot CLI runtime's own export, which is a different channel.

**What VS Code would need to do.** Save the AHP mirror's per-session sequence counters, and enough unacknowledged data, to disk. Restore them on start. Define what baseline to upload when a session first becomes shared.

**Priority: defer.** This is data completeness, not a security hole.

## S33: Reconnect continuity

> **In short:** After a dropped connection, a retried action might run twice or the restored history might not line up. Also partial upstream. **Priority: defer.**

**What it is.** Two related problems that can happen when a connection drops in the middle of an action:

- If the reply to "create session" or "send message" is lost, the client can't tell whether it happened. Retrying might do it twice.
- When a session is rebuilt from saved history, the IDs of individual response parts can differ from the IDs the client already displayed. The client may then reject the rebuilt snapshot as "missing content".

**Why it's needed.** It's about reliability and not losing or duplicating user actions, rather than security.

**Where VS Code is.** Session identities are preserved. The two problems above are not solved ([mapSessionEvents.ts](../copilot/mapSessionEvents.ts)).

**Upstream.** Also partial.

**Copilot app.** Same as `copilotd`. The app also contains its own recovery code for when a backfill leaves a hole in a remote session's history: it shows a "backfill gap" warning instead of pretending the history is complete.

**What VS Code would need to do.**

1. Let clients attach an idempotency key to actions like create and send, so a retry is recognized as a duplicate instead of running twice.
2. Generate response-part IDs from stable data, so rebuilding a session produces the same IDs every time.

**Priority: defer.** This is parity with upstream.

## S29: Privacy approval

> **In short:** Uploading conversations to Mission Control needs a formal privacy/product sign-off. **Required before release.**

**What it is.** A formal product, privacy, and security sign-off before conversation content is uploaded to and stored by Mission Control for real users. The sign-off should cover what's stored, for how long, and who can see it.

**Why it's needed.** Encrypting tokens doesn't encrypt conversations. MC and the relay can read mirrored content. The setting text discloses this, but disclosure isn't the same as approval.

**Where VS Code is.** The setting description says conversation content is not end-to-end encrypted. No release approval has been recorded.

**Copilot app.** Its code can't show whether it has an approval. Two observations:

- The app's normal sessions already export transcripts to GitHub by default (View only).
- Exposing a machine to Mission Control is still behind an experimental flag, and remote control behind another one.

So the app has shipped default-on *export*, but not default-on *machine exposure*. That is a useful reference point for the review.

**What VS Code would need to do.** Get the review. Make sure the setting text matches the real scope: *all* sessions, including local ones (see S30), and remote terminal access.

**Priority: required before release.**

## S34: Release qualification

> **In short:** Only one packaged build on one platform has been tested end to end. **Required before release.**

**What it is.** Proving the feature works in real, signed, packaged builds on every platform we ship. The encryption library in particular has to load correctly from the packaged app.

**Why it's needed.** Things that work from source can break once packaged, signed, or notarized. Native crypto modules are a common example.

**Where VS Code is.** One signed macOS arm64 build ([480503](https://dev.azure.com/monacotools/Monaco/_build/results?buildId=480503)) was tested end to end. The current code, and Windows and Linux builds, haven't been.

**Copilot app.** Not directly comparable. The app downloads a pinned `copilotd` release and checks it against a hard-coded SHA-256 checksum before running it. VS Code ships its host code inside its own signed package, so it has no extra download to verify.

**What VS Code would need to do.** Repeat that exercise on the current code for Windows, Linux, and macOS: registration, remote discovery, running a session, and turning the feature off. Use isolated profiles with Settings Sync disabled.

**Priority: required before release.** This is a release process step, not a design decision.

(Written by Copilot)
