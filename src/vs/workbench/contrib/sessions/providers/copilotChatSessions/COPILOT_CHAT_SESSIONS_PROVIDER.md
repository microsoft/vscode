# Copilot Chat sessions provider

> **Specification change gate:** Do not update this document for provider bug fixes, option details, picker behavior, or timing. Update it only when provider ownership, identity, cache semantics, or request lifecycle changes.

## Scope

`CopilotChatSessionsProvider` owns Cloud sandbox creation and adapts existing cloud automation runs into `ISessionsProvider`. Interactive cloud sessions use sandboxes exclusively. Local Copilot CLI sessions contributed by the Copilot extension are not surfaced in the Agents Window; local Copilot sessions are owned by the Agent Host providers.

## Registration and identity

`DefaultSessionsProviderContribution` registers the default provider after workbench restoration.

| Property | Contract |
|----------|----------|
| Provider ID | `default-copilot` |
| Label | Copilot Chat |
| Cloud session type | The only session type advertised |

The provider may expose local-folder and remote-repository browse actions. Repository selection UI is owned by the shared workbench picker, used by both the extension's repository command and browser session creation; each caller supplies repository data and owns any session-option updates. Workspace resolution is shared by the default and sandbox creation modes.

On web, the contribution also registers a sandbox-only instance (`cloud-sandbox-creation`) while remote agent hosts are enabled and AI features are visible. This instance owns sandbox drafts, not existing automation or CLI history. It advertises the Copilot sandbox creation type.

## Drafts

Cloud drafts implement the `ISession` contract and expose provider-declared option groups and remote workspace metadata. A local folder can host a Cloud draft only for the GitHub repository it tracks; the draft targets that remote repository. Shared new-session UI consumes the observable loading, workspace, model, and capability contracts and does not branch on draft classes.

New interactive Cloud sessions always use GitHub Cloud sandboxes. Draft models, configuration controls, and first-send routing remain sandbox-backed even if remote connections become unavailable; sending then fails rather than falling back to the legacy coding agent.

Automation configuration drafts retain the scheduled-Cloud model catalogue and configuration contract; they cannot be sent as interactive chats. Definitions and dispatch use the Automations API, independently of sandbox creation; see [Automations](../../../../../sessions/AUTOMATIONS.md#definitions-and-session-configuration).

While remote agent hosts are enabled and AI features are visible, the provider also advertises quick chats. These drafts explicitly have no workspace or repository and always require the sandbox backend.

## Existing sessions

`AgentSessionAdapter` projects an existing Copilot Cloud automation run into a stable `ISession` facade. Non-automation sessions and sessions of any other provider type are ignored. It updates observable state in a transaction and preserves resource identity while metadata changes. The extension's task-backed provider retains automation history and follow-up turns but no longer creates or delegates interactive tasks, advertises a creation target, or offers legacy custom-agent and partner-agent controls.

The provider cache is keyed by resource identity. Refreshing the backing agent session list updates existing adapters and emits added, removed, changed, or replacement catalog notifications as appropriate.

Provider metadata translation, including repository and pull-request metadata, remains inside the adapter. Shared Sessions code consumes provider-neutral workspace, changes, status, and GitHub information.

The cloud provider reports verified PR-closing issues through `linkedIssues` metadata containing their URLs and titles. The adapter exposes these as session artifacts and, for public GitHub URLs, issue references for the existing issue pill. Enterprise-hosted issues remain openable artifacts without public GitHub polling.

The Copilot extension records automation tasks that receive a message from VS Code. Other tasks carry `external: true` metadata, which the adapter exposes as `ISession.isExternal`. The extension lists external runs according to `chat.agentSessions.showExternal`, and a sent message adopts a run by clearing the flag.

## Cloud automation coordination

`GitHubCloudAutomationStore` owns a provider-local, explicitly refreshed cache of user-owned GitHub cloud automation definitions. It retains the default-account client lease from `IWorkbenchGitHubService` until account/grant invalidation or disposal; the service supplies Mission Control endpoints. The shared `client.query` and `client.automations` domains own repository reads and automation requests/response validation; the store bounds page collection and detail hydration. Discovery is limited to Agents Window recent workspaces and explicitly registered GitHub.com repositories, with private/internal visibility verified before listing. Only account-scoped repository references persist in profile-local machine storage; definitions stay in memory, and account/grant changes or disposal cancel pending reads and clear the cache.

Refresh failures, including incomplete paginated results, retain the affected repository's last successful definitions while reporting an error; successful repositories still update. The store serializes definition refreshes and mutations within an account lifetime, rechecks repository eligibility before writes, and discards responses after account/grant changes or disposal. Updates support an authoritative preflight comparison, not server-side compare-and-swap. An uncertain mutation blocks further writes until an explicit successful catalogue refresh.

History is an explicitly refreshed, bounded server-owned window. Active task details are fetched with bounded concurrency and cancellation. Manual dispatch acknowledges acceptance only; it does not create a local run or correlate an arbitrary history entry with that request. The store does not implement the shared Automation contract or initiate requests on construction, observation, or account changes.

Only the default provider exposes `CloudAutomationStore`, which adapts the GitHub store to the shared Automation contract. The sandbox-only provider is not an Automation authority. The adapter creates a store and refreshes it only while the cloud gate, parent Automations setting, AI visibility, and a GitHub.com account permit access. Each account or gate transition disposes the old store. Definition and history identities include provider, account, repository, and remote definition identity; native Cloud session adoption is a separate concern.

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

Each session has a single chat; the provider does not advertise multiple chats, rename, or delete. Follow-up turns go through the committed session's existing chat resource.

Sandbox creation reuses the remote draft and optimistic replacement lifecycle. Repository selection creates only a draft. The first send provisions through `CloudSandboxAgentHostContribution`, awaits the connection's advertised repository preparation, sends the prompt once into the provisioned session's existing main chat, and transfers ownership to that environment's provider. Until that handoff, the draft exposes shared `ISession.preparationProgress`; the chat view owns the transient, extension-independent preparation transcript. Sandbox drafts obtain their account-scoped model catalog from Mission Control independently of local runtimes and the Copilot extension. Connected sandbox model providers retain service-discovered models missing from the AHP catalog, including after restoration; explicit host metadata and policy take precedence for models the host does advertise. The creation provider retains session and model configuration, resolves session options with the connected host, and applies the selected options before dispatching the first turn. Explicit sandbox drafts fail when sandbox creation is disabled rather than falling back to the server-run Cloud agent. If the first send fails after provisioning, the environment's session is published so it remains recoverable.

Quick chats use the same lifecycle but omit the repository from provisioning and skip repository preparation. The provisional session is tagged as workspace-less, and that metadata is passed through the chat content provider before the first turn so the host can retain the session kind.

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

Provider tests own sandbox creation, automation configuration and history, metadata translation, and regressions. Shared provider lifecycle behavior is covered by Sessions management tests.

## Change policy

Update this specification only when ownership, identity, draft classes, cache semantics, or the request lifecycle changes. Keep picker details, option lists, timeouts, and bug narratives in code and focused tests.
