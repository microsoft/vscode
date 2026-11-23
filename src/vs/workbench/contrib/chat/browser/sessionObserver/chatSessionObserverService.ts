/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatSessionStatus, isSessionInProgressStatus } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { isRequestVM } from '../../common/model/chatViewModel.js';
import { IPromptTimelineReveal, PROMPT_TIMELINE_CONTRIB_ID } from '../../common/promptTimeline.js';
import { ActiveChatSessionHost, ChatSessionObservedStatus, IActiveChatSession, IChatSessionContentRef, IChatSessionEvent, IChatSessionEventInput, IChatSessionObservedInfo, IChatSessionObservedList, IChatSessionObserverService, IChatSessionsObservedChangeEvent, IChatSessionTranscript, IChatSessionTranscriptSource } from '../../common/sessionObserver/chatSessionObserver.js';
import { IAgentSession } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatWidget, IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from '../chat.js';
import { getChatQuestionAnswerSessionResource } from '../widget/chatContentParts/chatQuestionAnswerEditor.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME } from '../copilotCliEventsUri.js';
import { AgentHostTranscriptSource } from './agentHostTranscriptSource.js';
import { ChatModelTranscriptSource } from './chatModelTranscriptSource.js';
import { CloudSessionTranscriptSource } from './cloudSessionTranscriptSource.js';
import { CopilotCliTranscriptSource } from './copilotCliTranscriptSource.js';
import type { IChatWidgetContrib } from '../widget/chatWidget.js';

const DAY = 86_400_000;
/** A log nobody observes is kept warm briefly, so quick re-observations don't reload it. */
const LINGER_MS = 30_000;

export const NO_FIDELITY = { reasoning: 'none', toolOutput: 'truncated', diffs: 'none', timestamps: 'perTurn', modelCalls: false, liveWithoutWidget: false, liveLatencyMs: 0 } as const;

export function providerOf(resource: URI, providerType: string): { provider: string; harness?: string } {
	if (resource.scheme === COPILOT_CLI_EH_SCHEME) {
		return { provider: 'copilotCli' };
	}
	if (resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
		return { provider: 'agentHost', harness: 'copilot' };
	}
	const ah = /^(?:agent-host|remote-.+?)-(.+)$/.exec(resource.scheme);
	if (ah) {
		return { provider: 'agentHost', harness: ah[1] === 'copilotcli' ? 'copilot' : ah[1] };
	}
	if (/cloud|coding-agent|copilot-swe/i.test(providerType) || /cloud/i.test(resource.scheme)) {
		return { provider: 'cloud' };
	}
	if (providerType === 'local' || resource.scheme === 'vscode-chat-session' || resource.scheme === 'vscode-local-chat-session') {
		return { provider: 'local' };
	}
	return { provider: providerType || resource.scheme };
}

function statusOf(s: IAgentSession): ChatSessionObservedStatus {
	switch (s.status) {
		case ChatSessionStatus.NeedsInput: return 'question';
		case ChatSessionStatus.Failed: return 'failed';
		case ChatSessionStatus.Completed: return 'waiting';
		default: return isSessionInProgressStatus(s.status) ? 'working' : 'waiting';
	}
}

function infoOf(s: IAgentSession): IChatSessionObservedInfo {
	const { provider, harness } = providerOf(s.resource, s.providerType);
	const meta = s.metadata;
	const changes = s.changes && !Array.isArray(s.changes) ? s.changes as { files: number; insertions: number; deletions: number } : undefined;
	const cloud = provider === 'cloud';
	return {
		resource: s.resource,
		provider,
		...(harness ? { harness } : {}),
		title: s.label,
		...(typeof s.description === 'string' ? { description: s.description } : {}),
		status: statusOf(s),
		createdAt: s.timing.created,
		lastActivityAt: Math.max(s.timing.created, s.timing.lastRequestStarted ?? 0, s.timing.lastRequestEnded ?? 0),
		...(s.timing.lastRequestStarted ? { lastRequestStartedAt: s.timing.lastRequestStarted } : {}),
		...(s.timing.lastRequestEnded ? { lastRequestEndedAt: s.timing.lastRequestEnded } : {}),
		readState: { isRead: s.isRead() },
		archived: s.isArchived(),
		...(meta?.workingDirectoryPath || meta?.worktreePath || meta?.repositoryPath ? {
			workspace: {
				...(meta.workingDirectoryPath ? { folder: URI.file(meta.workingDirectoryPath) } : {}),
				...(meta.worktreePath ? { worktree: URI.file(meta.worktreePath) } : {}),
				...(meta.repositoryPath ? { repositoryRoot: URI.file(meta.repositoryPath) } : {}),
			},
		} : {}),
		...(meta?.branchName || meta?.branch ? { repository: { remoteUrl: '', branch: meta.branchName ?? meta.branch, ...(meta.baseBranchName ? { baseBranch: meta.baseBranchName } : {}), ...(meta.headRefOid ? { head: meta.headRefOid } : {}) } } : {}),
		...(changes ? { changes } : {}),
		...(s.parentSession ? { parent: s.parentSession.resource } : {}),
		...(s.children?.length ? { children: s.children.map(c => c.resource) } : {}),
		capabilities: { steering: !cloud, queueing: !cloud, inputSuggestions: true, questions: !cloud, planReview: !cloud },
		fidelity: NO_FIDELITY,
	};
}

/** How long the chat input must stay unchanged before its text is reported as the session's unsent input. */
const INPUT_SETTLE_MS = 400;

class SharedLog extends Disposable {
	readonly events: IChatSessionEvent[] = [];
	readonly onDidAppend = this._register(new Emitter<readonly IChatSessionEvent[]>());
	readonly onDidChangeInfo = this._register(new Emitter<IChatSessionObservedInfo>());
	private readonly contents = new Map<string, string>();
	refs = 0;
	linger: ReturnType<typeof setTimeout> | undefined;
	handle: IDisposable | undefined;

	constructor(public info: IChatSessionObservedInfo) {
		super();
	}

	append(events: readonly IChatSessionEventInput[]): void {
		const base = this.events.length;
		const out: IChatSessionEvent[] = events.map((e, i) => ({ ...e, seq: base + i + 1 }));
		this.events.push(...out);
		this.onDidAppend.fire(out);
	}

	patchInfo(patch: Partial<Omit<IChatSessionObservedInfo, 'resource'>>): void {
		const next = { ...this.info, ...patch, lastActivityAt: Math.max(this.info.lastActivityAt, patch.lastActivityAt ?? 0) };
		if (JSON.stringify(next) !== JSON.stringify(this.info)) {
			this.info = next;
			this.onDidChangeInfo.fire(next);
		}
	}

	storeContent(text: string): IChatSessionContentRef {
		const id = generateUuid();
		this.contents.set(id, text);
		return { id, size: text.length };
	}

	track<T extends IDisposable>(d: T): T {
		return this._register(d);
	}

	content(ref: IChatSessionContentRef): string {
		return this.contents.get(ref.id) ?? '';
	}

	override dispose(): void {
		clearTimeout(this.linger);
		this.handle?.dispose();
		super.dispose();
	}
}

export class ChatSessionObserverService extends Disposable implements IChatSessionObserverService {
	declare readonly _serviceBrand: undefined;

	private readonly sources: IChatSessionTranscriptSource[] = [];
	private readonly logs = new ResourceMap<Promise<SharedLog>>();
	private known = new ResourceMap<IChatSessionObservedInfo>();

	private readonly _onDidChangeSessions = this._register(new Emitter<IChatSessionsObservedChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private _active: readonly IActiveChatSession[] = [];
	private readonly _onDidChangeActiveSessions = this._register(new Emitter<readonly IActiveChatSession[]>());
	readonly onDidChangeActiveSessions = this._onDidChangeActiveSessions.event;
	private readonly widgetListeners = this._register(new DisposableStore());
	/** What each observed session's input held when last reported, so an unchanged input isn't reported again. */
	private readonly lastInput = new ResourceMap<string>();
	private readonly answerBoxes = this._register(new DisposableMap<string, DisposableStore>());
	private inputReports: RunOnceScheduler[] = [];

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IHostService private readonly hostService: IHostService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IModelService modelService: IModelService,
	) {
		super();
		this._register(this.registerSource(this._register(instantiationService.createInstance(CopilotCliTranscriptSource))));
		this._register(this.registerSource(this._register(instantiationService.createInstance(AgentHostTranscriptSource))));
		this._register(this.registerSource(this._register(instantiationService.createInstance(ChatModelTranscriptSource))));
		this._register(this.registerSource(this._register(instantiationService.createInstance(CloudSessionTranscriptSource))));

		this._register(this.chatWidgetService.onDidAddWidget(() => this.updateActive()));
		this._register(this.chatWidgetService.onDidChangeFocusedWidget(() => this.updateActive()));
		this._register(this.chatWidgetService.onDidChangeFocusedSession(() => this.updateActive()));
		this._register(this.hostService.onDidChangeFocus(() => this.updateActive()));
		this._register(modelService.onModelAdded(m => this.watchAnswerBox(m)));
		for (const m of modelService.getModels()) {
			this.watchAnswerBox(m);
		}
		this.updateActive();
	}

	registerSource(source: IChatSessionTranscriptSource): IDisposable {
		this.sources.push(source);
		this.sources.sort((a, b) => b.priority - a.priority);
		return toDisposable(() => {
			const i = this.sources.indexOf(source);
			if (i >= 0) {
				this.sources.splice(i, 1);
			}
		});
	}

	// ---- the session list ----

	private listenedToSessions = false;

	private readonly lists = new Set<IChatSessionObservedList>();

	registerSessionList(list: IChatSessionObservedList): IDisposable {
		this.lists.add(list);
		const listener = list.onDidChange(() => this.listenedToSessions && this.diffSessions());
		if (this.listenedToSessions) {
			this.diffSessions();
		}
		return toDisposable(() => {
			listener.dispose();
			this.lists.delete(list);
			if (this.listenedToSessions) {
				this.diffSessions();
			}
		});
	}

	private snapshot(): ResourceMap<IChatSessionObservedInfo> {
		const map = new ResourceMap<IChatSessionObservedInfo>();
		for (const list of this.lists) {
			for (const info of list.getSessions()) {
				map.set(info.resource, info);
			}
		}
		// The agent sessions model knows more about a session (its workspace, changes, timing), so it wins.
		for (const s of this.agentSessionsService.model.sessions) {
			map.set(s.resource, infoOf(s));
		}
		return map;
	}

	async getSessions(activeSince?: number): Promise<readonly IChatSessionObservedInfo[]> {
		const model = this.agentSessionsService.model;
		if (!model.resolved) {
			await Promise.race([Event.toPromise(model.onDidResolve), new Promise(r => setTimeout(r, 5_000))]);
		}
		if (!this.listenedToSessions) {
			this.listenedToSessions = true;
			this.known = this.snapshot();
			this._register(model.onDidChangeSessions(() => this.diffSessions()));
			this._register(model.onDidChangeSessionArchivedState(() => this.diffSessions()));
		}
		const since = activeSince ?? Date.now() - 30 * DAY;
		return [...this.known.values()].filter(i => i.lastActivityAt >= since || i.status === 'working');
	}

	private diffSessions(): void {
		const next = this.snapshot();
		const added: IChatSessionObservedInfo[] = [];
		const changed: IChatSessionObservedInfo[] = [];
		const removed: URI[] = [];
		for (const [resource, info] of next) {
			const prev = this.known.get(resource);
			if (!prev) {
				added.push(info);
			} else if (prev.status !== info.status || prev.title !== info.title || prev.lastActivityAt !== info.lastActivityAt || prev.archived !== info.archived || prev.readState.isRead !== info.readState.isRead) {
				changed.push(info);
			}
		}
		for (const resource of this.known.keys()) {
			if (!next.has(resource)) {
				removed.push(resource);
			}
		}
		this.known = next;
		if (added.length || changed.length || removed.length) {
			this._onDidChangeSessions.fire({ added, changed, removed });
		}
	}

	// ---- observation: one shared log per session ----

	async observe(resource: URI): Promise<IChatSessionTranscript> {
		let p = this.logs.get(resource);
		if (!p) {
			p = this.open(resource);
			this.logs.set(resource, p);
			p.catch(() => this.logs.delete(resource));
		}
		const log = await p;
		clearTimeout(log.linger);
		log.linger = undefined;
		log.refs++;
		const store = new DisposableStore();
		const onDidAppend = store.add(new Emitter<readonly IChatSessionEvent[]>());
		const onDidChangeInfo = store.add(new Emitter<IChatSessionObservedInfo>());
		store.add(log.onDidAppend.event(e => onDidAppend.fire(e)));
		store.add(log.onDidChangeInfo.event(i => onDidChangeInfo.fire(i)));
		let disposed = false;
		return {
			get info() { return log.info; },
			events: log.events.slice(),
			onDidAppend: onDidAppend.event,
			onDidChangeInfo: onDidChangeInfo.event,
			fetchContent: async ref => log.content(ref),
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				store.dispose();
				if (--log.refs === 0) {
					log.linger = setTimeout(() => {
						if (log.refs === 0) {
							this.logs.delete(resource);
							log.dispose();
						}
					}, LINGER_MS);
				}
			},
		};
	}

	private async open(resource: URI): Promise<SharedLog> {
		await this.getSessions();
		const listed = this.known.get(resource);
		const log = new SharedLog(listed ?? {
			resource, ...providerOf(resource, ''), title: resource.path.replace(/^\//, ''), status: 'waiting', createdAt: Date.now(), lastActivityAt: 0,
			readState: { isRead: true }, archived: false,
			capabilities: { steering: true, queueing: true, inputSuggestions: true, questions: true, planReview: true }, fidelity: NO_FIDELITY,
		});
		const sink = {
			append: (e: readonly IChatSessionEventInput[]) => log.append(e),
			// A listed session keeps the sessions list's title; an unlisted one (a chat not yet in the list) takes its source's.
			patchInfo: (p: Partial<Omit<IChatSessionObservedInfo, 'resource'>>) => {
				const { title, ...rest } = p;
				log.patchInfo(listed || !title ? rest : p);
			},
			storeContent: (t: string) => log.storeContent(t),
		};
		for (const source of this.sources.filter(s => s.canObserve(resource))) {
			try {
				log.handle = await source.observe(resource, sink);
				this.logService.trace(`[chatSessionObserver] ${resource.toString()} observed by ${source.id}`);
				// Keep the list's status in step with what the source knows.
				log.track(log.onDidChangeInfo.event(info => {
					const prev = this.known.get(resource);
					if (prev && prev.status !== info.status) {
						this.known.set(resource, { ...prev, status: info.status, lastActivityAt: info.lastActivityAt });
						this._onDidChangeSessions.fire({ added: [], removed: [], changed: [info] });
					}
				}));
				return log;
			} catch (e) {
				this.logService.trace(`[chatSessionObserver] ${source.id} could not observe ${resource.toString()}: ${e}`);
			}
		}
		log.dispose();
		throw new Error(`No transcript source can observe ${resource.toString()}`);
	}

	// ---- which session each surface shows ----

	get activeSessions(): readonly IActiveChatSession[] {
		return this._active;
	}

	private hostOf(widget: IChatWidget): ActiveChatSessionHost {
		if (this.environmentService.isSessionsWindow) {
			return 'agentsWindow';
		}
		const ctx = widget.viewContext;
		if (isIChatViewViewContext(ctx)) {
			return 'chatView';
		}
		if (isIChatResourceViewContext(ctx) && ctx.isQuickChat) {
			return 'quickChat';
		}
		return 'chatEditor';
	}

	private updateActive(): void {
		// Focus moving away right after typing must not lose the input's last report.
		for (const r of this.inputReports.splice(0)) {
			if (r.isScheduled()) {
				r.flush();
			}
		}
		this.widgetListeners.clear();
		const focused = this.hostService.hasFocus;
		const last = this.chatWidgetService.lastFocusedWidget;
		const out: IActiveChatSession[] = [];
		const seen = new ResourceMap<boolean>();
		const widgets = [...this.chatWidgetService.getAllWidgets()].filter(w => w.location === ChatAgentLocation.Chat);
		for (const w of widgets) {
			this.widgetListeners.add(w.onDidChangeViewModel(() => this.updateActive()));
			this.widgetListeners.add(w.inputEditor.onDidFocusEditorText(() => this.updateActive()));
			this.widgetListeners.add(w.inputEditor.onDidBlurEditorText(() => this.updateActive()));
			// The session's unsent input, once typing pauses: an `input` event in its log, if it is observed.
			const report = this.widgetListeners.add(new RunOnceScheduler(() => this.reportInput(w), INPUT_SETTLE_MS));
			this.inputReports.push(report);
			this.widgetListeners.add(w.inputEditor.onDidChangeModelContent(() => report.schedule()));
			const resource = w.viewModel?.sessionResource;
			if (!resource || seen.has(resource) || !w.domNode.isConnected) {
				continue;
			}
			seen.set(resource, true);
			out.push({ resource, host: this.hostOf(w), windowKind: this.environmentService.isSessionsWindow ? 'agents' : 'editor', windowFocused: focused && w === last, inputFocused: focused && w.inputEditor.hasTextFocus() });
		}
		// The last-focused surface first.
		out.sort((a, b) => Number(b.windowFocused) - Number(a.windowFocused));
		if (JSON.stringify(out) !== JSON.stringify(this._active)) {
			this._active = out;
			this._onDidChangeActiveSessions.fire(out);
		}
	}

	private reportInput(w: IChatWidget): void {
		const resource = w.viewModel?.sessionResource;
		if (resource) {
			this.reportText(resource, w.inputEditor.getModel()?.getValue() ?? '');
		}
	}

	/**
	 * The free-form answer box of an open question or plan review is where the user writes their answer,
	 * so its text is the session's unsent input too, once typing pauses. When it closes, the chat input is again.
	 */
	private watchAnswerBox(model: ITextModel): void {
		const session = getChatQuestionAnswerSessionResource(model.uri);
		if (!session) {
			return;
		}
		const key = model.uri.toString();
		const store = new DisposableStore();
		const report = store.add(new RunOnceScheduler(() => this.reportText(session, model.getValue()), INPUT_SETTLE_MS));
		store.add(model.onDidChangeContent(() => report.schedule()));
		store.add(model.onWillDispose(() => {
			report.cancel();
			this.reportText(session, this.chatWidgetService.getWidgetBySessionResource(session)?.inputEditor.getModel()?.getValue() ?? '');
			this.answerBoxes.deleteAndDispose(key);
		}));
		this.answerBoxes.set(key, store);
	}

	private reportText(resource: URI, text: string): void {
		const log = this.logs.get(resource);
		if (!log || this.lastInput.get(resource) === text) {
			return;
		}
		this.lastInput.set(resource, text);
		void log.then(l => l.append([{ id: `input:${generateUuid()}`, at: Date.now(), kind: 'input', textLength: text.length, text }]), () => undefined);
	}

	// ---- navigation ----

	async openSession(resource: URI): Promise<void> {
		const existing = this.chatWidgetService.getWidgetBySessionResource(resource);
		if (existing) {
			await this.chatWidgetService.reveal(existing);
			return;
		}
		await this.chatWidgetService.openSession(resource);
	}

	async revealEvent(resource: URI, eventId: string): Promise<void> {
		await this.openSession(resource);
		const widget = this.chatWidgetService.getWidgetBySessionResource(resource);
		const log = await this.logs.get(resource);
		const event = log?.events.find(e => e.id === eventId);
		// The turn's request in the transcript: `req:<id>` from the chat model; an agent host's turn
		// id is the request's id as it is.
		const turnId = event?.turnId;
		const requestId = turnId?.startsWith('req:') ? turnId.slice(4) : eventId.startsWith('req:') ? eventId.slice(4) : turnId;
		const item = requestId ? widget?.viewModel?.getItems().find(i => i.id === requestId) : undefined;
		if (widget && item) {
			widget.reveal(item);
		} else {
			this.logService.info(`[sessionObserver] reveal ${eventId} in ${resource.toString()}: ${!widget ? 'no widget shows the session' : !event ? 'no such event' : 'its turn is not in the transcript'}`);
		}
	}

	async revealPromptAt(resource: URI, timestamp: number): Promise<void> {
		await this.openSession(resource);
		const widget = this.chatWidgetService.getWidgetBySessionResource(resource);
		// Where the timeline is shown, its own path: the prompt it draws the note under, revealed as choosing that prompt does.
		if (!widget || widget.getContrib<IChatWidgetContrib & IPromptTimelineReveal>(PROMPT_TIMELINE_CONTRIB_ID)?.revealPromptAt(timestamp)) {
			if (!widget) {
				this.logService.info(`[sessionObserver] reveal the prompt at ${timestamp} in ${resource.toString()}: no widget shows the session`);
			}
			return;
		}
		const requests = widget.viewModel?.getItems().filter(isRequestVM) ?? [];
		const prompt = requests.filter(r => r.timestamp <= timestamp).at(-1) ?? requests[0];
		if (prompt) {
			widget.reveal(prompt, 0);
		}
	}

	async openEditDiff(resource: URI, eventId: string): Promise<void> {
		const log = await this.logs.get(resource);
		const event = log?.events.find(e => e.id === eventId);
		if (event?.kind === 'edit') {
			await this.editorService.openEditor({ resource: event.uri });
		} else {
			await this.revealEvent(resource, eventId);
		}
	}
}
