# Central chat catalog authority

Schema 14 adds a global `chats_v2` catalog and extends the existing
`session_chat_catalogs` header. It retains `session_chats`, `sessions_v2`, and
their legacy consumers. The orchestrator enables metadata-only migration under
the existing session-catalog gate after wiring normalized readers, producers
and restoration. Disabling the gate prevents new activation; already activated
catalogs remain terminal normalized authority.
The gate is frozen on first use within a host process; changing it requires a
new host. It cannot restore legacy compatibility writes for an activated catalog.

## Legacy retention and migration markers

Keep the legacy `session_chats` table during migration and subsequent milestones.
The existing `session_chat_catalogs.authority_version = 2` header is the migration
marker for its owner session and all chats activated together. The header and V2
rows are committed atomically; normalization generation/source revision/hash
record the verified source receipt. No separate flag on each legacy chat row is
needed. Retained legacy rows are not authoritative after activation and must not
be merged into V2 reads or used as a fallback.

Normalized activation, direct registration and public peer membership mutations
also replace `session_chats` with a one-way SQL projection in the same central
transaction. It contains live visible peers only, excludes the exact physical
default and private descendants, and compacts peer order independently of the
default's slot. Removing a peer tombstones its V2 identity and private closure;
the projection removes its legacy membership row. Representable peer read/archive,
provider, origin and inherited-turn updates refresh the same projection.
Projection failure rolls back the authoritative mutation. It does not advance
the header a second time or acknowledge a backing-store mirror.

This is a migration-only compatibility projection, not a second authority or
bidirectional synchronization. Legacy writes are never imported after cutover.
An older writer can still change legacy membership and the shared header revision;
normal V2 revision checks reject stale requests, and a later public mutation
rebuilds the projection from V2. The projection does not update legacy backing
membership JSON or its mirror acknowledgement, titles, pinned directories, or
provider transcripts. Session aggregate publication remains separate and can lag.
Default-only sessions have no projected peer rows; their existing runtime
registration bridge records both session registries, and deletion removes both.
These SQL facts do not establish full older-app read/write or downgrade safety,
or compatibility with ownership changes and opaque chat addressing.

Table removal is deferred until a separately approved cleanup milestone, after
remaining migration, consumer and recovery dependencies have been audited.
Successful activation alone never authorizes dropping the old table.

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

`listLegacyChatCatalogSessions(sessions)` selects migration eligibility from live
session identities and authority headers only, excluding backing, tombstoned and
excluded sessions. Provisional sessions are eligible when their persisted source
is verified, clean and consistent; normalization preserves the provisional marker
and does not create provider backing or change listing/restoration visibility.
Dirty or missing sources remain pending until reconciliation supplies trustworthy
metadata. Materialization updates the same normalized chat and clears the existing
session marker through the normal lifecycle. Damaged normalized chat metadata cannot block unrelated legacy conversion
or reconciliation. Conversion failures remain logged and isolated per owner.

`readChatV2(session, chat)` reads authority and one owner-scoped chat in a single
queued SELECT. It validates the visible default and the requested row's metadata
and directories without decoding sibling or private rows. Title hydration and
deferred-title restoration use this lookup rather than repeated full snapshots.
Historical subagents discovered from restored parent tool results are registered
as private rows before title hydration, retaining their authoritative physical-default
parent edge and imported
legacy custom title. Existing normalized metadata remains authoritative; child
transcripts stay lazy and private rows never enter public peer ordering.

`getChatV2ProviderDetail(chat)` lazily reads only opaque provider data.
Absent snapshot directories mean inheritance;
an empty array means an explicitly empty pin. Neither snapshot nor mutation
opens a per-session database or calls a provider or the filesystem.

## Consumer integration

Bulk listing uses `readSessionListCatalogs(sessions)`, bounded to 400 selected
sessions per statement. One SELECT returns the required session fields, joined
authority/default identity and compact public chat summaries. The read is queued
behind central mutations so it cannot observe partially applied writes on the
shared connection. It preserves the header's exact default role and validates
public metadata hashes, versions, origin and pinned directories.

For normalized owners, SQLite omits stale embedded chats from the returned
aggregate payload; legacy owners retain their embedded chats. Neither projection
changes stored data. Listing does not load private rows, provider detail,
storage/lineage facts or mutation receipts, and its read-only return type is not
a persistable envelope. The decoder validates list payloads without generating
an unused canonical serialization. Existing canonical payload and complete
snapshot APIs remain unchanged; individual read-error recovery retains the
complete snapshot path. The source resolver uses the same public chat projection
and omits legacy per-chat summary reads and writes when normalized chats are supplied.

The existing `listSessions computed` performance summary retains total duration,
catalog/provider fallback counts, resolution duration and database opens/stats.
`catalog read Nms` measures the bulk catalog-reader phase, including bounded row
recovery if the bulk read fails. Slow-list info logging and normal trace logging
keep their existing thresholds; no per-session logging is added.

Session synchronization carries the observed catalog revision into the
aggregate-only upsert. Durable pending replay validates against current
normalized authority; an obsolete chat projection is rebuilt instead of
reimported. Existing AgentService aggregate synchronization and reconciliation
use these projections without altering normalized chat metadata.

The bounded production reconciliation callback prepares unopened sessions
without starting providers or loading transcripts. It acquires the session-sync
queue before the peer-store queue, fencing receipt and legacy metadata producers
without reversing the normal synchronization lock order. Preparation returns
`notReady` when explicit
backing clears still contradict the central legacy catalog. Legacy
reconciliation must first publish those facts and a matching verified source;
activation must not silently preserve stale provider detail or reinterpret
an inconsistent receipt. An already normalized session does not reopen legacy
metadata.

New non-provisional, non-ephemeral sessions with no existing catalog or verified envelope
register directly in normalized authority. Existing clean sessions can activate
on their first metadata write: preparation combines the requested typed mutation
with conversion in the same central transaction. Dirty or unreconciled sessions
remain legacy and schedule reconciliation before a later bounded retry.

Title/source, read/archive flags, changes summaries, opaque provider detail and
pinned-directory producers use the peer store's serialized central-aware writer.
Metadata replacements merge against the current row and compare both revisions.
Title writes and snapshots reuse the source projection's Unicode-safe
1024-character summary bound; accepted longer titles do not fail catalog persistence.
Cold restoration uses that bounded authoritative summary.
Multiple keys for one chat share a CAS update. Unknown summary values remain
absent; explicit empty changes counts remain zero. Clears do not fall back to
legacy backing values. Tool and local `/rename` commands use the same writer.
Deferred title scheduling stays in session metadata, but restoration validates its
seed against normalized title/source metadata after activation, not legacy title
mirrors. Default-title snapshots
fill only absent titles and recheck that condition after a CAS conflict, without
writing legacy chat-title mirrors. Session-level configuration, aggregate flags, draft and
transcript metadata remain in their existing session/backing stores.

Restoration reads the header's default role and current public rows. Private
rows are not mistaken for deleted public membership. Spawned tool chats retain
their existing read-only protocol presentation while their internal catalog
role is Hidden; private insertion, provider updates and removal use the private
lifecycle APIs. A later explicit parent updates an existing private row; subsequent
provider-only updates retain that lineage. No migration cleans unknown historical deletion markers.
Public origin projections retain bounded navigation provenance; full side-chat
selection snapshots stay in normalized origin detail. Normalization validates
the same public projection and preserves explicitly prepared detail, including
exact agreement with existing central legacy origin facts. Aggregate-only
updates compare the shared public projection without rewriting origin detail.

Explicit recreation of a deleted session retains its session URI but allocates
a fresh default-chat URI with a generation query. Old global chat identities
remain tombstoned. Creation, root-channel routing, provider rollback and
restoration use the advertised/header default URI rather than deriving identity
from the session URI. Initial pull-request artifacts also reference the allocated
default chat, including a fresh generation when a deleted session is recreated.
The physical catalog default stays stable when a client selects a different
routing default. Legacy state and live-summary projections compare only against
the state manager's stable default identity, never routing selection or URI spelling.
Eviction retains that physical identity until restoration or summary retraction.
Cold deletion resolves it from the normalized header and materializes the exact
default backing before destructive disposal. Provider-data events preserve their
addressed chat identity even when a canonical-shaped URI belongs to a peer.
Imported aggregate requests carry the revision read with their authoritative
chat snapshot; revision conflicts rebuild that snapshot before retrying.
Direct registration has no migration generation stamp: its
first aggregate envelope establishes the lifetime generation. Readers validate
an explicit header stamp when present, but do not require one for these new
catalogs.

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
When per-chat backing provenance, inherited-turn metadata or pinned directories
contradict the verified legacy projection, preparation returns `notReady`.
The reconciliation owner marks the payload dirty and refreshes it from the
persisted default and peer metadata before retrying activation. This metadata-only
repair does not hydrate provider conversations or relax normalization checks.
Existing legacy catalog imports use the same default metadata enrichment without
changing provider-only initial imports.
Private roles may have no recorded parent; absence is preserved without
inventing default lineage. Present parent chains must remain within the owner
catalog and must not be cyclic.

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

`upsertSessionV2FromChatCatalog(envelope, expectedSessionGeneration,
expectedCatalogRevision)` updates only the session aggregate envelope after
checking normalized authority, header revision, registration lifetime and the
exact current public chat projection in the same transaction. Callers rebuild
the public projection from a fresh normalized snapshot, not legacy metadata.
Private rows remain central and are not deleted when absent from this public
projection. Existing envelope generation/revision/hash CAS rules still apply;
chat or header changes conflict. This path never writes chats or the header.

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

Existing `getSessionChatCatalog` and `replaceSessionChatCatalog` dispatch to
normalized peers after cutover.
They preserve the default pointer, private descendants and bounded metadata;
removing a peer tombstones its owned private closure atomically. Reordering
does not change ownership epochs. Session deletion/unregistration/exclusion
tombstones all its live normalized rows before removing the header.

## Scope

`insertPrivateChatV2(session, chat, expectedCatalogRevision)` adds a complete
explicitly Hidden chat without an ordering slot. It compares the live owner and
normalized header revision, enforces the total chat bound, and validates recorded
parent chains. Exact current same-owner private data replays under the current
revision; foreign, public, tombstoned or divergent identities conflict.

`removePrivateChatV2(session, chat, expectedCatalogRevision)` tombstones only the
owned private target and its private descendant closure in the same transaction
as advancing the header revision. Public/default rows are never removed or
traversed. Tombstoned global identities cannot be reinserted; stale revision
attempts conflict. Neither operation writes the session aggregate payload.

There are no move, retirement, resource-inventory, retention, cleanup-debt or
outbox APIs in this foundation. The approved upstream schema has no database
move/reorder API to migrate. Session consumption, provider remapping and resource
transfer remain a separate delivery. Legacy tables are not dropped by schema 14.
