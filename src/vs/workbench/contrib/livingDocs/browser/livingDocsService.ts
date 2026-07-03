/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { asJson, asText, IRequestService } from '../../../../platform/request/common/request.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IChatMessage, IChatStep, IFigureChange, ILivingDocsService, ILivingDocSummary, ISkillCheck, ISourcePeek, ISourcePeekRow, IWorkingSetDoc, LivingDocsPanelTab, REVIEW_RAIL_VIEW_ID } from '../common/livingDocs.js';
import { extractBindLinks, findQuoteLine, parseChatResponse, parseLivingDoc, parseMultiChatResponse, reconcileBindLinks, serializeLivingDoc, withFrontmatterList } from '../common/livingDocMarkdown.js';
import { renderExportHtml, renderExportMarkdown } from './livingDocRender.js';
import { ILockStore, SidecarLockStore } from './livingDocLockStore.js';
import { AgentOrchestrator, IAgentRunContext, IAgentRunResult } from './agentOrchestrator.js';
import { WorkspaceAgentStore } from './agentStore.js';
import { AddedContextKind, AgentPolicy, emptyLock, IAddedContext, IAgentDef, IAgentRun, IAuditEntry, IBindingEntry, IFreshness, ILivingDoc, ILivingDocBlock, ILivingDocLock, IProposedChange, SourceKind } from '../common/livingDocsModel.js';
import { buildSourceGrid } from '../common/sourceGrid.js';

// The verdict from one Skill acting as a grader in the verify gate (maker != checker, spec 5).
interface IGradeResult {
	readonly pass: boolean;
	readonly flag?: string;
}

// One freshly-read source value for a bind key, before it is written into the lock.
interface IResolution {
	readonly value: string;
	readonly sourceHash: string;
	readonly source: string;        // human-ish origin, e.g. "metrics.csv#mrr"
}

// Everything we hold for one open or discovered document.
interface IDocState {
	readonly uri: URI;
	doc: ILivingDoc;
	rawText: string;
	lock: ILivingDocLock;           // the source of truth for resolved values + freshness
	recent: Set<string>;            // block ids changed in the last refresh (for the highlight)
	staleBindings: Set<string>;     // dirty bits: bind keys whose source changed since last sync
	staleContext: Set<string>;      // dirty bits: context files changed since last review
	status: string;
	folderFiles: readonly string[]; // real md/csv/json siblings in the doc's folder (for @mention + pickers)
}

const k = (n: number) => `${(n / 1000).toFixed(1)}k`;
const pct = (a: number, b: number) => `${b >= a ? '+' : ''}${Math.round(((b - a) / a) * 100)}%`;

// A tiny, order-independent string hash (FNV-1a) for cheap source-change detection. Not crypto.
function hashString(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16);
}

// Classify a frontmatter source string into a source kind for the home-row chips.
function sourceKind(source: string): SourceKind {
	return /^https?:\/\//.test(source) ? 'api' : 'file';
}

// Model-backed features (Review-impact rewrites, the Strategy grader) call Claude through a local
// OAuth proxy (scripts/lwd-anthropic-proxy.js) so no credential ever reaches the renderer. These are
// the request defaults; the proxy base URL is configurable via livingDocs.modelProxyUrl.
const DEFAULT_PROXY_URL = 'http://localhost:8090';
const DEFAULT_MODEL = 'claude-opus-4-8';
const MODEL_MAX_TOKENS = 1024;
// How long a model-availability probe result is trusted before re-checking (so starting the proxy
// mid-session is picked up without re-probing on every render).
const MODEL_PROBE_TTL_MS = 30_000;

// The alias a bind key uses for a source file: "metrics.csv" -> "metrics", "market-research.md" ->
// "market-research". Bind keys are "<alias>.<field>" (with an optional ".<qualifier>").
function sourceAlias(source: string): string {
	const name = source.split('/').pop() ?? source;
	return name.replace(/\.[^.]+$/, '');
}

function tokenize(s: string): string[] {
	return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

// Token-overlap (Jaccard) similarity of two strings, 0..1. Used to relocate a prose claim against the
// current text - deterministic, no model. 1 = identical token sets, 0 = nothing in common.
function similarity(a: string, b: string): number {
	const ta = new Set(tokenize(a));
	const tb = new Set(tokenize(b));
	if (ta.size === 0 || tb.size === 0) { return 0; }
	let inter = 0;
	for (const t of ta) { if (tb.has(t)) { inter++; } }
	return inter / (ta.size + tb.size - inter);
}

// The "New document" starting point (plan 16 iter 3, decision 56): a BLANK writing surface, not an
// IDE boilerplate template. A new doc is clean Markdown the user owns -- no injected `title:`
// frontmatter and no "## Overview / Write your document here" placeholder, so opening it reads as
// "just start writing" (the editor focuses the first line on mount). It becomes a Living Document the
// moment a source is connected (a `sources:`/`context:` entry or a bind link). A single trailing
// newline (not a 0-byte file) gives ProseMirror one empty paragraph to land the caret in.
const NEW_DOCUMENT_TEMPLATE = `\n`;

export class LivingDocsService extends Disposable implements ILivingDocsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _onDidRequestPanel = this._register(new Emitter<LivingDocsPanelTab>());
	readonly onDidRequestPanel: Event<LivingDocsPanelTab> = this._onDidRequestPanel.event;

	private readonly _onDidRequestFocusChange = this._register(new Emitter<{ docId: string; changeId: string }>());
	readonly onDidRequestFocusChange: Event<{ docId: string; changeId: string }> = this._onDidRequestFocusChange.event;

	private readonly _docs = new Map<string, IDocState>();
	// Raw source text by `${docUri}::${source}`, cached during resolution so getSourcePeek (sync) can
	// build the comp's raw CSV grid for the in-surface source-peek pane.
	private readonly _rawSourceCache = new Map<string, string>();
	private _pending: IProposedChange[] = [];
	private readonly _lockStore: ILockStore;
	// The orchestration engine: agent registry + dependency-graph event-bus (+ triggers/policy/verify).
	private readonly _orchestrator: AgentOrchestrator;
	// Correlated source watchers, one store per loaded document. Disposed/recreated on reload, and
	// all torn down when the service is disposed.
	private readonly _watchers = new Map<string, IDisposable>();

	// Cached "is the model proxy reachable?" so the synchronous Skills report can show the right
	// Strategy state; refreshed on a short TTL and reused while a probe is in flight.
	private _modelAvailable = false;
	private _modelProbedAt = 0;
	private _modelProbe: Promise<boolean> | undefined;
	// The latest model-backed Strategy verdict per document, surfaced in the Skills rail after a Run.
	private readonly _strategyGrades = new Map<string, IGradeResult>();
	// The Chat conversation per document (the right-panel Chat tab) and the in-flight set for the
	// "working" indicator. Kept in the service so the rail survives re-renders and tab switches.
	private readonly _chats = new Map<string, IChatMessage[]>();
	private readonly _chatBusy = new Set<string>();
	// The chat's working set (plan 18): the documents one instruction fans out across, keyed by the
	// active document the chat belongs to (mirrors the per-document _chats keying). Empty by default,
	// so with no set added the chat stays single-doc (decision 61).
	private readonly _workingSets = new Map<string, IWorkingSetDoc[]>();
	// The figure diff from each document's last "Sync across", for the editor's synced banner.
	private readonly _lastSyncDiff = new Map<string, IFigureChange[]>();

	constructor(
		@IFileService private readonly _files: IFileService,
		@IEditorService private readonly _editors: IEditorService,
		@IViewsService private readonly _views: IViewsService,
		@IConfigurationService private readonly _config: IConfigurationService,
		@INotificationService private readonly _notify: INotificationService,
		@ILogService private readonly _log: ILogService,
		@IRequestService private readonly _request: IRequestService,
		@IWorkspaceContextService private readonly _workspace: IWorkspaceContextService,
		@IFileDialogService private readonly _fileDialog: IFileDialogService,
		@IHostService private readonly _host: IHostService,
	) {
		super();
		this._lockStore = new SidecarLockStore(this._files);
		const folder = this._workspace.getWorkspace().folders[0]?.uri ?? URI.file('/');
		this._orchestrator = this._register(new AgentOrchestrator(
			this._files, this._log, new WorkspaceAgentStore(this._files, folder), () => this._discoverLivingDocUris()));
		// Surface orchestration state changes (dirty queue, agent status) through the service event.
		this._register(this._orchestrator.onDidChange(() => this._onDidChange.fire()));
		this._orchestrator.setRunner((agent, context) => this._runAgent(agent, context));
		void this._orchestrator.ensureLoaded().then(() => this._orchestrator.start());
		this._register(toDisposable(() => {
			for (const w of this._watchers.values()) { w.dispose(); }
			this._watchers.clear();
		}));
		// Probe the model proxy once at startup so the Skills rail reflects model availability without
		// waiting for the first model call. Failures are swallowed (the no-model fallback stays intact).
		void this._probeModel();
	}

	/** The orchestration engine (agent registry, graph event-bus, triggers, policy, verify gate). */
	get orchestrator(): AgentOrchestrator { return this._orchestrator; }

	getAgents(): readonly IAgentDef[] { return this._orchestrator.getAgents(); }

	// --- per-document views ---

	getDoc(resource: URI): ILivingDoc | undefined { return this._docs.get(resource.toString())?.doc; }
	getRawText(resource: URI): string { return this._docs.get(resource.toString())?.rawText ?? ''; }
	getStatus(resource: URI): string { return this._docs.get(resource.toString())?.status ?? 'No document'; }
	getRecentlyApplied(resource: URI): ReadonlySet<string> { return this._docs.get(resource.toString())?.recent ?? new Set<string>(); }
	getResolved(resource: URI): ReadonlyMap<string, string> {
		// The lock is the source of truth for resolved values.
		const out = new Map<string, string>();
		const state = this._docs.get(resource.toString());
		if (state) { for (const key of Object.keys(state.lock.bindings)) { out.set(key, state.lock.bindings[key].resolved); } }
		return out;
	}
	getLock(resource: URI): ILivingDocLock | undefined { return this._docs.get(resource.toString())?.lock; }
	getFreshness(resource: URI): IFreshness {
		const state = this._docs.get(resource.toString());
		const staleBindings = state ? [...state.staleBindings] : [];
		const staleContext = state ? [...state.staleContext] : [];
		return { staleBindings, staleContext, dirty: staleBindings.length > 0 || staleContext.length > 0 };
	}
	getPendingForDoc(resource: URI): readonly IProposedChange[] {
		const id = resource.toString();
		return this._pending.filter(c => c.docId === id);
	}

	// Run the document's Skills as deterministic graders over its current state (spec 5). Financial =
	// every bound figure resolves to a source value; Formatting = headings follow title-case house
	// style; Strategy needs a model so it reports a needs-model state in the model-less build.
	getSkillReport(resource: URI): readonly ISkillCheck[] {
		const state = this._docs.get(resource.toString());
		if (!state || !state.doc.isLiving) { return []; }
		const resolved = this.getResolved(resource);

		const keys = new Set<string>();
		for (const block of state.doc.blocks) { for (const link of block.binds) { keys.add(link.key); } }
		const total = keys.size;
		const unresolved = [...keys].filter(k => !resolved.has(k));
		const financial: ISkillCheck = unresolved.length === 0
			? { id: 'financial', name: 'Financial agent', blurb: 'Validates figures in reports & quotes', status: 'pass', detail: `All ${total} linked figure${total === 1 ? '' : 's'} reconcile with sources.`, canRun: true }
			: { id: 'financial', name: 'Financial agent', blurb: 'Validates figures in reports & quotes', status: 'flag', detail: `${unresolved.length} of ${total} figures do not reconcile: ${unresolved.join(', ')}.`, canRun: true };

		const fixes = state.doc.blocks.filter(b => b.type === 'heading' && (b.level ?? 0) >= 2 && !LivingDocsService._isTitleCase(b.text)).length;
		const formatting: ISkillCheck = fixes === 0
			? { id: 'formatting', name: 'Formatting agent', blurb: 'Checks house style before export', status: 'pass', detail: 'All headings follow house style.', canRun: true }
			: { id: 'formatting', name: 'Formatting agent', blurb: 'Checks house style before export', status: 'flag', detail: `${fixes} heading-case fix${fixes === 1 ? '' : 'es'} suggested.`, canRun: true, fixable: true };

		// Strategy is model-backed: NO MODEL when the proxy is unreachable; otherwise READY until run,
		// then the cached PASS/FLAG verdict from runSkillCheck.
		const blurb = 'Tests claims against strategy & OKRs';
		const grade = this._strategyGrades.get(resource.toString());
		let strategy: ISkillCheck;
		if (!this._modelAvailable) {
			strategy = { id: 'strategy', name: 'Strategy agent', blurb, status: 'needs-model', detail: 'Connect a model to test claims against the decision stack.', canRun: false };
		} else if (!grade) {
			strategy = { id: 'strategy', name: 'Strategy agent', blurb, status: 'ready', detail: 'Run to test this document\'s claims against the decision stack.', canRun: true };
		} else if (grade.pass) {
			strategy = { id: 'strategy', name: 'Strategy agent', blurb, status: 'pass', detail: 'Claims are consistent with the decision stack.', canRun: true };
		} else {
			strategy = { id: 'strategy', name: 'Strategy agent', blurb, status: 'flag', detail: grade.flag ?? 'A claim conflicts with the decision stack.', canRun: true };
		}

		return [strategy, financial, formatting];
	}

	// Run a Skill on demand from the rail. The model-backed Strategy grader runs against the document's
	// claims + decision stack and caches its verdict; Financial/Formatting are deterministic and simply
	// recompute on the next render (the fired event triggers it).
	async runSkillCheck(resource: URI, id: ISkillCheck['id']): Promise<void> {
		if (id === 'strategy') {
			const state = this._docs.get(resource.toString());
			if (state) {
				const grade = await this._gradeStrategy(state, []);
				this._strategyGrades.set(resource.toString(), grade);
			}
		}
		this._onDidChange.fire();
	}

	// Apply a Skill's deterministic fix to the document (spec 5, the Apply-fix half of criterion 3).
	// Formatting title-cases every flagged heading in place, audits each, and persists once; the grader
	// then re-derives to PASS. A no-op for skills with no deterministic fix or nothing to fix.
	async applySkillFix(resource: URI, id: ISkillCheck['id']): Promise<void> {
		const state = this._docs.get(resource.toString());
		if (!state || !state.doc.isLiving) { return; }
		let fixed = 0;
		if (id === 'formatting') {
			for (const block of state.doc.blocks) {
				if (block.type !== 'heading' || (block.level ?? 0) < 2 || LivingDocsService._isTitleCase(block.text)) { continue; }
				const next = LivingDocsService._toTitleCase(block.text);
				if (next === block.text) { continue; }
				state.lock.audit.push(this._entry(block.id, 'approved', block.text, next, 'heuristic'));
				block.text = next;
				state.recent.add(block.id);
				fixed++;
			}
		}
		if (!fixed) { return; }
		state.status = `Formatting fix applied - ${fixed} heading${fixed === 1 ? '' : 's'} title-cased`;
		await this._persist(state);
		this._onDidChange.fire();
	}

	// House style: title-case headings. A heading passes when every significant word (the first word,
	// and any word that is not a minor word) is capitalized. Deterministic - no model.
	private static readonly _MINOR_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'of', 'to', 'by', 'in', 'on', 'at', 'as', 'is', 'with']);
	private static _isTitleCase(text: string): boolean {
		const words = text.trim().split(/\s+/);
		return words.every((word, i) => {
			const letters = word.replace(/[^A-Za-z].*$/, '');
			if (!letters) { return true; }
			if (i !== 0 && LivingDocsService._MINOR_WORDS.has(letters.toLowerCase())) { return true; }
			return letters[0] === letters[0].toUpperCase();
		});
	}

	// Rewrite a heading to house style: capitalize the first letter of every significant word, lower-case
	// minor words (except the first). Only the leading letter is touched, so acronyms (MRR, OKRs) survive.
	private static _toTitleCase(text: string): string {
		return text.trim().split(/\s+/).map((word, i) => {
			const letters = word.replace(/[^A-Za-z].*$/, '');
			if (i !== 0 && letters && LivingDocsService._MINOR_WORDS.has(letters.toLowerCase())) { return word.toLowerCase(); }
			return word.replace(/[A-Za-z]/, c => c.toUpperCase());
		}).join(' ');
	}

	// --- workspace-wide views ---

	getAllPending(): readonly IProposedChange[] { return this._pending; }
	getAudit(): readonly IAuditEntry[] {
		// The audit is folded into each document's lock; aggregate across the loaded documents.
		return [...this._docs.values()].flatMap(s => s.lock.audit);
	}

	focusPanel(tab: LivingDocsPanelTab): void {
		this._onDidRequestPanel.fire(tab);
		// Reveal the right panel; take focus only for Chat so the user can type straight away.
		this._views.openView(REVIEW_RAIL_VIEW_ID, tab === 'chat').catch(e => this._log.warn('[livingDocs] focusPanel failed', e));
	}

	focusChange(changeId: string): void {
		// Look up the change's document so the editor pane showing it can scroll to the right inline diff.
		// A stale id (already approved/rejected) is a no-op - nothing to focus.
		const change = this.getAllPending().find(c => c.id === changeId);
		if (change) {
			this._onDidRequestFocusChange.fire({ docId: change.docId, changeId });
		}
	}

	// --- the "Documents" home ---

	async listDocuments(): Promise<readonly ILivingDocSummary[]> {
		const found = new Map<string, URI>();
		// Always include documents already loaded (e.g. the open editor), even if discovery misses them.
		for (const state of this._docs.values()) {
			found.set(state.uri.toString(), state.uri);
		}
		// Scan each workspace folder for every Markdown document so the home reflects the real folder
		// (the folder IS the project); living vs plain is carried per-summary for the badge.
		for (const folder of this._workspace.getWorkspace().folders) {
			await this._collectDocs(folder.uri, found, 0);
		}
		const summaries: ILivingDocSummary[] = [];
		for (const uri of found.values()) {
			const summary = await this._summarize(uri);
			if (summary) { summaries.push(summary); }
		}
		summaries.sort((a, b) => a.title.localeCompare(b.title));
		return summaries;
	}

	getWorkspaceFolderName(): string | undefined {
		return this._workspace.getWorkspace().folders[0]?.name;
	}

	// The data files (csv/json) sitting alongside the document that are not already bound and are not lock
	// sidecars - the choices the Add-source picker offers (sources are scoped to the folder; decision #40).
	async getSourceCandidates(resource: URI): Promise<readonly string[]> {
		const state = this._docs.get(resource.toString());
		if (!state) { return []; }
		const bound = new Set(state.doc.sources);
		let children;
		try {
			children = (await this._files.resolve(dirname(resource))).children ?? [];
		} catch {
			return [];
		}
		return children
			.filter(c => !c.isDirectory)
			.map(c => basename(c.resource))
			// Exclude system json (lock sidecars + the agents registry) - they are not user data sources.
			.filter(name => /\.(csv|json)$/i.test(name) && !/\.lock\.json$/i.test(name) && name !== 'agents.json' && !bound.has(name))
			.sort((a, b) => a.localeCompare(b));
	}

	async addSource(resource: URI, source: string): Promise<void> {
		await this._rewriteSources(resource, source, true);
	}

	async removeSource(resource: URI, source: string): Promise<void> {
		await this._rewriteSources(resource, source, false);
	}

	// The real folder documents not already referenced (context) or bound (sources) - the Add-context-file
	// picker's choices (referencing a real file in the project; R6).
	async getContextCandidates(resource: URI): Promise<readonly string[]> {
		const state = this._docs.get(resource.toString());
		if (!state) { return []; }
		const taken = new Set([...state.doc.sources, ...state.doc.context]);
		return state.folderFiles.filter(name => !taken.has(name));
	}

	async addContextFile(resource: URI, file: string): Promise<void> {
		await this._rewriteList(resource, 'context', file, true);
	}

	async removeContextFile(resource: URI, file: string): Promise<void> {
		await this._rewriteList(resource, 'context', file, false);
	}

	// The md/csv/json siblings of a document, excluding itself, lock/agents system files and generated views.
	private async _scanFolderDocs(uri: URI): Promise<string[]> {
		let children;
		try {
			children = (await this._files.resolve(dirname(uri))).children ?? [];
		} catch {
			return [];
		}
		const self = basename(uri);
		return children
			.filter(c => !c.isDirectory)
			.map(c => basename(c.resource))
			.filter(name => /\.(md|csv|json|txt)$/i.test(name) && !/\.lock\.json$/i.test(name) && name !== 'agents.json' && !/\.(export|source)\.md$/i.test(name) && name !== self)
			.sort((a, b) => a.localeCompare(b));
	}

	// Add/remove a source by rewriting only the frontmatter `sources:` list; saveRawText persists, reparses,
	// and re-resolves (so the binding is live and source-peek shows the grid) and fires the change event.
	private async _rewriteSources(resource: URI, source: string, add: boolean): Promise<void> {
		await this._rewriteList(resource, 'sources', source, add);
	}

	// Add/remove a value in a frontmatter list (sources or context) by rewriting only the frontmatter;
	// saveRawText persists, reparses, and re-resolves (live binding + source-peek) and fires the change.
	private async _rewriteList(resource: URI, key: 'sources' | 'context', value: string, add: boolean): Promise<void> {
		const raw = this.getRawText(resource);
		if (!raw) { return; }
		const next = withFrontmatterList(raw, key, value, add);
		if (next === raw) { return; }
		await this.saveRawText(resource, next);
	}

	// The on-ramp: prompt for a local folder and open it as the workspace. `showOpenDialog` uses the
	// browser File System Access picker on web (real-disk, via the html file-system provider) and the
	// native dialog on desktop; `openWindow` reloads the workbench with the picked folder as the workspace.
	async openFolder(): Promise<void> {
		const picked = await this._fileDialog.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, title: 'Open Folder' });
		if (picked && picked.length) {
			await this._host.openWindow([{ folderUri: picked[0] }], { forceReuseWindow: true });
		}
	}

	async createDocument(): Promise<URI | undefined> {
		const folder = this._workspace.getWorkspace().folders[0];
		if (!folder) {
			this._notify.info('Open a folder to create a document.');
			return undefined;
		}
		const target = await this._uniqueDocUri(folder.uri);
		try {
			await this._files.writeFile(target, VSBuffer.fromString(NEW_DOCUMENT_TEMPLATE));
			await this._editors.openEditor({ resource: target, options: { pinned: true } });
			this._onDidChange.fire();
			return target;
		} catch (e) {
			this._log.warn('[livingDocs] create document failed', e);
			return undefined;
		}
	}

	// Recursively collect every Markdown document under a folder (the folder is the project), skipping
	// hidden and dependency directories. Bounded in depth so a large workspace can never make the home hang.
	private async _collectDocs(dir: URI, found: Map<string, URI>, depth: number): Promise<void> {
		if (depth > 4) { return; }
		let children;
		try {
			children = (await this._files.resolve(dir)).children ?? [];
		} catch (e) {
			this._log.trace('[livingDocs] documents scan skipped', e instanceof Error ? e.message : String(e));
			return;
		}
		for (const child of children) {
			const name = basename(child.resource);
			if (child.isDirectory) {
				if (name.startsWith('.') || name === 'node_modules' || name === 'out') { continue; }
				await this._collectDocs(child.resource, found, depth + 1);
			} else if (this._isDocFile(child.resource)) {
				found.set(child.resource.toString(), child.resource);
			}
		}
	}

	// A document is any `.md` file; generated `.export.md` / `.source.md` views are skipped. Whether it is
	// "living" (declares sources/context or carries bind links) is resolved per-summary for the badge.
	private _isDocFile(resource: URI): boolean {
		const path = resource.path;
		return path.endsWith('.md') && !path.endsWith('.export.md') && !path.endsWith('.source.md');
	}

	// A `.md` is a Living Document when its content declares sources/context or carries bind links.
	// Generated `.export.md` / `.source.md` views are skipped.
	private async _isLivingDocFile(resource: URI): Promise<boolean> {
		const path = resource.path;
		if (!path.endsWith('.md') || path.endsWith('.export.md') || path.endsWith('.source.md')) { return false; }
		try {
			const text = (await this._files.readFile(resource)).value.toString();
			return parseLivingDoc(text).isLiving;
		} catch {
			return false;
		}
	}

	private async _summarize(uri: URI): Promise<ILivingDocSummary | undefined> {
		try {
			const raw = (await this._files.readFile(uri)).value.toString();
			const doc = parseLivingDoc(raw);
			const kinds = new Set<SourceKind>();
			for (const source of doc.sources) { kinds.add(sourceKind(source)); }
			const id = uri.toString();
			const bound = doc.blocks.reduce((n, b) => n + b.binds.length, 0);
			return {
				resource: uri,
				title: doc.title,
				isLiving: doc.isLiving,
				sourceKinds: [...kinds],
				sources: doc.sources,
				lastSynced: doc.context.length ? `${doc.context.length} context` : (bound ? `${bound} bound` : ''),
				pendingCount: this._pending.filter(c => c.docId === id).length,
			};
		} catch (e) {
			this._log.trace('[livingDocs] summarize skipped', e instanceof Error ? e.message : String(e));
			return undefined;
		}
	}

	private async _uniqueDocUri(folder: URI): Promise<URI> {
		const existing = new Set<string>();
		try {
			for (const child of (await this._files.resolve(folder)).children ?? []) {
				existing.add(basename(child.resource));
			}
		} catch {
			// An unreadable folder just means no collisions to avoid.
		}
		let name = 'Untitled.md';
		for (let n = 2; existing.has(name); n++) {
			name = `Untitled ${n}.md`;
		}
		return joinPath(folder, name);
	}

	// --- loading ---

	async loadDocument(resource: URI): Promise<void> {
		const state = await this._loadState(resource);
		if (state) {
			// First open with no lock yet: bootstrap it from the sources (the initial sync). Otherwise
			// the lock is authoritative - load is read-only and the cache reconciles to it at render.
			await this._bootstrapLock(state);
			state.recent = new Set<string>();
			// On-open freshness hook (spec 7): hash the sources now so the Context panel's flag is current
			// without a manual refresh, then watch them for later changes.
			await this._recomputeFreshness(state);
			this._watchSources(state);
		}
		this._onDidChange.fire();
	}

	private async _loadState(resource: URI): Promise<IDocState | undefined> {
		let rawText: string;
		let doc: ILivingDoc;
		try {
			rawText = (await this._files.readFile(resource)).value.toString();
			doc = parseLivingDoc(rawText);
		} catch (e) {
			this._log.error('[livingDocs] failed to parse document', e);
			this._docs.delete(resource.toString());
			return undefined;
		}
		const lock = (await this._lockStore.read(resource)) ?? emptyLock();
		const state: IDocState = {
			uri: resource,
			doc,
			rawText,
			lock,
			recent: this._docs.get(resource.toString())?.recent ?? new Set<string>(),
			staleBindings: new Set<string>(),
			staleContext: new Set<string>(),
			status: doc.isLiving ? 'All sources synced' : 'Markdown',
			folderFiles: [],
		};
		this._docs.set(resource.toString(), state);
		state.folderFiles = await this._scanFolderDocs(resource);
		if (doc.isLiving) { await this._resolveSubtitle(state); }
		return state;
	}

	// When a doc carries bind keys with no lock entry yet (a brand-new or never-synced doc), resolve
	// them once from the sources and write the initial lock. Existing lock entries are left untouched
	// so the lock stays the source of truth across opens.
	private async _bootstrapLock(state: IDocState): Promise<void> {
		const keys = new Set<string>();
		for (const block of state.doc.blocks) { for (const b of block.binds) { keys.add(b.key); } }
		const missingBinding = [...keys].some(key => !Object.prototype.hasOwnProperty.call(state.lock.bindings, key));
		const missingContext = state.doc.context.some(file => !Object.prototype.hasOwnProperty.call(state.lock.context, file));
		if (!missingBinding && !missingContext) { return; }

		const resolution = await this._resolveCurrent(state);
		let changed = false;
		for (const key of keys) {
			if (Object.prototype.hasOwnProperty.call(state.lock.bindings, key)) { continue; }
			const r = resolution.get(key);
			if (!r) { continue; }
			state.lock.bindings[key] = this._bindingEntry(r);
			changed = true;
		}
		// Seed each context source as reviewed-at-current so it reads as current until it next changes.
		for (const file of state.doc.context) {
			if (Object.prototype.hasOwnProperty.call(state.lock.context, file)) { continue; }
			state.lock.context[file] = { reviewedHash: await this._hashContext(state, file), reviewedAt: new Date().toISOString(), scope: 'document' };
			changed = true;
		}
		if (changed) {
			try {
				await this._lockStore.write(state.uri, state.lock);
			} catch (e) {
				this._log.warn('[livingDocs] lock bootstrap write failed', e);
			}
		}
	}

	// --- staleness detection (cheap, always-on): the dirty bit (spec 3.4) ---

	async checkSources(resource: URI): Promise<void> {
		const state = this._docs.get(resource.toString());
		if (!state) { return; }
		await this._recomputeFreshness(state);
		this._onDidChange.fire();
	}

	// Re-hash every source and flip the dirty bits. Value bindings compare the source value's hash to
	// the lock's; context sources compare to the lock's reviewedHash. No prose is touched, no model is
	// called - this is the always-on layer.
	private async _recomputeFreshness(state: IDocState): Promise<void> {
		const staleBindings = new Set<string>();
		const staleContext = new Set<string>();
		if (state.doc.isLiving) {
			const resolution = await this._resolveCurrent(state);
			for (const key of Object.keys(state.lock.bindings)) {
				const cur = resolution.get(key);
				if (cur && cur.sourceHash !== state.lock.bindings[key].sourceHash) { staleBindings.add(key); }
			}
			for (const file of state.doc.context) {
				const entry = state.lock.context[file];
				const hash = await this._hashContext(state, file);
				if (!entry || entry.reviewedHash !== hash) { staleContext.add(file); }
			}
		}
		state.staleBindings = staleBindings;
		state.staleContext = staleContext;
		if (state.doc.isLiving) {
			state.status = (staleBindings.size || staleContext.size) ? 'Sources changed - may be affected' : 'All sources synced';
		}
	}

	private async _hashContext(state: IDocState, file: string): Promise<string> {
		if (sourceKind(file) === 'api') { return ''; }
		try {
			const text = (await this._files.readFile(joinPath(dirname(state.uri), file))).value.toString();
			return hashString(text);
		} catch (e) {
			this._log.trace('[livingDocs] context unreadable', file, e instanceof Error ? e.message : String(e));
			return '';
		}
	}

	// Watch each file source + context source with a correlated watcher so a source change flips the
	// dirty bit on its own (the always-on layer). Recreated per load; best-effort (no-op where the
	// platform has no watcher, e.g. unit tests).
	private _watchSources(state: IDocState): void {
		const id = state.uri.toString();
		this._watchers.get(id)?.dispose();
		this._watchers.delete(id);
		if (typeof this._files.createWatcher !== 'function') { return; }
		const store = new DisposableStore();
		const targets: URI[] = [];
		for (const source of state.doc.sources) {
			if (sourceKind(source) === 'file') { targets.push(joinPath(dirname(state.uri), source)); }
		}
		for (const file of state.doc.context) {
			if (sourceKind(file) === 'file') { targets.push(joinPath(dirname(state.uri), file)); }
		}
		for (const target of targets) {
			try {
				const watcher = store.add(this._files.createWatcher(target, { recursive: false, excludes: [] }));
				const sourcePath = target.path;
				store.add(watcher.onDidChange(() => {
					// Per-document freshness recompute + the workspace-wide graph propagation / event agents.
					void this.checkSources(state.uri);
					void this._orchestrator.onSourceChanged(sourcePath);
				}));
			} catch (e) {
				this._log.trace('[livingDocs] watch failed', e instanceof Error ? e.message : String(e));
			}
		}
		this._watchers.set(id, store);
	}

	private _bindingEntry(r: IResolution): IBindingEntry {
		return { resolved: r.value, source: r.source, sourceHash: r.sourceHash, syncedAt: new Date().toISOString(), appliedBy: 'agent', kind: 'figure' };
	}

	// Read every `sources:` file and build the bind-key -> freshly-resolved value map. A CSV produces
	// the latest row's columns (plus `.prev` / `.delta` qualifiers); an api/JSON source produces its
	// top-level fields. Influence (`context:`) sources are not value-resolved here (see Item 5).
	private async _resolveCurrent(state: IDocState): Promise<Map<string, IResolution>> {
		const resolved = new Map<string, IResolution>();
		for (const source of state.doc.sources) {
			const alias = sourceAlias(source);
			if (sourceKind(source) === 'api') {
				await this._resolveApiSource(source, alias, resolved);
				continue;
			}
			const uri = joinPath(dirname(state.uri), source);
			let text: string;
			try {
				text = (await this._files.readFile(uri)).value.toString();
			} catch (e) {
				this._log.warn('[livingDocs] source unreadable', source, e instanceof Error ? e.message : String(e));
				continue;
			}
			// Cache the raw source text so the in-surface source-peek pane can show the comp's actual
			// CSV grid (built synchronously in getSourcePeek, which runs during a webview render).
			this._rawSourceCache.set(`${state.uri.toString()}::${source}`, text);
			if (source.endsWith('.csv')) {
				this._resolveCsv(text, source, alias, resolved);
			}
		}
		return resolved;
	}

	// The doc subtitle tracks the resolved period: when it reads "Week N", N is refreshed from the
	// primary source's latest `week` value, so a sync that advances the source advances the subtitle too.
	private async _resolveSubtitle(state: IDocState): Promise<void> {
		const m = /^Week\s+(\d+)(.*)$/i.exec(state.doc.subtitle);
		if (!m || !state.doc.sources.length) { return; }
		let week: string | undefined;
		try {
			const resolution = await this._resolveCurrent(state);
			for (const [key, r] of resolution) {
				if (/(^|\.)week$/.test(key)) { week = r.value.trim(); break; }
			}
		} catch {
			return;
		}
		if (week && /^\d+$/.test(week) && week !== m[1]) {
			state.doc.subtitle = `Week ${week}${m[2]}`;
		}
	}

	private _resolveCsv(text: string, source: string, alias: string, resolved: Map<string, IResolution>): void {
		const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
		if (lines.length < 2) { return; }
		const cols = lines[0].split(',').map(c => c.trim());
		const rows = lines.slice(1).map(l => l.split(','));
		const latest = rows[rows.length - 1];
		const prev = rows.length >= 2 ? rows[rows.length - 2] : undefined;
		const hash = hashString(lines[lines.length - 1]);
		for (let i = 0; i < cols.length; i++) {
			const col = cols[i];
			const cur = (latest[i] ?? '').trim();
			resolved.set(`${alias}.${col}`, { value: this._formatCell(col, cur), sourceHash: hash, source: `${source}#${col}` });
			if (prev) {
				const pv = (prev[i] ?? '').trim();
				resolved.set(`${alias}.${col}.prev`, { value: this._formatCell(col, pv), sourceHash: hash, source: `${source}#${col}` });
				const delta = this._deltaCell(col, pv, cur);
				if (delta) { resolved.set(`${alias}.${col}.delta`, { value: delta, sourceHash: hash, source: `${source}#${col}` }); }
			}
		}
	}

	// Spike-specific presentation for the sample metrics schema: currency in $k, churn as a percent,
	// everything else as-is. A real build would carry formatting hints in the source connector.
	private _formatCell(col: string, value: string): string {
		const n = Number(value);
		if (col === 'mrr' && !isNaN(n)) { return `$${k(n)}`; }
		if (col === 'churn' && !isNaN(n)) { return `${value}%`; }
		return value;
	}

	private _deltaCell(col: string, prev: string, cur: string): string | undefined {
		const a = Number(prev), b = Number(cur);
		if (isNaN(a) || isNaN(b)) { return undefined; }
		if (col === 'churn') { return `${b >= a ? '+' : ''}${(b - a).toFixed(1)}pt`; }
		if (col === 'mrr' || col === 'signups' || col === 'active') { return pct(a, b); }
		return undefined;
	}

	private async _resolveApiSource(url: string, alias: string, resolved: Map<string, IResolution>): Promise<void> {
		try {
			const context = await this._request.request({ type: 'GET', url, callSite: 'livingDocs.apiSource' }, CancellationToken.None);
			const json = await asJson<Record<string, unknown>>(context);
			if (!json) { return; }
			const hash = hashString(JSON.stringify(json));
			for (const key of Object.keys(json)) {
				const value = json[key];
				const text = typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
				resolved.set(`${alias}.${key}`, { value: text, sourceHash: hash, source: `${url}#${key}` });
			}
		} catch (e) {
			this._log.warn('[livingDocs] api source failed', e instanceof Error ? e.message : String(e));
		}
	}

	// Resolve the current source values into the lock (update each binding's resolved/sourceHash/
	// syncedAt). No prose is touched.
	private async _resolveIntoLock(state: IDocState): Promise<void> {
		const resolution = await this._resolveCurrent(state);
		for (const [key, r] of resolution) {
			state.lock.bindings[key] = this._bindingEntry(r);
		}
	}

	// The figure changes a re-sync would make: each bound block whose visible cache no longer matches the
	// lock's resolved values. Computed without mutating the document, so the policy router can apply,
	// queue, or draft them.
	private _figureReconciles(state: IDocState): { blockId: string; oldText: string; newText: string }[] {
		const resolved = this.getResolved(state.uri);
		const changes: { blockId: string; oldText: string; newText: string }[] = [];
		for (const block of state.doc.blocks) {
			if (block.binds.length === 0) { continue; }
			const next = reconcileBindLinks(block.text, resolved);
			if (next !== block.text) { changes.push({ blockId: block.id, oldText: block.text, newText: next }); }
		}
		return changes;
	}

	private _applyFigure(state: IDocState, change: { blockId: string; oldText: string; newText: string }): void {
		const block = state.doc.blocks.find(b => b.id === change.blockId);
		if (!block) { return; }
		state.lock.audit.push(this._entry(block.id, 'auto-applied', change.oldText, change.newText, 'heuristic'));
		block.text = change.newText;
		block.binds = extractBindLinks(change.newText);
		state.recent.add(block.id);
	}

	// Re-sync the lock from the current sources and auto-apply every figure (the manual "Refresh from
	// sources" path; figures are deterministic and low-risk). Caller persists.
	private async _syncLock(state: IDocState): Promise<void> {
		await this._resolveIntoLock(state);
		for (const change of this._figureReconciles(state)) { this._applyFigure(state, change); }
	}

	// The verify gate (spec 5, maker != checker): run the document's Skills as graders before apply.
	// Deterministic Financial runs first and cheap (figures must reconcile to the lock/source); Strategy
	// (claims vs the Knowledge decision stack) and Formatting (house style) may use a model - in the
	// no-model spike they pass. A failed grader stops the run before anything lands.
	private async _verifyGate(state: IDocState, changes: { blockId: string; oldText: string; newText: string }[]): Promise<IGradeResult> {
		const financial = this._gradeFinancial(state, changes);
		if (!financial.pass) { return financial; }
		const strategy = await this._gradeStrategy(state, changes);
		if (!strategy.pass) { return strategy; }
		return this._gradeFormatting(state, changes);
	}

	// Deterministic: every bound value in the text must reconcile to a resolved lock/source value. A
	// missing source value (unresolved key) fails the gate; a merely-stale cache does not (that is
	// staleness, reconciled at render). The reconciled text always carries the lock value, so this is
	// the meaningful check on both the run path and the before-export gate.
	private _gradeFinancial(state: IDocState, changes: { blockId: string; oldText: string; newText: string }[]): IGradeResult {
		for (const change of changes) {
			for (const link of extractBindLinks(change.newText)) {
				if (!state.lock.bindings[link.key]) {
					return { pass: false, flag: `Financial: "${link.key}" has no source value - it does not reconcile.` };
				}
			}
		}
		return { pass: true };
	}

	// Model-backed strategy grader (spec 5, maker != checker): do the claims being asserted contradict
	// the document's Knowledge/decision-stack context (its `context` sources)? Returns the honest pass
	// when no model is reachable, on error, or on a refusal, so the verify gate never blocks on the
	// proxy being down. With changes, it grades those; without, the document's current prose claims.
	private async _gradeStrategy(state: IDocState, changes: { blockId: string; newText?: string }[]): Promise<IGradeResult> {
		if (!await this._hasModel()) { return { pass: true }; }
		const claims = changes.length
			? changes.map(c => (c.newText ?? '').trim()).filter(t => t.length > 0)
			: this._strategyClaims(state);
		const decisionStack = (await this._readContext(state, state.doc.context)).trim();
		if (!claims.length || !decisionStack) { return { pass: true }; }
		try {
			const system = 'You are a strategy reviewer. Decide whether any of the document\'s claims contradict or are clearly unsupported by the decision stack (the team\'s strategy, OKRs, and market context). '
				+ 'Reply with ONLY a JSON object: {"pass": boolean, "flag": string}. Set pass=false ONLY for a clear contradiction, with a one-sentence reason starting with "Strategy: " in flag. When in doubt, pass.';
			const user = `Decision stack:\n"""${decisionStack}"""\n\nClaims:\n${claims.map(c => `- ${c}`).join('\n')}`;
			const text = await this._callModel(system, user);
			const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { pass?: boolean; flag?: string };
			if (json.pass === false) {
				const flag = (typeof json.flag === 'string' && json.flag.trim()) ? json.flag.trim() : 'Strategy: a claim conflicts with the decision stack.';
				return { pass: false, flag };
			}
			return { pass: true };
		} catch (e) {
			this._log.info('[livingDocs] strategy grade failed, passing', e instanceof Error ? e.message : String(e));
			return { pass: true };
		}
	}

	// The prose claims the Strategy grader checks: the document's non-empty paragraph text.
	private _strategyClaims(state: IDocState): string[] {
		return state.doc.blocks.filter(b => b.type === 'paragraph' && b.text.trim().length > 0).map(b => b.text.trim());
	}

	private _gradeFormatting(_state: IDocState, _changes: { blockId: string }[]): IGradeResult {
		return { pass: true };
	}

	// Route a document's figure changes by the agent's policy (spec 4.2), after the verify gate. The
	// gate runs between rewrite and apply: a failed grader blocks the whole run (nothing applied or
	// queued) and surfaces the flag (spec 5). auto-figures applies silently (audited); ask-before-apply
	// queues a pending change; draft-only queues a draft and never lands.
	private async _runFiguresByPolicy(state: IDocState, policy: AgentPolicy): Promise<{ applied: number; queued: number; blocked?: string }> {
		await this._resolveIntoLock(state);
		const changes = this._figureReconciles(state);
		if (changes.length) {
			const gate = await this._verifyGate(state, changes);
			if (!gate.pass) {
				state.status = `Blocked at the verify gate - ${gate.flag}`;
				this._notify.info(gate.flag ?? 'Blocked at the verify gate.');
				return { applied: 0, queued: 0, blocked: gate.flag };
			}
		}
		let applied = 0;
		let queued = 0;
		for (const change of changes) {
			if (policy === 'auto-figures') {
				this._applyFigure(state, change);
				applied++;
				continue;
			}
			// ask-before-apply / draft-only: queue for the rail without touching the doc.
			const block = state.doc.blocks.find(b => b.id === change.blockId);
			this._pending = this._pending.filter(c => !(c.docId === state.uri.toString() && c.blockId === change.blockId));
			this._pending.push({
				id: generateUuid(),
				docId: state.uri.toString(),
				docTitle: state.doc.title,
				blockId: change.blockId,
				blockLabel: block ? this._blockLabel(state.doc, change.blockId) : change.blockId,
				oldText: change.oldText,
				newText: change.newText,
				kind: 'figure',
				confidence: 1,
				rationale: 'Source value changed; figure update prepared.',
				sourceCells: block ? block.binds.map(b => b.key) : [],
				via: 'heuristic',
				draft: policy === 'draft-only',
			});
			queued++;
		}
		return { applied, queued };
	}

	async saveRawText(resource: URI, text: string, options?: { readonly silent?: boolean }): Promise<void> {
		const id = resource.toString();
		const doc = parseLivingDoc(text);
		const lock = this._docs.get(id)?.lock ?? (await this._lockStore.read(resource)) ?? emptyLock();
		const state: IDocState = {
			uri: resource,
			doc,
			rawText: text,
			lock,
			recent: new Set<string>(),
			staleBindings: new Set<string>(),
			staleContext: new Set<string>(),
			status: doc.isLiving ? 'All sources synced' : 'Markdown',
			folderFiles: this._docs.get(id)?.folderFiles ?? [],
		};
		try {
			await this._files.writeFile(resource, VSBuffer.fromString(text));
		} catch (e) {
			this._log.warn('[livingDocs] raw save failed', e);
		}
		this._docs.set(id, state);
		await this._bootstrapLock(state);
		await this._recomputeFreshness(state);
		this._watchSources(state);
		// Silent saves (live ProseMirror typing) persist to disk + refresh state but do NOT fire the
		// change event, so the editor does not re-render the webview and remount the editor mid-keystroke.
		if (!options?.silent) {
			this._onDidChange.fire();
		}
	}

	// --- document-lifecycle hooks (spec 3, 7) ---

	// The before-export gate: the whole document's figures must reconcile (Financial) before it can
	// leave the system. Returns the flag when export should be blocked.
	private _beforeExportGate(state: IDocState): IGradeResult {
		const current = state.doc.blocks
			.filter(b => b.binds.length > 0)
			.map(b => ({ blockId: b.id, oldText: b.text, newText: b.text }));
		return this._gradeFinancial(state, current);
	}

	// On-publish snapshot: pin the document to the current source versions (hashes) so a published doc
	// stays reproducible even as sources move on (spec 7; uses the pins[] field reserved in plan 06).
	async publishDocument(resource: URI): Promise<void> {
		const state = this._docs.get(resource.toString());
		if (!state) { return; }
		const gate = this._beforeExportGate(state);
		if (!gate.pass) {
			this._notify.info(`Cannot publish - ${gate.flag}`);
			return;
		}
		const versions = new Map<string, string>();
		for (const key of Object.keys(state.lock.bindings)) {
			const binding = state.lock.bindings[key];
			const source = binding.source.split('#')[0];
			versions.set(source, binding.sourceHash);
		}
		const at = new Date().toISOString();
		state.lock.pins = [...versions].map(([source, version]) => ({ source, version }));
		state.lock.audit.push(this._entry(state.doc.blocks[0]?.id ?? '', 'auto-applied', '', `published ${at}`, 'heuristic'));
		await this._lockStore.write(state.uri, state.lock);
		this._notify.info(`Published "${state.doc.title}" - pinned to ${state.lock.pins.length} source version${state.lock.pins.length === 1 ? '' : 's'}.`);
		this._onDidChange.fire();
	}

	async exportDocument(resource: URI): Promise<URI | undefined> {
		const state = this._docs.get(resource.toString());
		if (!state) { return undefined; }
		const gate = this._beforeExportGate(state);
		if (!gate.pass) {
			this._notify.info(`Export blocked - ${gate.flag}`);
			return undefined;
		}
		const html = renderExportHtml(state.doc, this.getResolved(resource));
		const stem = basename(resource).replace(/\.md$/, '');
		const target = joinPath(dirname(resource), `${stem}.export.html`);
		try {
			await this._files.writeFile(target, VSBuffer.fromString(html));
			await this._editors.openEditor({ resource: target, options: { pinned: true } }, SIDE_GROUP);
			this._notify.info(`Exported "${state.doc.title}" to ${basename(target)}.`);
			return target;
		} catch (e) {
			this._log.warn('[livingDocs] export failed', e);
			return undefined;
		}
	}

	async exportMarkdown(resource: URI): Promise<URI | undefined> {
		const state = this._docs.get(resource.toString());
		if (!state) { return undefined; }
		const gate = this._beforeExportGate(state);
		if (!gate.pass) {
			this._notify.info(`Export blocked - ${gate.flag}`);
			return undefined;
		}
		const markdown = renderExportMarkdown(state.doc, this.getResolved(resource));
		const stem = basename(resource).replace(/\.md$/, '');
		const target = joinPath(dirname(resource), `${stem}.export.md`);
		try {
			await this._files.writeFile(target, VSBuffer.fromString(markdown));
			await this._editors.openEditor({ resource: target, options: { pinned: true } }, SIDE_GROUP);
			this._notify.info(`Exported "${state.doc.title}" to ${basename(target)}.`);
			return target;
		} catch (e) {
			this._log.warn('[livingDocs] markdown export failed', e);
			return undefined;
		}
	}

	shareDocument(resource: URI): void {
		// Live shareable links aren't built yet; point the user at the portable export for now.
		this._notify.info('A live shareable link is coming soon. Use Download to send a Markdown copy in the meantime.');
	}

	async editBlock(resource: URI, blockId: string, text: string): Promise<void> {
		const state = this._docs.get(resource.toString());
		if (!state) { return; }
		const block = state.doc.blocks.find(b => b.id === blockId);
		// Only non-bound prose/headings are hand-editable; bound blocks stay driven by their source.
		if (!block || block.binds.length > 0) { return; }
		const next = text.trim();
		if (block.text === next) { return; }
		block.text = next;
		await this._persist(state);
		this._onDidChange.fire();
	}

	// --- the fan-out refresh ---

	async refreshFromSources(): Promise<void> {
		// Re-derive every bound document in the workspace, not just the open one.
		const uris = await this._discoverLivingDocUris();
		let derived = 0;
		for (const uri of uris) {
			let state = this._docs.get(uri.toString());
			if (!state) { state = await this._loadState(uri); }
			if (!state || !state.doc.isLiving) { continue; }
			await this._syncLockWithDiff(state);
			await this._persist(state);
			// The value bindings are now in sync, so their dirty bits clear (context stays stale until
			// a Review-impact pass, Item 5).
			await this._recomputeFreshness(state);
			derived++;
		}

		for (const state of this._docs.values()) {
			if (state.doc.isLiving) { state.status = `${derived} document${derived === 1 ? '' : 's'} synced`; }
		}
		this._onDidChange.fire();
	}

	// "Run now": run an agent over its flow documents (or the whole workspace if it scopes none).
	async runAgent(agentId: string): Promise<IAgentRun | undefined> {
		await this._orchestrator.ensureLoaded();
		const agent = this._orchestrator.getAgent(agentId);
		if (!agent) { return undefined; }
		const docs = agent.flow.docs.length ? agent.flow.docs.map(d => URI.parse(d)) : await this._discoverLivingDocUris();
		return this._orchestrator.runAgent(agentId, 'manual', docs);
	}

	// The orchestration host: how an agent does its work once a trigger fires. Event agents only flag
	// along the graph (propagation already ran); lifecycle hooks fire from the document lifecycle
	// (Item 5). Everything else re-derives each in-scope document and routes its figure changes through
	// the verify gate then the per-edge policy (auto-apply / queue / draft). Reports what landed/queued.
	private async _runAgent(agent: IAgentDef, context: IAgentRunContext): Promise<IAgentRunResult> {
		if (agent.trigger.kind === 'event' || agent.trigger.kind === 'lifecycle') { return { applied: 0, queued: 0 }; }
		let applied = 0;
		let queued = 0;
		let blocked: string | undefined;
		for (const uri of context.docs) {
			const state = this._docs.get(uri.toString()) ?? await this._loadState(uri);
			if (!state || !state.doc.isLiving) { continue; }
			state.recent = new Set<string>();
			const result = await this._runFiguresByPolicy(state, agent.policy);
			applied += result.applied;
			queued += result.queued;
			if (result.blocked) { blocked = result.blocked; }
			if (result.applied) { await this._persist(state); } else { await this._lockStore.write(state.uri, state.lock).catch(e => this._log.warn('[livingDocs] lock write failed', e)); }
			await this._recomputeFreshness(state);
			// The heartbeat drains each doc it processed from the dirty queue.
			if (agent.trigger.kind === 'heartbeat') { this._orchestrator.clearDirty(uri); }
		}
		this._onDidChange.fire();
		return { applied, queued, blocked };
	}

	// --- the Review-impact pass (expensive, on-demand): spec 3.6 ---

	// Above this similarity a claim's anchor is taken to still point at the right prose; below it the
	// pass fails loudly with a re-link prompt rather than re-attaching to the wrong sentence.
	private static readonly _CLAIM_CONFIDENT = 0.5;

	async reviewImpact(resource: URI): Promise<void> {
		const id = resource.toString();
		const state = this._docs.get(id);
		if (!state || !state.doc.isLiving) { return; }

		// Review the changed context sources (or all of them if nothing is flagged dirty yet).
		const freshness = this.getFreshness(resource);
		const contextFiles = freshness.staleContext.length ? [...freshness.staleContext] : [...state.doc.context];
		const diff = await this._readContext(state, contextFiles);
		const modelAvailable = await this._hasModel();

		// Re-running the pass replaces this document's earlier impact candidates so it stays idempotent.
		this._pending = this._pending.filter(c => c.docId !== id);

		for (const target of this._claimTargets(state)) {
			if (target.relink) {
				// Guardrail 2: a low-confidence anchor match fails loudly - ask to re-link, never re-attach.
				this._pending.push(this._relinkPrompt(state, target, contextFiles));
				this._notify.info(`This commentary is bound to ${contextFiles.join(', ') || 'a source'} - re-link?`);
				continue;
			}
			const block = state.doc.blocks.find(b => b.id === target.blockId);
			if (!block) { continue; }
			const proposal = await this._proposeImpact(diff, contextFiles, block.text, modelAvailable);
			if (proposal.newText === block.text) { continue; }
			const change: IProposedChange = {
				id: generateUuid(),
				docId: id,
				docTitle: state.doc.title,
				blockId: block.id,
				blockLabel: this._blockLabel(state.doc, block.id),
				oldText: block.text,
				newText: proposal.newText,
				kind: proposal.kind,
				confidence: proposal.confidence,
				rationale: proposal.rationale,
				sourceCells: [],
				claimId: target.claimId,
				contextReviewed: contextFiles,
				via: proposal.via,
			};
			if (proposal.kind === 'figure') {
				// Confidence-gated routing (guardrail 4): figure-class ripples may auto-stage.
				if (block) { block.text = proposal.newText; block.binds = extractBindLinks(proposal.newText); state.recent.add(block.id); }
				state.lock.audit.push(this._entry(block.id, 'auto-applied', change.oldText, change.newText, proposal.via));
			} else {
				// Meaning/influence changes wait for approval in the review rail (no eager rewrites).
				this._pending.push(change);
			}
		}

		const queued = this._pending.filter(c => c.docId === id).length;
		state.status = modelAvailable
			? `${queued} impact ${queued === 1 ? 'change' : 'changes'} to review`
			: 'No model available - showing heuristic suggestions';
		await this._persist(state);
		this._onDidChange.fire();
		try {
			await this._views.openView(REVIEW_RAIL_VIEW_ID, false);
		} catch (e) {
			this._log.warn('[livingDocs] could not reveal review rail', e);
		}
	}

	// The prose targets the impact pass should consider: authored lock claims (relocated by fuzzy
	// match on their anchor), or - when none are authored - each non-bound prose paragraph as an
	// implicit influence target.
	private _claimTargets(state: IDocState): { claimId?: string; blockId?: string; relink?: boolean }[] {
		const claimIds = Object.keys(state.lock.claims);
		if (claimIds.length) {
			return claimIds.map(claimId => {
				const best = this._relocateClaim(state.doc, state.lock.claims[claimId].anchor);
				const relink = best.score < LivingDocsService._CLAIM_CONFIDENT;
				return { claimId, blockId: best.blockId, relink };
			});
		}
		return state.doc.blocks.filter(b => b.type === 'paragraph' && b.binds.length === 0).map(b => ({ blockId: b.id }));
	}

	// Relocate a claim by fuzzy-matching its stored anchor against the current prose (the file may have
	// moved/edited). Token-overlap similarity - deterministic, no model.
	private _relocateClaim(doc: ILivingDoc, anchor: string): { blockId: string | undefined; score: number } {
		let best: { blockId: string | undefined; score: number } = { blockId: undefined, score: 0 };
		for (const block of doc.blocks) {
			if (block.type === 'heading') { continue; }
			const score = similarity(anchor, block.text);
			if (score > best.score) { best = { blockId: block.id, score }; }
		}
		return best;
	}

	private _relinkPrompt(state: IDocState, target: { claimId?: string; blockId?: string }, contextFiles: string[]): IProposedChange {
		const claim = target.claimId ? state.lock.claims[target.claimId] : undefined;
		const best = target.blockId ? state.doc.blocks.find(b => b.id === target.blockId) : undefined;
		return {
			id: generateUuid(),
			docId: state.uri.toString(),
			docTitle: state.doc.title,
			blockId: target.blockId ?? '',
			blockLabel: 'Re-link claim',
			oldText: claim?.anchor ?? '',
			newText: best?.text ?? '',
			kind: 'meaning',
			confidence: 0,
			rationale: `This commentary is bound to ${contextFiles.join(', ') || 'a source'} but its anchor no longer matches the prose - re-link?`,
			sourceCells: [],
			claimId: target.claimId,
			contextReviewed: contextFiles,
			via: 'heuristic',
			relink: true,
		};
	}

	// The local OAuth proxy base URL (coerced - config stubs may return non-strings), trailing slash trimmed.
	private _proxyUrl(): string {
		const raw = this._config.getValue<string>('livingDocs.modelProxyUrl');
		const url = (typeof raw === 'string' && raw.length > 0) ? raw : DEFAULT_PROXY_URL;
		return url.replace(/\/+$/, '');
	}

	private _modelName(): string {
		const preferred = this._config.getValue<string>('livingDocs.commentaryModel');
		return (typeof preferred === 'string' && preferred.length > 0) ? preferred : DEFAULT_MODEL;
	}

	private async _hasModel(): Promise<boolean> {
		if (this._config.getValue<boolean>('livingDocs.useModel') === false) { return false; }
		return this._probeModel();
	}

	// Probe the proxy's /healthz once per TTL (reusing an in-flight probe) and cache the result so the
	// synchronous Skills report can read it. A change in availability fires onDidChange to refresh the UI.
	private async _probeModel(): Promise<boolean> {
		const now = Date.now();
		if (this._modelProbe && (now - this._modelProbedAt) < MODEL_PROBE_TTL_MS) {
			return this._modelProbe;
		}
		this._modelProbedAt = now;
		this._modelProbe = (async () => {
			let ok = false;
			try {
				const context = await this._request.request({ type: 'GET', url: `${this._proxyUrl()}/healthz`, callSite: 'livingDocs.modelProbe', disableCache: true }, CancellationToken.None);
				const json = await asJson<{ ok?: boolean }>(context);
				ok = !!json && json.ok === true;
			} catch {
				ok = false;
			}
			if (ok !== this._modelAvailable) {
				this._modelAvailable = ok;
				this._onDidChange.fire();
			}
			return ok;
		})();
		return this._modelProbe;
	}

	// POST one short request to the proxy and return the assistant text. Throws on a refusal or any
	// transport/parse error so the caller falls back to the deterministic path. Opus 4.8 request shape:
	// adaptive thinking, low effort, no sampling params (those 400). The credential stays in the proxy.
	// Call the model, retrying ONCE on a transient failure (plan 16 iter 5, decision 58). The OpenRouter
	// backend intermittently errors or returns an empty/refusal body on larger follow-ups; a single silent
	// retry recovers most of those before the caller's honest fallback ever shows. A refusal is NOT retried
	// (it would just refuse again). Only a genuine second failure propagates.
	private async _callModel(system: string, user: string): Promise<string> {
		try {
			return await this._callModelOnce(system, user);
		} catch (e) {
			if (e instanceof Error && e.message === 'model refused the request') { throw e; }
			this._log.info('[livingDocs] model call failed, retrying once', e instanceof Error ? e.message : String(e));
			return await this._callModelOnce(system, user);
		}
	}

	private async _callModelOnce(system: string, user: string): Promise<string> {
		const body = JSON.stringify({
			model: this._modelName(),
			max_tokens: MODEL_MAX_TOKENS,
			thinking: { type: 'adaptive' },
			output_config: { effort: 'low' },
			system,
			messages: [{ role: 'user', content: user }],
		});
		const context = await this._request.request({
			type: 'POST',
			url: `${this._proxyUrl()}/v1/messages`,
			headers: { 'content-type': 'application/json' },
			data: body,
			callSite: 'livingDocs.model',
		}, CancellationToken.None);
		const raw = await asText(context);
		if (!raw) { throw new Error('empty model response'); }
		const json = JSON.parse(raw) as { stop_reason?: string; content?: { type: string; text?: string }[]; error?: { message?: string } };
		if (json.error) { throw new Error(json.error.message ?? 'model proxy error'); }
		if (json.stop_reason === 'refusal') { throw new Error('model refused the request'); }
		const text = (json.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
		if (!text.trim()) { throw new Error('model returned no text'); }
		return text;
	}

	private async _proposeImpact(diff: string, contextFiles: string[], oldText: string, modelAvailable: boolean): Promise<{ newText: string; kind: 'figure' | 'meaning'; confidence: number; rationale: string; via: 'model' | 'heuristic' }> {
		if (modelAvailable) {
			try {
				return await this._modelImpact(diff, contextFiles, oldText);
			} catch (e) {
				this._log.info('[livingDocs] model impact failed, using heuristic', e instanceof Error ? e.message : String(e));
			}
		}
		return this._heuristicImpact(diff, contextFiles, oldText);
	}

	private async _modelImpact(diff: string, contextFiles: string[], oldText: string): Promise<{ newText: string; kind: 'figure' | 'meaning'; confidence: number; rationale: string; via: 'model' }> {
		const system = 'You revise one sentence of business commentary so it stays consistent with a changed source. '
			+ 'Reply with ONLY a JSON object: {"newText": string, "kind": "figure" | "meaning", "confidence": number, "rationale": string}. '
			+ 'Use kind="meaning" when the qualitative framing should change; otherwise kind="figure" and return newText unchanged.';
		const user = `The source(s) ${contextFiles.join(', ')} now read:\n"""${diff}"""\nCurrent commentary: "${oldText}". Revise it if the framing should change.`;
		const text = await this._callModel(system, user);
		const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
		return {
			newText: String(json.newText ?? oldText),
			kind: json.kind === 'meaning' ? 'meaning' : 'figure',
			confidence: typeof json.confidence === 'number' ? json.confidence : 0.8,
			rationale: String(json.rationale ?? ''),
			via: 'model',
		};
	}

	// The no-model path is a VISIBLE, conservative suggestion (not a silent degrade): it surfaces the
	// salient change and proposes a clearly-heuristic addition for the user to approve or reject.
	private _heuristicImpact(diff: string, contextFiles: string[], oldText: string): { newText: string; kind: 'meaning'; confidence: number; rationale: string; via: 'heuristic' } {
		const salient = diff.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#')).pop() ?? '';
		const note = salient ? ` In light of an update to ${contextFiles.join(', ')} ("${salient}"), revisit whether this still holds.` : ` ${contextFiles.join(', ')} changed since last review - revisit this.`;
		return {
			newText: `${oldText}${note}`,
			kind: 'meaning',
			confidence: 0.5,
			rationale: `Heuristic suggestion (no model available): ${contextFiles.join(', ')} changed since last review.`,
			via: 'heuristic',
		};
	}

	private async _readContext(state: IDocState, files: string[]): Promise<string> {
		const parts: string[] = [];
		for (const file of files) {
			if (sourceKind(file) === 'api') { continue; }
			try {
				parts.push((await this._files.readFile(joinPath(dirname(state.uri), file))).value.toString());
			} catch {
				// An unreadable context source contributes nothing to the diff.
			}
		}
		return parts.join('\n\n');
	}

	private _blockLabel(doc: ILivingDoc, blockId: string): string {
		let heading = '';
		for (const b of doc.blocks) {
			if (b.type === 'heading') { heading = b.text; }
			if (b.id === blockId) { return heading || blockId; }
		}
		return blockId;
	}

	// --- Chat agent (the right-panel Chat tab) ---

	getChatMessages(resource: URI): readonly IChatMessage[] {
		return this._chats.get(resource.toString()) ?? [];
	}

	// --- working set (plan 18): the documents a chat instruction edits across ---

	getWorkingSet(resource: URI): readonly IWorkingSetDoc[] {
		return this._workingSets.get(resource.toString()) ?? [];
	}

	async addToWorkingSet(resource: URI, docs: readonly URI[]): Promise<void> {
		const id = resource.toString();
		const set = this._workingSets.get(id) ?? [];
		const known = new Set(set.map(d => d.resource.toString()));
		let added = false;
		for (const doc of docs) {
			if (known.has(doc.toString())) { continue; }
			// Resolve a human title for the chip: the loaded doc's title, else a parsed summary, else the file name.
			const title = this.getDoc(doc)?.title ?? (await this._summarize(doc))?.title ?? basename(doc);
			set.push({ resource: doc, title });
			known.add(doc.toString());
			added = true;
		}
		if (added) {
			this._workingSets.set(id, set);
			this._onDidChange.fire();
		}
	}

	async addFolderToWorkingSet(resource: URI): Promise<void> {
		const docs = await this.listDocuments();
		await this.addToWorkingSet(resource, docs.map(d => d.resource));
	}

	removeFromWorkingSet(resource: URI, doc: URI): void {
		const id = resource.toString();
		const set = this._workingSets.get(id);
		if (!set) { return; }
		const next = set.filter(d => d.resource.toString() !== doc.toString());
		if (next.length === set.length) { return; }
		this._workingSets.set(id, next);
		this._onDidChange.fire();
	}

	async getWorkingSetCandidates(resource: URI): Promise<readonly IWorkingSetDoc[]> {
		const inSet = new Set(this.getWorkingSet(resource).map(d => d.resource.toString()));
		const docs = await this.listDocuments();
		return docs.filter(d => !inSet.has(d.resource.toString())).map(d => ({ resource: d.resource, title: d.title }));
	}

	getMentionableFiles(resource: URI): readonly string[] {
		const state = this._docs.get(resource.toString());
		if (!state) { return []; }
		// Declared sources/context PLUS the real folder documents - so @mention can reference any folder file,
		// not only frontmatter-declared ones (R6).
		const out = new Set<string>([...state.doc.sources, ...state.doc.context, ...state.folderFiles]);
		return [...out].sort((a, b) => a.localeCompare(b));
	}

	isChatBusy(resource: URI): boolean {
		return this._chatBusy.has(resource.toString());
	}

	async sendChatMessage(resource: URI, text: string): Promise<void> {
		const trimmed = text.trim();
		if (!trimmed) { return; }
		const id = resource.toString();
		const history = this._chats.get(id) ?? [];
		this._chats.set(id, history);

		const mentions = this._parseMentions(resource, trimmed);
		history.push({ role: 'user', content: trimmed, mentions: mentions.length ? mentions : undefined });
		this._chatBusy.add(id);
		this._onDidChange.fire();

		try {
			// Chat is available on EVERY open document (decision 48): "living" is just a data-binding badge,
			// not a chat gate. A plain doc simply has no sources/figures, so the agent answers from the prose
			// alone and can still generate/insert/revise content. Only an unopened doc has no state to chat over.
			const state = this._docs.get(id);
			if (!state) {
				history.push({ role: 'assistant', via: 'fallback', content: 'Open a document in the editor to chat about it - I answer using the document and its sources.' });
				return;
			}
			if (!await this._hasModel()) {
				history.push({ role: 'assistant', via: 'fallback', content: 'The agent model is not reachable. Start the local proxy (scripts/lwd-anthropic-proxy.sh) and I can answer using this document and its sources.' });
				return;
			}
			// A working set fans the instruction across every doc in one model call (plan 18, decision 62);
			// with no set the chat stays single-doc against the active document (decision 61).
			const workingSet = this.getWorkingSet(resource);
			const reply = workingSet.length
				? await this._chatRespondMulti(state, trimmed, mentions, workingSet)
				: await this._chatRespond(state, trimmed, mentions);
			history.push(reply);
		} catch (e) {
			this._log.info('[livingDocs] chat failed, honest fallback', e instanceof Error ? e.message : String(e));
			history.push({ role: 'assistant', via: 'fallback', content: 'I could not complete that just now (the agent model errored). The proxy may be down - try again once it is back.' });
		} finally {
			this._chatBusy.delete(id);
			this._onDidChange.fire();
		}
	}

	// Build the model prompt from the document (figures resolved) + the @mentioned and context sources,
	// ask for a reply plus optional prose edits, render tool-steps, and queue any edits into the rail.
	private async _chatRespond(state: IDocState, text: string, mentions: string[]): Promise<IChatMessage> {
		const docText = this._serializeDocForChat(state);
		const sourceFiles = mentions.length ? mentions : [...state.doc.sources, ...state.doc.context];
		const sources = await this._readContext(state, sourceFiles);
		const headings = state.doc.blocks.filter(b => b.type === 'heading').map(b => b.text);
		const system = 'You are the agent inside a Living Document editor, holding one continuing conversation about the open document. '
			+ 'Use the prior turns for context - a follow-up like "change a couple of them" refers to content you proposed earlier, applied over the CURRENT document shown below. '
			+ 'You can (a) rewrite existing prose paragraphs and (b) GENERATE new content to insert (lists, a new section). Never touch bound figures. '
			+ 'Reply with ONLY a JSON object: {"reply": string, '
			+ '"edits": [{"heading": string, "oldText": string, "newText": string, "rationale": string}], '
			+ '"inserts": [{"afterHeading": string, "newText": string, "rationale": string}]}. '
			+ 'Use "edits" to rewrite an existing paragraph (oldText must quote the current prose). Use "inserts" to add NEW content: newText is Markdown (e.g. a numbered or bulleted list) placed after the named heading (empty afterHeading = end of the document). '
			+ 'Propose changes only when the user asks to write, generate or revise; otherwise return empty arrays. Keep reply concise.';
		const transcript = this._chatTranscript(state.uri);
		const user = `Document "${state.doc.title}" (${state.doc.subtitle}):\n${docText}\n\nHeadings: ${headings.join(' | ') || '(none)'}\n\nSources (${sourceFiles.join(', ') || 'none'}):\n"""${sources}"""\n\n${transcript}User: ${text}`;
		const raw = await this._callModel(system, user);
		// Tolerant parse (plan 16 iter 5): a non-JSON / truncated / prose-wrapped reply degrades to a plain
		// chat answer instead of throwing (which used to surface as a false "the agent model errored").
		const json = parseChatResponse(raw);

		const steps: IChatStep[] = [];
		const proposedIds: string[] = [];
		if (sourceFiles.length) { steps.push({ label: `Read ${sourceFiles.join(', ')}`, status: 'done' }); }
		for (const edit of json.edits) {
			const queued = this._queueChatEdit(state, edit);
			if (queued) { steps.push({ label: `Proposed edit: ${queued.label}`, status: 'queued' }); proposedIds.push(queued.id); }
		}
		for (const insert of json.inserts) {
			const queued = this._queueChatInsert(state, insert);
			if (queued) { steps.push({ label: `Proposed new content after ${queued.label}`, status: 'queued' }); proposedIds.push(queued.id); }
		}
		// What the bubble shows: the model's reply when it gave one; nothing when proposals carry the meaning
		// (their cards speak); otherwise a neutral honest line. `parseChatResponse` already routed a non-JSON
		// plain-text answer into `reply`, so a truthy `reply` is always real prose -- we NEVER surface the raw
		// JSON envelope (a parsed-but-empty reply used to leak `{"reply":"",...}` into the chat).
		const content = json.reply || (proposedIds.length ? '' : 'I do not have anything to add on that.');
		return {
			role: 'assistant', via: 'model', content,
			steps: steps.length ? steps : undefined,
			proposedIds: proposedIds.length ? proposedIds : undefined,
		};
	}

	// Fan one instruction across the whole working set in a SINGLE model call (plan 18, decision 62). The
	// model is shown every target document (figures resolved) and asked for a per-document edit map; each
	// doc's edits/inserts are routed into the existing proposal queue tagged with that doc's id, so the
	// Review rail's per-document grouping + approve/reject loop is reused unchanged. Plain and living docs
	// flow through the same path (decision 63).
	private async _chatRespondMulti(active: IDocState, text: string, mentions: string[], workingSet: readonly IWorkingSetDoc[]): Promise<IChatMessage> {
		// Ensure every target document is loaded so it can be serialized for the prompt and edited.
		for (const wsDoc of workingSet) {
			if (!this._docs.get(wsDoc.resource.toString())) { await this.loadDocument(wsDoc.resource); }
		}
		const states = workingSet
			.map(ws => this._docs.get(ws.resource.toString()))
			.filter((s): s is IDocState => !!s);

		const sourceFiles = mentions.length ? mentions : [...active.doc.sources, ...active.doc.context];
		const sources = await this._readContext(active, sourceFiles);
		const docSections = states.map(s => {
			const headings = s.doc.blocks.filter(b => b.type === 'heading').map(b => b.text);
			return `### Document: "${s.doc.title}"\n${this._serializeDocForChat(s)}\nHeadings: ${headings.join(' | ') || '(none)'}`;
		}).join('\n\n');

		const system = 'You are the agent inside a Living Document editor. The user has selected a WORKING SET of documents and given ONE instruction to apply across ALL of them. '
			+ 'Apply the instruction to every document where it is relevant; a document that needs no change simply gets empty arrays. Never touch bound figures. '
			+ 'GROUND every change in a specific decision from the attached source: for each edit and insert, include "sourceQuote" (a short VERBATIM sentence copied from the attached source that this change implements) and "sourceLine" (the 1-based line number of that sentence in the attached source, if the source shows numbered lines). '
			+ 'Reply with ONLY a JSON object: {"reply": string, "docs": [{"doc": string, '
			+ '"edits": [{"heading": string, "oldText": string, "newText": string, "rationale": string, "sourceQuote": string, "sourceLine": number}], '
			+ '"inserts": [{"afterHeading": string, "newText": string, "rationale": string, "sourceQuote": string, "sourceLine": number}]}]}. '
			+ 'The "doc" field MUST be the exact document title shown below. Use "edits" to rewrite an existing paragraph (oldText must quote the current prose). Use "inserts" to add NEW content after the named heading (empty afterHeading = end of that document). Keep reply concise.';
		const transcript = this._chatTranscript(active.uri);
		const user = `Working set (${states.length} documents):\n\n${docSections}\n\nShared sources (${sourceFiles.join(', ') || 'none'}):\n"""${sources}"""\n\n${transcript}User: ${text}`;
		const raw = await this._callModel(system, user);
		const json = parseMultiChatResponse(raw);

		const steps: IChatStep[] = [];
		const proposedIds: string[] = [];
		if (sourceFiles.length) { steps.push({ label: `Read ${sourceFiles.join(', ')}`, status: 'done' }); }
		// Match each returned doc entry to a working-set document by title, then queue its edits/inserts
		// against that document's own state (so proposals carry the right docId for the rail grouping).
		const byTitle = new Map(states.map(s => [s.doc.title.trim().toLowerCase(), s]));
		for (const entry of json.docs) {
			const target = byTitle.get(entry.doc.trim().toLowerCase());
			if (!target) { continue; }
			for (const edit of entry.edits) {
				const queued = this._queueChatEdit(target, edit, sources);
				if (queued) { steps.push({ label: `${target.doc.title}: ${queued.label}`, status: 'queued' }); proposedIds.push(queued.id); }
			}
			for (const insert of entry.inserts) {
				const queued = this._queueChatInsert(target, insert, sources);
				if (queued) { steps.push({ label: `${target.doc.title}: new content after ${queued.label}`, status: 'queued' }); proposedIds.push(queued.id); }
			}
		}
		const content = json.reply || (proposedIds.length ? '' : 'I did not find anything to change across those documents.');
		return {
			role: 'assistant', via: 'model', content,
			steps: steps.length ? steps : undefined,
			proposedIds: proposedIds.length ? proposedIds : undefined,
		};
	}

	// Render the last few turns for the model so a follow-up ("change a couple of them") resolves against
	// what was already said. The caller has already pushed the current user turn, so drop the last entry.
	private _chatTranscript(resource: URI): string {
		const prior = (this._chats.get(resource.toString()) ?? []).slice(0, -1).slice(-6);
		if (!prior.length) { return ''; }
		const lines = prior.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
		return `Conversation so far:\n${lines.join('\n')}\n\n`;
	}

	// Locate the prose block an edit targets (best token-overlap match under the named heading) and queue
	// a meaning-class change for it. Bound (figure) blocks and no-op rewrites are skipped. Returns the
	// block label when queued, else undefined.
	private _queueChatEdit(state: IDocState, edit: { heading?: string; oldText?: string; newText?: string; rationale?: string; sourceQuote?: string; sourceLine?: number }, sourceText?: string): { id: string; label: string } | undefined {
		const newText = String(edit.newText ?? '').trim();
		const oldText = String(edit.oldText ?? '').trim();
		if (!newText || !oldText) { return undefined; }
		let best: ILivingDocBlock | undefined;
		let bestScore = 0.5;
		for (const block of state.doc.blocks) {
			if (block.type === 'heading' || block.binds.length) { continue; }
			const score = similarity(block.text, oldText);
			if (score > bestScore) { bestScore = score; best = block; }
		}
		if (!best || best.text.trim() === newText) { return undefined; }
		const label = this._blockLabel(state.doc, best.id);
		const id = generateUuid();
		const grounding = this._resolveSourceGrounding(edit.sourceQuote, edit.sourceLine, sourceText);
		this._pending.push({
			id,
			docId: state.uri.toString(),
			docTitle: state.doc.title,
			blockId: best.id,
			blockLabel: label,
			oldText: best.text,
			newText,
			kind: 'meaning',
			confidence: 0.85,
			rationale: String(edit.rationale ?? 'Proposed by the Chat agent.'),
			sourceCells: [],
			via: 'model',
			...grounding,
		});
		return { id, label };
	}

	// Resolve the source grounding for a fan-out change (plan 23.4, decision #77): keep the model's
	// verbatim quote, and take its line number from the model when given, else look the quote up in the
	// real source text to fill a TRUE line. If the quote is not found we leave the line undefined - the
	// card then shows the quote with no line chip. A line number is NEVER fabricated.
	private _resolveSourceGrounding(sourceQuote?: string, sourceLine?: number, sourceText?: string): { sourceQuote?: string; sourceLine?: number } {
		const quote = typeof sourceQuote === 'string' ? sourceQuote.trim() : '';
		if (!quote) { return {}; }
		if (typeof sourceLine === 'number' && Number.isFinite(sourceLine)) {
			return { sourceQuote: quote, sourceLine };
		}
		const found = sourceText ? findQuoteLine(sourceText, quote) : undefined;
		return found ? { sourceQuote: quote, sourceLine: found } : { sourceQuote: quote };
	}

	// Queue a generative insertion: brand-new Markdown content (a list, a section) to be added after the
	// named heading (best fuzzy match; empty/unknown -> end of document). No oldText - the inline diff
	// renders it all-additions, and approve splices a new block into the document.
	private _queueChatInsert(state: IDocState, insert: { afterHeading?: string; newText?: string; rationale?: string; sourceQuote?: string; sourceLine?: number }, sourceText?: string): { id: string; label: string } | undefined {
		const newText = String(insert.newText ?? '').trim();
		if (!newText) { return undefined; }
		const afterHeading = String(insert.afterHeading ?? '').trim();
		let afterBlockId = '';
		let label = 'the end';
		if (afterHeading) {
			let best: ILivingDocBlock | undefined;
			let bestScore = 0.5;
			for (const block of state.doc.blocks) {
				if (block.type !== 'heading') { continue; }
				const score = similarity(block.text, afterHeading);
				if (score > bestScore) { bestScore = score; best = block; }
			}
			if (best) { afterBlockId = best.id; label = best.text; }
		}
		const id = generateUuid();
		this._pending.push({
			id,
			docId: state.uri.toString(),
			docTitle: state.doc.title,
			blockId: afterBlockId,
			blockLabel: label,
			oldText: '',
			newText,
			kind: 'meaning',
			confidence: 0.8,
			rationale: String(insert.rationale ?? 'New content proposed by the Chat agent.'),
			sourceCells: [],
			via: 'model',
			insert: true,
			afterBlockId,
			...this._resolveSourceGrounding(insert.sourceQuote, insert.sourceLine, sourceText),
		});
		return { id, label };
	}

	private _parseMentions(resource: URI, text: string): string[] {
		if (!text.includes('@')) { return []; }
		return this.getMentionableFiles(resource).filter(f => text.includes(`@${f}`));
	}

	// The document as clean prose for the model: title + headings + paragraphs with bind links resolved
	// to their live values (so the agent reasons over the figures the reader sees, not the raw markup).
	private _serializeDocForChat(state: IDocState): string {
		const resolved = this.getResolved(state.uri);
		const resolve = (s: string) => s.replace(/\[([^\]]*)\]\(bind:([^)]+)\)/g, (_m, label: string, key: string) => resolved.get(key) ?? label);
		const lines: string[] = [];
		for (const block of state.doc.blocks) {
			lines.push(block.type === 'heading' ? `${'#'.repeat(block.level ?? 1)} ${resolve(block.text)}` : resolve(block.text));
		}
		return lines.join('\n');
	}

	// --- approve / reject (the review rail) ---

	async approve(changeId: string): Promise<void> {
		const change = this._pending.find(c => c.id === changeId);
		if (!change) { return; }
		const state = this._docs.get(change.docId);
		if (!state) { return; }
		const block = state.doc.blocks.find(b => b.id === change.blockId);
		if (change.insert) {
			// A generative insertion: splice the new Markdown content in as a fresh block after its anchor
			// (or at the end when the anchor is gone/unset), then persist. The block keeps the full Markdown
			// (heading + list) verbatim; the renderer shows rich content as rendered Markdown. No claim/lock.
			const newBlock: ILivingDocBlock = { id: generateUuid(), type: 'paragraph', text: change.newText, binds: extractBindLinks(change.newText) };
			const anchorIndex = change.afterBlockId ? state.doc.blocks.findIndex(b => b.id === change.afterBlockId) : state.doc.blocks.length - 1;
			state.doc.blocks.splice(anchorIndex + 1, 0, newBlock);
			state.recent.add(newBlock.id);
		} else if (block && !change.relink) {
			// A re-link prompt re-anchors the claim to the current best-match prose without rewriting it;
			// a normal impact change applies its rewrite to the block.
			block.text = change.newText; block.binds = extractBindLinks(change.newText); state.recent.add(block.id);
		}
		if (change.claimId) {
			const prior = state.lock.claims[change.claimId];
			state.lock.claims[change.claimId] = {
				anchor: change.relink ? (block?.text ?? prior?.anchor ?? '') : change.newText,
				boundTo: prior?.boundTo ?? change.contextReviewed ?? [],
				kind: 'meaning',
				state: 'applied',
			};
		}
		this._pending = this._pending.filter(c => c.id !== changeId);
		state.lock.audit.push(this._entry(change.blockId, 'approved', change.oldText, change.newText, change.via ?? 'model'));
		await this._markContextReviewed(state, change.contextReviewed);
		state.status = `Change approved - applied to ${change.docTitle}`;
		await this._persist(state);
		await this._recomputeFreshness(state);
		this._onDidChange.fire();
	}

	// Accept every pending change for a document in one action (the comp's "accept all"). Applied in
	// order; each approve re-resolves its anchor by stable block id, so insertions stay correctly placed.
	async approveAll(docId: string): Promise<void> {
		const ids = this._pending.filter(c => c.docId === docId).map(c => c.id);
		for (const id of ids) {
			await this.approve(id);
		}
	}

	reject(changeId: string): void {
		const change = this._pending.find(c => c.id === changeId);
		if (!change) { return; }
		this._pending = this._pending.filter(c => c.id !== changeId);
		const state = this._docs.get(change.docId);
		if (state) {
			state.lock.audit.push(this._entry(change.blockId, 'rejected', change.oldText, change.newText, change.via ?? 'model'));
			state.status = `Change rejected - ${change.docTitle} left unchanged`;
			// Rejecting still counts as reviewing the changed context, so the flag clears.
			void this._markContextReviewed(state, change.contextReviewed)
				.then(() => this._recomputeFreshness(state))
				.then(() => this._onDidChange.fire())
				.catch(e => this._log.warn('[livingDocs] reject follow-up failed', e));
		}
		this._onDidChange.fire();
	}

	// Accept every pending change across every document at once (the chat-level "Accept all" spanning the
	// whole working set). Applied per document so each doc's insertions stay correctly anchored.
	async approveAllPending(): Promise<void> {
		const docIds = [...new Set(this._pending.map(c => c.docId))];
		for (const docId of docIds) {
			await this.approveAll(docId);
		}
	}

	// Discard every pending change for one document in a single action (the per-document "Reject all",
	// mirroring approveAll). Each reject audits the discard and clears it from the rail; other documents'
	// pending changes are untouched.
	async rejectAll(docId: string): Promise<void> {
		const ids = this._pending.filter(c => c.docId === docId).map(c => c.id);
		for (const id of ids) {
			this.reject(id);
		}
	}

	// Discard every pending change across every document at once (the chat-level "Reject all" spanning
	// the whole working set). Clears the rail in one action.
	async rejectAllPending(): Promise<void> {
		const ids = this._pending.map(c => c.id);
		for (const id of ids) {
			this.reject(id);
		}
	}

	// Mark each reviewed context source as reviewed-at-current in the lock so its stale flag clears.
	private async _markContextReviewed(state: IDocState, files: readonly string[] | undefined): Promise<void> {
		if (!files?.length) { return; }
		for (const file of files) {
			state.lock.context[file] = { reviewedHash: await this._hashContext(state, file), reviewedAt: new Date().toISOString(), scope: 'document' };
		}
	}

	// Source-peek: the styled source data rendered as an IN-SURFACE pane inside the one document
	// surface (the comp's "Sync across" source panel) - never a second editor group. The cells behind
	// the clicked provenance dot are marked `selected`; the "Sync across" loop then re-derives figures.
	getSourcePeek(resource: URI, cells: readonly string[]): ISourcePeek | undefined {
		const state = this._docs.get(resource.toString());
		if (!state || !state.doc.isLiving) { return undefined; }
		const selected = new Set(cells);
		const rows: ISourcePeekRow[] = Object.keys(state.lock.bindings).map(key => ({
			key,
			value: state.lock.bindings[key].resolved,
			selected: selected.has(key),
		}));
		const source = state.doc.sources.find(s => sourceKind(s) === 'file') ?? state.doc.sources[0] ?? 'source';
		const referencedBy = [...this._docs.values()]
			.filter(s => s.doc.isLiving && s.doc.sources.some(src => state.doc.sources.includes(src)))
			.map(s => s.doc.title);
		const raw = this._rawSourceCache.get(`${resource.toString()}::${source}`);
		const grid = raw && source.endsWith('.csv') ? buildSourceGrid(raw) : undefined;
		return { source, rows, referencedBy, grid };
	}

	// "Sync across": re-derive this one document's bound figures from its current sources and return the
	// old -> new diff (the visible result of a source edit). Figures auto-apply (low risk); the diff is
	// recorded for the editor's synced banner. Meaning-changes still go through Review-impact, not here.
	async syncFromSources(resource: URI): Promise<readonly IFigureChange[]> {
		const id = resource.toString();
		const state = this._docs.get(id);
		if (!state || !state.doc.isLiving) { return []; }
		const changes = await this._syncLockWithDiff(state);
		await this._persist(state);
		await this._recomputeFreshness(state);
		state.status = changes.length
			? `Synced - ${changes.length} figure${changes.length === 1 ? '' : 's'} updated`
			: 'Synced - figures already up to date';
		this._onDidChange.fire();
		return changes;
	}

	// Re-derive a document's figures (the existing _syncLock) while capturing the old -> new diff of the
	// resolved values, recorded per document for the editor's "Sync across" banner. Shared by the focused
	// per-document sync and the workspace-wide refresh.
	private async _syncLockWithDiff(state: IDocState): Promise<IFigureChange[]> {
		const before = new Map(this.getResolved(state.uri));
		state.recent = new Set<string>();
		await this._syncLock(state);
		await this._resolveSubtitle(state);
		const after = this.getResolved(state.uri);
		const changes: IFigureChange[] = [];
		for (const [key, next] of after) {
			const old = before.get(key);
			if (old !== undefined && old !== next) { changes.push({ key, old, next }); }
		}
		this._lastSyncDiff.set(state.uri.toString(), changes);
		return changes;
	}

	getLastSyncDiff(resource: URI): readonly IFigureChange[] {
		return this._lastSyncDiff.get(resource.toString()) ?? [];
	}

	// --- typed context (Pasted text / Images / Company knowledge + Add context) ---

	getAddedContext(resource: URI): readonly IAddedContext[] {
		return this._docs.get(resource.toString())?.lock.contextItems ?? [];
	}

	// Add a typed context item from the Context panel. Pasted notes and knowledge keep their full text in
	// `detail` with a truncated `label`; an image keeps its path/URL as the label. Persisted in the lock.
	async addContext(resource: URI, kind: AddedContextKind, text: string): Promise<void> {
		const state = this._docs.get(resource.toString());
		const trimmed = text.trim();
		if (!state || !trimmed) { return; }
		if (!state.lock.contextItems) { state.lock.contextItems = []; }
		const oneLine = trimmed.replace(/\s+/g, ' ');
		const label = kind === 'image' ? oneLine : (oneLine.length > 48 ? `${oneLine.slice(0, 47)}\u2026` : oneLine);
		const detail = kind === 'image' ? 'image' : (kind === 'knowledge' ? 'company knowledge' : 'pasted note');
		state.lock.contextItems.push({ kind, label, detail });
		state.status = 'Context added';
		await this._persist(state);
		this._onDidChange.fire();
	}

	// --- discovery + persistence ---

	private async _discoverLivingDocUris(): Promise<URI[]> {
		const found = new Map<string, URI>();
		// Always include documents already loaded (e.g. the open editor).
		for (const state of this._docs.values()) { found.set(state.uri.toString(), state.uri); }
		// Scan the directory of each loaded document for sibling Living Documents.
		const dirs = new Map<string, URI>();
		for (const state of this._docs.values()) {
			const dir = dirname(state.uri);
			dirs.set(dir.toString(), dir);
		}
		for (const dir of dirs.values()) {
			try {
				const stat = await this._files.resolve(dir);
				for (const child of stat.children ?? []) {
					if (!child.isDirectory && await this._isLivingDocFile(child.resource)) {
						found.set(child.resource.toString(), child.resource);
					}
				}
			} catch (e) {
				// Directory listing is unavailable (e.g. in unit tests); the loaded set still applies.
				this._log.trace('[livingDocs] directory scan skipped', e instanceof Error ? e.message : String(e));
			}
		}
		return [...found.values()];
	}

	private _entry(blockId: string, action: IAuditEntry['action'], oldText: string, newText: string, via: IAuditEntry['via']): IAuditEntry {
		const docTitle = [...this._docs.values()].find(s => s.doc.blocks.some(b => b.id === blockId))?.doc.title ?? '';
		return { time: new Date().toISOString(), docTitle, blockId, action, oldText, newText, via };
	}

	// Persist the document (.md) and its lock together - the pair is one logical unit.
	private async _persist(state: IDocState): Promise<void> {
		try {
			const serialized = serializeLivingDoc(state.doc);
			state.rawText = serialized;
			await this._files.writeFile(state.uri, VSBuffer.fromString(serialized));
			await this._lockStore.write(state.uri, state.lock);
		} catch (e) {
			this._log.warn('[livingDocs] persist failed', e);
		}
	}
}
