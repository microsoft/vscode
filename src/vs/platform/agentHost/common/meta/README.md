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
- Image charges come from the runtime-owned completion usage, never arbitrary tool-result JSON. Missing billing is unavailable, not zero; image-token consumption must not become chat context occupancy after restore.
- The [Copilot GitHub-reference convention](https://github.com/github/copilot-host/blob/main/spec/meta-conventions/copilot/session-meta.md#copilotgithubreferences) identifies the primary checkout's PR with `headBranch`. Clients prefer VS Code's folder-scoped GitHub metadata when present; the VS Code host also publishes the convention for a verified current-branch association in session state and summaries. Attached and created-only references are not head-branch associations, and recorded artifacts do not establish that a host created a PR.
- Compatibility presentation must remain client-side. Do not synthesize protocol state or change execution, permissions, or visibility to imitate another client's rendering.
- Plan-review compatibility must normalize answers as well as presentation, for live and restored requests. VS Code's explicit review representation takes precedence over Copilot's question convention; revision feedback is accepted freeform input for the former but a decline with a separate feedback answer for the latter.
- Session configuration `readOnly` governs picker editability, not settings-derived values forwarded to the host. Forwarding still validates the schema and session mutability; see [sessionConfigProperties.ts](../sessionConfigProperties.ts).
- Sandbox local-network guidance is computed from the executing host's platform and effective configuration, only after its backend and every reported capability are supported. Clients must not infer it from their own OS or settings; absent metadata from older or other hosts means no guidance. The settings link does not grant access or override managed policy.

## Essential references

- [Agent Host instructions](../../../../../../.github/instructions/agentHostTesting.instructions.md): metadata validation and public versus host-private import boundaries.
- [AHP interoperability](../../../../../../.github/instructions/agent-host-interoperability.instructions.md): native protocol fields take precedence over optional host extensions.
- [Generation and pin updates](../../../../../../build/agentHost/README.md): regenerate Copilot D declarations; never edit generated types manually.
- [Metadata compatibility tests](../../test/common/metadataCompatibility.test.ts): source-selection and malformed-data contracts.
- [Wire-to-feature tests](../../../../workbench/contrib/chat/test/browser/agentSessions/agentHostChatContribution.test.ts), suite `wire-to-feature`: verify feature wiring across JSON serialization, not just parser behavior.
