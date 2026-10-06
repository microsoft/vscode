# Central chat catalog authority

Schema 14 adds a global `chats_v2` catalog and extends the existing
`session_chat_catalogs` header. It retains `session_chats`, `sessions_v2`, and
their existing consumers. This database foundation does not enable cutover:
the orchestrator must wire its readers, migration preparation and write-through
paths before invoking activation.

## Read contract

`readCatalogSnapshot(sessions?)` uses exactly two SELECT statements in a single
read transaction: live session identities and headers, then all live normalized
chats. A supplied selector is limited to the exported
`AGENT_HOST_CATALOG_SNAPSHOT_SESSION_LIMIT` (400 sessions). Each normalized session
has at most 1000 chats, including its default and private descendants. A header
with `authorityVersion: 1` is legacy authority; `2` is normalized authority.
Every snapshot entry also carries this discriminator, even without a header.
Consumers choose authority per session, never merge the two row sets.

The header contains the current catalog revision, exact default chat URI and
activation generation/source revision/hash. The default need not occupy slot
zero. Visible orders are contiguous; private chats have no ordering slot.
Snapshots include read/archive/inherited state, origin, ordered pinned
directories, stable storage and lineage,
ownership/metadata revisions, and typed summary/title-source/interactivity/
changes metadata. Metadata uses the existing catalog changes validator, a
1024-character title limit and a 16 KiB encoded limit. Malformed metadata,
unsupported versions and hash failures are errors, not empty summaries.

`getChatV2ProviderDetail(chat)` lazily reads only opaque provider data.
Absent snapshot directories mean inheritance;
an empty array means an explicitly empty pin. Neither snapshot nor mutation
opens a per-session database or calls a provider or the filesystem.

## Activation and writes

`ensureChatCatalogV2(session, expectation, candidate, mutation?)` compares the
live registration, tombstone/exclusion state, clean verified `sessions_v2`
generation/revision/hash, and central catalog revision. It derives every
lightweight field from the actual canonical verified payload. Candidate
conflicts, incomplete roles, reordered pinned directories, invalid lineage,
duplicate/global identities and contradictory private interactivity fail
explicitly. When a central peer catalog exists, its membership, read/archive/
inherited/origin state must agree with the payload; provider data is retained.
Missing default-chat provider detail and directories can be explicitly enriched
by the prepared candidate. Preparation must materialize all explicit private
chats into the verified payload, and supply their parent/storage/provider facts
before activation.

`candidate.deletedChats` carries bounded explicit legacy deletion evidence:
both the title and title-source fields must be present and empty. Activation
retains these identities as global tombstoned rows before old keys are cleaned;
absence or a leftover backing is not deletion evidence. This is not a complete
historical deletion inventory. Unknown legacy markers must remain uncleaned
until consumers and data have been audited.

Activation and an optional typed CAS mutation commit in **one** transaction.
The `replacePeers` mutation supplies requested membership separately from the
unchanged source candidate. Its expected revision is the pre-activation catalog
revision on first activation, or the actual normalized header revision on
replay. The metadata variant compares both live chat revisions.
A stale mutation rolls back activation as well. Replayed activation never
rewrites normalized rows. An importer calling `upsertSessionV2` after cutover
receives `conflict`, rather than overwriting the terminal normalized authority.

`registerChatCatalogV2` writes a new, already registered, unverified session
directly to normalized authority. It does not import or replace an existing
header or verified payload.

`updateChatV2Metadata` compares both ownership and metadata revisions against
the actual live row. All successful writes advance the header revision;
metadata/provider/read/directory/private-lineage writes advance only the
metadata revision. Omitted fields preserve existing values. Metadata is an
explicit complete replacement when supplied; nullable provider/origin/directories/
inherited fields use `null` to clear. Interactivity cannot change a chat's
visible/private role. Only private chats can be reparented, within the live
owner catalog, without cycles.

Existing `getSessionChatCatalog`, `replaceSessionChatCatalog` and
`recoverSessionChatCatalog` dispatch to normalized peers after cutover.
Terminal recovery returns `conflict` for any divergent candidate; an exact
complete normalized peer snapshot acknowledges the unchanged revision without
re-importing rows.
They preserve the default pointer, private descendants and bounded metadata;
removing a peer tombstones its owned private closure atomically. Reordering
does not change ownership epochs. Session deletion/unregistration/exclusion
tombstones all its live normalized rows before removing the header.

## Scope

There are no move, retirement, resource-inventory, retention, cleanup-debt or
outbox APIs in this foundation. The approved upstream schema has no database
move/reorder API to migrate. Those product workflows, reader activation,
provider/session-database migration preparation and changeset/sync wiring
belong to the orchestrator. Legacy tables are not dropped by schema 14.
