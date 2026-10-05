# Agent Host metadata

## Rules for updating this file

- Update this file only for non-obvious constraints that are critical to get right, or to maintain a short list of essential references for agents.
- Do not accumulate code descriptions, helper inventories, implementation details, individual workarounds, or facts an agent can discover by reading the code.
- Prefer the owning instruction, specification, test, or a concise code comment for details. Link to authoritative guidance rather than duplicating it here.
- When updating, remove obsolete guidance and condense overlapping points. This is not a change log or a record of completed work.

## Critical invariants

- Source precedence is feature-specific, not a universal "VS Code first" rule. Some readers select by key presence even when malformed; others fall back when there is no usable result. Preserve the owning reader's contract; do not merge fields from competing representations.
- Preserve unrelated and unknown metadata during writes and round trips. Explicit `false`, zero, and empty values must not be treated as absent.
- Metadata is not permission to infer unrelated semantics: tool origin does not classify an operation, output chunks are not arguments, model-call cost is not turn cost, and context occupancy is not quota. Internal visibility hides the request row, not the response.
- Compatibility presentation must remain client-side. Do not synthesize protocol state or change execution, permissions, or visibility to imitate another client's rendering.
- Session configuration `readOnly` governs picker editability, not settings-derived values forwarded to the host. Forwarding still validates the schema and session mutability; see [sessionConfigProperties.ts](../sessionConfigProperties.ts).

## Essential references

- [Agent Host instructions](../../../../../../.github/instructions/agentHostTesting.instructions.md): metadata validation and public versus host-private import boundaries.
- [AHP interoperability](../../../../../../.github/instructions/agent-host-interoperability.instructions.md): native protocol fields take precedence over optional host extensions.
- [Generation and pin updates](../../../../../../build/agentHost/README.md): regenerate Copilot D declarations; never edit generated types manually.
- [Metadata compatibility tests](../../test/common/metadataCompatibility.test.ts): source-selection and malformed-data contracts.
- [Wire-to-feature tests](../../../../workbench/contrib/chat/test/browser/agentSessions/agentHostChatContribution.test.ts), suite `metadata wire-to-feature`: verify feature wiring across JSON serialization, not just parser behavior.
