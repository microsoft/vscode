/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

// A provider-neutral, append-only event log for every chat session (proposed API
// `chatSessionObserver`). Each provider has a transcript source that maps its native record
// into these events; a multiplexer serves the complete history plus live appends, with or
// without a widget open.

export type ChatSessionObservedStatus = 'working' | 'waiting' | 'question' | 'finished' | 'failed' | 'cancelled';

export interface IChatSessionFidelity {
	readonly reasoning: 'full' | 'summary' | 'none';
	readonly toolOutput: 'full' | 'truncated';
	readonly diffs: 'perEdit' | 'perTurn' | 'aggregate' | 'none';
	readonly timestamps: 'perEvent' | 'perTurn';
	readonly modelCalls: boolean;
	readonly liveWithoutWidget: boolean;
	readonly liveLatencyMs: number;
}

export interface IChatSessionObservedInfo {
	readonly resource: URI;
	readonly provider: string;
	readonly harness?: string;
	readonly title: string;
	readonly description?: string;
	readonly status: ChatSessionObservedStatus;
	readonly createdAt: number;
	readonly lastActivityAt: number;
	readonly lastRequestStartedAt?: number;
	readonly lastRequestEndedAt?: number;
	readonly readState: { readonly isRead: boolean; readonly lastReadAt?: number };
	readonly archived: boolean;
	readonly workspace?: { readonly folder?: URI; readonly worktree?: URI; readonly repositoryRoot?: URI };
	readonly repository?: { readonly remoteUrl: string; readonly owner?: string; readonly name?: string; readonly branch?: string; readonly baseBranch?: string; readonly head?: string };
	readonly pullRequest?: { readonly url: string; readonly number: number; readonly title?: string; readonly state?: string };
	readonly changes?: { readonly files: number; readonly insertions: number; readonly deletions: number };
	readonly model?: string;
	readonly mode?: string;
	readonly reasoningEffort?: string;
	readonly parent?: URI;
	readonly children?: readonly URI[];
	readonly capabilities: { readonly steering: boolean; readonly queueing: boolean; readonly inputSuggestions: boolean; readonly questions: boolean; readonly planReview: boolean };
	readonly fidelity: IChatSessionFidelity;
}

export interface IChatSessionContentRef {
	readonly id: string;
	readonly size: number;
}

export interface IChatSessionEventAttachment {
	readonly kind: 'file' | 'selection' | 'directory' | 'image' | 'symbol' | 'url' | 'promptFile' | 'other';
	readonly label: string;
	readonly uri?: URI;
	readonly range?: { readonly startLineNumber: number; readonly endLineNumber: number };
}

export type ChatSessionUserMessageOrigin = 'user' | 'system' | 'autopilot' | 'notification' | 'skill' | 'extension' | 'agent';

interface IChatSessionEventBase {
	readonly seq: number;
	readonly id: string;
	readonly at: number;
	readonly turnId?: string;
	readonly parentId?: string;
	readonly rawType?: string;
}

/** The facts of an event, without its envelope. */
export type ChatSessionEventData =
	| { readonly kind: 'turnStarted'; readonly trigger: 'user' | 'system' | 'autopilot' | 'steering' | 'queued' }
	| {
		readonly kind: 'userMessage'; readonly text: string; readonly origin: ChatSessionUserMessageOrigin;
		readonly submitKind?: 'send' | 'steer' | 'queue'; readonly attachments: readonly IChatSessionEventAttachment[];
		readonly model?: string; readonly mode?: string; readonly reasoningEffort?: string; readonly hiddenFromTranscript?: boolean;
	}
	| { readonly kind: 'agentText'; readonly text: string; readonly final: boolean }
	| { readonly kind: 'reasoning'; readonly text?: string; readonly availability: 'full' | 'summary' | 'redacted' | 'none'; readonly durationMs?: number }
	| { readonly kind: 'toolCall'; readonly callId: string; readonly name: string; readonly displayName?: string; readonly input: unknown; readonly contributor?: string; readonly message?: string }
	| { readonly kind: 'toolOutput'; readonly callId: string; readonly stream?: 'stdout' | 'stderr' | 'content'; readonly text?: string; readonly ref?: IChatSessionContentRef; readonly totalChars: number; readonly truncated: boolean }
	| { readonly kind: 'toolResult'; readonly callId: string; readonly status: 'completed' | 'failed' | 'cancelled' | 'denied' | 'timedOut'; readonly exitCode?: number; readonly durationMs?: number; readonly error?: string; readonly structured?: unknown }
	| { readonly kind: 'edit'; readonly callId?: string; readonly uri: URI; readonly operation: 'modify' | 'create' | 'delete' | 'rename'; readonly newUri?: URI; readonly before?: IChatSessionContentRef; readonly after?: IChatSessionContentRef; readonly unifiedDiff: string; readonly added: number; readonly removed: number }
	| { readonly kind: 'editDecision'; readonly uris: readonly URI[]; readonly decision: 'kept' | 'undone' | 'modifiedByUser' }
	| { readonly kind: 'question'; readonly questionId: string; readonly questions: readonly { readonly text: string; readonly kind: 'single' | 'multi' | 'text'; readonly options?: readonly string[] }[] }
	| { readonly kind: 'questionAnswer'; readonly questionId: string; readonly answers: readonly { readonly selected?: readonly string[]; readonly text?: string }[]; readonly actor: 'user' | 'auto' }
	| { readonly kind: 'planReview'; readonly reviewId: string; readonly title: string; readonly plan: string; readonly planUri?: URI; readonly actions: readonly string[]; readonly canProvideFeedback: boolean }
	| { readonly kind: 'planReviewDecision'; readonly reviewId: string; readonly action: string; readonly feedback?: string }
	| { readonly kind: 'permission'; readonly permissionId: string; readonly callId?: string; readonly title: string; readonly detail?: string; readonly options?: readonly string[] }
	| { readonly kind: 'permissionDecision'; readonly permissionId: string; readonly decision: 'allowed' | 'denied' | 'auto'; readonly option?: string }
	| { readonly kind: 'todos'; readonly items: readonly { readonly id: string; readonly title: string; readonly status: 'not-started' | 'in-progress' | 'completed' }[] }
	| { readonly kind: 'subagentStarted'; readonly childSession?: URI; readonly name: string; readonly description?: string; readonly callId?: string }
	| { readonly kind: 'subagentEnded'; readonly childSession?: URI; readonly callId?: string; readonly status: 'completed' | 'failed' | 'cancelled'; readonly summary?: string }
	| { readonly kind: 'compaction'; readonly summary: string; readonly coversThroughSeq: number; readonly trigger: 'auto' | 'manual' }
	| { readonly kind: 'modelCall'; readonly model: string; readonly reasoningEffort?: string; readonly inputTokens?: number; readonly outputTokens?: number }
	| { readonly kind: 'modelChanged'; readonly model: string; readonly reasoningEffort?: string }
	| { readonly kind: 'modeChanged'; readonly mode: string }
	| { readonly kind: 'notification'; readonly text: string; readonly source: string }
	| { readonly kind: 'pullRequest'; readonly url: string; readonly number: number; readonly title?: string; readonly action: 'opened' | 'updated' | 'linked' }
	| { readonly kind: 'error'; readonly message: string; readonly code?: string; readonly details?: string; readonly resumable?: boolean }
	| { readonly kind: 'turnEnded'; readonly outcome: 'completed' | 'needsInput' | 'cancelled' | 'failed'; readonly cancelledBy?: 'user' | 'system'; readonly reason?: string }
	| { readonly kind: 'pending'; readonly items: readonly { readonly id: string; readonly kind: 'queued' | 'steering'; readonly text: string; readonly at: number }[] }
	| { readonly kind: 'input'; readonly textLength: number; readonly text?: string }
	| { readonly kind: 'transcriptVisibility'; readonly visible: boolean };

export type IChatSessionEvent = IChatSessionEventBase & ChatSessionEventData;
/** What a source emits; the multiplexer numbers events (`seq`). */
export type IChatSessionEventInput = Omit<IChatSessionEventBase, 'seq'> & ChatSessionEventData;

export interface IChatSessionTranscript extends IDisposable {
	readonly info: IChatSessionObservedInfo;
	readonly events: readonly IChatSessionEvent[];
	readonly onDidAppend: Event<readonly IChatSessionEvent[]>;
	readonly onDidChangeInfo: Event<IChatSessionObservedInfo>;
	fetchContent(ref: IChatSessionContentRef): Promise<string>;
}

export interface IChatSessionsObservedChangeEvent {
	readonly added: readonly IChatSessionObservedInfo[];
	readonly removed: readonly URI[];
	readonly changed: readonly IChatSessionObservedInfo[];
}

export type ActiveChatSessionHost = 'chatView' | 'chatEditor' | 'quickChat' | 'agentsWindow' | 'inbox';

export interface IActiveChatSession {
	readonly resource: URI;
	readonly host: ActiveChatSessionHost;
	readonly windowKind: 'editor' | 'agents';
	readonly windowFocused: boolean;
	readonly inputFocused: boolean;
}

export interface IChatSessionTranscriptSink {
	append(events: readonly IChatSessionEventInput[]): void;
	/** Fields the source knows better than the session list (status, model, PR, fidelity...). */
	patchInfo(patch: Partial<Omit<IChatSessionObservedInfo, 'resource'>>): void;
	storeContent(text: string): IChatSessionContentRef;
}

/**
 * A provider's transcript source: maps the provider's native record of a session, losslessly
 * where it can, and declares what it can't supply in the session's fidelity.
 */
export interface IChatSessionTranscriptSource {
	readonly id: string;
	/** Higher wins when several sources can observe a session. */
	readonly priority: number;
	canObserve(resource: URI): boolean;
	/** Loads the full history into the sink, then keeps appending live events until disposed. */
	observe(resource: URI, sink: IChatSessionTranscriptSink): Promise<IDisposable>;
}

/** A session list beside the agent sessions model (the Agents Window's own), merged into `getSessions`. */
export interface IChatSessionObservedList {
	readonly onDidChange: Event<void>;
	getSessions(): readonly IChatSessionObservedInfo[];
}

export const IChatSessionObserverService = createDecorator<IChatSessionObserverService>('chatSessionObserverService');

export interface IChatSessionObserverService {
	readonly _serviceBrand: undefined;

	getSessions(activeSince?: number): Promise<readonly IChatSessionObservedInfo[]>;
	readonly onDidChangeSessions: Event<IChatSessionsObservedChangeEvent>;
	/** Ref-counted: every observation of a session shares one log. */
	observe(resource: URI): Promise<IChatSessionTranscript>;
	registerSource(source: IChatSessionTranscriptSource): IDisposable;
	/** Adds sessions a window lists outside the agent sessions model. */
	registerSessionList(list: IChatSessionObservedList): IDisposable;

	readonly activeSessions: readonly IActiveChatSession[];
	readonly onDidChangeActiveSessions: Event<readonly IActiveChatSession[]>;

	openSession(resource: URI): Promise<void>;
	revealEvent(resource: URI, eventId: string): Promise<void>;
	/** Opens the session and reveals the prompt its timeline shows a note written at `timestamp` under. */
	revealPromptAt(resource: URI, timestamp: number): Promise<void>;
	openEditDiff(resource: URI, eventId: string): Promise<void>;
}

// ---- N2: input suggestions (proposed API `chatInputSuggestion`) -----------------------------

export interface IChatInputSuggestion {
	readonly id: string;
	readonly validForTurn?: string;
	readonly text?: string;
	readonly answer?: { readonly questionId?: string; readonly reviewId?: string; readonly selectedOptions?: readonly string[]; readonly freeform?: string };
}

export type ChatInputSuggestionState = 'shown' | 'hidden' | 'accepted' | 'partiallyAccepted' | 'rejected' | 'superseded' | 'invalidated';

export interface IChatInputSuggestionEvent {
	readonly id: string;
	readonly session: URI;
	readonly owner: string;
	readonly state: ChatInputSuggestionState;
	readonly acceptedChars?: number;
	/** For an answer: the options the user picked when it was accepted. */
	readonly selectedOptions?: readonly string[];
	readonly host: ActiveChatSessionHost;
	readonly reason?: string;
}

export interface IChatRequestSubmission {
	readonly session: URI;
	readonly requestId: string;
	readonly text: string;
	readonly kind: 'send' | 'steer' | 'queue' | 'answer' | 'planDecision';
	readonly host: ActiveChatSessionHost;
	readonly fromSuggestion?: { readonly id: string; readonly owner: string; readonly acceptedChars: number };
	readonly fromDraft?: { readonly id: string; readonly owner: string };
}

export const IChatInputSuggestionService = createDecorator<IChatInputSuggestionService>('chatInputSuggestionService');

export interface IChatInputSuggestionService {
	readonly _serviceBrand: undefined;
	/**
	 * One suggestion per session; the latest owner (extension id) to set one wins. Returns false when it
	 * kept what the session's inputs offer instead, so as never to drop what the user typed.
	 */
	setSuggestion(owner: string, session: URI, suggestion: IChatInputSuggestion | undefined): boolean;
	getSuggestion(session: URI): (IChatInputSuggestion & { readonly owner: string }) | undefined;
	readonly onDidChangeSuggestions: Event<URI>;
	readonly onDidChangeSuggestionState: Event<IChatInputSuggestionEvent>;
	readonly onDidSubmitRequest: Event<IChatRequestSubmission>;
	reportState(session: URI, id: string, state: ChatInputSuggestionState, host: ActiveChatSessionHost, details?: { acceptedChars?: number; reason?: string }): void;
	/**
	 * A question carousel or plan review was answered: reports it as a submission, and as an
	 * accepted suggestion when it picked exactly the suggested options or kept its free-form text.
	 */
	reportAnswer(session: URI, answer: { readonly kind: 'answer' | 'planDecision'; readonly selected: readonly string[]; readonly text: string }): void;
	/** An open question carousel or plan review takes the session's answer while it is shown; the chat input defers to it. */
	claimAnswerSurface(session: URI): IDisposable;
	/** An answer surface showed the suggestion (a marked option, a placeholder) or inserted its free-form text. */
	reportAnswerInteraction(session: URI, state: 'shown' | 'accepted', acceptedChars?: number): void;
}

// ---- N5: annotations on a session's timeline (proposed API `chatSessionAnnotations`) ----------

/** A note at a moment of a session (e.g. a progress digest), drawn on its prompt timeline. */
export interface IChatSessionAnnotation {
	readonly id: string;
	readonly timestamp: number;
	readonly label: string;
	readonly detail?: IMarkdownString;
	readonly icon?: ThemeIcon;
}

export const IChatSessionAnnotationService = createDecorator<IChatSessionAnnotationService>('chatSessionAnnotationService');

export interface IChatSessionAnnotationService {
	readonly _serviceBrand: undefined;
	/** Replaces one owner's (extension host's) annotations on a session. */
	setAnnotations(owner: string, session: URI, annotations: readonly IChatSessionAnnotation[]): void;
	/** Every owner's annotations on a session, oldest first. */
	getAnnotations(session: URI): readonly IChatSessionAnnotation[];
	clearOwner(owner: string): void;
	readonly onDidChangeAnnotations: Event<URI>;
}

/** The newest note on a session or any of its chats, e.g. its latest progress digest, for the session's hover. */
export function getLatestChatSessionAnnotation(service: IChatSessionAnnotationService | undefined, ...resources: (URI | undefined)[]): IChatSessionAnnotation | undefined {
	let latest: IChatSessionAnnotation | undefined;
	for (const resource of resources) {
		for (const a of resource && service ? service.getAnnotations(resource) : []) {
			if (!latest || a.timestamp > latest.timestamp) {
				latest = a;
			}
		}
	}
	return latest;
}

// ---- N6: calling the user to a session (proposed API `chatSessionAttention`) ------------------

/** A mark on a session's row in the sessions lists, e.g. for a draft waiting to be reviewed. */
export interface IChatSessionAttention {
	readonly icon: ThemeIcon;
	readonly tooltip: string;
}

/**
 * The marks extensions set on sessions, per owner (extension host). A registry rather than a
 * service so the sessions lists' renderers read it without another dependency.
 */
class ChatSessionAttentionRegistry {
	private readonly bySession = new ResourceMap<Map<string, IChatSessionAttention>>();
	private readonly _onDidChange = new Emitter<URI>();
	readonly onDidChange = this._onDidChange.event;

	set(owner: string, session: URI, attention: IChatSessionAttention | undefined): void {
		let owners = this.bySession.get(session);
		if (!attention) {
			if (!owners?.delete(owner)) {
				return;
			}
			if (!owners.size) {
				this.bySession.delete(session);
			}
		} else {
			if (!owners) {
				owners = new Map();
				this.bySession.set(session, owners);
			}
			owners.set(owner, attention);
		}
		this._onDidChange.fire(session);
	}

	/** The newest mark on any of the given resources (a session and its chats). */
	get(...resources: (URI | undefined)[]): IChatSessionAttention | undefined {
		for (const resource of resources) {
			const owners = resource && this.bySession.get(resource);
			if (owners?.size) {
				return [...owners.values()].at(-1);
			}
		}
		return undefined;
	}

	clearOwner(owner: string): void {
		for (const [session, owners] of [...this.bySession]) {
			if (owners.delete(owner)) {
				if (!owners.size) {
					this.bySession.delete(session);
				}
				this._onDidChange.fire(session);
			}
		}
	}
}

export const chatSessionAttentionRegistry = new ChatSessionAttentionRegistry();

export interface IChatSessionNotification {
	readonly title?: string;
	readonly body: string;
}

export interface IChatSessionNotificationResult {
	readonly shown: boolean;
	readonly reason?: 'windowFocused' | 'off';
	/** Settles once the toast is gone: whether it was clicked. */
	readonly clicked: Promise<boolean>;
}

export const IChatSessionAttentionService = createDecorator<IChatSessionAttentionService>('chatSessionAttentionService');
export interface IChatSessionAttentionService {
	readonly _serviceBrand: undefined;
	/**
	 * Calls the user to a session from outside VS Code through the path a session that needs input
	 * takes: window attention (taskbar flash, dock badge) and an OS toast that opens the session.
	 * One toast per owner and session at a time: a newer one replaces it.
	 */
	notify(owner: string, session: URI, notification: IChatSessionNotification): Promise<IChatSessionNotificationResult>;
	/** Withdraws an owner's toasts (the extension host ended). */
	clearOwner(owner: string): void;
}

// ---- N3: drafts (proposed API `chatDraftRequests`) -------------------------------------------

export interface IChatDraftRequest {
	readonly id: string;
	readonly owner: string;
	readonly session: URI;
	readonly text: string;
	readonly label: string;
	readonly detail?: string;
	readonly warning?: string;
	readonly createdAt: number;
}

export type ChatDraftOutcome = 'steered' | 'queued' | 'sent' | 'discarded' | 'expired';

export interface IChatDraftResolution {
	readonly draft: IChatDraftRequest;
	readonly outcome: ChatDraftOutcome;
	readonly finalText?: string;
	readonly edited: boolean;
	readonly reason?: string;
	readonly requestId?: string;
}

export const IChatDraftRequestService = createDecorator<IChatDraftRequestService>('chatDraftRequestService');

export interface IChatDraftRequestService {
	readonly _serviceBrand: undefined;
	/** Adds the owner's draft for the session, replacing the owner's previous one there. */
	setDraft(draft: IChatDraftRequest): void;
	updateDraft(id: string, patch: Partial<Pick<IChatDraftRequest, 'text' | 'label' | 'detail' | 'warning'>>): void;
	resolveDraft(id: string, outcome: ChatDraftOutcome, details?: { finalText?: string; edited?: boolean; reason?: string; requestId?: string }): void;
	getDrafts(session: URI): readonly IChatDraftRequest[];
	getDraft(id: string): IChatDraftRequest | undefined;
	readonly onDidChangeDrafts: Event<URI>;
	readonly onDidChangeDraftState: Event<{ readonly draft: IChatDraftRequest; readonly state: 'shown' | 'hidden' | 'editing'; readonly host: ActiveChatSessionHost }>;
	readonly onDidResolveDraft: Event<IChatDraftResolution>;
	reportDraftState(id: string, state: 'shown' | 'hidden' | 'editing', host: ActiveChatSessionHost): void;
	/** The draft the user moved into a session's input to edit, until it is sent or abandoned. */
	editingDraft(session: URI): IChatDraftRequest | undefined;
	/** Marks a draft as about to be submitted as is (Steer Now, Queue); the submission resolves it. */
	stageForSubmit(id: string): void;
}

// ---- N4: panels beside the active session (proposed API `chatSessionPanel`) --------------------

export interface IChatSessionPanelDescriptor {
	readonly id: string;
	readonly title: string;
	/** A codicon id, e.g. `pulse`. */
	readonly icon?: string;
	readonly extensionId: string;
}

/**
 * The panels extensions contribute. Editor windows show them as views beside the Chat view;
 * the Agents Window shows them as side-pane tabs (its side pane is an editor group).
 */
class ChatSessionPanelRegistry {
	private readonly panels = new Map<string, IChatSessionPanelDescriptor>();
	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = this._onDidChange.event;

	register(panel: IChatSessionPanelDescriptor): IDisposable {
		this.panels.set(panel.id, panel);
		this._onDidChange.fire();
		return toDisposable(() => {
			if (this.panels.get(panel.id) === panel) {
				this.panels.delete(panel.id);
				this._onDidChange.fire();
			}
		});
	}

	get(id: string): IChatSessionPanelDescriptor | undefined {
		return this.panels.get(id);
	}

	all(): readonly IChatSessionPanelDescriptor[] {
		return [...this.panels.values()];
	}
}

export const chatSessionPanelRegistry = new ChatSessionPanelRegistry();
