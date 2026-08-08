/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { alert as ariaAlert } from '../../../../../base/browser/ui/aria/aria.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ChatRequestQueueKind, ChatSendResult, IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionHistoryItem, IChatSessionsService } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { heuristicScore, IRoutableSession, isHighConfidenceSessionRoute, ISessionRouteResult, ISessionRouter, ROUTER_FIELD_CLIP_LENGTH } from '../../common/sessionRouter.js';
import { AgentSessionProviders, AgentSessionTarget } from '../agentSessions/agentSessions.js';
import { IAgentHostNewSessionFolderService } from '../agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentSession, AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { parseExplicitNewSessionRequest, resolveNewSessionWorkspaceFolder, ROUTE_ENRICH_MAX_CANDIDATES, selectBestSessionRoute, selectRouterShortlist } from './chatSessionRoutingHelpers.js';

import './media/chatSessionRouting.css';

/** Maximum number of high-confidence session options shown in the destination picker. */
const ROUTE_MAX_CHOICES = 6;

/**
 * How long the pending-send badge counts down before auto-dispatching to the
 * routed target. Long enough to read the target and intervene, short enough to
 * keep a hands-free/voice flow moving.
 */
const ROUTE_AUTOSEND_DELAY_MS = 10000;

/** Resolved destination for a submitted request: an existing session or a new one. */
type PendingTarget =
	| { readonly kind: 'session'; readonly sessionId: string; readonly label: string; readonly confidence: number }
	| NewSessionTarget;

type NewSessionTarget = {
	readonly kind: 'new';
	readonly label: string;
	readonly folder?: URI;
};

interface IDispatchResult {
	readonly status: 'sent' | 'queued' | 'rejected';
	readonly resource?: URI;
	readonly requestId?: string;
	readonly reason?: string;
	readonly reasonCode?: 'cancelled' | 'providerRemoved';
	readonly completion?: Promise<IDispatchResult>;
}

type SubmissionPhase = 'idle' | 'routing' | 'awaitingChoice' | 'dispatching';

function statusToString(status: AgentSessionStatus): string {
	switch (status) {
		case AgentSessionStatus.Failed: return 'failed';
		case AgentSessionStatus.Completed: return 'idle';
		case AgentSessionStatus.InProgress: return 'working';
		default: return 'unknown';
	}
}

function isCopilotRoutingProvider(provider: string): boolean {
	return provider === AgentSessionProviders.Background
		|| provider === AgentSessionProviders.Cloud
		|| provider === AgentSessionProviders.AgentHostCopilot;
}

/** Flatten a `string | IMarkdownString | undefined` field to plain text. */
function markdownToText(value: string | IMarkdownString | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const text = (typeof value === 'string' ? value : value.value).trim();
	return text || undefined;
}

/**
 * Extract plain text from a response history item by concatenating its markdown
 * parts. Kept coarse and clipped: the router only needs a gist of the latest
 * response, not a faithful render, so non-text parts (tools, trees, etc.) are
 * ignored. Returns `undefined` when the response has no textual content.
 */
function historyResponseToText(item: Extract<IChatSessionHistoryItem, { type: 'response' }>): string | undefined {
	let text = '';
	for (const part of item.parts) {
		if (part.kind === 'markdownContent') {
			text += part.content.value;
			// Enough to characterize the response; avoid walking a huge transcript.
			if (text.length >= ROUTER_FIELD_CLIP_LENGTH * 2) {
				break;
			}
		}
	}
	text = text.trim();
	return text || undefined;
}

/**
 * The surface (floating input window, quick chat, …) that hosts a routed chat
 * input. Supplies the widget being routed, its own scratch session to exclude
 * from candidates, and where the advisory badge should be inserted.
 */
export interface IChatSessionRoutingHost {
	/** The chat widget whose submission is being routed. */
	readonly widget: ChatWidget;
	/** Resource of the host's own scratch session, excluded from routing candidates. */
	getOwnSessionResource(): URI | undefined;
	/** Session whose currently displayed question or approval the voice input answers directly. */
	getPendingReplySessionResource?(): URI | undefined;
	/** Session provider selected for a newly created destination. */
	getNewSessionTarget?(): AgentSessionTarget | undefined;
	/**
	 * Insert the advisory badge into the host DOM near the input.
	 * If the host has no surface to place it, leave the badge disconnected and
	 * the controller will fall back to an immediate dispatch.
	 */
	placeBadge(badge: HTMLElement): void;
	/** Notify the host that a new request will be independently routed. */
	onWillRoute?(): void;
	/** Notify the host immediately before sending so stale destination state can be invalidated. */
	onWillDispatchRoute?(resource: URI): void;
	/** Roll back pre-dispatch state when the send is rejected or fails. */
	onDidRejectRoute?(resource: URI): void;
	/** Notify the host when a single-target route resolves, or clear it for fan-out. */
	onDidResolveRoute?(resource: URI | undefined, kind?: 'existing_session' | 'new_session', isVoiceModeInput?: boolean, requestId?: string): void;
}

/**
 * Shared routing + advisory-badge behaviour for chat input surfaces. Scores a
 * submitted utterance against existing agent sessions, resolves a pending target
 * (best match above threshold, else a new session), then shows a ranked panel
 * that counts down and auto-sends. The user can change or fan out the selection,
 * abort, or keep typing to cancel before it fires.
 */
export class ChatSessionRoutingController extends Disposable {

	/** Active pending-send badge + auto-send timers; replaced/cleared per submission. */
	private readonly _pendingSend = this._register(new MutableDisposable<IDisposable>());
	/** Cancellation for the in-flight submission; canceled when the host tears down. */
	private readonly _submitCts = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _submitDraftListeners = this._register(new MutableDisposable<IDisposable>());

	constructor(
		private readonly host: IChatSessionRoutingHost,
		private readonly debugOwner: string,
		@IChatService private readonly chatService: IChatService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ISessionRouter private readonly sessionRouter: ISessionRouter,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IAgentHostNewSessionFolderService private readonly newSessionFolderService: IAgentHostNewSessionFolderService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super();
	}

	/**
	 * Intercept a submission before local execution: score it against existing
	 * sessions, resolve a pending target, and show the advisory badge. Always
	 * returns `true` (handled) so the input-only widget never runs the request on
	 * its own scratch session.
	 */
	async handleSubmit(query: string, _mode: ChatModeKind, attachedContext?: IChatRequestVariableEntry[], isVoiceModeInput?: boolean): Promise<boolean> {
		const submittedUtterance = query.trim();
		if (!submittedUtterance) {
			return false;
		}
		const explicitNewSessionTask = parseExplicitNewSessionRequest(submittedUtterance);
		const utterance = explicitNewSessionTask ?? submittedUtterance;

		// A new submission supersedes any pending badge from a previous one.
		this._submitCts.value?.cancel();
		this._submitDraftListeners.clear();
		this._pendingSend.clear();

		// Immediately reflect that the request was accepted so the send button
		// greys out while routing runs (it is intercepted off-model, so the
		// widget's own submit state never changes). Cleared when the submission
		// resolves, is cancelled, or the user edits the draft.
		this._setSubmissionPhase('routing');
		ariaAlert(localize('chatSessionRouting.findingDestination', "Finding the best chat for your request."));

		// The host cancels the in-flight submission on teardown so we never
		// dispatch after close.
		const cts = new CancellationTokenSource();
		this._submitCts.value = cts;
		const token = cts.token;
		const submittedAttachmentIds = this._attachmentIds();
		const draftListeners = new DisposableStore();
		const cancelForDraftChange = () => {
			cts.cancel();
			if (this._submitCts.value === cts) {
				this._pendingSend.clear();
				this._submitDraftListeners.clear();
				this._setSubmissionPhase('idle');
			}
		};
		draftListeners.add(this.host.widget.inputEditor.onDidChangeModelContent(cancelForDraftChange));
		draftListeners.add(this.host.widget.attachmentModel.onDidChange(cancelForDraftChange));
		this._submitDraftListeners.value = draftListeners;
		const requestOptions: IChatSendRequestOptions = {
			...this.host.widget.getSelectedModelRequestOptions(),
			...this.host.widget.getModeRequestOptions(),
			isVoiceModeInput,
			attachedContext: attachedContext?.length ? [...attachedContext] : undefined,
		};
		if (explicitNewSessionTask) {
			this.host.onWillRoute?.();
			const target = this._resolveNewSessionTarget(utterance, attachedContext, [], []);
			this._dispatchImmediately(target, query, submittedAttachmentIds, utterance, requestOptions, cts);
			return true;
		}
		const followupResource = isVoiceModeInput ? this.host.getPendingReplySessionResource?.() : undefined;
		if (followupResource && followupResource.toString() !== this.host.getOwnSessionResource()?.toString()) {
			const followupTarget: PendingTarget = {
				kind: 'session',
				sessionId: followupResource.toString(),
				label: this.chatService.getSession(followupResource)?.title || localize('chatSessionRouting.currentSession', "Current session"),
				confidence: 1,
			};
			this._dispatchImmediately(followupTarget, query, submittedAttachmentIds, utterance, requestOptions, cts);
			return true;
		}
		this.host.onWillRoute?.();

		const candidates = await this._collectCandidateSessions(token);
		if (token.isCancellationRequested) {
			return true;
		}

		// Every candidate receives a lightweight semantic pass before we bound the
		// more expensive transcript enrichment. This prevents an older, generically
		// named but relevant session from being excluded by local metadata alone.
		const preliminaryResults = candidates.length > ROUTE_ENRICH_MAX_CANDIDATES
			? await this._route(candidates, utterance, token)
			: [];
		if (token.isCancellationRequested) {
			return true;
		}
		const shortlist = selectRouterShortlist(candidates, preliminaryResults);
		const enriched = shortlist.length ? await this._enrichCandidates(shortlist, token) : [];
		if (token.isCancellationRequested) {
			return true;
		}

		const results = enriched.length ? await this._route(enriched, utterance, token) : [];
		if (token.isCancellationRequested) {
			return true;
		}
		this._setSubmissionPhase('awaitingChoice');

		const newSessionTarget = this._resolveNewSessionTarget(utterance, attachedContext, results, enriched);
		const target = this._resolveTarget(results, enriched, newSessionTarget);
		const candidateIds = new Set(enriched.map(candidate => candidate.sessionId));
		const hasSessionChoice = results.some(result => candidateIds.has(result.sessionId) && isHighConfidenceSessionRoute(result));
		if (target.kind === 'new' && !hasSessionChoice) {
			this._dispatchImmediately(target, query, submittedAttachmentIds, utterance, requestOptions, cts);
			return true;
		}
		this._beginPendingSend(target, newSessionTarget, results, enriched, query, submittedAttachmentIds, utterance, requestOptions, cts);
		return true;
	}

	private _dispatchImmediately(target: PendingTarget, submittedInput: string, submittedAttachmentIds: readonly string[], utterance: string, requestOptions: IChatSendRequestOptions, cts: CancellationTokenSource): void {
		this._submitDraftListeners.clear();
		this._setSubmissionPhase('dispatching');
		void this._dispatchTo(target, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts.token).then(result => {
			if (this._submitCts.value !== cts) {
				return;
			}
			this._setSubmissionPhase('idle');
			if ((result.status === 'sent' || result.status === 'queued') && result.resource) {
				this._showDeliveryConfirmation(target.label, result);
			} else {
				this._showDispatchFailure(target.label);
			}
		});
	}

	/** Cancel any in-flight submission and remove the pending badge. */
	cancelPending(): void {
		this._cancelPending(true);
	}

	private _cancelPending(resetSubmissionPhase: boolean): void {
		this._submitCts.value?.cancel();
		this._submitCts.clear();
		this._submitDraftListeners.clear();
		this._pendingSend.clear();
		if (resetSubmissionPhase) {
			this._setSubmissionPhase('idle');
		}
	}

	private _setSubmissionPhase(phase: SubmissionPhase): void {
		this.host.widget.input.setSubmitPending(phase !== 'idle', phase === 'routing' || phase === 'dispatching');
	}

	/** Run the router, degrading to an empty ranking on failure/cancellation. */
	private async _route(candidates: IRoutableSession[], utterance: string, token: CancellationToken): Promise<ISessionRouteResult[]> {
		try {
			const results = await this.sessionRouter.route({ utterance, sessions: candidates }, token);
			const lexicalTieBreak = new Map(heuristicScore({ utterance, sessions: candidates }).map(result => [result.sessionId, result.confidence]));
			return [...results].sort((a, b) =>
				b.confidence - a.confidence
				|| (lexicalTieBreak.get(b.sessionId) ?? 0) - (lexicalTieBreak.get(a.sessionId) ?? 0));
		} catch (err) {
			if (!token.isCancellationRequested) {
				this.logService.warn('[chatSessionRouting] session routing failed:', err);
			}
			return [];
		}
	}

	/**
	 * Pick the single pending target the badge pre-selects: the top match if it
	 * clears the confidence threshold, otherwise a brand-new session.
	 */
	private _resolveTarget(results: ISessionRouteResult[], candidates: IRoutableSession[], newSessionTarget: NewSessionTarget): PendingTarget {
		const labelById = new Map(candidates.map(c => [c.sessionId, c.label]));
		const chosen = selectBestSessionRoute(results);
		if (!chosen) {
			return newSessionTarget;
		}
		return {
			kind: 'session',
			sessionId: chosen.sessionId,
			label: labelById.get(chosen.sessionId) ?? chosen.sessionId,
			confidence: chosen.confidence,
		};
	}

	/**
	 * Snapshot the current agent sessions as routing candidates. Excludes the
	 * host's own scratch session so it can never route to itself, and local chats:
	 * routing targets the headless, out-of-view agent sessions (cloud/background/
	 * agent-host) this surface exists to fan requests out to, and those are the
	 * ones whose conversation content is available and meaningful to match on.
	 * Awaits the session model so a pending first-load/refresh isn't missed.
	 */
	private async _collectCandidateSessions(token: CancellationToken): Promise<IRoutableSession[]> {
		try {
			await this.agentSessionsService.model.resolve(undefined);
		} catch (err) {
			this.logService.warn('[chatSessionRouting] resolving agent sessions failed:', err);
		}
		if (token.isCancellationRequested) {
			return [];
		}
		const ownResource = this.host.getOwnSessionResource()?.toString();
		return this.agentSessionsService.model.sessions
			.filter(session => session.resource.toString() !== ownResource
				&& isCopilotRoutingProvider(session.providerType)
				&& !session.isArchived()
				&& this.chatSessionsService.getChatSessionContribution(getChatSessionType(session.resource))?.isReadOnly !== true)
			.map(session => this._toRoutableSession(session));
	}

	private _toRoutableSession(session: IAgentSession): IRoutableSession {
		return {
			sessionId: session.resource.toString(),
			label: session.label,
			status: statusToString(session.status),
			lastActivity: session.timing?.lastRequestEnded ?? session.timing?.lastRequestStarted ?? session.timing?.created,
			description: markdownToText(session.description),
			repo: session.metadata?.repositoryPath,
			cwd: session.metadata?.workingDirectoryPath,
		};
	}

	private _resolveNewSessionTarget(
		utterance: string,
		attachedContext: readonly IChatRequestVariableEntry[] | undefined,
		results: readonly ISessionRouteResult[],
		candidates: readonly IRoutableSession[],
	): NewSessionTarget {
		const folders = this.workspaceContextService.getWorkspace().folders;
		const folder = this._folderFromAttachments(attachedContext)
			?? resolveNewSessionWorkspaceFolder(utterance, folders, results, candidates, this.newSessionFolderService.getDefaultFolder());
		return {
			kind: 'new',
			label: folder
				? localize('chatSessionRouting.newSessionInFolder', "New session in {0}", this.workspaceContextService.getWorkspaceFolder(folder)?.name ?? folder.path)
				: localize('chatSessionRouting.newSession', "New session"),
			folder,
		};
	}

	private _folderFromAttachments(attachedContext: readonly IChatRequestVariableEntry[] | undefined): URI | undefined {
		for (const attachment of attachedContext ?? []) {
			const resource = IChatRequestVariableEntry.toUri(attachment);
			const folder = resource && this.workspaceContextService.getWorkspaceFolder(resource);
			if (folder) {
				return folder.uri;
			}
		}
		return undefined;
	}

	/**
	 * Enrich the shortlisted candidates with conversation content (first
	 * request, most recent request, and a truncated most recent response) so the
	 * final score can match on what a session is actually about rather than just
	 * its title. Each fetch degrades independently: a session whose content can't
	 * be resolved is kept as-is on its metadata.
	 */
	private async _enrichCandidates(candidates: IRoutableSession[], token: CancellationToken): Promise<IRoutableSession[]> {
		return Promise.all(candidates.map(candidate => this._enrichCandidate(candidate, token)));
	}

	private async _enrichCandidate(candidate: IRoutableSession, token: CancellationToken): Promise<IRoutableSession> {
		let resource: URI;
		try {
			resource = URI.parse(candidate.sessionId);
		} catch {
			return candidate;
		}
		try {
			const history = await this.chatSessionsService.getChatSessionHistory?.(resource, token);
			if (token.isCancellationRequested) {
				return candidate;
			}
			return history ? this._applyHistory(candidate, history) : candidate;
		} catch (err) {
			if (!token.isCancellationRequested) {
				this.logService.trace('[chatSessionRouting] enriching candidate failed, using metadata only:', candidate.sessionId, err);
			}
			return candidate;
		}
	}

	/** Fold the first/most-recent request and most-recent response into a candidate. */
	private _applyHistory(candidate: IRoutableSession, history: readonly IChatSessionHistoryItem[]): IRoutableSession {
		let firstRequest: string | undefined;
		let lastRequest: string | undefined;
		let lastResponse: string | undefined;
		for (const item of history) {
			if (item.type === 'request') {
				const prompt = item.prompt.trim();
				if (prompt) {
					firstRequest ??= prompt;
					lastRequest = prompt;
				}
			} else {
				const text = historyResponseToText(item);
				if (text) {
					lastResponse = text;
				}
			}
		}
		if (!firstRequest && !lastRequest && !lastResponse) {
			return candidate;
		}
		return { ...candidate, firstRequest, lastRequest, lastResponse };
	}

	/**
	 * Show the advisory destination picker. A confident session match counts
	 * down and auto-sends; an uncertain route waits for an explicit choice.
	 */
	private _beginPendingSend(
		target: PendingTarget,
		newSessionTarget: NewSessionTarget,
		results: ISessionRouteResult[],
		candidates: IRoutableSession[],
		submittedInput: string,
		submittedAttachmentIds: readonly string[],
		utterance: string,
		requestOptions: IChatSendRequestOptions,
		cts: CancellationTokenSource,
	): void {
		const badge = dom.$('.chat-routing-badge');
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			this.logService.warn('[chatSessionRouting] no surface available for destination review; preserving draft');
			cts.cancel();
			this._submitDraftListeners.clear();
			this._setSubmissionPhase('idle');
			return;
		}

		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
		store.add(toDisposable(() => {
			if (this._submitCts.value === cts) {
				this._submitDraftListeners.clear();
			}
		}));
		this._pendingSend.value = store;

		this._renderCountdownBadge(badge, store, target, newSessionTarget, results, candidates, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts);
	}

	/**
	 * Confident-match badge: names the routed session and counts down, then
	 * auto-sends. The user can select another destination, choose several,
	 * abort, or keep typing to cancel before it fires.
	 */
	private _renderCountdownBadge(
		badge: HTMLElement,
		store: DisposableStore,
		target: PendingTarget,
		newSessionTarget: NewSessionTarget,
		results: ISessionRouteResult[],
		candidates: IRoutableSession[],
		submittedInput: string,
		submittedAttachmentIds: readonly string[],
		utterance: string,
		requestOptions: IChatSendRequestOptions,
		cts: CancellationTokenSource,
	): void {
		const targetWindow = dom.getWindow(badge);
		badge.classList.add('chat-routing-badge-ranked');

		const labelById = new Map(candidates.map(candidate => [candidate.sessionId, candidate.label]));
		const ranked = results
			.filter(result => labelById.has(result.sessionId) && isHighConfidenceSessionRoute(result))
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, ROUTE_MAX_CHOICES)
			.map(result => ({
				kind: 'session' as const,
				sessionId: result.sessionId,
				label: labelById.get(result.sessionId) ?? result.sessionId,
				confidence: result.confidence,
			}));
		const options: PendingTarget[] = [
			...ranked,
			newSessionTarget,
		];
		const preselected = Math.max(0, options.findIndex(option =>
			target.kind === 'session'
				? option.kind === 'session' && option.sessionId === target.sessionId
				: option.kind === 'new'));
		const selection = new Set<number>([preselected]);

		const head = dom.append(badge, dom.$('.chat-routing-badge-head'));
		const headLabel = dom.append(head, dom.$('span.chat-routing-badge-title'));
		const countdownEl = dom.append(head, dom.$('span.chat-routing-badge-countdown'));
		const list = dom.append(badge, dom.$('.chat-routing-badge-list', { role: 'listbox', 'aria-label': localize('chatSessionRouting.sendTo', "Send to"), 'aria-multiselectable': 'true' }));
		let choosingFolder = false;
		let focusedIndex = preselected;
		const rows = options.map((option, index) => {
			const row = dom.append(list, dom.$('.chat-routing-badge-row', { role: 'option', tabindex: '0' }));
			const mark = dom.append(row, dom.$('span.chat-routing-badge-mark'));
			mark.appendChild(renderIcon(Codicon.pass));
			const label = dom.append(row, dom.$('span.chat-routing-badge-name'));
			label.textContent = option.label;
			const score = dom.append(row, dom.$('span.chat-routing-badge-score'));
			score.textContent = option.kind === 'session'
				? index === 0
					? localize('chatSessionRouting.bestMatchSessionModel', "Best Match · Session model")
					: localize('chatSessionRouting.highConfidenceSessionModel', "High Confidence · Session model")
				: requestOptions.userSelectedModelId
					? localize('chatSessionRouting.selectedModel', "Selected model")
					: '';
			if (option.kind === 'new' && this.workspaceContextService.getWorkspace().folders.length > 1) {
				const changeFolder = dom.append(row, dom.$('button.chat-routing-badge-folder-action', {
					type: 'button',
					'aria-label': localize('chatSessionRouting.changeTargetFolderAria', "Change target folder for new session"),
				}));
				changeFolder.textContent = localize('chatSessionRouting.changeTargetFolder', "Change Folder");
				store.add(dom.addDisposableListener(changeFolder, dom.EventType.CLICK, event => {
					event.preventDefault();
					event.stopPropagation();
					selection.clear();
					selection.add(index);
					renderSelection();
					countdownTimer.clear();
					countdownEl.textContent = localize('chatSessionRouting.waiting', "waiting for you");
					choosingFolder = true;
					const folders = this.workspaceContextService.getWorkspace().folders;
					void this.quickInputService.pick(
						folders.map(folder => ({
							label: folder.name,
							description: folder.uri.fsPath,
							picked: options[index].kind === 'new' && options[index].folder?.toString() === folder.uri.toString(),
							folder,
						})),
						{ placeHolder: localize('chatSessionRouting.selectTargetFolder', "Select the folder for the new session") },
					).then(folderPick => {
						choosingFolder = false;
						if (!folderPick || cts.token.isCancellationRequested) {
							return;
						}
						const updatedTarget: NewSessionTarget = {
							kind: 'new',
							label: localize('chatSessionRouting.newSessionInFolder', "New session in {0}", folderPick.folder.name),
							folder: folderPick.folder.uri,
						};
						options[index] = updatedTarget;
						label.textContent = updatedTarget.label;
						ariaAlert(localize('chatSessionRouting.targetFolderChanged', "New session will use folder {0}.", folderPick.folder.name));
					});
				}));
			}
			store.add(dom.addDisposableListener(row, dom.EventType.CLICK, event => {
				focusedIndex = index;
				if (event.ctrlKey || event.metaKey) {
					if (selection.has(index) && selection.size > 1) {
						selection.delete(index);
					} else {
						selection.add(index);
					}
					countdownTimer.clear();
					countdownEl.textContent = localize('chatSessionRouting.waiting', "waiting for you");
					renderSelection();
					return;
				}
				selection.clear();
				selection.add(index);
				renderSelection();
				send();
			}));
			return row;
		});

		const foot = dom.append(badge, dom.$('.chat-routing-badge-foot'));
		const changeHint = dom.append(foot, dom.$('span'));
		changeHint.textContent = localize('chatSessionRouting.changeHint', "Tab to choose · Arrow keys move · Space selects several · Escape cancels");
		const sendHint = dom.append(foot, dom.$('span.chat-routing-badge-foot-end'));

		const renderSelection = () => {
			rows.forEach((row, index) => {
				const selected = selection.has(index);
				row.classList.toggle('selected', selected);
				row.setAttribute('aria-selected', String(selected));
				row.tabIndex = focusedIndex === index ? 0 : -1;
			});
			list.classList.toggle('multiple', selection.size > 1);
			headLabel.textContent = selection.size > 1
				? localize('chatSessionRouting.sendToMany', "Send to {0} sessions", selection.size)
				: localize('chatSessionRouting.sendTo', "Send to");
			sendHint.textContent = selection.size > 1
				? localize('chatSessionRouting.sendAllHint', "Enter to send to all")
				: localize('chatSessionRouting.sendNowHint', "Enter to send now");
		};
		renderSelection();
		const initialTarget = options[preselected];
		ariaAlert(initialTarget.kind === 'session'
			? localize('chatSessionRouting.sendingToIn', "Sending to {0} in {1} seconds. Press Escape to cancel.", initialTarget.label, Math.ceil(ROUTE_AUTOSEND_DELAY_MS / 1000))
			: localize('chatSessionRouting.confirmNewSession', "No confident match. Choose a destination before sending."));

		let remainingSeconds = Math.ceil(ROUTE_AUTOSEND_DELAY_MS / 1000);
		const renderCountdown = () => {
			countdownEl.textContent = localize('chatSessionRouting.sendingIn', "sending in {0}s", remainingSeconds);
		};

		let didDispatch = false;
		const send = () => {
			if (didDispatch) {
				return;
			}
			didDispatch = true;
			countdownTimer.clear();
			this._submitDraftListeners.clear();
			this._setSubmissionPhase('dispatching');
			badge.classList.remove('chat-routing-badge-ranked');
			badge.replaceChildren();
			const progress = dom.append(badge, dom.$('span.chat-routing-badge-sent-mark'));
			progress.appendChild(renderIcon(Codicon.loading));
			const progressLabel = dom.append(badge, dom.$('span.chat-routing-badge-label'));
			progressLabel.textContent = localize('chatSessionRouting.dispatching', "Sending request…");
			const sent = [...selection].sort((a, b) => a - b).map(index => options[index]);
			if (!sent.length) {
				this._setSubmissionPhase('idle');
				return;
			}
			if (sent.length > 1) {
				this.host.onDidResolveRoute?.(undefined);
			}
			const dispatches = sent.map(selected =>
				this._dispatchTo(selected, submittedInput, submittedAttachmentIds, utterance, requestOptions, cts.token, sent.length === 1)
			);
			if (sent.length > 1) {
				void Promise.all(dispatches).then(results => {
					if (this._submitCts.value === cts) {
						this._setSubmissionPhase('idle');
						this._showFanoutOutcomes(sent, results);
					}
				});
				return;
			}
			void dispatches[0].then(result => {
				if (this._submitCts.value !== cts) {
					return;
				}
				this._setSubmissionPhase('idle');
				const selected = sent[0];
				if ((result.status === 'sent' || result.status === 'queued') && result.resource) {
					this._showDeliveryConfirmation(selected.label, result);
				} else {
					this._showDispatchFailure(selected.label);
				}
			});
		};

		const countdownTimer = store.add(new MutableDisposable());
		const startCountdown = () => {
			remainingSeconds = Math.ceil(ROUTE_AUTOSEND_DELAY_MS / 1000);
			renderCountdown();
			const handle = targetWindow.setInterval(() => {
				remainingSeconds--;
				if (remainingSeconds <= 0) {
					send();
					return;
				}
				renderCountdown();
			}, 1000);
			countdownTimer.value = toDisposable(() => targetWindow.clearInterval(handle));
		};

		const cancel = () => {
			cts.cancel();
			this._pendingSend.clear();
			this._setSubmissionPhase('idle');
		};

		store.add(dom.addDisposableListener(targetWindow, dom.EventType.KEY_DOWN, event => {
			if (choosingFolder || (dom.isHTMLElement(event.target) && event.target.classList.contains('chat-routing-badge-folder-action'))) {
				return;
			}
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				cancel();
				return;
			}
			const isRoutingInteraction = dom.isHTMLElement(event.target) && badge.contains(event.target);
			const isListInteraction = isRoutingInteraction && !!event.target.closest('.chat-routing-badge-row');
			if (isListInteraction && (keyboardEvent.equals(KeyCode.UpArrow) || keyboardEvent.equals(KeyCode.DownArrow) || keyboardEvent.equals(KeyCode.Home) || keyboardEvent.equals(KeyCode.End))) {
				keyboardEvent.preventDefault();
				if (keyboardEvent.equals(KeyCode.Home)) {
					focusedIndex = 0;
				} else if (keyboardEvent.equals(KeyCode.End)) {
					focusedIndex = rows.length - 1;
				} else {
					const delta = keyboardEvent.equals(KeyCode.UpArrow) ? -1 : 1;
					focusedIndex = (focusedIndex + delta + rows.length) % rows.length;
				}
				renderSelection();
				rows[focusedIndex].focus();
				countdownTimer.clear();
				countdownEl.textContent = localize('chatSessionRouting.waiting', "waiting for you");
			} else if (isListInteraction && keyboardEvent.equals(KeyCode.Space)) {
				keyboardEvent.preventDefault();
				if (selection.has(focusedIndex) && selection.size > 1) {
					selection.delete(focusedIndex);
				} else {
					selection.add(focusedIndex);
				}
				renderSelection();
				countdownTimer.clear();
				countdownEl.textContent = localize('chatSessionRouting.waiting', "waiting for you");
			} else if (isListInteraction && keyboardEvent.equals(KeyCode.Enter)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				send();
			}
		}, true));

		if (target.kind === 'session') {
			startCountdown();
		} else {
			countdownEl.textContent = localize('chatSessionRouting.waiting', "waiting for you");
		}
	}

	private _showDeliveryConfirmation(label: string, result: IDispatchResult): void {
		const resource = result.resource;
		if (!resource) {
			this._showDispatchFailure(label);
			return;
		}
		const badge = dom.$('.chat-routing-badge');
		const mark = dom.append(badge, dom.$('span.chat-routing-badge-sent-mark'));
		mark.appendChild(renderIcon(result.status === 'queued' ? Codicon.clock : Codicon.pass));
		const labelEl = dom.append(badge, dom.$('span.chat-routing-badge-label'));
		labelEl.textContent = result.status === 'queued'
			? localize('chatSessionRouting.queuedFor', "Queued for {0}", label)
			: localize('chatSessionRouting.sentTo', "Sent to {0}", label);
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			return;
		}

		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
		this._addActionLink(store, badge, localize('chatSessionRouting.open', "Open"), () => void this.chatWidgetService.openSession(resource));
		this._addActionLink(store, badge, localize('chatSessionRouting.dismiss', "Dismiss"), () => this._pendingSend.clear());
		this._pendingSend.value = store;
		const announcement = result.status === 'queued'
			? localize('chatSessionRouting.queuedFor', "Queued for {0}", label)
			: localize('chatSessionRouting.sentTo', "Sent to {0}", label);
		ariaAlert(announcement);
		let trackingActivity = false;
		const trackActivity = () => {
			if (!trackingActivity) {
				trackingActivity = true;
				this._trackDeliveryActivity(store, resource, label, mark, labelEl, result.status === 'queued');
			}
		};
		trackActivity();

		if (result.completion) {
			void result.completion.then(completion => {
				if (this._pendingSend.value !== store) {
					return;
				}
				if (completion.status === 'sent') {
					mark.replaceChildren(renderIcon(Codicon.pass));
					labelEl.textContent = localize('chatSessionRouting.sentTo', "Sent to {0}", label);
					ariaAlert(labelEl.textContent);
					trackActivity();
				} else {
					mark.replaceChildren(renderIcon(completion.reasonCode === 'providerRemoved' ? Codicon.circleSlash : Codicon.error));
					labelEl.textContent = completion.reasonCode === 'providerRemoved'
						? localize('chatSessionRouting.noLongerQueued', "Request is no longer queued for {0}", label)
						: completion.reasonCode === 'cancelled'
							? localize('chatSessionRouting.queueCancelled', "Queued request to {0} was cancelled", label)
							: localize('chatSessionRouting.queuedNotSent', "Queued request to {0} was not sent", label);
					ariaAlert(labelEl.textContent);
				}
			});
		}
	}

	private _trackDeliveryActivity(store: DisposableStore, resource: URI, label: string, mark: HTMLElement, labelElement: HTMLElement, waitForActivity: boolean): void {
		const model = this.chatService.getSession(resource);
		let lastAnnouncement = labelElement.textContent;
		let observedActivity = !waitForActivity;
		const update = (requestInProgress = model?.requestInProgress.get() ?? false, needsInput = !!model?.requestNeedsInput.get()) => {
			const sessionStatus = this.agentSessionsService.model.getSession(resource)?.status;
			let icon = waitForActivity && !observedActivity ? Codicon.clock : Codicon.pass;
			if (needsInput || sessionStatus === AgentSessionStatus.NeedsInput) {
				observedActivity = true;
				icon = Codicon.question;
				labelElement.textContent = localize('chatSessionRouting.needsInputIn', "{0} needs your input", label);
			} else if (requestInProgress || sessionStatus === AgentSessionStatus.InProgress) {
				observedActivity = true;
				icon = Codicon.loading;
				labelElement.textContent = localize('chatSessionRouting.runningIn', "Running in {0}", label);
			} else if (sessionStatus === AgentSessionStatus.Failed) {
				observedActivity = true;
				icon = Codicon.error;
				labelElement.textContent = localize('chatSessionRouting.failedIn', "Failed in {0}", label);
			} else if (observedActivity && (sessionStatus === AgentSessionStatus.Completed || model?.hasRequests)) {
				labelElement.textContent = localize('chatSessionRouting.completedIn', "Completed in {0}", label);
			}
			mark.replaceChildren(renderIcon(icon));
			if (labelElement.textContent !== lastAnnouncement) {
				lastAnnouncement = labelElement.textContent;
				ariaAlert(lastAnnouncement);
			}
		};
		if (model) {
			store.add(autorun(reader => update(model.requestInProgress.read(reader), !!model.requestNeedsInput.read(reader))));
		} else {
			update();
		}
		store.add(this.agentSessionsService.model.onDidChangeSessions(() => update()));
	}

	private _showFanoutOutcomes(targets: readonly PendingTarget[], results: readonly IDispatchResult[]): void {
		const badge = dom.$('.chat-routing-badge');
		badge.classList.add('chat-routing-badge-outcomes');
		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
		const heading = dom.append(badge, dom.$('span.chat-routing-badge-label'));
		heading.textContent = localize('chatSessionRouting.deliveryResults', "Delivery results");
		const list = dom.append(badge, dom.$('.chat-routing-outcome-list'));
		results.forEach((result, index) => {
			const target = targets[index];
			const row = dom.append(list, dom.$('.chat-routing-outcome-row'));
			const icon = dom.append(row, dom.$('span.chat-routing-badge-sent-mark'));
			icon.appendChild(renderIcon(result.status === 'rejected' ? Codicon.error : result.status === 'queued' ? Codicon.clock : Codicon.pass));
			const text = dom.append(row, dom.$('span.chat-routing-badge-label'));
			text.textContent = result.status === 'rejected'
				? localize('chatSessionRouting.targetFailed', "{0}: failed", target.label)
				: result.status === 'queued'
					? localize('chatSessionRouting.targetQueued', "{0}: queued", target.label)
					: localize('chatSessionRouting.targetSent', "{0}: sent", target.label);
			const resource = result.resource;
			if (resource) {
				this._addActionLink(store, row, localize('chatSessionRouting.open', "Open"), () => void this.chatWidgetService.openSession(resource));
			}
			if (result.completion) {
				void result.completion.then(completion => {
					icon.replaceChildren(renderIcon(completion.status === 'sent'
						? Codicon.pass
						: completion.reasonCode === 'providerRemoved' ? Codicon.circleSlash : Codicon.error));
					text.textContent = completion.status === 'sent'
						? localize('chatSessionRouting.targetSent', "{0}: sent", target.label)
						: completion.reasonCode === 'providerRemoved'
							? localize('chatSessionRouting.targetNoLongerQueued', "{0}: no longer queued", target.label)
							: completion.reasonCode === 'cancelled'
								? localize('chatSessionRouting.targetCancelled', "{0}: cancelled", target.label)
								: localize('chatSessionRouting.targetFailed', "{0}: failed", target.label);
				});
			}
		});
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			return;
		}

		this._addActionLink(store, badge, localize('chatSessionRouting.dismiss', "Dismiss"), () => this._pendingSend.clear());
		this._pendingSend.value = store;
		const sent = results.filter(result => result.status === 'sent').length;
		const queued = results.filter(result => result.status === 'queued').length;
		const failed = results.length - sent - queued;
		ariaAlert(localize('chatSessionRouting.fanoutResult', "{0} sent, {1} queued, {2} failed.", sent, queued, failed));
	}

	private _showDispatchFailure(label?: string): void {
		const badge = dom.$('.chat-routing-badge');
		const mark = dom.append(badge, dom.$('span.chat-routing-badge-sent-mark'));
		mark.appendChild(renderIcon(Codicon.error));
		const message = dom.append(badge, dom.$('span.chat-routing-badge-label'));
		message.textContent = label
			? localize('chatSessionRouting.sendFailedTo', "Could not send to {0}. Your draft was preserved.", label)
			: localize('chatSessionRouting.sendFailed', "Could not send the request. Your draft was preserved.");
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			return;
		}
		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
		this._addActionLink(store, badge, localize('chatSessionRouting.dismiss', "Dismiss"), () => this._pendingSend.clear());
		this._pendingSend.value = store;
		ariaAlert(message.textContent);
	}

	/** Append an accessible link-style action to the badge. */
	private _addActionLink(store: DisposableStore, badge: HTMLElement, text: string, run: () => void): void {
		const el = dom.append(badge, dom.$('a.chat-routing-badge-action', { role: 'button', tabindex: '0' }));
		el.textContent = text;
		store.add(dom.addDisposableListener(el, dom.EventType.CLICK, run));
		store.add(dom.addStandardDisposableListener(el, dom.EventType.KEY_DOWN, e => {
			if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
				e.preventDefault();
				run();
			}
		}));
	}

	/** Dispatch a resolved pending target. */
	private async _dispatchTo(target: PendingTarget, submittedInput: string, submittedAttachmentIds: readonly string[], utterance: string, requestOptions: IChatSendRequestOptions, token: CancellationToken, notifyRoute = true): Promise<IDispatchResult> {
		if (target.kind === 'new') {
			return this._dispatchToNewSession(submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute, target.folder);
		}
		return this._dispatchToSession(target.sessionId, submittedInput, submittedAttachmentIds, utterance, requestOptions, token, notifyRoute);
	}

	private async _dispatchToSession(sessionId: string, submittedInput: string, submittedAttachmentIds: readonly string[], utterance: string, requestOptions: IChatSendRequestOptions, token: CancellationToken, notifyRoute: boolean): Promise<IDispatchResult> {
		let target: URI;
		try {
			target = URI.parse(sessionId);
		} catch (err) {
			this.logService.warn('[chatSessionRouting] invalid session id for routing:', sessionId, err);
			return { status: 'rejected' };
		}

		try {
			const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, token, `${this.debugOwner}-route`);
			if (token.isCancellationRequested) {
				ref?.dispose();
				return { status: 'rejected' };
			}
			if (!ref) {
				this.logService.warn('[chatSessionRouting] could not load routed session:', sessionId);
				return { status: 'rejected' };
			}
			let result: IDispatchResult;
			let requestId: string | undefined;
			let disposeReference = true;
			try {
				if (notifyRoute) {
					this.host.onWillDispatchRoute?.(target);
				}
				result = await this._sendRequest(target, utterance, {
					...requestOptions,
					// Existing Agent Host queues retain their session model. Their
					// remote queue protocol has no per-request model override.
					userSelectedModelId: undefined,
					agentIdSilent: getChatSessionType(target),
					queue: ChatRequestQueueKind.Queued,
				});
				if (result.status === 'queued' && result.completion) {
					disposeReference = false;
					result = {
						...result,
						completion: result.completion.finally(() => ref.dispose()),
					};
				}
				requestId = result.requestId ?? (result.status === 'sent' ? ref.object.lastRequest?.id : undefined);
			} finally {
				if (disposeReference) {
					ref.dispose();
				}
			}
			if (result.status === 'rejected') {
				if (notifyRoute) {
					this.host.onDidRejectRoute?.(target);
				}
				this.logService.warn('[chatSessionRouting] routed session rejected the request:', sessionId);
				return result;
			}
			if (notifyRoute && result.resource) {
				this.host.onDidResolveRoute?.(result.resource, 'existing_session', requestOptions.isVoiceModeInput, requestId);
			}
			this._clearInputIfUnchanged(submittedInput, submittedAttachmentIds);
			return result;
		} catch (err) {
			if (notifyRoute) {
				this.host.onDidRejectRoute?.(target);
			}
			if (token.isCancellationRequested) {
				return { status: 'rejected' };
			}
			this.logService.warn('[chatSessionRouting] error dispatching to routed session:', err);
			return { status: 'rejected' };
		}
	}

	private async _dispatchToNewSession(submittedInput: string, submittedAttachmentIds: readonly string[], utterance: string, requestOptions: IChatSendRequestOptions, token: CancellationToken, notifyRoute: boolean, folder?: URI): Promise<IDispatchResult> {
		let routeResource: URI | undefined;
		try {
			const sessionTarget = this.host.getNewSessionTarget?.() ?? AgentSessionProviders.Local;
			const ref = sessionTarget === AgentSessionProviders.Local
				? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: `${this.debugOwner}-new` })
				: await this.chatService.acquireOrLoadSession(
					URI.from({ scheme: sessionTarget, path: `/untitled-${generateUuid()}` }),
					ChatAgentLocation.Chat,
					token,
					`${this.debugOwner}-new`,
				);
			if (!ref) {
				this.logService.warn(`[chatSessionRouting] unable to create a new ${sessionTarget} session`);
				return { status: 'rejected' };
			}
			routeResource = ref.object.sessionResource;
			if (token.isCancellationRequested) {
				ref.dispose();
				return { status: 'rejected' };
			}
			folder ??= this._resolveNewSessionTarget(utterance, requestOptions.attachedContext, [], []).folder;
			if (folder) {
				this.newSessionFolderService.setFolder(ref.object.sessionResource, folder);
			}
			let result: IDispatchResult;
			let requestId: string | undefined;
			try {
				if (notifyRoute) {
					this.host.onWillDispatchRoute?.(ref.object.sessionResource);
				}
				result = await this._sendRequest(ref.object.sessionResource, utterance, {
					...requestOptions,
					agentIdSilent: sessionTarget === AgentSessionProviders.Local ? undefined : sessionTarget,
				});
				requestId = result.requestId ?? (result.status === 'sent' ? ref.object.lastRequest?.id : undefined);
			} finally {
				ref.dispose();
			}
			if (result.status === 'rejected') {
				if (notifyRoute) {
					this.host.onDidRejectRoute?.(ref.object.sessionResource);
				}
				this.logService.warn('[chatSessionRouting] new session rejected the request');
				return result;
			}
			if (notifyRoute && result.resource) {
				this.host.onDidResolveRoute?.(result.resource, 'new_session', requestOptions.isVoiceModeInput, requestId);
			}
			this._clearInputIfUnchanged(submittedInput, submittedAttachmentIds);
			return result;
		} catch (err) {
			if (notifyRoute && routeResource) {
				this.host.onDidRejectRoute?.(routeResource);
			}
			if (token.isCancellationRequested) {
				return { status: 'rejected' };
			}
			this.logService.warn('[chatSessionRouting] error starting a new session:', err);
			return { status: 'rejected' };
		}
	}

	private async _sendRequest(resource: URI, utterance: string, options: IChatSendRequestOptions): Promise<IDispatchResult> {
		const result = await this.chatService.sendRequest(resource, utterance, options);
		if (result.kind === 'rejected') {
			return { status: 'rejected', reason: result.reason, reasonCode: result.reasonCode };
		}
		if (result.kind === 'queued') {
			return {
				status: 'queued',
				resource,
				requestId: result.requestId,
				completion: this._resolveQueuedCompletion(resource, result.deferred),
			};
		}
		// A sent result does not carry the request id directly, and reading
		// `model.lastRequest` here races request creation (especially when an
		// untitled agent session is replaced by its durable resource). The response
		// model is the authoritative owner of the stable request id and is created
		// independently of response completion, so wait only for that model.
		const response = await result.data.responseCreatedPromise;
		return { status: 'sent', resource: result.newSessionResource ?? resource, requestId: response.requestId };
	}

	private async _resolveQueuedCompletion(resource: URI, deferred: Promise<ChatSendResult>): Promise<IDispatchResult> {
		try {
			let result = await deferred;
			while (result.kind === 'queued') {
				result = await result.deferred;
			}
			return result.kind === 'sent'
				? { status: 'sent', resource: result.newSessionResource ?? resource }
				: { status: 'rejected', resource: result.newSessionResource ?? resource, reason: result.reason, reasonCode: result.reasonCode };
		} catch (error) {
			this.logService.warn('[chatSessionRouting] queued request failed:', error);
			return { status: 'rejected', resource, reason: error instanceof Error ? error.message : String(error) };
		}
	}

	/**
	 * Clear the input (and its explicit attachments) only if the editor still
	 * holds exactly what was submitted, so a newer draft typed while the request
	 * was in flight is preserved.
	 */
	private _attachmentIds(): string[] {
		return this.host.widget.attachmentModel.attachments.map(attachment => attachment.id);
	}

	private _clearInputIfUnchanged(submittedInput: string, submittedAttachmentIds: readonly string[]): void {
		const editor = this.host.widget.inputEditor;
		const currentAttachmentIds = this._attachmentIds();
		const attachmentsUnchanged = currentAttachmentIds.length === submittedAttachmentIds.length
			&& currentAttachmentIds.every((id, index) => id === submittedAttachmentIds[index]);
		if (editor.getValue() === submittedInput && attachmentsUnchanged) {
			this._submitDraftListeners.clear();
			editor.setValue('');
			this.host.widget.attachmentModel.clear();
		}
	}

	override dispose(): void {
		// The host widget can be disposed before this controller by a shared
		// disposable store, so teardown must cancel without touching its UI.
		this._cancelPending(false);
		super.dispose();
	}
}
