# Protocol versioning instructions

This directory contains the VS Code-facing wrappers around the Agent Host
Protocol (AHP) state model. Read this before modifying protocol types.

## Overview

- `sessionState.ts`, `sessionActions.ts`, `sessionReducers.ts`, and
  `sessionProtocol.ts` are VS Code-facing wrappers and re-exports.
- `protocol/**` is generated from the sibling `agent-host-protocol` repo by
  `scripts/sync-agent-host-protocol.ts`. Generated files carry a `DO NOT EDIT`
  banner; update the source protocol repo and sync the copy into VS Code.
- `protocol/version/registry.ts` contains `PROTOCOL_VERSION`,
  `ACTION_INTRODUCED_IN`, `NOTIFICATION_INTRODUCED_IN`, and version helper
  functions. There is no `versions/` directory in this tree.

## Current changeset surface

The generated protocol includes the Changesets model:

- `SessionSummary.changesets` is the lightweight catalogue shown in lists.
- The old `session/diffsChanged` shape is replaced by five `changeset/*`
  actions: `statusChanged`, `fileSet`, `fileRemoved`, `operationsChanged`, and
  `cleared`.
- `invokeChangesetOperation` lets clients invoke server-defined verbs against a
  changeset. The wire command and dispatch path exist even when no concrete
  operations are advertised yet.
- Changeset actions are scoped to an expanded changeset URI
  (`<sessionUri>/changeset/<id>`); see `../changesetUri.ts` for the build/parse
  helpers.
- Session teardown uses `changeset/cleared` plus the corresponding
  session-level lifecycle notification. There is no separate `changeset/disposed`
  action in the VS Code protocol copy.

## Updating generated protocol types

1. Update the source files in the sibling `agent-host-protocol` repo.
2. Run `npx tsx scripts/sync-agent-host-protocol.ts` from the VS Code repo.
3. If VS Code consumers need short aliases or type guards, update the wrapper
   files in this directory after the sync.
4. Compile. The generated registry catches missing action/notification version
   map entries.

## Adding optional fields to existing types

Optional protocol fields are usually backwards-compatible. Add the field in the
source protocol repo, sync `protocol/**`, and add wrapper exports only when VS
Code code needs them.

## Adding new action types

Adding a new server-produced action type is backwards-compatible when old clients
can ignore it safely. Old clients at the same protocol version ignore unknown
action types by leaving reducer state unchanged.

1. Add the action interface and union membership in the source protocol repo.
2. Add the action to `ACTION_INTRODUCED_IN` in
   `protocol/version/registry.ts` through the generated sync.
3. Add the reducer case in the source protocol repo and sync it into
   `protocol/reducers.ts`.
4. Re-export the new action from `sessionActions.ts` when VS Code callers need
   the type directly.
5. Update `../../../protocol.md` and any affected AHP docs.

## When to bump the protocol version

Bump `PROTOCOL_VERSION` in `protocol/version/registry.ts` when you need a
capability boundary; for example, when a client must know whether the server
supports a feature before sending a command or rendering UI.

When bumping:

1. Update the source protocol repo's version registry and sync it into
   `protocol/version/registry.ts`.
2. Assign new action and notification types to the new version in
   `ACTION_INTRODUCED_IN` or `NOTIFICATION_INTRODUCED_IN`.
3. Update capability types when the feature needs client-visible capability
   negotiation.
4. Update `../../../protocol.md` version history and affected AHP docs.

## Adding new notification types

Use the same process as new action types, but register the new notification in
`NOTIFICATION_INTRODUCED_IN`.

## What the compiler catches

| Mistake                                                               | Compile error                   |
| --------------------------------------------------------------------- | ------------------------------- |
| Add action to union, forget `ACTION_INTRODUCED_IN` entry              | Mapped type index is incomplete |
| Add notification to union, forget `NOTIFICATION_INTRODUCED_IN` entry  | Mapped type index is incomplete |
| Remove action or notification type that the registry still references | Registry key no longer exists   |
