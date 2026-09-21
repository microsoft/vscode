# Native CLI terminal sessions

In a desktop Agents Window, create a new session, choose **CLI Terminal**, choose **Copilot CLI**, **Claude Code**, or **Codex**, and select a local folder. Choose **Start Terminal Session** to open the idle native CLI without submitting a prompt. Workspace, CLI, interface, and account pickers only configure the draft; changing them never launches a process.

After Start, the creation screen remains visible with a pixel spinner while the CLI initializes. The terminal is attached in a hidden, non-interactive warmup surface so it receives layout and terminal-query responses before it is shown. The session view opens when the initial CLI screen is available, including native sign-in or trust prompts. Cancelling or replacing the draft stops its unpublished process; an early exit or startup timeout leaves creation available for retry.

The center hosts the actual CLI TUI in VS Code's terminal. It does not create a VS Code chat transcript or replace the existing chat renderer. Terminal sessions remain under their repository in the Sessions list, have their CLI's icon and a terminal marker beside their title, and retain the Files and Changes panes. Their working/status rows follow the same detail and timestamp rules as ordinary chat sessions. Ordinary creation defaults to Chat; New Session can inherit the active session's explicitly selected interface and target. The two interfaces remember their harness choices separately.

Process-provided terminal colors survive switching away and returning; the integration does not select a different CLI theme. The title and TUI have a small layout gap. Startup and resume waits use the shared pixel spinner, with reduced-motion support. Parsed screen output, including alternate-screen redraws without line feeds, clears this feedback. Launch preparation overlaps repository initialization, while still capturing the repository baseline before starting the CLI. First-use CLI extraction, native authentication, and native MCP startup can add their own startup time.

## Runtime and authentication

The launcher uses a native executable on the terminal's shell PATH, or a bundled executable when available. These machine-scoped settings can select another native executable by absolute path:

- `sessions.terminal.copilotExecutable`
- `sessions.terminal.claudeExecutable`
- `sessions.terminal.codexExecutable`

New Claude Code and Codex terminal sessions default to **GitHub Copilot**. The **Account** choice is available only on the creation screen and is fixed once the CLI starts. The session surface does not show VS Code account controls or billing text:

- **GitHub Copilot** (default): sign in to Copilot when starting the session if needed. A compatible default is selected automatically; there is no pre-launch model picker. Use `/model` in the CLI to change models. The actual CLI TUI connects to an authenticated local gateway that reuses VS Code's existing Anthropic Messages / OpenAI Responses adapters. No Claude or ChatGPT subscription is needed for this route; Copilot's model availability, billing and usage limits apply.
- **Claude Account / OpenAI Account**: explicitly select this to use the CLI's own saved sign-in, subscription, API key, or configured gateway. VS Code does not change its authentication. If necessary, the CLI presents its native sign-in flow.

This is API routing, not SDK-driven conversation rendering. The CLI still owns its conversation, tools, hooks, and approval prompts. It never receives the upstream GitHub credential: each terminal has an isolated, short-lived loopback capability. Claude receives a private temporary settings file so project settings cannot accidentally override the selected account route; Codex receives command-line provider configuration and an environment capability. No account credentials or gateway endpoints are stored in the session catalog, repository, or the user's global CLI configuration.

The chosen account source is saved with the session. Existing saved choices are preserved; legacy sessions without a saved account source keep native authentication rather than silently changing their billing. Resuming does not override the model selected in the native CLI; Claude's model-family aliases resolve independently instead of all pointing to the initial model. A lost or expired gateway requires reconnecting; there is no silent fallback to a native account. Copilot CLI itself continues to use its own Copilot authentication.

AI-disabled state and workspace trust are checked before launch. Copilot-backed TUI mode currently refuses accounts governed by GitHub runtime-managed settings because those settings cannot yet be enforced by the independent CLI; use the standard chat harness for those accounts. Native-mode enterprise controls remain the responsibility of the native runtime.

Native terminal sessions run directly in the selected local folder. They do not implicitly create a worktree, support workspace-less chats, or connect a local process to a remote workspace.

## Changes and session metadata

Repository Changes compares the current working tree with the commit captured at session start; Uncommitted Changes compares it with the current HEAD. Staged, unstaged, untracked, renamed, and deleted files feed the standard diff UI. These are repository-level changes, including pre-existing edits and changes made by other processes, not an attribution of edits to a particular CLI.

Titles follow native session metadata and Claude's terminal title until explicitly renamed in the Agents Window. Sidebar counts are cached with session metadata, so inactive entries retain their last known counts after a restart without scanning every repository. A live but idle CLI does not show as working. Native activity signals drive working, input-required, completion, and error states.

The provider tracks one process separately from its conversation facades. Native new/resume operations select the corresponding Sessions row and repository details, transferring the same terminal rather than relaunching it or overwriting the previous conversation. A foreground switch preserves terminal keyboard focus; background activity does not steal focus. Native aliases keep imported chat history from producing duplicate rows.

- **Copilot:** per-launch native hooks supply turn activity; the CLI's exact foreground-registration records cover idle switches before those lazy hooks run. These records come from a private, launch-specific info-log directory. Only validated identifiers, timestamps, and the matching workspace metadata are used by the UI. The temporary native logs are deleted when the runtime ends. No native RPC listener is enabled.
- **Claude Code:** a per-launch hook plugin supplies identities and lifecycle events. Native busy-title transitions supplement completion hooks for cancellation, without interpreting ordinary Escape presses as cancellation. A resting title does not clear an independently reported permission wait. Resume workspace metadata is confirmed before an unknown conversation is assigned to a repository.
- **Codex:** the actual TUI connects through an authenticated loopback bridge to its own native app-server. Successful foreground thread start/resume/fork replies provide exact identity; thread and turn notifications provide activity and names. Internal title-generation threads are excluded.

Native hook restrictions, disabled title updates, and unsupported CLI versions can limit tracking. Tracking errors are visible without replacing the TUI, suppressing native approvals, or guessing the most recent conversation.

Tracking warnings use accepted conversation metadata, including Copilot's foreground log rather than requiring hook events alone. Native activity without conversation metadata is reported as partial synchronization, not a sign-in or trust failure. Read errors remain visible until that source recovers; normal terminal progress does not conceal them.

Closing or switching a session view leaves its CLI running. Live processes reconnect on window reload when terminal persistence is enabled (`terminal.integrated.enablePersistentSessions` and `task.reconnection`); application restarts use the CLI's exact resume identifier. Empty Codex drafts start a fresh native thread when no resumable rollout exists. Archive and delete stop an attached process and update the Agents Window catalog; deleting a detached conversation does not terminate another conversation's runtime or delete CLI-owned history.

Warm switches reuse the live terminal without redundant visibility or resize requests. Reopening the same repository preserves its shared Git state object, and unchanged diff results do not invalidate the Changes view. Switching to a session without a live terminal still requires native CLI resume and can take longer.

Shared ownership and presentation contracts are documented in [Sessions architecture](../../../SESSIONS.md).
