# Agent Host node tests

Choose the lowest test type that exercises the behavior:

- `*.test.ts`: in-process unit tests for one service, mapper, reducer, or provider component.
- `protocol/`: a real Agent Host server driven over AHP with `ScriptedMockAgent`. Use for server and protocol contracts that do not depend on a provider SDK.
- `e2e/providers/`: the whole server and bundled provider process with deterministic LLM captures and AHP snapshots. Use when provider behavior is part of the contract.
- `providerIntegration/`: a real provider process backed by the local mock LLM. Use when provider lifecycle matters but realistic model behavior does not.
- Other `*.integrationTest.ts` files at this level: focused component integrations that do not exercise AHP end to end, such as direct SDK or Git-service coverage.

Tests that launch a real provider process isolate its home, configuration, logs, and session state in a temporary directory.

The protocol and E2E folders contain their own running and authoring instructions.

## Peer-chat membership recovery (#339409)

`agentHostPeerChatStore.test.ts` covers a corrupted empty legacy mirror being imported
into the central catalogue, followed by recovery from surviving legacy chat databases.
Recovery requires a local Copilot CLI session with a restore-created fragment registration
and matching peer backing metadata. Other providers, default chats, and unrelated owners
are not inferred from directory names.

`agentService.test.ts` verifies that listing triggers recovery, removes only verified
phantom registrations without deleting shared storage, and restores titles and lazy
transcript loading with the original chat URIs and provider continuation metadata.
The pre-recovery membership is retained in the parent's `agentHost.peerChatRecovery339409`
metadata. Existing membership order is preserved; missing peers are appended in
deterministic storage-name order because their original order is no longer available.
Recovery does not write chat-local metadata or transcripts. Additional missing peers
require affirmative parent title/source metadata; explicitly deleted peers, unstamped
orphan storage, and historical chat URIs owned by another central catalogue are excluded.
Healthy catalogues are not scavenged. The diagnostic record freezes candidate URIs and
the source revision, and records completion so subsequent removals are not undone.
Concurrent catalogue changes take precedence over recovery; interrupted mirror writes
can be retried without discovering additional candidates.

Dataset tests cover empty, partial and healthy catalogues, newer continuation metadata,
deletion and ownership conflicts, interrupted recovery, malformed records, missing
databases, and the catalogue size boundary. Missing peers are restored as active:
their previous archive flags cannot be inferred after both membership copies were erased.
