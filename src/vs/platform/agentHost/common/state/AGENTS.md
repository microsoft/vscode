# Protocol versioning instructions

This directory contains the protocol version system. Read this before modifying any protocol types.

## Overview

The protocol has **living types** (in `sessionState.ts`, `sessionActions.ts`) and **version type snapshots** (in `versions/v1.ts`, etc.). The `versions/versionRegistry.ts` file contains compile-time checks that enforce backwards compatibility between them, plus a runtime map that tracks which action types belong to which version.

The latest version file is the **tip** — it can be edited. Older version files are frozen.

## Adding optional fields to existing types

This is the most common change. No version bump needed.

1. Add the optional field to the living type in `sessionState.ts` or `sessionActions.ts`:
   ```typescript
   export interface IToolCallState {
       // ...existing fields...
       readonly mcpServerName?: string; // new optional field
   }
   ```
2. Add the same optional field to the corresponding type in the **tip** version file (currently `versions/v1.ts`):
   ```typescript
   export interface IV1_ToolCallState {
       // ...existing fields...
       readonly mcpServerName?: string;
   }
   ```
3. Compile. If it passes, you're done. If it fails, you tried to do something incompatible.

You can also skip step 2 — the tip is allowed to be a subset of the living type. But adding it to the tip documents that the field exists at this version.

## Adding new action types

Adding a new action type is backwards-compatible and does **not** require a version bump. Old clients at the same version ignore unknown action types (reducers return state unchanged). Old servers at the same version simply never produce the action.

1. **Add the new action interface** to `sessionActions.ts` and include it in the `ISessionAction` or `IRootAction` union.
2. **Add the action to `ACTION_INTRODUCED_IN`** in `versions/versionRegistry.ts` with the **current** version number. The compiler will force you to do this — if you add a type to the union without a map entry, it won't compile.
3. **Add the type to the tip version file** (currently `versions/v1.ts`) and add an `AssertCompatible` check in `versions/versionRegistry.ts`.
4. **Add a reducer case** in `sessionReducers.ts` to handle the new action.
5. **Update `../../../protocol.md`** to document the new action.

### When to bump the version

Bump `PROTOCOL_VERSION` when you need a **capability boundary** — i.e., a client needs to check "does this server support feature X?" before sending commands or rendering UI. Examples:

- A new **client-sendable** action that requires server-side support (the client must know the server can handle it before sending)
- A group of related actions that form a new feature area (subagents, model selection, etc.)

When bumping:
1. **Bump `PROTOCOL_VERSION`** in `versions/versionRegistry.ts`.
2. **Create the new tip version file** `versions/v{N}.ts`. Copy the previous tip and add your new types. The previous tip is now frozen — do not edit it.
3. **Add `AssertCompatible` checks** in `versions/versionRegistry.ts` for the new version's types.
4. **Add `ProtocolCapabilities` fields** in `sessionCapabilities.ts` for the new feature area.
5. Assign your new action types version N in `ACTION_INTRODUCED_IN`.
6. **Update `../../../protocol.md`** version history.

## Adding new notification types

Same process as new action types, but use `NOTIFICATION_INTRODUCED_IN` instead of `ACTION_INTRODUCED_IN`.

## Raising the minimum protocol version

This drops support for old clients and lets you delete compatibility cruft.

1. **Raise `MIN_PROTOCOL_VERSION`** in `versions/versionRegistry.ts` from N to N+1.
2. **Delete `versions/v{N}.ts`**.
3. **Remove the v{N} `AssertCompatible` checks** and version-grouped type aliases from `versions/versionRegistry.ts`.
4. **Compile.** The compiler will surface any code that referenced the deleted version types — clean it up.
5. **Update `../../../protocol.md`** version history.

## What the compiler catches

| Mistake | Compile error |
|---|---|
| Remove a field from a living type | `Current extends Frozen` fails in `AssertCompatible` |
| Change a field's type | `Current extends Frozen` fails in `AssertCompatible` |
| Add a required field to a living type | `Frozen extends Current` fails in `AssertCompatible` |
| Add action to union, forget `ACTION_INTRODUCED_IN` entry | Mapped type index is incomplete |
| Add notification to union, forget `NOTIFICATION_INTRODUCED_IN` entry | Mapped type index is incomplete |
| Remove action type that a version still references | Version-grouped union no longer extends living union |
