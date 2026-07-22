/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { IRoutableSession, ISessionRouteResult, ISessionRouter } from '../../common/sessionRouter.js';
import { IAgentSession, AgentSessionStatus } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatWidget } from '../widget/chatWidget.js';

import './media/chatSessionRouting.css';

/**
 * Minimum confidence for a candidate to be treated as a real match. Below this
 * for every candidate, the request targets a brand-new session instead.
 */
const ROUTE_CONFIDENCE_THRESHOLD = 0.5;

/**
 * When the last-used session is within this confidence margin of the top match,
 * it is preferred so repeated turns keep landing on the same session.
 */
const ROUTE_AMBIGUITY_MARGIN = 0.2;

/** Maximum number of options shown in the disambiguation picker. */
const ROUTE_MAX_CHOICES = 6;

/**
 * How long the pending-send badge counts down before auto-dispatching to the
 * routed target. Long enough to read the target and intervene, short enough to
 * keep a hands-free/voice flow moving.
 */
const ROUTE_AUTOSEND_DELAY_MS = 8000;

/**
 * How long the "Sent to …" confirmation badge lingers after a matched send
 * before auto-dismissing. Long enough to register where the request went, short
 * enough not to get in the way of firing the next one.
 */
const SENT_CONFIRMATION_MS = 4000;

/** Workspace-scoped memory of the last routed session, biasing the next turn. */
const LAST_TARGET_STORAGE_KEY = 'chat.sessionRouting.lastTarget';

/** Resolved destination for a submitted request: an existing session or a new one. */
type PendingTarget =
	| { readonly kind: 'session'; readonly sessionId: string; readonly label: string; readonly confidence: number }
	| { readonly kind: 'new'; readonly label: string };

function statusToString(status: AgentSessionStatus): string {
	switch (status) {
		case AgentSessionStatus.Failed: return 'failed';
		case AgentSessionStatus.Completed: return 'idle';
		case AgentSessionStatus.InProgress: return 'working';
		default: return 'unknown';
	}
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
	/**
	 * Insert the advisory badge into the host DOM, positioned above the input.
	 * If the host has no surface to place it, leave the badge disconnected and
	 * the controller will fall back to an immediate dispatch.
	 */
	placeBadge(badge: HTMLElement): void;
}

/**
 * Shared routing + advisory-badge behaviour for chat input surfaces. Scores a
 * submitted utterance against existing agent sessions, resolves a single pending
 * target (best match above threshold, else a new session), then shows a badge
 * that counts down and auto-sends. Routing is never silent: the user can
 * redirect ("Change"), abort ("Cancel"), or keep typing to cancel the auto-send
 * before it fires. The last routed session is remembered to bias the next turn.
 */
export class ChatSessionRoutingController extends Disposable {

	/** Active pending-send badge + auto-send timers; replaced/cleared per submission. */
	private readonly _pendingSend = this._register(new MutableDisposable<IDisposable>());
	/** Sessions loaded or spawned by routing, deduped by resource; disposed on teardown. */
	private readonly _routedSessionRefs = new ResourceMap<IChatModelReference>();
	/** Cancellation for the in-flight submission; canceled when the host tears down. */
	private readonly _submitCts = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		private readonly host: IChatSessionRoutingHost,
		private readonly debugOwner: string,
		@IChatService private readonly chatService: IChatService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@ISessionRouter private readonly sessionRouter: ISessionRouter,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	/**
	 * Intercept a submission before local execution: score it against existing
	 * sessions, resolve a pending target, and show the advisory badge. Always
	 * returns `true` (handled) so the input-only widget never runs the request on
	 * its own scratch session.
	 */
	async handleSubmit(query: string, _mode: ChatModeKind, attachedContext?: IChatRequestVariableEntry[]): Promise<boolean> {
		const utterance = query.trim();
		if (!utterance) {
			return false;
		}

		// A new submission supersedes any pending badge from a previous one.
		this._pendingSend.clear();

		// Replacing the source disposes any previous one; the host cancels the
		// in-flight submission on teardown so we never dispatch after close.
		const cts = new CancellationTokenSource();
		this._submitCts.value = cts;
		const token = cts.token;

		const candidates = await this._collectCandidateSessions(token);
		if (token.isCancellationRequested) {
			return true;
		}

		const results = candidates.length ? await this._route(candidates, utterance, token) : [];
		if (token.isCancellationRequested) {
			return true;
		}

		const target = this._resolveTarget(results, candidates);
		this._beginPendingSend(target, results, candidates, query, utterance, attachedContext, cts);
		return true;
	}

	/** Cancel any in-flight submission and remove the pending badge. */
	cancelPending(): void {
		this._submitCts.value?.cancel();
		this._submitCts.clear();
		this._pendingSend.clear();
	}

	/** Run the router, degrading to an empty ranking on failure/cancellation. */
	private async _route(candidates: IRoutableSession[], utterance: string, token: CancellationToken): Promise<ISessionRouteResult[]> {
		try {
			return await this.sessionRouter.route({ utterance, sessions: candidates }, token);
		} catch (err) {
			if (!token.isCancellationRequested) {
				this.logService.warn('[chatSessionRouting] session routing failed:', err);
			}
			return [];
		}
	}

	/**
	 * Pick the single pending target the badge pre-selects: the top match if it
	 * clears the confidence threshold (biased toward the last-used session on a
	 * tie within the ambiguity margin), otherwise a brand-new session.
	 */
	private _resolveTarget(results: ISessionRouteResult[], candidates: IRoutableSession[]): PendingTarget {
		const labelById = new Map(candidates.map(c => [c.sessionId, c.label]));
		const top = results[0];
		if (!top || top.confidence < ROUTE_CONFIDENCE_THRESHOLD) {
			return { kind: 'new', label: localize('chatSessionRouting.newSession', "New session") };
		}

		// Prefer the last-used session when it is within the ambiguity margin of
		// the top match, so repeated turns keep landing on the same session.
		const lastTargetId = this.storageService.get(LAST_TARGET_STORAGE_KEY, StorageScope.WORKSPACE);
		const preferred = lastTargetId
			? results.find(r => r.sessionId === lastTargetId
				&& r.confidence >= ROUTE_CONFIDENCE_THRESHOLD
				&& (top.confidence - r.confidence) <= ROUTE_AMBIGUITY_MARGIN)
			: undefined;
		const chosen = preferred ?? top;
		return {
			kind: 'session',
			sessionId: chosen.sessionId,
			label: labelById.get(chosen.sessionId) ?? chosen.sessionId,
			confidence: chosen.confidence,
		};
	}

	/**
	 * Snapshot the current agent sessions as routing candidates, excluding the
	 * host's own scratch session so it can never route to itself. Awaits the
	 * session model so a pending first-load/refresh isn't missed.
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
			.filter(session => session.resource.toString() !== ownResource)
			.map(session => this._toRoutableSession(session));
	}

	private _toRoutableSession(session: IAgentSession): IRoutableSession {
		return {
			sessionId: session.resource.toString(),
			label: session.label,
			status: statusToString(session.status),
			lastActivity: session.timing?.lastRequestEnded ?? session.timing?.lastRequestStarted ?? session.timing?.created,
		};
	}

	/**
	 * Ask the user to pick a target, listing the scored sessions (best first,
	 * capped) plus a new-session option. `preselectedId` is floated to the top so
	 * it is the default highlighted choice. Returns the chosen session id,
	 * `'new'` for a new session, or `undefined` if the picker was dismissed.
	 */
	private async _promptSessionChoice(results: ISessionRouteResult[], labelById: Map<string, string>, preselectedId?: string): Promise<string | 'new' | undefined> {
		type RouteChoiceItem = IQuickPickItem & { sessionId?: string; isNew?: boolean };
		const ordered = results.slice(0, ROUTE_MAX_CHOICES);
		if (preselectedId && preselectedId !== 'new') {
			const idx = ordered.findIndex(r => r.sessionId === preselectedId);
			if (idx > 0) {
				ordered.unshift(ordered.splice(idx, 1)[0]);
			}
		}
		const items: RouteChoiceItem[] = ordered.map(match => ({
			label: labelById.get(match.sessionId) ?? match.sessionId,
			description: localize('chatSessionRouting.matchPercent', "{0}% match", Math.round(match.confidence * 100)),
			detail: match.reason,
			sessionId: match.sessionId,
		}));
		const newItem: RouteChoiceItem = {
			label: `$(add) ${localize('chatSessionRouting.newSession', "New session")}`,
			isNew: true,
		};
		if (preselectedId === 'new') {
			items.unshift(newItem);
		} else {
			items.push(newItem);
		}

		const picked = await this.quickInputService.pick(items, {
			placeHolder: localize('chatSessionRouting.choosePlaceholder', "Choose where to send this request"),
		});
		if (!picked) {
			return undefined;
		}
		return picked.isNew ? 'new' : picked.sessionId;
	}

	/**
	 * Show the advisory pending-send badge for a resolved target. A confident
	 * session match counts down and auto-sends (redirectable/cancelable); a
	 * no-match creates and sends to a new chat immediately and links to it.
	 */
	private _beginPendingSend(
		target: PendingTarget,
		results: ISessionRouteResult[],
		candidates: IRoutableSession[],
		submittedInput: string,
		utterance: string,
		attachedContext: IChatRequestVariableEntry[] | undefined,
		cts: CancellationTokenSource,
	): void {
		const badge = dom.$('.chat-routing-badge');
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			// No surface to host the badge — fall back to an immediate dispatch.
			void this._dispatchTo(target, submittedInput, utterance, attachedContext, cts.token);
			return;
		}

		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
		this._pendingSend.value = store;

		if (target.kind === 'new') {
			// No confident match: don't delay — create and send to a new chat right
			// away, then surface a link to it in the badge as soon as it exists.
			this._renderNewSessionBadge(badge, store, submittedInput, utterance, attachedContext, cts);
		} else {
			this._renderCountdownBadge(badge, store, target, results, candidates, submittedInput, utterance, attachedContext, cts);
		}
	}

	/**
	 * Confident-match badge: names the routed session and counts down, then
	 * auto-sends. The user can redirect ("Change"), abort ("Cancel"), or keep
	 * typing (which cancels the auto-send) before it fires. Choosing "New
	 * session" in the picker hands off to the immediate new-session flow.
	 */
	private _renderCountdownBadge(
		badge: HTMLElement,
		store: DisposableStore,
		target: PendingTarget,
		results: ISessionRouteResult[],
		candidates: IRoutableSession[],
		submittedInput: string,
		utterance: string,
		attachedContext: IChatRequestVariableEntry[] | undefined,
		cts: CancellationTokenSource,
	): void {
		const targetWindow = dom.getWindow(badge);
		let current = target;

		const label = dom.append(badge, dom.$('span.chat-routing-badge-label'));
		const countdownEl = dom.append(badge, dom.$('span.chat-routing-badge-countdown'));

		const renderLabel = () => {
			label.textContent = current.kind === 'session'
				? localize('chatSessionRouting.sendingToSession', "Sending to {0} · {1}% match", current.label, Math.round(current.confidence * 100))
				: localize('chatSessionRouting.sendingToNew', "Sending to {0}", current.label);
		};
		renderLabel();

		let remainingSeconds = Math.ceil(ROUTE_AUTOSEND_DELAY_MS / 1000);
		const renderCountdown = () => {
			countdownEl.textContent = localize('chatSessionRouting.sendingIn', "sending in {0}s", remainingSeconds);
		};

		const send = () => {
			// Detach the badge (and its listeners) before dispatch so a clear of
			// the input during send can't re-enter cancel().
			this._pendingSend.clear();
			const sent = current;
			void this._dispatchTo(sent, submittedInput, utterance, attachedContext, cts.token).then(ok => {
				// Confirm where the request went so an omni surface that can't show
				// the response inline still gives feedback. Guard on the current
				// submission so a newer one isn't overwritten.
				if (ok && sent.kind === 'session' && this._submitCts.value === cts) {
					this._showSentConfirmation(sent.label, sent.sessionId);
				}
			});
		};

		// Countdown lives in a MutableDisposable so it can be paused while the
		// "Change" picker is open and restarted afterwards.
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
		};

		const change = async () => {
			countdownTimer.clear();
			const labelById = new Map(candidates.map(c => [c.sessionId, c.label]));
			const preselected = current.kind === 'session' ? current.sessionId : 'new';
			const choice = await this._promptSessionChoice(results, labelById, preselected);
			if (cts.token.isCancellationRequested || this._pendingSend.value !== store) {
				return;
			}
			if (choice === undefined) {
				startCountdown();
				return;
			}
			if (choice === 'new') {
				// Redirecting to a new session follows the same no-delay path.
				dom.clearNode(badge);
				this._renderNewSessionBadge(badge, store, submittedInput, utterance, attachedContext, cts);
				return;
			}
			const match = results.find(r => r.sessionId === choice);
			current = { kind: 'session', sessionId: choice, label: labelById.get(choice) ?? choice, confidence: match?.confidence ?? 0 };
			renderLabel();
			startCountdown();
		};

		this._addActionLink(store, badge, localize('chatSessionRouting.change', "Change"), () => void change());
		this._addActionLink(store, badge, localize('chatSessionRouting.cancel', "Cancel"), cancel);

		// Typing in the input cancels the auto-send so an edit never silently sends.
		store.add(this.host.widget.inputEditor.onDidChangeModelContent(() => cancel()));

		startCountdown();
	}

	/**
	 * No-match badge: creates the new chat immediately (no countdown), fires the
	 * request, and — since the session resource exists right away — shows a link
	 * that opens the newly created chat.
	 */
	private _renderNewSessionBadge(
		badge: HTMLElement,
		store: DisposableStore,
		submittedInput: string,
		utterance: string,
		attachedContext: IChatRequestVariableEntry[] | undefined,
		cts: CancellationTokenSource,
	): void {
		const label = dom.append(badge, dom.$('span.chat-routing-badge-label'));

		let resource: URI | undefined;
		try {
			const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: `${this.debugOwner}-new` });
			this._retainSessionRef(ref.object.sessionResource, ref);
			resource = ref.object.sessionResource;
		} catch (err) {
			this.logService.warn('[chatSessionRouting] error starting a new session:', err);
		}

		if (!resource) {
			label.textContent = localize('chatSessionRouting.noMatchFailed', "No matching chat found — could not create a new chat");
			this._addActionLink(store, badge, localize('chatSessionRouting.dismiss', "Dismiss"), () => this._pendingSend.clear());
			return;
		}
		const sessionResource = resource;

		label.textContent = localize('chatSessionRouting.noMatch', "No matching chat found — sent to a new chat");
		this._addActionLink(store, badge, localize('chatSessionRouting.openNewChat', "Open new chat"), () => {
			void this.chatWidgetService.openSession(sessionResource);
		});
		this._addActionLink(store, badge, localize('chatSessionRouting.dismiss', "Dismiss"), () => this._pendingSend.clear());

		// Fire the request; the badge stays so the link remains usable.
		void this._sendToNewSession(sessionResource, submittedInput, utterance, attachedContext, cts.token);
	}

	/**
	 * Show a brief "Sent to …" confirmation after a matched send, so an omni
	 * surface that can't render the response inline still confirms where the
	 * request went. Offers an "Open" link and auto-dismisses.
	 */
	private _showSentConfirmation(label: string, sessionId: string): void {
		let resource: URI;
		try {
			resource = URI.parse(sessionId);
		} catch {
			return;
		}

		const badge = dom.$('.chat-routing-badge');
		const labelEl = dom.append(badge, dom.$('span.chat-routing-badge-label'));
		labelEl.textContent = localize('chatSessionRouting.sentTo', "Sent to {0}", label);
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			return;
		}

		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
		this._addActionLink(store, badge, localize('chatSessionRouting.open', "Open"), () => void this.chatWidgetService.openSession(resource));
		this._addActionLink(store, badge, localize('chatSessionRouting.dismiss', "Dismiss"), () => this._pendingSend.clear());

		const targetWindow = dom.getWindow(badge);
		const handle = targetWindow.setTimeout(() => {
			if (this._pendingSend.value === store) {
				this._pendingSend.clear();
			}
		}, SENT_CONFIRMATION_MS);
		store.add(toDisposable(() => targetWindow.clearTimeout(handle)));

		this._pendingSend.value = store;
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

	/** Dispatch a resolved pending target, remembering it for next time. */
	private async _dispatchTo(target: PendingTarget, submittedInput: string, utterance: string, attachedContext: IChatRequestVariableEntry[] | undefined, token: CancellationToken): Promise<boolean> {
		if (target.kind === 'new') {
			return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
		}
		return this._dispatchToSession(target.sessionId, submittedInput, utterance, attachedContext, token);
	}

	/** Send to an already-created new session (used by the no-delay no-match flow). */
	private async _sendToNewSession(resource: URI, submittedInput: string, utterance: string, attachedContext: IChatRequestVariableEntry[] | undefined, token: CancellationToken): Promise<void> {
		try {
			const result = await this.chatService.sendRequest(resource, utterance, attachedContext?.length ? { attachedContext } : undefined);
			if (token.isCancellationRequested) {
				return;
			}
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatSessionRouting] new session rejected the request');
				return;
			}
			this._clearInputIfUnchanged(submittedInput);
		} catch (err) {
			if (!token.isCancellationRequested) {
				this.logService.warn('[chatSessionRouting] error sending to new session:', err);
			}
		}
	}

	private async _dispatchToSession(sessionId: string, submittedInput: string, utterance: string, attachedContext: IChatRequestVariableEntry[] | undefined, token: CancellationToken): Promise<boolean> {
		let target: URI;
		try {
			target = URI.parse(sessionId);
		} catch (err) {
			this.logService.warn('[chatSessionRouting] invalid session id for routing:', sessionId, err);
			return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
		}

		try {
			const ref = await this.chatService.acquireOrLoadSession(target, ChatAgentLocation.Chat, token, `${this.debugOwner}-route`);
			if (token.isCancellationRequested) {
				ref?.dispose();
				return true;
			}
			if (!ref) {
				this.logService.warn('[chatSessionRouting] could not load routed session, starting a new one:', sessionId);
				return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
			}
			this._retainSessionRef(target, ref);
			const result = await this.chatService.sendRequest(target, utterance, attachedContext?.length ? { attachedContext } : undefined);
			if (token.isCancellationRequested) {
				return true;
			}
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatSessionRouting] routed session rejected the request, starting a new one:', sessionId);
				return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
			}
			// Remember this session so the next request biases toward it.
			this.storageService.store(LAST_TARGET_STORAGE_KEY, sessionId, StorageScope.WORKSPACE, StorageTarget.MACHINE);
			this._clearInputIfUnchanged(submittedInput);
			return true;
		} catch (err) {
			if (token.isCancellationRequested) {
				return true;
			}
			this.logService.warn('[chatSessionRouting] error dispatching to routed session, starting a new one:', err);
			return this._dispatchToNewSession(submittedInput, utterance, attachedContext, token);
		}
	}

	private async _dispatchToNewSession(submittedInput: string, utterance: string, attachedContext: IChatRequestVariableEntry[] | undefined, token: CancellationToken): Promise<boolean> {
		try {
			const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: `${this.debugOwner}-new` });
			if (token.isCancellationRequested) {
				ref.dispose();
				return true;
			}
			this._retainSessionRef(ref.object.sessionResource, ref);
			const result = await this.chatService.sendRequest(ref.object.sessionResource, utterance, attachedContext?.length ? { attachedContext } : undefined);
			if (token.isCancellationRequested) {
				return true;
			}
			if (!result || result.kind === 'rejected') {
				this.logService.warn('[chatSessionRouting] new session rejected the request, running locally');
				return false;
			}
			this._clearInputIfUnchanged(submittedInput);
			return true;
		} catch (err) {
			if (token.isCancellationRequested) {
				return true;
			}
			this.logService.warn('[chatSessionRouting] error starting a new session, running locally:', err);
			return false;
		}
	}

	/**
	 * Retain at most one reference per session resource so a long-lived host
	 * doesn't accumulate model references (and their sessions) as more requests
	 * are routed to the same target.
	 */
	private _retainSessionRef(resource: URI, ref: IChatModelReference): void {
		if (this._routedSessionRefs.has(resource)) {
			ref.dispose();
			return;
		}
		this._routedSessionRefs.set(resource, ref);
	}

	/**
	 * Clear the input (and its explicit attachments) only if the editor still
	 * holds exactly what was submitted, so a newer draft typed while the request
	 * was in flight is preserved.
	 */
	private _clearInputIfUnchanged(submittedInput: string): void {
		const editor = this.host.widget.inputEditor;
		if (editor.getValue() === submittedInput) {
			editor.setValue('');
			this.host.widget.attachmentModel.clear();
		}
	}

	override dispose(): void {
		this._pendingSend.clear();
		for (const ref of this._routedSessionRefs.values()) {
			ref.dispose();
		}
		this._routedSessionRefs.clear();
		super.dispose();
	}
}
