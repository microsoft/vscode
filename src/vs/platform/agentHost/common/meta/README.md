# Agent Host metadata

Features import the domain helpers directly in this directory. Those helpers select a convention, validate its data through the matching implementation, and return the feature's typed result.

- [vscode/](./vscode/) contains the original VS Code metadata parsers and writers.
- [copilotd/](./copilotd/) contains Copilot D parsers and [generated value types](./copilotd/generated/copilotdMetadata.ts). The workspace marks the generated folder read-only; regenerate it rather than editing the declarations.
- Top-level helpers such as [agentMessageMeta.ts](./agentMessageMeta.ts), [agentUsageMeta.ts](./agentUsageMeta.ts), [errorMeta.ts](./errorMeta.ts), [agentModelMeta.ts](./agentModelMeta.ts), and [attachmentMeta.ts](./attachmentMeta.ts) own dispatch and domain conversion. New helpers do not require an `agent` prefix; existing names remain where they preserve an established API.

`local/code-no-private-agent-host-meta-import` prohibits feature imports into either host-specific directory, including type imports and re-exports. Top-level metadata helpers may delegate into either directory. Parsing tests can exercise the implementations directly.

Selection depends on the feature. Error helpers try the VS Code reader first, then try Copilot D when it has no usable result. Attachment detail has no shared VS Code counterpart: its single reader exposes valid Copilot D detail even when other attachment metadata is present, and the same result supplies display and resend. Other existing helpers still select the whole VS Code result by key presence, including its malformed-data fallback. Do not fill fields from both sources. Keep host-specific keys and validation in the host-specific implementations. VS Code-only extensions retain top-level entry points even when they have only one implementation.

Writers preserve unrelated keys and emit compatible representations from the same feature input. Do not fabricate a counterpart for a host-specific concept.

Keep these meanings separate:

- Tool origin and operational metrics are not tool operation kinds.
- Output deltas are chunks, not streamed arguments or snapshots.
- Internal visibility hides a request row, not its responses.
- Latest model-call cost is not whole-turn cost.
- Current context usage is not account quota.

## Temporary Copilot app tool presentation

[agentToolCallMeta.ts](./agentToolCallMeta.ts) exposes a separate presentation reader for unclassified server tool calls. Its private [Copilot compatibility table](./copilotd/toolPresentation.ts) follows the Copilot app's client-side aliases and label conventions (app revision `9a05a3ee1e0`). It is a temporary replacement for missing host presentation hints, not metadata synthesized into protocol state.

The fallback only replaces absent or generic `Running <name>` / `Tool finished` labels. Explicit VS Code metadata, specific host messages, MCP/client contributors, and MCP Apps remain authoritative. Exact known names are matched; arbitrary prefixes, tool metrics, and permission decisions are not used for classification. Search aliases use the existing search card, shell tools with valid commands use a display-only terminal card, and read aliases suppress incomplete file arguments. Other known tools receive meaningful running/completed/failed labels in existing cards. Unknown tools keep their host-provided presentation.

App-specific widgets, workflow controls, result counters, and automatic hiding/grouping are not reproduced. In particular, housekeeping or widget tool calls are not hidden merely because the Copilot app hides them. Existing VS Code interactions, subagent discovery, content/edit processing, and permission handling are unchanged. Both live and restored tool calls use the same presentation reader, and argument-derived labels are bounded and escaped.

The open `_meta` map and unknown attachment fields remain intact. See [generation and pin-update commands](../../../../../../build/agentHost/README.md).

A model-text override supplies the model-bound prompt before outgoing contributions add context. Stored display text is restored using both native and provider turn identities, including interrupted and provider-started steering turns. Ordinary Chat retries retain that metadata unless the caller explicitly supplies replacement metadata.

Current session occupancy belongs only on the latest restored response, not every historical turn. Idle-session occupancy changes refresh that response; the response model must notify consumers when occupancy or latest-call diagnostics change even if token counts stay the same.

The basic source-selection and writer matrix in [metadataCompatibility.test.ts](../../test/common/metadataCompatibility.test.ts) covers absent, unrelated, VS Code, Copilot D, mixed, and malformed metadata through the public helpers. Explicit false, zero, empty values, and unknown attachment fields retain their intended meanings.

The `metadata wire-to-feature` suite in [agentHostChatContribution.test.ts](../../../../workbench/contrib/chat/test/browser/agentSessions/agentHostChatContribution.test.ts) invokes the real registered agent and exchanges JSON-RPC messages through the protocol client and production session handler. It checks live errors, tool output, usage, quotas, context updates, outgoing commands/selections/model configuration, and restored messages edited and resent. The controlled peer supplies snapshots and actions; the test does not call metadata readers, reducers, or adapters, or replace production observation callbacks. Both directions cross JSON serialization. This catches broken feature wiring without requiring a live host or network.
