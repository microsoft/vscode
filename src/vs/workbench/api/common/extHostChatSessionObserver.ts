/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { revive } from '../../../base/common/marshalling.js';
import { URI } from '../../../base/common/uri.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ExtHostChatSessionObserverShape, IMainContext, MainContext, MainThreadChatSessionObserverShape } from './extHost.protocol.js';
import { ChatSessionNotificationSkipReason, Range } from './extHostTypes.js';
import * as typeConvert from './extHostTypeConverters.js';
import { ExtHostWebviewViews } from './extHostWebviewView.js';

// The internal model uses strings; the API uses enums whose values are the 1-based position
// of each string here (the order of the members in the proposal's enum).

const EVENT_KIND = ['turnStarted', 'userMessage', 'agentText', 'reasoning', 'toolCall', 'toolOutput', 'toolResult', 'edit', 'editDecision', 'question', 'questionAnswer', 'planReview', 'planReviewDecision', 'permission', 'permissionDecision', 'todos', 'subagentStarted', 'subagentEnded', 'compaction', 'modelCall', 'modelChanged', 'modeChanged', 'notification', 'pullRequest', 'error', 'turnEnded', 'pending', 'input', 'transcriptVisibility'];
const STATUS = ['working', 'waiting', 'question', 'finished', 'failed', 'cancelled'];
const FIDELITY = {
	reasoning: ['full', 'summary', 'none'],
	toolOutput: ['full', 'truncated'],
	diffs: ['perEdit', 'perTurn', 'aggregate', 'none'],
	timestamps: ['perEvent', 'perTurn'],
};
const ATTACHMENT_KIND = ['file', 'selection', 'directory', 'image', 'symbol', 'url', 'promptFile', 'other'];
const HOST = ['chatView', 'chatEditor', 'quickChat', 'agentsWindow', 'inbox'];
const WINDOW_KIND = ['editor', 'agents'];
const SUGGESTION_STATE = ['shown', 'hidden', 'accepted', 'partiallyAccepted', 'rejected', 'superseded', 'invalidated'];
const SUBMISSION_KIND = ['send', 'steer', 'queue', 'answer', 'planDecision'];
const DRAFT_STATE = ['shown', 'hidden', 'editing'];
const DRAFT_OUTCOME = ['steered', 'queued', 'sent', 'discarded', 'expired'];

/** Per event kind: which fields are enums, and their tables. `[]` marks an array of objects. */
const EVENT_FIELDS: Record<string, Record<string, readonly string[] | { each: string; table: readonly string[] }>> = {
	turnStarted: { trigger: ['user', 'system', 'autopilot', 'steering', 'queued'] },
	userMessage: { origin: ['user', 'system', 'autopilot', 'notification', 'skill', 'extension', 'agent'], submitKind: ['send', 'steer', 'queue'], attachments: { each: 'kind', table: ATTACHMENT_KIND } },
	reasoning: { availability: ['full', 'summary', 'redacted', 'none'] },
	toolOutput: { stream: ['stdout', 'stderr', 'content'] },
	toolResult: { status: ['completed', 'failed', 'cancelled', 'denied', 'timedOut'] },
	edit: { operation: ['modify', 'create', 'delete', 'rename'] },
	editDecision: { decision: ['kept', 'undone', 'modifiedByUser'] },
	question: { questions: { each: 'kind', table: ['single', 'multi', 'text'] } },
	questionAnswer: { actor: ['user', 'auto'] },
	permissionDecision: { decision: ['allowed', 'denied', 'auto'] },
	todos: { items: { each: 'status', table: ['not-started', 'in-progress', 'completed'] } },
	subagentEnded: { status: ['completed', 'failed', 'cancelled'] },
	compaction: { trigger: ['auto', 'manual'] },
	pullRequest: { action: ['opened', 'updated', 'linked'] },
	turnEnded: { outcome: ['completed', 'needsInput', 'cancelled', 'failed'], cancelledBy: ['user', 'system'] },
	pending: { items: { each: 'kind', table: ['queued', 'steering'] } },
};

function enumOf(table: readonly string[], value: unknown): number | undefined {
	const i = typeof value === 'string' ? table.indexOf(value) : -1;
	return i >= 0 ? i + 1 : undefined;
}


export function toApiEvent(raw: unknown): vscode.ChatSessionEvent {
	const e = { ...(revive(raw) as Record<string, unknown>) };
	const kind = e.kind as string;
	for (const [field, spec] of Object.entries(EVENT_FIELDS[kind] ?? {})) {
		const value = e[field];
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(spec)) {
			e[field] = enumOf(spec, value);
		} else if (Array.isArray(value)) {
			const { each, table } = spec as { each: string; table: readonly string[] };
			e[field] = value.map((item: Record<string, unknown>) => ({ ...item, [each]: enumOf(table, item[each]) }));
		}
	}
	if (kind === 'userMessage' && Array.isArray(e.attachments)) {
		e.attachments = (e.attachments as Record<string, unknown>[]).map(a => {
			const r = a.range as { startLineNumber: number; endLineNumber: number } | undefined;
			return r ? { ...a, range: new Range(r.startLineNumber - 1, 0, r.endLineNumber - 1, 0) } : a;
		});
	}
	e.kind = enumOf(EVENT_KIND, kind);
	return Object.freeze(e) as unknown as vscode.ChatSessionEvent;
}

export function toApiInfo(raw: unknown): vscode.ChatSessionInfo {
	const i = { ...(revive(raw) as Record<string, unknown>) };
	i.status = enumOf(STATUS, i.status);
	const f = i.fidelity as Record<string, unknown> | undefined;
	if (f) {
		i.fidelity = {
			...f,
			reasoning: enumOf(FIDELITY.reasoning, f.reasoning),
			toolOutput: enumOf(FIDELITY.toolOutput, f.toolOutput),
			diffs: enumOf(FIDELITY.diffs, f.diffs),
			timestamps: enumOf(FIDELITY.timestamps, f.timestamps),
		};
	}
	return Object.freeze(i) as unknown as vscode.ChatSessionInfo;
}

function toApiActive(raw: unknown): vscode.ActiveChatSession {
	const a = { ...(revive(raw) as Record<string, unknown>) };
	a.host = enumOf(HOST, a.host);
	a.windowKind = enumOf(WINDOW_KIND, a.windowKind);
	return Object.freeze(a) as unknown as vscode.ActiveChatSession;
}

function hostOf(value: unknown): vscode.ChatSessionHost {
	return (enumOf(HOST, value) ?? 1) as vscode.ChatSessionHost;
}

class Observation extends Disposable implements vscode.ChatSessionObservation {
	readonly events: vscode.ChatSessionEvent[];
	readonly _onDidReceiveEvents = this._register(new Emitter<readonly vscode.ChatSessionEvent[]>());
	readonly onDidReceiveEvents = this._onDidReceiveEvents.event;
	readonly _onDidChangeInfo = this._register(new Emitter<vscode.ChatSessionInfo>());
	readonly onDidChangeInfo = this._onDidChangeInfo.event;

	constructor(public info: vscode.ChatSessionInfo, events: vscode.ChatSessionEvent[], private readonly fetch: (ref: vscode.ChatSessionContentRef) => Thenable<string>, private readonly onDispose: () => void) {
		super();
		this.events = events;
	}

	fetchContent(ref: vscode.ChatSessionContentRef): Thenable<string> {
		return this.fetch(ref);
	}

	override dispose(): void {
		this.onDispose();
		super.dispose();
	}
}

interface IDraftEntry {
	readonly state: Emitter<vscode.ChatDraftRequestStateChange>;
	readonly end: Emitter<vscode.ChatDraftRequestResolution>;
}

export class ExtHostChatSessionObserver implements ExtHostChatSessionObserverShape {
	private readonly proxy: MainThreadChatSessionObserverShape;
	private readonly observations = new Map<number, Observation>();
	private nextHandle = 1;
	private active: readonly vscode.ActiveChatSession[] = [];
	private started: Promise<void> | undefined;

	private readonly _onDidChangeChatSessions = new Emitter<vscode.ChatSessionsChangeEvent>({ onWillAddFirstListener: () => void this.start() });
	readonly onDidChangeChatSessions = this._onDidChangeChatSessions.event;
	private readonly _onDidChangeActiveChatSessions = new Emitter<readonly vscode.ActiveChatSession[]>({ onWillAddFirstListener: () => void this.start() });
	readonly onDidChangeActiveChatSessions = this._onDidChangeActiveChatSessions.event;
	private readonly _onDidChangeChatInputSuggestion = new Emitter<vscode.ChatInputSuggestionEvent>();
	readonly onDidChangeChatInputSuggestion = this._onDidChangeChatInputSuggestion.event;
	private readonly _onDidSendChatRequest = new Emitter<vscode.ChatRequestSubmission>();
	readonly onDidSendChatRequest = this._onDidSendChatRequest.event;
	private readonly drafts = new Map<string, IDraftEntry>();

	constructor(mainContext: IMainContext, private readonly webviewViews: ExtHostWebviewViews) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadChatSessionObserver);
	}

	private start(): Promise<void> {
		this.started ??= this.proxy.$startListening().then(active => {
			this.active = active.map(toApiActive);
		});
		return this.started;
	}

	// ---- chatSessionObserver ----

	async getChatSessions(filter?: { readonly activeSince?: number }): Promise<readonly vscode.ChatSessionInfo[]> {
		void this.start();
		return (await this.proxy.$getChatSessions(filter?.activeSince)).map(toApiInfo);
	}

	async observeChatSession(resource: vscode.Uri, options?: { readonly fromSeq?: number }): Promise<vscode.ChatSessionObservation> {
		const handle = this.nextHandle++;
		const { info, events } = await this.proxy.$observeChatSession(handle, resource, options?.fromSeq);
		const obs = new Observation(toApiInfo(info), events.map(toApiEvent), ref => this.proxy.$fetchContent(handle, ref), () => {
			this.observations.delete(handle);
			this.proxy.$disposeObservation(handle);
		});
		this.observations.set(handle, obs);
		return obs;
	}

	get activeChatSessions(): readonly vscode.ActiveChatSession[] {
		void this.start();
		return this.active;
	}

	openChatSession(resource: vscode.Uri): Thenable<void> {
		return this.proxy.$openChatSession(resource);
	}

	revealChatSessionEvent(resource: vscode.Uri, eventId: string): Thenable<void> {
		return this.proxy.$revealChatSessionEvent(resource, eventId);
	}

	openChatSessionEditDiff(resource: vscode.Uri, eventId: string): Thenable<void> {
		return this.proxy.$openChatSessionEditDiff(resource, eventId);
	}

	$onDidChangeChatSessions(e: unknown): void {
		const ev = revive(e) as { added: unknown[]; removed: vscode.Uri[]; changed: unknown[] };
		this._onDidChangeChatSessions.fire({ added: ev.added.map(toApiInfo), removed: ev.removed, changed: ev.changed.map(toApiInfo) });
	}

	$onDidChangeActiveChatSessions(active: unknown[]): void {
		this.active = Object.freeze(active.map(toApiActive));
		this._onDidChangeActiveChatSessions.fire(this.active);
	}

	$onDidAppend(handle: number, events: unknown[]): void {
		const obs = this.observations.get(handle);
		if (obs) {
			const mapped = events.map(toApiEvent);
			obs.events.push(...mapped);
			obs._onDidReceiveEvents.fire(mapped);
		}
	}

	$onDidChangeInfo(handle: number, info: unknown): void {
		const obs = this.observations.get(handle);
		if (obs) {
			obs.info = toApiInfo(info);
			obs._onDidChangeInfo.fire(obs.info);
		}
	}

	// ---- chatSessionAnnotations ----

	setChatSessionAnnotations(session: vscode.Uri, annotations: readonly vscode.ChatSessionAnnotation[]): void {
		this.proxy.$setChatSessionAnnotations(session, annotations.map(a => ({
			id: a.id, timestamp: a.timestamp, label: a.label,
			...(a.detail ? { detail: typeConvert.MarkdownString.from(a.detail) } : {}),
			...(a.icon ? { icon: a.icon.id } : {}),
		})));
	}

	revealChatSessionPromptAt(session: vscode.Uri, timestamp: number): Thenable<void> {
		return this.proxy.$revealChatSessionPromptAt(session, timestamp);
	}

	getChatLinkTooltips(hrefs: readonly string[]): Thenable<string[]> {
		return this.proxy.$getChatLinkTooltips([...hrefs]);
	}

	// ---- chatSessionAttention ----

	setChatSessionAttention(session: vscode.Uri, attention: vscode.ChatSessionAttention | undefined): void {
		this.proxy.$setChatSessionAttention(session, attention && { icon: attention.icon.id, tooltip: attention.tooltip });
	}

	private notificationHandle = 0;
	private readonly notificationClicks = new Map<number, (clicked: boolean) => void>();

	async notifyChatSession(session: vscode.Uri, notification: vscode.ChatSessionNotification): Promise<vscode.ChatSessionNotificationResult> {
		const handle = ++this.notificationHandle;
		const clicked = new Promise<boolean>(resolve => this.notificationClicks.set(handle, resolve));
		const result = await this.proxy.$notifyChatSession(session, { ...(notification.title ? { title: notification.title } : {}), body: notification.body }, handle);
		if (!result.shown) {
			this.$onDidSettleChatSessionNotification(handle, false);
		}
		const reason = result.reason === 'windowFocused' ? ChatSessionNotificationSkipReason.WindowFocused : result.reason === 'off' ? ChatSessionNotificationSkipReason.Off : undefined;
		return { shown: result.shown, ...(reason ? { reason } : {}), clicked };
	}

	$onDidSettleChatSessionNotification(handle: number, clicked: boolean): void {
		this.notificationClicks.get(handle)?.(clicked);
		this.notificationClicks.delete(handle);
	}

	// ---- chatInputSuggestion ----

	setChatInputSuggestion(session: vscode.Uri, suggestion: vscode.ChatInputSuggestion | undefined): Promise<boolean> {
		return this.proxy.$setChatInputSuggestion(session, suggestion ? {
			id: suggestion.id,
			...(suggestion.validForTurn ? { validForTurn: suggestion.validForTurn } : {}),
			...(suggestion.text !== undefined ? { text: suggestion.text } : {}),
			...(suggestion.answer ? { answer: { ...suggestion.answer, ...(suggestion.answer.selectedOptions ? { selectedOptions: [...suggestion.answer.selectedOptions] } : {}) } } : {}),
		} : undefined);
	}

	$onDidChangeChatInputSuggestion(e: unknown): void {
		const ev = revive(e) as Record<string, unknown>;
		this._onDidChangeChatInputSuggestion.fire({
			id: ev.id as string, session: ev.session as vscode.Uri,
			state: (enumOf(SUGGESTION_STATE, ev.state) ?? 2) as vscode.ChatInputSuggestionState,
			host: hostOf(ev.host),
			...(typeof ev.acceptedChars === 'number' ? { acceptedChars: ev.acceptedChars } : {}),
			...(Array.isArray(ev.selectedOptions) ? { selectedOptions: ev.selectedOptions as string[] } : {}),
			...(typeof ev.reason === 'string' ? { reason: ev.reason } : {}),
		});
	}

	$onDidSubmitChatRequest(e: unknown): void {
		const ev = revive(e) as Record<string, unknown> & { fromSuggestion?: { id: string; acceptedChars: number }; fromDraft?: { id: string } };
		this._onDidSendChatRequest.fire({
			session: ev.session as vscode.Uri, requestId: ev.requestId as string, text: ev.text as string,
			kind: (enumOf(SUBMISSION_KIND, ev.kind) ?? 1) as vscode.ChatRequestSubmissionKind,
			host: hostOf(ev.host),
			...(ev.fromSuggestion ? { fromSuggestion: { id: ev.fromSuggestion.id, acceptedChars: ev.fromSuggestion.acceptedChars } } : {}),
			...(ev.fromDraft ? { fromDraft: { id: ev.fromDraft.id } } : {}),
		});
	}

	// ---- chatDraftRequests ----

	addChatDraftRequest(session: vscode.Uri, draft: vscode.ChatDraftRequest): vscode.ChatDraftRequestHandle {
		const entry: IDraftEntry = { state: new Emitter(), end: new Emitter() };
		this.drafts.set(draft.id, entry);
		this.proxy.$addChatDraftRequest(session, { id: draft.id, text: draft.text, label: draft.label, ...(draft.detail ? { detail: draft.detail } : {}), ...(draft.warning ? { warning: draft.warning } : {}) });
		let disposed = false;
		return {
			id: draft.id,
			update: patch => this.proxy.$updateChatDraftRequest(draft.id, { ...patch }),
			onDidChangeState: entry.state.event,
			onDidEnd: entry.end.event,
			dispose: () => {
				if (!disposed) {
					disposed = true;
					this.proxy.$disposeChatDraftRequest(draft.id);
					this.drafts.delete(draft.id);
					entry.state.dispose();
					entry.end.dispose();
				}
			},
		};
	}

	$onDidChangeDraftState(id: string, state: string, host: string): void {
		this.drafts.get(id)?.state.fire({ state: (enumOf(DRAFT_STATE, state) ?? 1) as vscode.ChatDraftRequestState, host: hostOf(host) });
	}

	$onDidResolveDraft(id: string, resolution: { outcome: string; finalText?: string; edited: boolean; reason?: string; requestId?: string }): void {
		const d = this.drafts.get(id);
		if (d) {
			d.end.fire({ ...resolution, outcome: (enumOf(DRAFT_OUTCOME, resolution.outcome) ?? 5) as vscode.ChatDraftRequestOutcome });
			this.drafts.delete(id);
		}
	}

	// ---- chatSessionPanel ----

	registerChatSessionPanelProvider(extension: IExtensionDescription, id: string, provider: vscode.ChatSessionPanelProvider, options?: { readonly webviewOptions?: { readonly retainContextWhenHidden?: boolean } }): vscode.Disposable {
		const store = new DisposableStore();
		const current = (): URI | undefined => (this.active.find(x => x.windowFocused) ?? this.active[0])?.resource;
		store.add(this.webviewViews.registerWebviewViewProvider(extension, id, {
			resolveWebviewView: async (webviewView, _ctx, token) => {
				await this.start();
				const onDidChangeSession = new Emitter<vscode.Uri | undefined>();
				let session = current();
				const listener = this.onDidChangeActiveChatSessions(() => {
					const next = current();
					if (next?.toString() !== session?.toString()) {
						session = next;
						onDidChangeSession.fire(next);
					}
				});
				webviewView.onDidDispose(() => {
					listener.dispose();
					onDidChangeSession.dispose();
				});
				const panel: vscode.ChatSessionPanel = {
					webviewView,
					get session() { return session; },
					onDidChangeSession: onDidChangeSession.event,
					// Carried by the view's badge: a dot in the Agents Window, the badge in editor windows.
					get hasUpdates() { return !!webviewView.badge; },
					set hasUpdates(value) { webviewView.badge = value ? { value: 1, tooltip: 'New updates' } : undefined; },
				};
				return provider.resolveChatSessionPanel(panel, token ?? CancellationToken.None);
			},
		}, options?.webviewOptions));
		return toDisposable(() => store.dispose());
	}
}

