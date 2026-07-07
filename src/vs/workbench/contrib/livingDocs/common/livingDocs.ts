/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { AddedContextKind, IAddedContext, IAgentDef, IAgentRun, IAuditEntry, IFreshness, ILivingDoc, ILivingDocLock, IProposedChange, ISnapshotEntry, SnapshotVia, SourceKind } from './livingDocsModel.js';
import { ISourceGrid } from './sourceGrid.js';

export const ILivingDocsService = createDecorator<ILivingDocsService>('livingDocsService');

export const REVIEW_RAIL_VIEW_ID = 'workbench.view.livingDocs.review';
export const REVIEW_RAIL_CONTAINER_ID = 'workbench.viewContainer.livingDocs';

export const DOCUMENTS_VIEW_ID = 'workbench.view.livingDocs.documents';
export const DOCUMENTS_CONTAINER_ID = 'workbench.viewContainer.livingDocs.documents';

export const CONTEXT_VIEW_ID = 'workbench.view.livingDocs.context';
export const CONTEXT_CONTAINER_ID = 'workbench.viewContainer.livingDocs.context';

/** The tabs of the Studio right panel. */
export type LivingDocsPanelTab = 'chat' | 'review' | 'history';

/**
 * A lightweight summary of one document for the "Documents" home list. Built by parsing each
 * discovered file without loading its source, so the home can render before any document is opened.
 */
export interface ILivingDocSummary {
	readonly resource: URI;
	readonly title: string;
	readonly isLiving: boolean;
	/** The distinct source kinds (file | api | mcp) the document binds to, for the row chips. */
	readonly sourceKinds: readonly SourceKind[];
	/** The document's binding sources (e.g. "metrics.csv", "crm.api"), for the tree-rail Sources folder. */
	readonly sources: readonly string[];
	/** Human label for when the document was last synced, e.g. "Week 24" (empty for plain Markdown). */
	readonly lastSynced: string;
	/** Pending meaning-changes for this document (mirrors the Review rail count). */
	readonly pendingCount: number;
}

/**
 * One document that draws on a source (plan 29, iter 1): the dependent document plus the exact bind keys
 * it resolves from that source (empty for a context/influence-only dependency). Powers the Knowledge
 * screen's per-source detail drawer (the documents + keys behind a source, with jump-to-doc).
 */
export interface ISourceUsage {
	readonly doc: URI;
	/** The dependent document's display title, for the drawer row + jump-to-doc label. */
	readonly title: string;
	/** The bind keys this document resolves from the source (e.g. "metrics.mrr"); empty for context-only use. */
	readonly keys: readonly string[];
	/** True when this document uses the source as influence/context (frontmatter `context:`) rather than a value binding. */
	readonly context: boolean;
}

/**
 * One source in the project's real source registry (plan 29, D29-A): a projection over every project
 * document's declared `sources:`/`context:` and its lock, folded by source identity. Real data only -
 * `syncedAt` and `fresh` come from the lock's recorded hashes/timestamps (undefined `syncedAt` = referenced
 * but never synced, the honest idle state); `usedBy` is the dependency fan-in across the folder.
 */
export interface ISourceInfo {
	/** The source's durable identity as authored in frontmatter (e.g. "metrics.csv" or the API URL). */
	readonly id: string;
	readonly kind: SourceKind;
	/** The display label: the file name for a file source, the host for an api source. */
	readonly label: string;
	/** The most recent lock sync/review time across every dependent document, or undefined when never synced. */
	readonly syncedAt: string | undefined;
	/** True when the current source value still matches every dependent lock's recorded hash (nothing stale). */
	readonly fresh: boolean;
	/** The documents that depend on this source, each with the bind keys it resolves. */
	readonly usedBy: readonly ISourceUsage[];
}

/**
 * One template discovered in the project (plan 28, D28-A): a `*.template.md` file - ordinary Markdown
 * with `template: true` frontmatter - that seeds new documents. Built by parsing the file without loading
 * its sources, so the Templates screen can render its card (name, description, slot/source counts) before
 * any generation runs. `body` is the template's Markdown body (headings + bind links + `{{slot}}` hints),
 * carried so a generation can compose its skeleton and model brief from the same parsed value.
 */
export interface ITemplateInfo {
	readonly uri: URI;
	/** The template's `name:` frontmatter (falls back to the derived title), the card title. */
	readonly name: string;
	/** The template's `description:` frontmatter, the card subtitle (empty when none was authored). */
	readonly description: string;
	/** The template's declared value sources (frontmatter `sources:`), pre-ticked in the generate sheet. */
	readonly sources: readonly string[];
	/** The template's Markdown body after the frontmatter (headings, bind links, `{{slot}}` hints). */
	readonly body: string;
}

/**
 * One document in a chat's *working set* - the edit targets a multi-document instruction fans out
 * across (plan 18, decision 60). Distinct from a document's `sources` (data bindings it reads from):
 * the working set is "the documents this instruction should change". Rendered as a chip in the composer.
 */
export interface IWorkingSetDoc {
	readonly resource: URI;
	readonly title: string;
}

/**
 * One document Skill's verdict for the Skills rail (spec 5, maker != checker). Financial and
 * Formatting are deterministic and run with no model; Strategy needs a model to test claims against
 * the Knowledge decision stack, so it reports `needs-model` in the model-less build.
 */
export interface ISkillCheck {
	readonly id: 'financial' | 'strategy' | 'formatting';
	readonly name: string;
	readonly blurb: string;
	readonly status: 'pass' | 'flag' | 'needs-model' | 'ready';
	/** Human summary, e.g. "All 6 linked figures reconcile with sources." */
	readonly detail: string;
	/** True when the check can be (re-)run: deterministic locally, or model-backed via the proxy. */
	readonly canRun: boolean;
	/** True when a flagged check has a deterministic one-tap fix that edits the document (e.g. Formatting heading-case). */
	readonly fixable?: boolean;
}

/**
 * One bound figure that moved in a sync: its bind key and the old -> new resolved values. Powers the
 * editor's "Sync across" diff banner (source-peek: edit a source, sync, see which figures changed).
 */
export interface IFigureChange {
	readonly key: string;
	readonly old: string;
	readonly next: string;
}

/** One bound key shown in the in-surface source-peek pane (the comp's "Sync across" source panel). */
export interface ISourcePeekRow {
	readonly key: string;
	readonly value: string;
	/** True when this key is the one the clicked provenance dot points at (highlighted in the pane). */
	readonly selected: boolean;
}

/**
 * The raw response payload behind a non-file (api/mcp) bound value (plan 29, iter 4): the real JSON / MCP
 * tool result the value was extracted from, so source-peek shows the actual payload instead of pretending
 * to be a CSV file. `field` is the extracted key/field, highlighted in the rendered payload.
 */
export interface ISourcePayload {
	/** The source origin label, e.g. "api.example.com" or "demo.query". */
	readonly source: string;
	/** The raw response text (pretty-printed JSON for api; the MCP tool text for mcp). */
	readonly raw: string;
	/** The field/key that was extracted from the payload (highlighted in the view). */
	readonly field: string;
	/** The source kind, for the pane's label ("API response" / "MCP result"). */
	readonly kind: SourceKind;
}

/**
 * The data behind the in-surface source-peek pane. The pane renders inside the one document surface
 * (never a second editor group) - this is the v2 replacement for the SIDE_GROUP source open.
 */
export interface ISourcePeek {
	/** The primary file source's name (e.g. "metrics.csv"). */
	readonly source: string;
	readonly rows: readonly ISourcePeekRow[];
	/** Titles of living documents that also reference this source. */
	readonly referencedBy: readonly string[];
	/** The source's raw CSV grid (the comp shows the actual rows, latest highlighted), when available. */
	readonly grid?: ISourceGrid;
	/** For a clicked api/mcp bound value: the real response payload with the extracted field (plan 29 iter 4). */
	readonly payload?: ISourcePayload;
}

/**
 * One step the Chat agent took while answering, rendered as a tool-call row in the conversation
 * (e.g. "Read metrics.csv", "Proposed: Commentary rewrite"). `done` steps already happened
 * (a read/analysis); `queued` steps produced a pending change waiting in the Review rail.
 */
export interface IChatStep {
	readonly label: string;
	readonly status: 'done' | 'queued';
}

/**
 * One turn in a document's Chat conversation. User turns carry the parsed `@mention` file names;
 * assistant turns carry the model reply, the tool-call `steps`, and whether the reply was a real
 * model answer or the honest no-model fallback.
 */
export interface IChatMessage {
	readonly role: 'user' | 'assistant';
	readonly content: string;
	readonly mentions?: readonly string[];
	readonly steps?: readonly IChatStep[];
	readonly via?: 'model' | 'fallback';
	// Ids of the pending changes this assistant turn proposed (edits and/or insertions), so the Chat
	// rail can render a Copilot/Cursor-style review card per proposal tied to the turn. The card reads
	// the live pending change by id, so it disappears once approved/rejected.
	readonly proposedIds?: readonly string[];
	// True when the user cancelled this reply mid-stream (plan 27, decision D27-B): the prose streamed so
	// far is kept as an honest, muted "stopped" turn and any proposal JSON is discarded (never queued).
	readonly stopped?: boolean;
	// True when the model call genuinely failed (not a cancel): the rail renders an honest error turn with
	// an inline Retry that re-sends the same user message (plan 27 iter 3). Distinct from the no-model /
	// no-document fallbacks, which are honest guidance the user cannot usefully retry.
	readonly failed?: boolean;
}

/** The in-flight streaming turn for a document: the prose accumulated so far + the tool steps as they settle. */
export interface IStreamingChat {
	readonly text: string;
	readonly steps: readonly IChatStep[];
}

/**
 * Holds every loaded Living Document and drives the core loop:
 *   source change -> agent proposes edits -> figures auto-apply, meaning-changes queue ->
 *   approve/reject -> audit trail.
 *
 * Documents are addressed by their resource so several can be open at once. A single source
 * change fans out across all bound documents in the workspace. Shared between the document
 * editor (renders one document + its pending diffs) and the review rail (aggregates pending
 * changes across every document).
 */
export interface ILivingDocsService {
	readonly _serviceBrand: undefined;

	/** Fires whenever any document, the pending set, the audit, or a status changes. */
	readonly onDidChange: Event<void>;

	/** Fires when something asks the right panel to focus a tab (e.g. "Ask AI" -> Chat). */
	readonly onDidRequestPanel: Event<LivingDocsPanelTab>;

	/**
	 * Fires as a chat reply streams (plan 27 iter 3): the argument is the document whose live turn grew a
	 * delta or a tool step. The rail appends to the live turn without a full re-render, so the composer's
	 * caret and the scroll position survive token-by-token growth. `onDidChange` still fires once at the
	 * start and once at the end of a reply (busy on/off); this event carries the in-between deltas.
	 */
	readonly onDidStreamChat: Event<URI>;

	/**
	 * Fires when a surface (the review rail) asks the editor to scroll to and highlight one pending
	 * change's inline diff - the rail-to-editor navigation (plan 19, E-A). `docId` is the change's
	 * document; the editor pane showing that document reveals the change by id. Navigate-only: this never
	 * approves - approval happens wherever the user then acts (rail or editor).
	 */
	readonly onDidRequestFocusChange: Event<{ readonly docId: string; readonly changeId: string }>;

	/** Reveal the right panel and switch it to the given tab. */
	focusPanel(tab: LivingDocsPanelTab): void;

	/** Ask the editor showing a change's document to scroll to and highlight that change's inline diff. */
	focusChange(changeId: string): void;

	// --- per-document views (the editor renders one document by its resource) ---
	getDoc(resource: URI): ILivingDoc | undefined;
	/** The verbatim Markdown source of a document (for the Raw Markdown view). */
	getRawText(resource: URI): string;
	/** The resolved value of each bind key for a document (mirrors the lock's resolved values). */
	getResolved(resource: URI): ReadonlyMap<string, string>;
	/** The document's lock (dependency graph + provenance ledger), if loaded. */
	getLock(resource: URI): ILivingDocLock | undefined;
	/** The cheap always-on staleness signal: which bindings/context changed since last sync/review. */
	getFreshness(resource: URI): IFreshness;
	/** Run the document's Skills as graders over its current state (for the Skills rail). */
	getSkillReport(resource: URI): readonly ISkillCheck[];
	/** Run a single Skill on demand (e.g. the model-backed Strategy grader); caches the verdict. */
	runSkillCheck(resource: URI, id: ISkillCheck['id']): Promise<void>;
	/** Apply a Skill's deterministic fix to the document (e.g. Formatting title-cases the flagged headings). */
	applySkillFix(resource: URI, id: ISkillCheck['id']): Promise<void>;
	/** Re-hash the document's sources and recompute its dirty bits (what the source watcher triggers). */
	checkSources(resource: URI): Promise<void>;
	getStatus(resource: URI): string;
	/** Block ids that were auto-applied in the last refresh (for the green "just updated" highlight). */
	getRecentlyApplied(resource: URI): ReadonlySet<string>;
	/** Pending changes that belong to one document (rendered inline in its editor). */
	getPendingForDoc(resource: URI): readonly IProposedChange[];

	// --- workspace-wide views (the review rail aggregates across documents) ---
	getAllPending(): readonly IProposedChange[];
	getAudit(): readonly IAuditEntry[];

	/** Discover and summarize every Living Document in the workspace (for the "Documents" home). */
	listDocuments(): Promise<readonly ILivingDocSummary[]>;

	/** Discover and parse every `*.template.md` in the workspace (for the Templates screen; plan 28). */
	listTemplates(): Promise<readonly ITemplateInfo[]>;

	/**
	 * The project's real source registry (plan 29, D29-A): every source referenced by a document in the
	 * folder (frontmatter `sources:`/`context:`), folded by source identity with its freshness, last-sync
	 * time and the documents that depend on it. A pure projection over the locks + the dependency graph -
	 * no new persistence. Sorted by label; the honest empty state (no sources) returns an empty list.
	 */
	listSources(): Promise<readonly ISourceInfo[]>;

	/**
	 * Create a new blank template file (`untitled.template.md`) seeded with a commented example and open it.
	 * Returns the new resource, or undefined when no folder is open. (plan 28, iter 2)
	 */
	createTemplate(): Promise<URI | undefined>;

	/**
	 * Generate a draft document from a template (plan 28, iter 3). Writes `<docName>.md` as the template's
	 * static skeleton (headings + verbatim bind links; the H1 becomes the document name; slots stripped),
	 * records `template: <name>` provenance, opens it, then drives the EXISTING chat path with a composed
	 * instruction so the prose arrives as reviewable insertion proposals - never written directly. With no
	 * model reachable the skeleton is still created and a status line explains the draft needs the model.
	 * Returns the new resource, or undefined when no folder is open / the template is unreadable.
	 */
	generateFromTemplate(templateUri: URI, docName: string, note: string): Promise<URI | undefined>;

	/** The registered orchestration agents (for the Agents view). */
	getAgents(): readonly IAgentDef[];

	/** Run an agent now over its flow documents (or the whole workspace if it scopes none). */
	runAgent(agentId: string): Promise<IAgentRun | undefined>;

	/** The name of the currently open workspace folder (the "project"), or undefined when none is open. */
	getWorkspaceFolderName(): string | undefined;

	/**
	 * The truthful DISPLAY name of the open project folder (plan 33, L5), or undefined when none is open.
	 * Same as the folder name except it resolves the web/memfs "mount" stub to the sample's own name when
	 * the folder ships an `.abstract-name` marker. Use this for user-facing project labels (Home, crumb, tiles).
	 */
	getProjectDisplayName(): string | undefined;

	/** Prompt for and open a local folder as the workspace (the on-ramp; FSA on web, native dialog on desktop). */
	openFolder(): Promise<void>;

	/**
	 * Create a new blank Living Document and return its resource. With a `name` the file is born titled
	 * (`<name>.md`); with none it stays `Untitled.md` (decision 56's zero-ceremony, name-on-first-save path).
	 */
	createDocument(name?: string): Promise<URI | undefined>;

	/** The folder's data files (csv/json) not already bound to the document, for the Add-source picker. */
	getSourceCandidates(resource: URI): Promise<readonly string[]>;

	/**
	 * The project folder's data files (csv/json), for the Knowledge screen's project-level Add-source picker
	 * (plan 29, iter 2). Not doc-scoped - the user picks the target document in the sheet. Excludes lock
	 * sidecars and the agents registry (they are not user data sources). Empty when no folder is open.
	 */
	getFolderDataFiles(): Promise<readonly string[]>;

	/** Bind a source file to a document by writing its frontmatter `sources:` list (no hand-editing). */
	addSource(resource: URI, source: string): Promise<void>;

	/** Unbind a source from a document by removing it from the frontmatter `sources:` list. */
	removeSource(resource: URI, source: string): Promise<void>;

	/** Folder files (md/csv/json) not already referenced or bound, for the Add-context-file picker. */
	getContextCandidates(resource: URI): Promise<readonly string[]>;

	/** Reference a real folder file from a document by adding it to the frontmatter `context:` list. */
	addContextFile(resource: URI, file: string): Promise<void>;

	/** Remove a referenced file from a document's frontmatter `context:` list. */
	removeContextFile(resource: URI, file: string): Promise<void>;

	/** Load a document; for a Living Document its bound source is read alongside. */
	loadDocument(resource: URI): Promise<void>;

	/**
	 * Persist edited raw Markdown verbatim and reparse the document. Pass `{ silent: true }` to skip
	 * the change event so a live editing surface (e.g. the ProseMirror editor) is not forced to
	 * re-render and lose its cursor while the user is still typing.
	 */
	saveRawText(resource: URI, text: string, options?: { readonly silent?: boolean }): Promise<void>;

	/**
	 * Edit a non-bound prose block in place (WYSIWYG) and persist it. Bound blocks are
	 * driven by their source and cannot be hand-edited; this is a no-op for them.
	 */
	editBlock(resource: URI, blockId: string, text: string): Promise<void>;

	/** Re-derive bound blocks across every bound document from the latest source values. */
	refreshFromSources(): Promise<void>;

	/**
	 * The expensive, on-demand impact pass (spec 3.6): read the changed context sources against the
	 * document's prose claims and queue candidate edits (with provenance + confidence) into the review
	 * rail. Figures auto-apply; meaning/influence changes wait for approval. A claim whose anchor no
	 * longer confidently matches the prose surfaces a loud "re-link?" prompt instead of re-attaching.
	 */
	reviewImpact(resource: URI): Promise<void>;

	/** Export a document's current state to a self-contained HTML page and open it. */
	exportDocument(resource: URI): Promise<URI | undefined>;

	/**
	 * Export a document's *resolved* state to a clean, static Markdown file (no bindings, no
	 * {cell} placeholders, live values inlined) and open it. The portable share/Obsidian artefact.
	 */
	exportMarkdown(resource: URI): Promise<URI | undefined>;

	/** Share a document. Interim: live links are not built yet, so this surfaces guidance. */
	shareDocument(resource: URI): void;

	/** Publish a document: snapshot (pin) its sources to current versions for reproducibility. */
	publishDocument(resource: URI): Promise<void>;

	// --- versions / snapshots (plan 26 iter 2: the trust spine) ---
	/** The document's saved versions, newest first (empty until the first snapshot). */
	getSnapshots(resource: URI): readonly ISnapshotEntry[];
	/**
	 * Take a snapshot of the document's current body under a label. Auto-called on a refresh/agent run
	 * that applied changes, on a bulk approve, and on publish; also the manual "Save Version" action.
	 * Capped at {@link SNAPSHOT_CAP} with oldest-eviction. `body` defaults to the current on-disk text;
	 * callers that snapshot a pre-change state (e.g. before a refresh writes the new body) pass it.
	 */
	saveSnapshot(resource: URI, label: string, via: SnapshotVia, body?: string): Promise<void>;
	/**
	 * Restore an earlier version through the one approve path: any pending changes are rejected first,
	 * the snapshot body is written back, an audit entry (`approved`, via `restore`) is recorded, and
	 * freshness is recomputed so bindings that are now stale re-flag (which is correct and visible).
	 */
	restoreSnapshot(resource: URI, snapshotId: string): Promise<void>;

	// --- Chat agent (the right-panel Chat tab) ---
	/** The conversation so far for a document (empty until the first message). */
	getChatMessages(resource: URI): readonly IChatMessage[];
	/** The files a `@mention` can attach for a document: its linked sources + context files. */
	getMentionableFiles(resource: URI): readonly string[];
	/** True while a chat reply is in flight for a document (renders the "working" indicator). */
	isChatBusy(resource: URI): boolean;
	/**
	 * The in-flight streaming turn for a document (plan 27 iter 3): the prose streamed so far + the tool
	 * steps that have settled, or `undefined` when no reply is streaming. The rail renders this as a live
	 * assistant turn and reads its `text` for the salvage when the user stops.
	 */
	getStreamingChat(resource: URI): IStreamingChat | undefined;
	/**
	 * Send one user message to the document's Chat agent. Parses `@mentions`, gathers the document
	 * (with resolved figures) plus the mentioned/context sources, and asks the model for a reply that
	 * may also propose prose edits - those queue into the Review rail like any other pending change.
	 * With no model reachable it appends an honest fallback turn and proposes nothing (never fakes a reply).
	 */
	sendChatMessage(resource: URI, text: string): Promise<void>;
	/**
	 * Cancel the in-flight chat reply for a document (plan 27). Aborts the streaming model call; the prose
	 * streamed so far is kept as a muted "stopped" turn and any proposal JSON is discarded (decision D27-B).
	 * A no-op when no reply is in flight.
	 */
	cancelChat(resource: URI): void;
	/**
	 * Re-run the last user message after a failed reply (plan 27 iter 3). Drops the failed assistant turn so
	 * the retry replaces it (never duplicating the user turn) and delivers a fresh reply. A no-op while a
	 * reply is in flight or when the last turn is not a failed assistant turn.
	 */
	retryChat(resource: URI): void;

	// --- working set (plan 18: the documents a chat instruction edits across; decisions 60-62) ---
	/** The documents in the chat's working set (edit targets), keyed by the active document. */
	getWorkingSet(resource: URI): readonly IWorkingSetDoc[];
	/** Add documents to the chat's working set (de-duplicated by resource; titles resolved on add). */
	addToWorkingSet(resource: URI, docs: readonly URI[]): Promise<void>;
	/** Add every Markdown document in the workspace folder to the working set (the "Add folder" affordance). */
	addFolderToWorkingSet(resource: URI): Promise<void>;
	/** Remove one document from the chat's working set. */
	removeFromWorkingSet(resource: URI, doc: URI): void;
	/** The folder documents not already in the working set, for the "Add documents…" picker. */
	getWorkingSetCandidates(resource: URI): Promise<readonly IWorkingSetDoc[]>;

	/**
	 * Tweak (amend-before-approve, plan 31 iter 3, D31-B): mutate a pending change's proposed `newText` in
	 * place so the reviewer can hand-edit the agent's words before approving. Fires `onDidChange` so every
	 * surface re-renders the amended proposal as still-pending; the subsequent {@link approve} records the
	 * audit `via: 'tweaked'`. A no-op for an unknown id, a `figure` change (figures come from sources and are
	 * not hand-editable - the affordance hides for them), an empty amendment, or one that matches the current
	 * text. No new persist path: the amended text lands through the same {@link approve} serialisation.
	 */
	amendChange(changeId: string, newText: string): void;

	approve(changeId: string): Promise<void>;
	/** Accept every pending change for a document at once (the comp's "accept all"). */
	approveAll(docId: string): Promise<void>;
	/** Accept every pending change across every document at once (the chat-level "Accept all"). */
	approveAllPending(): Promise<void>;
	reject(changeId: string): void;
	/** Discard every pending change for one document at once (the per-document "Reject all"). */
	rejectAll(docId: string): Promise<void>;
	/** Discard every pending change across every document at once (the chat-level "Reject all"). */
	rejectAllPending(): Promise<void>;

	// --- source-peek + "Sync across" (the comp's signature editing interaction) ---
	/**
	 * The in-surface source-peek data for a document: the bound keys + resolved values, with the cells
	 * behind the clicked provenance dot marked `selected`, plus the documents that reference the source.
	 * Returns `undefined` for a non-living / unloaded document. Pure read - opens NO editor group (the v2
	 * replacement for the abrasive SIDE_GROUP source open; the pane renders inside the one document surface).
	 */
	getSourcePeek(resource: URI, cells: readonly string[]): ISourcePeek | undefined;
	/** Re-derive this document's bound figures from its current sources, apply them, and return the old -> new diff. */
	syncFromSources(resource: URI): Promise<readonly IFigureChange[]>;
	/** The figure diff from the last syncFromSources for a document (for the editor's "synced" banner). */
	getLastSyncDiff(resource: URI): readonly IFigureChange[];

	// --- typed context (the Context panel's Pasted text / Images / Company knowledge groups) ---
	/** The context the user added by hand (pasted text / images / company knowledge), persisted in the lock. */
	getAddedContext(resource: URI): readonly IAddedContext[];
	/** Add a typed context item to a document (from the Context panel's "Add context") and persist it. */
	addContext(resource: URI, kind: AddedContextKind, text: string): Promise<void>;
}
