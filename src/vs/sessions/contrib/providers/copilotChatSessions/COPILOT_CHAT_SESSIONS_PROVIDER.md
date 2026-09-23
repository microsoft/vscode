# Copilot Chat sessions provider

> **Specification change gate:** Do not update this document for provider bug fixes, option details, picker behavior, or timing. Update it only when provider ownership, identity, cache semantics, or request lifecycle changes.

## Scope

`CopilotChatSessionsProvider` adapts the existing Copilot agent-session infrastructure into `ISessionsProvider`. It supports Copilot Cloud and provides the local Copilot CLI path when Agent Host is unavailable.

## Registration and identity

`DefaultSessionsProviderContribution` registers the default provider after workbench restoration.

| Property | Contract |
|----------|----------|
| Provider ID | `default-copilot` |
| Label | Copilot Chat |
| Cloud session type | Always advertised when available |
| Local CLI session type | Advertised only when Agent Host does not own it |

The provider may expose local-folder and remote-repository browse actions. Repository selection UI is owned by the shared workbench picker, used by both the extension's repository command and browser session creation; each caller supplies repository data and owns any session-option updates. Workspace resolution is shared by the default and sandbox creation modes. Workspace URI schemes select the applicable draft implementation.

On web, the contribution also registers a sandbox-only instance (`cloud-sandbox-creation`) while cloud sandboxes and remote agent hosts are enabled and AI features are visible. This instance owns repository-backed drafts, not existing Cloud or CLI history. It advertises the Copilot sandbox creation type.

## Drafts

Local and cloud drafts implement the same `ISession` contract while adapting different backend options:

- local drafts resolve repository and local execution configuration;
- cloud drafts expose provider-declared option groups and remote workspace metadata.

Both expose observable loading, workspace, model, mode, and capabilities. Shared new-session UI consumes those contracts and does not branch on draft classes.

## Existing sessions

`AgentSessionAdapter` projects an existing `IAgentSession` into a stable `ISession` facade. It updates observable state in a transaction and preserves resource identity while metadata changes.

The provider cache is keyed by resource identity. Refreshing the backing agent session list updates existing adapters and emits added, removed, changed, or replacement catalog notifications as appropriate.

Provider metadata translation, including repository and pull-request metadata, remains inside the adapter. Shared Sessions code consumes provider-neutral workspace, changes, status, and GitHub information.

The cloud provider reports verified PR-closing issues through `linkedIssues` metadata containing their URLs and titles. The adapter exposes these as session artifacts and, for public GitHub URLs, issue references for the existing issue pill. Enterprise-hosted issues remain openable artifacts without public GitHub polling.

## Request lifecycle

The provider separates chat creation from request sending:

```text
createNewChat
    -> return the provider chat resource
    -> Sessions presents the chat
sendRequest
    -> send through the backing chat service
    -> commit or update the session
    -> publish replacement when draft identity changes
```

The provider never opens chat UI directly. Presentation and focus remain owned by `ISessionsService`.

Committed sessions send against their existing chat resources. Multi-chat creation is capability-gated and follows the shared management lifecycle.

Sandbox creation reuses the remote draft and optimistic replacement lifecycle. Repository selection creates only a draft. The first send provisions through `CloudSandboxAgentHostContribution`, sends the prompt once into the provisioned session's existing main chat, and transfers ownership to that environment's provider. Until that handoff, the creation provider owns an extension-independent, read-only transcript. The creation provider does not supply the regular Cloud model catalog; the connected host owns model selection. Explicit sandbox drafts fail when sandbox creation is disabled rather than falling back to the server-run Cloud agent. If the first send fails after provisioning, the environment's session is published so it remains recoverable.

## Picker contributions

Provider-specific new-session controls contribute through shared Sessions menus and scoped picker services. A picker contribution consists of:

- a menu action with provider-neutral enablement;
- an action view item;
- a scoped widget or controller.

Model selection policy is shared with Workbench chat. This provider supplies model snapshots, presentation options, and writes; it does not implement a second precedence policy.

Context keys derive from the scoped session and provider capabilities. Actions must not read the window-global active session when invoked from another session surface.

## Deletion and archive

Delete, archive, rename, and read-state operations delegate to the backing agent session infrastructure. Provider-specific confirmation metadata is carried in the operation payload; shared services do not reach into extension-host internals.

## Testing

Provider tests own concrete local/cloud option behavior, commit timing, metadata translation, and regressions. Shared provider lifecycle behavior is covered by Sessions management tests.

## Change policy

Update this specification only when ownership, identity, draft classes, cache semantics, or the request lifecycle changes. Keep picker details, option lists, timeouts, and bug narratives in code and focused tests.
