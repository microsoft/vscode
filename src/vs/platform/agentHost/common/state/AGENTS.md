# Protocol versioning instructions

This directory contains the VS Code-facing wrappers around the Agent Host Protocol (AHP) state model. Read this before modifying protocol types.

Before adding or changing protocol constructs or `_meta`, follow the [protocol constructs before `_meta` rules](../../../../../../.github/instructions/agent-host-interoperability.instructions.md#protocol-constructs-before-_meta). Existing protocol constructs must be used instead of metadata where possible; unmet requirements should be raised upstream, and optional metadata must tolerate alternate hosts and UIs that omit or ignore it.

## Overview

- `sessionState.ts`, `sessionActions.ts`, `sessionReducers.ts`, and `sessionProtocol.ts` are VS Code-facing wrappers and re-exports.
- `protocol/**` is generated from the sibling `agent-host-protocol` repo by `scripts/sync-agent-host-protocol.ts`. Generated files carry a `DO NOT EDIT` banner; update the source protocol repo and sync the copy into VS Code.
- `protocol/version/registry.ts` contains `PROTOCOL_VERSION`, `ACTION_INTRODUCED_IN`, `NOTIFICATION_INTRODUCED_IN`, and version helper functions. There is no `versions/` directory in this tree.

## Current changeset surface

The generated protocol includes the Changesets model:

- `SessionSummary.changesets` is the lightweight catalogue shown in lists.
- The old `session/diffsChanged` shape is replaced by five `changeset/*` actions: `statusChanged`, `fileSet`, `fileRemoved`, `operationsChanged`, and `cleared`.
- `invokeChangesetOperation` lets clients invoke server-defined verbs against a changeset. The wire command and dispatch path exist even when no concrete operations are advertised yet.
- Changeset actions are scoped to an expanded changeset URI (`<sessionUri>/changeset/<id>`); see `../changesetUri.ts` for the build/parse helpers.
- Session teardown uses `changeset/cleared` plus the corresponding session-level lifecycle notification. There is no separate `changeset/disposed` action in the VS Code protocol copy.

## Updating generated protocol types

1. Update the source files in the sibling `agent-host-protocol` repo.
2. Run `pnpm dlx tsx scripts/sync-agent-host-protocol.ts` from the VS Code repo.
3. If VS Code consumers need short aliases or type guards, update the wrapper files in this directory after the sync.
4. Compile. The generated registry catches missing action/notification version map entries.

### Current targeted backports

The generated copy uses the `.ahp-version` source commit `d7a5579b` plus targeted source backports for MCP-served skills and optional `AuthenticateParams.accountId`. The account field matches the merged [microsoft/agent-host-protocol#583](https://github.com/microsoft/agent-host-protocol/pull/583) at `eea267f02b9b031aebe6abea12a4e80927da2493`. Preserve these deltas when syncing until the recorded pin includes them. The older `CreateChatParams.title`, deprecated `SessionChatSummary.archived`, and `ChatIsReadChanged` compatibility deltas are already present in this pin.

For a narrow sync, set `AHP_PROTOCOL_REPO` to an isolated protocol source worktree at the recorded pin with those source backports applied, then run the normal sync script. Do not copy unrelated upstream changes or edit generated files to recover the existing deltas.

### Initial-message transport delta

Host-facing `IAgentCreateChatRequestOptions.initialMessage` uses the existing `CreateChatParams.initialMessage` field and is deliberately not part of provider creation options: the host creates the provider chat first, then processes the message through its normal client-aware admission path. Message failures appear in the target chat's turn state rather than a special creation RPC error. Protocol clients serialize a supplied initial message unchanged except that a missing message `model` or `agent` inherits the corresponding request option. Do not add top-level `model` or `agent` fields to `CreateChatParams`.

## Adding optional fields to existing types

Optional protocol fields are usually backwards-compatible. Add the field in the source protocol repo, sync `protocol/**`, and add wrapper exports only when VS Code code needs them.

## Adding new action types

Adding a new server-produced action type is backwards-compatible when old clients can ignore it safely. Old clients at the same protocol version ignore unknown action types by leaving reducer state unchanged.

1. Add the action interface and union membership in the source protocol repo.
2. Add the action to `ACTION_INTRODUCED_IN` in `protocol/version/registry.ts` through the generated sync.
3. Add the reducer case in the source protocol repo and sync it into `protocol/reducers.ts`.
4. Re-export the new action from `sessionActions.ts` when VS Code callers need the type directly.
5. Update `../../../protocol.md` and any affected AHP docs.

## When to bump the protocol version

Bump `PROTOCOL_VERSION` in `protocol/version/registry.ts` when you need a capability boundary; for example, when a client must know whether the server supports a feature before sending a command or rendering UI.

When bumping:

1. Update the source protocol repo's version registry and sync it into `protocol/version/registry.ts`.
2. Assign new action and notification types to the new version in `ACTION_INTRODUCED_IN` or `NOTIFICATION_INTRODUCED_IN`.
3. Update capability types when the feature needs client-visible capability negotiation.
4. Update `../../../protocol.md` version history and affected AHP docs.

## Adding new notification types

Use the same process as new action types, but register the new notification in `NOTIFICATION_INTRODUCED_IN`.

## What the compiler catches

| Mistake                                                               | Compile error                   |
| --------------------------------------------------------------------- | ------------------------------- |
| Add action to union, forget `ACTION_INTRODUCED_IN` entry              | Mapped type index is incomplete |
| Add notification to union, forget `NOTIFICATION_INTRODUCED_IN` entry  | Mapped type index is incomplete |
| Remove action or notification type that the registry still references | Registry key no longer exists   |
