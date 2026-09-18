<!--
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See License.txt in the project root for license information.
-->

# From title filtering to conversation-content search

**Status:** Prototype in this checkout, not a description of shipped VS Code behavior.
**Scope:** Copilot sessions managed by Agent Host, in the editor window and Agents window.
**Updated:** September 15, 2026.

## Summary

Before this change, the search button in the sessions list filters session **titles and other list labels**. It does not search the conversations behind those titles. A session can contain the exact answer a user needs and still be invisible to that search if its title uses different words.

The prototype makes the existing search button open **local full-text search over saved user messages and assistant responses**. Editor windows scope search to their open workspace; the Agents window remains cross-workspace. Results include an excerpt and open the relevant chat at the matching message. Searching does not require opening or resuming every conversation.

The default is **local keyword search**, using SQLite FTS5 and BM25 ranking. An optional **semantic mode** adds embedding-based matches for related concepts and combines them with keyword results. Semantic mode requires explicit approval before any query or saved message content is sent to the selected Copilot embeddings provider.

## 1. How search works without this change

There are two distinct search experiences:

| Existing experience | What it searches | What it does not do |
|---|---|---|
| Search/Find in the sessions list | Session titles, child-chat titles where represented, and group/section labels | Search user messages or assistant responses across saved conversations |
| Find inside an open chat | User-message text and supported rendered response content in that conversation | Discover matching content in other saved conversations |

The sessions list uses the standard tree Find widget, normally in filtering mode. The tree asks its keyboard-navigation label provider for the searchable string:

- In the editor's Chat panel, session rows return `element.label`, normally the session title.
- In the Agents window, session rows return their title, child-chat rows return the chat title, and group/section rows return their labels.
- The tree performs fuzzy or contiguous matching against those labels and filters the list.

**Typing into that list filter does not issue a full-text database query or fetch conversation histories.** The list's metadata may already have been loaded from storage, but the search operation itself works on the supplied labels.

Find within an open chat is separate. It extracts text from the current chat model and supports navigation within that conversation. Its response extraction deliberately excludes reasoning and tool invocations whose rendered placement cannot be determined reliably from the model alone.

References: [editor label provider](../../workbench/contrib/chat/browser/agentSessions/agentSessionsViewer.ts), [Agents list](../../sessions/contrib/sessions/browser/views/sessionsList.ts), [tree Find implementation](../../base/browser/ui/tree/abstractTree.ts), and [in-chat Find extraction](../../workbench/contrib/chat/browser/widget/chatFind/chatFindContent.ts).

## 2. The user problem

Titles are useful for navigation, but they are a lossy summary of a conversation.

For example, a session titled **"Fix startup regression"** may contain:

- A user message describing an `ECONNRESET` error.
- An assistant response explaining token refresh.
- A code block showing a proposed fix.

A title filter cannot find that session by `ECONNRESET` or `token refresh` unless those terms are also in the title. The desired experience is to search the discussion itself, see why a result matched, and jump to the relevant message instead of manually opening and searching multiple sessions.

## 3. What changes for users

The existing magnifying-glass button in both windows now opens **Search Agent Session Content (Preview)**. It is also available from the Command Palette.

| Window | Search scope |
|---|---|
| Editor with an open folder or populated multi-root workspace | Sessions belonging to the current workspace |
| Empty editor window, with no workspace folders | Eligible sessions across projects on connected hosts |
| Agents window | Eligible sessions across projects on connected hosts, regardless of the selected workspace |

The picker identifies the active scope. Workspace changes invalidate an in-flight editor search and rerun the query with the new scope.

Each result displays:

- Session title.
- Whether the match came from the user or assistant.
- Host and project context, plus an archive label when applicable.
- A short excerpt around the matching content.

Selecting a result opens its exact chat and reveals the matching message. The picker supports keyboard navigation and reports scan progress, failures, unsupported hosts, and result limits.

The old title-only filter remains available:

- **Chat: Find Agent Session by Title** in the editor window.
- **Sessions: Find Session by Title** in the Agents window.

The prototype does **not yet merge title matches and message-content matches into a single ranking**. Titles identify results in the content picker, but are not themselves indexed by its full-text index. A term appearing only in a title is still best found with title-only Find.

### Content coverage

| Content | Current prototype |
|---|---|
| Saved user messages | Included, with known injected prompt scaffolding removed |
| Saved assistant response text, including code contained in it | Included without truncating the indexed text |
| Rendered `task_complete` summaries | Included as assistant content |
| Default chat and persisted peer chats | Included |
| Archived sessions | Included when present in the host's available session catalog |
| Reasoning, synthetic user injections, and transient events | Excluded |
| Tool-origin subagent transcripts | Excluded |
| Attachments and arbitrary tool input/output | Excluded |
| Files elsewhere in the workspace | Not independently indexed |

The scope starts with eligible Copilot sessions returned by the connected hosts. In a workspace-scoped editor, the client filters that catalog **before requesting or indexing histories**. It reuses the session list's matching rules: recorded workspace-file identity for multi-root sessions, working-directory containment otherwise, and the existing repository-root exception for legacy worktree sessions. URI authorities distinguish remote hosts; matching is not based on project display names or raw path prefixes.

This is session-level scope, not a per-message file-access boundary: matching sessions contribute their default and peer chats. Search does not crawl arbitrary databases or every conversation directory on the machine. Host catalog visibility, external-session settings, and the active profile still affect which sessions are available.

## 4. Why a local database alone is not enough

Persisting conversations and making them searchable are different capabilities. A database may store metadata, event records, or file-edit snapshots without exposing an index suitable for interactive cross-session search.

There are several storage responsibilities here:

1. **Agent Host storage:** the host owns the session catalog, chat membership, opaque provider-backing records, turn mappings, and other metadata. Its per-session `session.db` is not simply a table of complete conversation messages.
2. **Copilot persisted history:** the provider accesses durable conversation events through the SDK. Search should use this API instead of depending on a private on-disk transcript schema.
3. **The new search index:** a derived, rebuildable index of selected message content. It is not the authoritative conversation store.

There is also an existing **Chronicle full-text index in the Copilot extension**. It provides useful prior art: FTS5 indexing of user/assistant turn content and BM25-ranked queries. However, it is separate from the sessions-list UI, and its extension-side ingestion is not a guarantee of coverage for Agent Host conversations. Its ingestion/reindex paths also truncate some content, including assistant responses at 5,000 characters and historical user messages at 1,000 characters.

The prototype therefore reads the provider's persisted history and indexes full message text rather than treating the extension's index as a complete transcript source.

References: [host session schema](node/sessionDatabase.ts), [Copilot provider](node/copilot/copilotAgent.ts), [Chronicle search](../../../../extensions/copilot/src/platform/chronicle/node/sessionStore.ts), and [Chronicle truncation limits](../../../../extensions/copilot/src/extension/chronicle/common/sessionStoreTracking.ts).

## 5. Architecture and request flow

```text
Editor Chat panel / Agents window search button
                       |
              Shared search picker
                       |
           Agent Host connection abstraction
                /                    \
    Local management IPC        Remote AHP extension
                \                    /
            AgentService.searchSessionHistory
                       |
       Host-owned default and peer-chat catalog
                       |
              Copilot provider adapter
                       |
        SDK persisted-event reader -> FTS5 index
                       |
          Chat/turn locators + short snippets
```

### Search runs where the history lives

The UI does not open SQLite files directly. It asks the owning Agent Host to search and receives bounded results. For a remote host, the index and transcript reads remain on that host; result snippets cross the existing connection to the UI.

The host owns the relationship between a session and its chats. The Copilot adapter owns the relationship between a chat and its SDK conversation. These identifiers are not necessarily identical, especially after forks or imports. The host passes opaque backing data to the provider rather than decoding it itself.

### Local and remote communication are intentionally different

Remote listeners that support the feature expose `vscode/searchSessionHistory`, advertised through the `vscode.searchSessionHistory` initialize capability.

The local utility-process data plane deliberately disables these protocol extension methods. Local search therefore uses the existing **management IPC channel**, through `supportsSessionHistorySearch` and `searchSessionHistory`. The UI consults transport-aware support rather than assuming a protocol capability describes every local operation.

This distinction matters: using the remote route for the local host produces "search unavailable" even when the search implementation is present. The fix preserves the restriction on unrelated protocol extension methods.

References: [connection contracts](common/agentService.ts), [local management service](node/agentHostManagementService.ts), [protocol client](browser/agentHostProtocolClient.ts), and [host routing](node/agentHostSessionSearch.ts).

## 6. How full-text retrieval works

### Query behavior

The prototype uses **SQLite FTS5**, an inverted text index: it looks up indexed words rather than scanning every complete transcript for each query.

Input is converted into literal Unicode word/number terms joined with `AND`:

| Query | Meaning |
|---|---|
| `document` | Find an indexed content segment containing that term |
| `token refresh` | Find a segment containing both terms |
| `"token refresh"` | Currently the same terms, not an exact-phrase instruction |
| `authentication` | Does not automatically match a discussion using only "signing in" |

Punctuation is a separator, not SQL or advanced FTS query syntax. Terms must match within the same indexed message/content segment, not merely somewhere across the entire session.

Unlike the old fuzzy title filter, this is token-based matching. General substring matching, stemming, and typo correction are not provided by the current query implementation.

FTS5's **BM25** score ranks matching segments within each chat using word occurrence and document-length statistics. This is lexical relevance, not semantic understanding.

The overall picker currently combines results from concurrent session searches; it does not perform a globally comparable relevance ranking across all chats and hosts. Multiple hits can repeat the same session title.

### Indexing and freshness

The host/profile has one derived search database beside its Agent Host storage file, normally:

```text
User/globalStorage/agent-host-search.db
  search_chats:     integer chat ID -> harness, chat/session/storage URIs,
                   backing identity, journal revision, index version
  search_turns:     integer turn ID -> chat ID and original turn reference
  search_documents: integer document ID -> turn ID, author role,
                   provider source locator
  search_fts:       full searchable text; rowid = integer document ID
```

Long chat and turn identifiers are stored in metadata rows, not repeated as FTS columns. Copilot, Claude, and Codex identities can coexist without collisions in the storage layer; only Copilot currently has a production document reader. The database remains a search-only cache, not a replacement for any provider database.

For each searched chat:

1. Read the last persisted event to identify the current journal tail.
2. Reuse the index when its version, backing identity, and tail ID still match.
3. Otherwise rebuild it by reading history forward in pages of 500 events.
4. Stop at the captured tail, so a conversation that keeps growing cannot extend the scan indefinitely.
5. Replace only that chat's metadata and FTS rows atomically in a SQLite transaction.
6. Query with the owning chat constraint before the result limit, then return bounded excerpts.

The SDK's `sessions.readPersistedEvents` API reads history **without creating, resuming, or activating the conversation**. The provider runtime may still need to initialize to serve that API.

Append, truncation, and backing changes invalidate the cache. The current implementation rebuilds the affected chat's index rather than incrementally inserting only newly appended events. It assumes durable event IDs identify immutable events; in-place content edits that preserve all relevant IDs are not covered by that freshness scheme.

Failed or inconsistent reads are surfaced as errors. A failed rebuild is rolled back rather than reported as a successful partial search.

The existing session-data deletion notification removes the corresponding shared-cache rows, including FTS entries. This cleanup is one-way: deleting cache data never deletes history. The cache checks its own database identity before changing schema, so accidentally pointing it at another database must fail without altering that database.

Recognized per-chat `session-search.db` files from the first prototype are cleaned up lazily after successful shared-cache indexing. Unsearched chats may retain their old sidecars during the transition, and unrecognized files are preserved with a warning. No canonical provider or session-history database is migrated, compacted, or deleted by this feature.

### Result identity and navigation

The result contract is intentionally small:

```ts
{
  chat: string;
  turnId: string;
  role: 'user' | 'assistant';
  snippet: string;
}
```

The owning connection supplies host identity. The host reconciles persisted SDK event IDs with loaded host turn IDs when necessary. The UI then opens the exact chat and selects the appropriate user or assistant row.

If the matching turn is missing, the UI reports that it could not reveal it. It does not silently redirect to another message with similar text.

References: [query/result contracts](common/agentHostSessionSearch.ts), [shared database](node/sessionSearchDatabase.ts), [cache lifecycle service](node/agentHostSessionSearchIndex.ts), [Copilot document reader](node/copilot/copilotSessionSearch.ts), and [picker/navigation](../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionSearch.ts).

## 7. Responsiveness, privacy, and current tradeoffs

| Decision | Benefit / tradeoff |
|---|---|
| Search only after a non-empty query; debounce edits by 300 ms | Avoid work while idle and reduce repeated scans while typing |
| At most four session requests in flight per picker, shared across query generations | Bound concurrency; an old in-flight request may finish before a newer query proceeds |
| Discard stale responses and stop queueing work after cancellation | Prevent old results overwriting the current query; does not abort every already-running host request |
| 512-character query limit; 20 results per chat; 100 per host session response and 100 displayed overall | Bound work and response size; broad queries may require refinement |
| Excerpts bounded to 220 characters, but full message content indexed | Keep the UI compact without losing matches deep in long messages |
| Persist a derived local index | Faster reuse, at the cost of additional disk space and duplicate stored conversation text |
| Restrictive POSIX file permissions where supported | Protect the derived index; it is not an encrypted store |
| Keyword mode makes no embeddings or inference requests | Semantic mode adds provider calls only after explicit opt-in |

"Local search" does not mean the rest of VS Code never uses the network: authentication, normal provider initialization, and remote-host communication remain separate concerns.

The first search can be slower while indexes are created. This prototype has functional validation, not a production-scale latency or memory benchmark.

### Measured storage footprint and optimization options

A sample of the original per-chat sidecar prototype measured on September 15, 2026 contained:

| Measurement | Value |
|---|---|
| Per-chat search databases | 48 |
| Indexed message/content segments | 1,964 |
| Indexed UTF-8 text | 0.95 MiB |
| Total SQLite search database size | 3.55 MiB |
| Median / largest database | 60 KiB / 392 KiB |

At this sample's average, 1,000 similarly sized chats would consume roughly 74 MiB. This is an illustration, not a limit or a forecast for long coding conversations. Searchable text volume, vocabulary, SQLite page overhead, and retained free pages affect size. The UI's result limits do not cap index storage.

Reindexing the same 1,964 segments into the consolidated schema reduced the search cache from **48 files / 3,723,264 bytes (3.55 MiB)** to **one file / 2,121,728 bytes (2.02 MiB)**: **43% less storage**, while retaining the text. The comparison returned the same 34 bounded `document` matches and verified that the original search sidecars' bytes were unchanged. It used normalized documents read from our existing search caches, not a live SDK/network latency benchmark. The temporary comparison database was removed afterwards.

Only the Copilot adapter currently supplies searchable documents. A Claude session does not receive an index today. A future Claude adapter can use the same shared database rather than creating another database per chat or provider.

**Consolidation is now implemented:** one derived search index per host/profile, with integer chat, turn, and document IDs. Remaining storage optimizations are separate follow-up work:

1. **Evaluate contentless FTS5.** The consolidated prototype still keeps the searchable text in its FTS table. Omitting that copy requires fetching original messages for snippets and does not eliminate the inverted index itself.
2. **Update incrementally and reclaim space deliberately.** Persist indexing cursors for append-only history and compact when fragmentation warrants it, rather than rebuilding every changed chat.
3. **Deduplicate repeated content and add a cache budget.** Preserve separate occurrence/turn locators while sharing repeated text where worthwhile. Eviction can bound disk use, at the cost of reindexing evicted history.

These follow-ups are not implemented. Truncating messages to reduce storage is not recommended: it would reintroduce the missing-deep-content problem. All optimization, migration, and cleanup work is restricted to the derived search database we own; existing SDK, extension, and session-history databases stay untouched.

**Profile identity is part of the data boundary.** A development build using a separate user-data directory sees that profile's host catalog, not automatically the user's Insiders history. Real-history validation used a separate profile snapshot with consistent SQLite backups; the original Insiders databases were not modified.

## 8. Opt-in semantic search

Semantic search addresses a different retrieval problem: finding a discussion about "signing in" when the query is "authentication."

The prototype uses **hybrid retrieval**:

1. The user enables semantic mode in the existing search picker and chooses a registered Copilot embeddings provider.
2. A confirmation explains the scope, provider, content transfer, local vector storage, and first-time indexing cost.
3. The ordinary keyword request refreshes the canonical-text search cache for each eligible session.
4. The host returns bounded batches of unembedded text chunks, independently of keyword matches.
5. The workbench computes chunk embeddings through the extension provider, then sends vectors back to the host-owned search cache.
6. A query embedding retrieves candidates by cosine similarity. Reciprocal-rank fusion combines semantic and keyword rankings, deduplicating by chat, turn, and author role.

Independent semantic retrieval matters. Merely reranking the lexical results would still miss conversations that share no query terms.

### Extension and host boundary

The existing extension registers providers through the proposed embeddings API. The shared [workbench embeddings service](../../workbench/services/embeddings/common/embeddingsService.ts) now exposes that registration to search without importing Copilot extension internals into Agent Host.

The host exposes three typed operations through `sessionSemanticSearch`: retrieve pending chunks, store vectors, and search cached vectors. Local utility-process clients use management IPC; remote hosts negotiate a separate semantic-search capability. The host remains responsible for the eligible chat catalog and query isolation. It never receives embedding-endpoint credentials.

### Consent, failures, and scope

Keyword mode remains the default. Consent applies only to the current picker and scope, not all future searches. Closing the picker, switching back to keyword mode, or changing workspace stops queued embedding work. Cancellation is passed to the provider for requests already in flight; it cannot undo content already sent.

Editor workspace filtering happens before message histories or embedding chunks are requested. Agents-window searches remain cross-workspace and say so in the confirmation. Semantic mode follows the existing registered provider's authentication and policy behavior; it does not invent a separate token or endpoint.

Missing providers, unsupported hosts, indexing budgets, and endpoint failures retain keyword results with an explicit fallback/incomplete indication. An index that covers only part of the eligible content must not be presented as complete semantic search.

### Persistence and limits

Chunk rows contain offsets and hashes referencing the existing FTS text, rather than a second chunk-text copy. Normalized Float32 vectors are stored as blobs in the same owned search database, keyed by chunk, model identity, and dimension count. Source-document deletion or replacement removes the related chunks and vectors. Stale vector writes are rejected rather than being attached to a replacement document that reused an ID.

A 512-dimensional Float32 embedding requires 2,048 raw bytes per chunk, plus database/index metadata. The earlier 43% consolidation measurement covers the lexical cache only; semantic vectors add storage. This prototype uses exact cosine comparison within the requested session, not an approximate nearest-neighbor index.

Provider model identifiers must change when their embedding semantics change; dimension checks alone cannot detect an incompatible model that emits the same vector length. Semantic quality, similarity thresholds, and large-corpus performance still require real-model evaluation. Deterministic test vectors verify retrieval mechanics but are not a relevance benchmark.

Further improvements include unified title/body retrieval, global cross-session reranking, incremental preservation of unchanged chunks, and a measured retrieval-quality/performance baseline.

## 9. Validation and review focus

Automated coverage includes long-message matches, prompt-scaffolding exclusion, peer-chat routing, stable navigation IDs, pagination, cache reuse, append/truncate invalidation, rollback on errors, query validation, result bounds, cancellation, local-management support, both toolbar registrations, and workspace-scoped filtering before history requests.

Live OSS checks verified real-history results, opening a result at its matching message, and launching the picker from the existing search button in both windows.

Reviewers should distinguish three claims:

- **Implemented:** searchable saved message content, bounded snippets, navigation, local persistent indexing, and opt-in embedding-based hybrid retrieval.
- **Not yet implemented:** a calibrated global hybrid ranking, a unified title/body query, and arbitrary tool-output search.
- **Requires further measurement:** large-corpus latency, index growth, rebuild cost, and retrieval quality.

### Short explanation for sharing

> The existing session search filters titles. This change searches the saved conversation itself: user messages and assistant responses. It builds one search cache per Agent Host/profile, returns contextual snippets, and opens the matching message without loading every chat during search. Keyword search stays local; an optional, explicitly approved semantic mode adds concept-based matches using the registered Copilot embeddings provider. Search text, chunk references, and vectors live in our derived cache; provider/history databases remain untouched.
