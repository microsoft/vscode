# Threads

> **Specification change gate:** Update this document only when Thread ownership, persistence, session lifecycle, Automation routing, or customization boundaries intentionally change. Concrete labels and styling belong in code and fixtures.

## Scope

Threads are persistent Agent Host conversations that stay directly accessible above the Ready for you list. They are durable working relationships rather than transient task notifications: a Thread remains visible while its agent is running and does not participate in Inbox, Running, On Hold, or Ready to Merge placement.

## Ownership

| Concern | Owner |
|---|---|
| Thread identity, name, avatar, scope, session binding, archive state, and Automation associations | `IThreadsService` |
| Conversation, tools, agent selection, workspace, and provider lifecycle | Existing `ISession` and Agent Host provider |
| Thread creation and connector setup | `IThreadSetupService` |
| Scheduled definitions and run history | Existing `IAutomationService` and provider Automation authority |
| Sidebar presentation and keyboard interaction | `ThreadsView` |

Thread metadata is profile-scoped presentation/orchestration state. The backing conversation remains provider-owned and is addressed by its immutable session resource. Draft replacement updates the binding; definitive session deletion removes the Thread.

## Lifecycle

A Thread is created through an Agent Host draft and must receive an initial prompt so the provider materializes a durable session. Setup selects:

- a name and initial prompt;
- Global or workspace scope;
- one Agent Host session type and one persistent custom agent;
- one Blobby accessory avatar;
- session-scoped MCP connector enablement.

Active Threads are shown by default. Archiving hides a Thread beneath a collapsed Archived Threads node without archiving its backing session, because provider archive state makes the conversation read-only. Permanent deletion deletes the provider session and Thread metadata. Associated Automation definitions are retained unless explicitly deleted through Automation management.

## Automations

Current Automation authorities create a new run session for every invocation. An associated Thread Automation therefore uses that durable run as the scheduler and audit record, and its prompt instructs the run to call the existing `send_message` tool exactly once to enqueue the scheduled work into the Thread session. The run does not perform the work itself; visible work and context continuity remain in the persistent Thread.

The Thread stores associated Automation IDs for presentation. The Automation definition remains authoritative for its schedule, prompt, target, enablement, template, and history.

## Agents and tools

Version one assigns exactly one custom agent to a Thread. The backing Agent Host session already exposes the standard session-management tools, including listing, creating, inspecting, messaging, and deleting sessions; Threads do not maintain a separate tool registry.

Connector selection writes `Session`-scoped customization enablement through the Agent Host provider. It never introduces a parallel enabled flag or bypasses customization resolution. Unavailable connectors may appear as disabled Coming Soon choices but do not create inert configuration.

## Future multi-agent threads

Multi-agent support should extend the Thread participant model rather than placing several models inside one provider turn. A future Thread can own an ordered participant list and route each turn to one participant or delegated child session while retaining one shared Thread timeline. Agent identity, handoff provenance, and concurrent-turn ordering must be explicit before that model is introduced.
