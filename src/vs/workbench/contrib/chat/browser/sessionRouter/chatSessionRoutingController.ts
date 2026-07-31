/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../base/browser/keyboardEvent.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatRequestVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { IChatModelReference, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionHistoryItem, IChatSessionsService } from '../../common/chatSessionsService.js';
import { heuristicScore, IRoutableSession, ISessionRouteResult, ISessionRouter, ROUTER_FIELD_CLIP_LENGTH } from '../../common/sessionRouter.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
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
 * How many top pre-ranked candidates get their conversation transcript fetched
 * for the final content-aware score. Bounds how many session-content resolves a
 * single submission triggers while still covering the plausible matches.
 */
const ROUTE_ENRICH_MAX_CANDIDATES = 5;

/**
 * How long the pending-send badge counts down before auto-dispatching to the
 * routed target. Long enough to read the target and intervene, short enough to
 * keep a hands-free/voice flow moving.
 */
const ROUTE_AUTOSEND_DELAY_MS = 10000;

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
	/**
	 * Insert the advisory badge into the host DOM near the input.
	 * If the host has no surface to place it, leave the badge disconnected and
	 * the controller will fall back to an immediate dispatch.
	 */
	placeBadge(badge: HTMLElement): void;
}

/**
 * Shared routing + advisory-badge behaviour for chat input surfaces. Scores a
 * submitted utterance against existing agent sessions, resolves a pending target
 * (best match above threshold, else a new session), then shows a ranked panel
 * that counts down and auto-sends. The user can change or fan out the selection,
 * abort, or keep typing to cancel before it fires. The last routed session is
 * remembered to bias the next turn.
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
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ISessionRouter private readonly sessionRouter: ISessionRouter,
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

		// Stage 1: cheaply pre-rank on in-memory metadata to pick a shortlist, then
		// stage 2: enrich only that shortlist with conversation content before the
		// final model score. This keeps transcript resolves bounded per submission.
		const shortlist = this._preRankCandidates(candidates, utterance);
		const enriched = shortlist.length ? await this._enrichCandidates(shortlist, token) : [];
		if (token.isCancellationRequested) {
			return true;
		}

		const results = enriched.length ? await this._route(enriched, utterance, token) : [];
		if (token.isCancellationRequested) {
			return true;
		}

		const target = this._resolveTarget(results, enriched);
		this._beginPendingSend(target, results, enriched, query, utterance, attachedContext, cts);
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
				&& session.providerType !== AgentSessionProviders.Local)
			.map(session => this._toRoutableSession(session));
	}

	private _toRoutableSession(session: IAgentSession): IRoutableSession {
		return {
			sessionId: session.resource.toString(),
			label: session.label,
			status: statusToString(session.status),
			lastActivity: session.timing?.lastRequestEnded ?? session.timing?.lastRequestStarted ?? session.timing?.created,
			description: markdownToText(session.description),
		};
	}

	/**
	 * Stage 1: cheap, in-memory pre-rank to pick which candidates are worth
	 * enriching. Uses the offline token-overlap heuristic over the metadata we
	 * already hold, then keeps the top {@link ROUTE_ENRICH_MAX_CANDIDATES}. Any
	 * candidate the heuristic can't score (all zero, e.g. empty utterance) still
	 * passes through up to the cap so routing never starves on a weak pre-rank.
	 */
	private _preRankCandidates(candidates: IRoutableSession[], utterance: string): IRoutableSession[] {
		if (candidates.length <= ROUTE_ENRICH_MAX_CANDIDATES) {
			return candidates;
		}
		const byId = new Map(candidates.map(c => [c.sessionId, c]));
		const ranked = heuristicScore({ utterance, sessions: candidates });
		return ranked
			.slice(0, ROUTE_ENRICH_MAX_CANDIDATES)
			.map(r => byId.get(r.sessionId))
			.filter((c): c is IRoutableSession => !!c);
	}

	/**
	 * Stage 2: enrich the shortlisted candidates with conversation content (first
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
			const session = await this.chatSessionsService.getOrCreateChatSession(resource, token);
			if (token.isCancellationRequested) {
				return candidate;
			}
			return this._applyHistory(candidate, session.history);
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

		if (target.kind === 'new' && results.length === 0) {
			// With no alternatives to show, create and send to a new chat right
			// away, then surface a link to it in the badge as soon as it exists.
			this._renderNewSessionBadge(badge, store, submittedInput, utterance, attachedContext, cts);
		} else {
			this._renderCountdownBadge(badge, store, target, results, candidates, submittedInput, utterance, attachedContext, cts);
		}
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
		results: ISessionRouteResult[],
		candidates: IRoutableSession[],
		submittedInput: string,
		utterance: string,
		attachedContext: IChatRequestVariableEntry[] | undefined,
		cts: CancellationTokenSource,
	): void {
		const targetWindow = dom.getWindow(badge);
		badge.classList.add('chat-routing-badge-ranked');

		const labelById = new Map(candidates.map(candidate => [candidate.sessionId, candidate.label]));
		const ranked = results
			.filter(result => labelById.has(result.sessionId))
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
			{ kind: 'new', label: localize('chatSessionRouting.startNewSession', "Start a new session") },
		];
		const preselected = Math.max(0, options.findIndex(option =>
			target.kind === 'session'
				? option.kind === 'session' && option.sessionId === target.sessionId
				: option.kind === 'new'));
		const selection = new Set<number>([preselected]);

		const head = dom.append(badge, dom.$('.chat-routing-badge-head'));
		const headLabel = dom.append(head, dom.$('span.chat-routing-badge-title'));
		const countdownEl = dom.append(head, dom.$('span.chat-routing-badge-countdown'));
		const list = dom.append(badge, dom.$('.chat-routing-badge-list', { role: 'listbox', 'aria-label': localize('chatSessionRouting.sendTo', "Send to") }));
		const rows = options.map((option, index) => {
			const row = dom.append(list, dom.$('.chat-routing-badge-row', { role: 'option', tabindex: '0' }));
			const mark = dom.append(row, dom.$('span.chat-routing-badge-mark'));
			mark.appendChild(renderIcon(Codicon.pass));
			const label = dom.append(row, dom.$('span.chat-routing-badge-name'));
			label.textContent = option.label;
			if (option.kind === 'session') {
				const meter = dom.append(row, dom.$('span.chat-routing-badge-meter'));
				const fill = dom.append(meter, dom.$('span'));
				fill.style.width = `${Math.round(option.confidence * 100)}%`;
			}
			const score = dom.append(row, dom.$('span.chat-routing-badge-score'));
			score.textContent = option.kind === 'session'
				? localize('chatSessionRouting.match', "{0}%", Math.round(option.confidence * 100))
				: '';
			store.add(dom.addDisposableListener(row, dom.EventType.CLICK, event => {
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
		changeHint.textContent = localize('chatSessionRouting.changeHint', "\u2325 to change \u00B7 \u2318click for several \u00B7 Escape to cancel");
		const sendHint = dom.append(foot, dom.$('span.chat-routing-badge-foot-end'));

		const renderSelection = () => {
			rows.forEach((row, index) => {
				const selected = selection.has(index);
				row.classList.toggle('selected', selected);
				row.setAttribute('aria-selected', String(selected));
				row.tabIndex = selected ? 0 : -1;
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

		let remainingSeconds = Math.ceil(ROUTE_AUTOSEND_DELAY_MS / 1000);
		const renderCountdown = () => {
			countdownEl.textContent = localize('chatSessionRouting.sendingIn', "sending in {0}s", remainingSeconds);
		};

		const send = () => {
			this._pendingSend.clear();
			const sent = [...selection].sort((a, b) => a - b).map(index => options[index]);
			if (!sent.length) {
				return;
			}
			const dispatches = sent.map(selected =>
				this._dispatchTo(selected, submittedInput, utterance, attachedContext, cts.token)
			);
			if (sent.length > 1) {
				this._showFanoutConfirmation(sent.length);
				return;
			}
			void dispatches[0].then(ok => {
				const selected = sent[0];
				if (ok && selected.kind === 'session' && this._submitCts.value === cts) {
					this._showSentConfirmation(selected.label, selected.sessionId);
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
		};

		store.add(dom.addDisposableListener(targetWindow, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			if (keyboardEvent.equals(KeyCode.Alt)) {
				keyboardEvent.preventDefault();
				const from = selection.size === 1 ? [...selection][0] : preselected;
				selection.clear();
				selection.add((from + 1) % options.length);
				renderSelection();
				countdownTimer.clear();
				countdownEl.textContent = localize('chatSessionRouting.waiting', "waiting for you");
			} else if (keyboardEvent.equals(KeyCode.Enter)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				send();
			} else if (keyboardEvent.equals(KeyCode.Escape)) {
				keyboardEvent.preventDefault();
				keyboardEvent.stopPropagation();
				cancel();
			}
		}, true));

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
		const mark = dom.append(badge, dom.$('span.chat-routing-badge-sent-mark'));
		mark.appendChild(renderIcon(Codicon.pass));
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

	private _showFanoutConfirmation(count: number): void {
		const badge = dom.$('.chat-routing-badge');
		const mark = dom.append(badge, dom.$('span.chat-routing-badge-sent-mark'));
		mark.appendChild(renderIcon(Codicon.pass));
		const label = dom.append(badge, dom.$('span.chat-routing-badge-label'));
		label.textContent = localize('chatSessionRouting.sentToMany', "Sent to {0} sessions", count);
		this.host.placeBadge(badge);
		if (!badge.parentElement) {
			return;
		}

		const store = new DisposableStore();
		store.add(toDisposable(() => badge.remove()));
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
