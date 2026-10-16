# Threads

> **Specification change gate:** Update this document only when Thread ownership, persistence, session lifecycle, Automation routing, or customization boundaries intentionally change. Concrete labels and styling belong in code and fixtures.

## Scope

Threads are persistent Agent Host conversations that stay directly accessible above the Inbox list. They are durable working relationships rather than transient task notifications: a Thread remains visible while its agent is running and does not participate in Inbox, Running, On Hold, or Ready to Merge placement.

## Ownership

| Concern | Owner |
|---|---|
| Thread identity, name, avatar, scope, session binding, and Automation associations | `IThreadsService` |
| Conversation, tools, primary-agent selection, workspace, and provider lifecycle | Existing `ISession` and Agent Host provider |
| Participant routing metadata and mention policy | `IThreadsService` and the Agent Host Thread delegation contribution |
| Thread creation and connector setup | `IThreadSetupService` |
| Scheduled definitions and run history | Existing `IAutomationService` and provider Automation authority |
| Sidebar presentation and keyboard interaction | `ThreadsView` |

Thread metadata is profile-scoped presentation/orchestration state. The backing conversation remains provider-owned. A Thread persists both the frontend Sessions resource used to open it in this window and the exact immutable host-native AHP session resource used by `send_message`, Automations, and cross-Thread routing. Draft replacement updates both bindings through the Agent Host connection identity service; definitive session deletion removes the Thread.

## Lifecycle

A Thread is created and persisted over an Agent Host draft without sending an initial prompt. Drafts are activated through the new-session composer path rather than the catalog-session opener. The provider materializes its durable session on the first explicit user send, and draft replacement updates the Thread binding. A persisted unmaterialized Thread whose provider draft no longer exists is recreated from its stored scope, harness, primary agent, and connector configuration before it is opened. Setup selects:

- a name;
- a host-scoped No workspace or workspace scope;
- one Agent Host harness, an ordered participant set, and one required primary agent;
- one Blobby accessory avatar;
- session-scoped MCP connector enablement.

Threads are always shown by default. Permanent deletion deletes the provider session and Thread metadata. Associated Automation definitions are retained unless explicitly deleted through Automation management. Persisted archive flags from the initial prototype are ignored so those Threads return to the active tree.

## Automations

Current Automation authorities create a new run session for every invocation. An associated Thread Automation therefore uses that durable run as the scheduler and audit record, and its prompt instructs the run to call the existing `send_message` tool exactly once to enqueue the scheduled work into the Thread session. The run does not perform the work itself; visible work and context continuity remain in the persistent Thread.

The Thread stores associated Automation IDs for presentation. The generated prompt always addresses the Thread by its host-native routing resource, never its local or host-qualified frontend resource. When identity resolution or Thread metadata changes, generated Thread envelopes are repaired optimistically; arbitrary user-authored Automation prompts are never rewritten. The Automation definition remains authoritative for its schedule, prompt, target, enablement, template, and history.

## Agents, mentions, and tools

Thread metadata stores an ordered participant list with one required primary participant. The primary receives every user turn and delegates actionable work through existing session-management tools. Explicit participant mentions constrain the delegation target; `@everyone` expands to every participant in the current Thread without an arbitrary count cap. Cross-Thread mentions require client confirmation before their routing metadata reaches the host.

The client carries participant and Thread targets in optional namespaced request metadata. The Agent Host Thread delegation contribution converts that metadata into model context without changing the visible user message. Delegated participant work uses `create_session` with the exact custom-agent URI supplied by the Thread, while cross-Thread work uses queued `send_message`. Child-session links remain the provenance for synthesized results. If delegation is unavailable, the primary may execute directly and must state that fallback.

Agent-generated mention text never routes recursively. Existing Agent Host spawn-depth, confirmation, and message-count protections remain authoritative; Thread orchestration does not bypass runtime tool policy.

Connector selection writes `Session`-scoped customization enablement through the Agent Host provider. It never introduces a parallel enabled flag or bypasses customization resolution. Unavailable connectors may appear as disabled Coming Soon choices but do not create inert configuration.

## Presentation

The Thread sidebar row remains name-only. Its Blobby avatar uses the rendering pose while the backing session is active and returns to idle when work stops. The empty draft view owns the personalized focus greeting and role-oriented prompt suggestions; selecting a suggestion prefills the existing composer without sending.
