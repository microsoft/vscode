/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { getFailedChecks, buildFixCIPrompt, submitFixCIChecks } from '../../changes/browser/checksActions.js';
import { whenChatWidgetForSession } from '../../chat/browser/chatWidgetUtils.js';
import type { ISessionChatPillsDebugData } from '../../chat/browser/sessionChatInputToolbarDebug.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubCheckStatus, GitHubPullRequestState, OPEN_PULL_REQUEST_ACTION_ID } from '../../github/common/types.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { getGitHubPullRequestRefs, IGitHubPullRequestRef, SessionStatus } from '../../../services/sessions/common/session.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionInputBanner, ISessionInputBannerAction, SessionInputBannerWidget } from './sessionInputBannerWidget.js';

const STORAGE_KEY_DISMISSED = 'sessions.inputBanners.dismissedItems';
const LEGACY_STORAGE_KEY_CI_DISMISSED = 'sessions.inputBanners.ci.dismissed';
const LEGACY_STORAGE_KEY_COMMENTS_DISMISSED = 'sessions.inputBanners.comments.dismissed';

interface IBaseBannerState {
	readonly id: string;
	readonly sessionId: string;
	readonly sessionResource: URI;
	readonly commentIds: readonly string[];
	readonly firstCommentId: string | undefined;
	readonly debug?: true;
}

interface IPRBannerState extends IBaseBannerState {
	readonly kind: 'pullRequest';
	readonly pullRequest: IGitHubPullRequestRef;
	readonly title: string | undefined;
	readonly failed: number;
	readonly completed: number;
	readonly pending: number;
	readonly multiplePullRequests: boolean;
}

interface IAgentCommentsBannerState extends IBaseBannerState {
	readonly kind: 'agentComments';
}

type BannerState = IPRBannerState | IAgentCommentsBannerState;

function pullRequestKey(pullRequest: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>): string {
	return `${pullRequest.owner.toLowerCase()}/${pullRequest.repo.toLowerCase()}#${pullRequest.number}`;
}

function pullRequestBannerId(sessionId: string, pullRequest: IGitHubPullRequestRef): string {
	return `${sessionId}:pullRequest:${pullRequestKey(pullRequest)}`;
}

function agentCommentsBannerId(sessionId: string): string {
	return `${sessionId}:agentComments`;
}

function feedbackForPullRequest(feedback: IAgentFeedback, pullRequest: IGitHubPullRequestRef, firstPullRequest: IGitHubPullRequestRef | undefined): boolean {
	if (feedback.kind !== AgentFeedbackKind.PRReview) {
		return false;
	}
	const source = feedback.sourcePullRequest ?? firstPullRequest;
	return !!source && pullRequestKey(source) === pullRequestKey(pullRequest);
}

/**
 * Hosts one actionable banner directly above the active session's chat input.
 * Multiple pull requests and agent-review comments are presented as carousel
 * items within that single banner.
 */
export class SessionInputBanners extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _active = observableValue<boolean>(this, false);
	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);
	private readonly _dismissed = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _legacyCIDismissed = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _legacyCommentsDismissed = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _feedbackChanged: IObservable<void>;
	private readonly _widget: SessionInputBannerWidget;

	private readonly _session = derived(this, reader => {
		if (!this._active.read(reader)) {
			return undefined;
		}
		const session = this.sessionsService.activeSession.read(reader);
		if (!session || session.status.read(reader) !== SessionStatus.Completed) {
			return undefined;
		}
		return session;
	});

	private readonly _agentMergeEnabled = derived(this, reader => {
		const session = this._session.read(reader);
		const provider = session && this.sessionsProvidersService.getProvider(session.providerId);
		if (!session || !provider || !isAgentHostProvider(provider)) {
			return false;
		}
		observableSignalFromEvent(reader.store, Event.filter(provider.onDidChangeSessionConfig, sessionId => sessionId === session.sessionId)).read(reader);
		return provider.getAgentMergeSessionState(session.sessionId)?.enabled === true;
	});

	private readonly _states: IObservable<readonly BannerState[]> = derived(this, reader => {
		const debugData = this._debugData.read(reader);
		if (debugData) {
			return this._debugStates(debugData);
		}

		const session = this._session.read(reader);
		if (!session) {
			return [];
		}

		this._feedbackChanged.read(reader);
		const createdFeedback = this.feedbackService.getFeedback(session.resource)
			.filter(item => item.state === AgentFeedbackState.Created);
		const gitHubInfo = session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
		const pullRequests = getGitHubPullRequestRefs(gitHubInfo);
		const onlyPullRequest = pullRequests.length === 1 ? pullRequests[0] : undefined;
		const dismissed = this._dismissed.read(reader);
		const legacyCIDismissed = this._legacyCIDismissed.read(reader).has(session.sessionId);
		const legacyCommentsDismissed = this._legacyCommentsDismissed.read(reader).has(session.sessionId);
		const states: BannerState[] = [];

		if (!this._agentMergeEnabled.read(reader)) {
			for (const pullRequest of pullRequests) {
				const id = pullRequestBannerId(session.sessionId, pullRequest);
				if (dismissed.has(id)) {
					continue;
				}

				const comments = legacyCommentsDismissed
					? []
					: createdFeedback.filter(item => feedbackForPullRequest(item, pullRequest, onlyPullRequest));
				const prModelRef = reader.store.add(this.gitHubService.createPullRequestModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number));
				const livePullRequest = prModelRef.object.pullRequest.read(reader);
				let failed = 0;
				let completed = 0;
				let pending = 0;
				if (!legacyCIDismissed && livePullRequest && !livePullRequest.isDraft && livePullRequest.state === GitHubPullRequestState.Open) {
					const ciModelRef = reader.store.add(this.gitHubService.createPullRequestCIModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number, livePullRequest.headSha));
					const ciModel = ciModelRef.object;
					if (!ciModel.fixRequested.read(reader)) {
						const checks = ciModel.checks.read(reader);
						failed = getFailedChecks(checks).length;
						completed = checks.filter(check => check.status === GitHubCheckStatus.Completed).length;
						pending = checks.length - completed;
					}
				}

				if (failed === 0 && comments.length === 0) {
					continue;
				}

				states.push({
					id,
					kind: 'pullRequest',
					sessionId: session.sessionId,
					sessionResource: session.resource,
					pullRequest,
					title: livePullRequest?.title ?? pullRequest.title,
					failed,
					completed,
					pending,
					commentIds: comments.map(comment => comment.id),
					firstCommentId: comments[0]?.id,
					multiplePullRequests: pullRequests.length > 1,
				});
			}
		}

		const agentComments = legacyCommentsDismissed
			? []
			: createdFeedback.filter(item => item.kind === AgentFeedbackKind.AgentReview);
		const agentCommentsId = agentCommentsBannerId(session.sessionId);
		if (agentComments.length > 0 && !dismissed.has(agentCommentsId)) {
			states.push({
				id: agentCommentsId,
				kind: 'agentComments',
				sessionId: session.sessionId,
				sessionResource: session.resource,
				commentIds: agentComments.map(comment => comment.id),
				firstCommentId: agentComments[0].id,
			});
		}

		return states;
	});

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IAgentFeedbackService private readonly feedbackService: IAgentFeedbackService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) {
		super();

		this.domNode = dom.$('.session-input-banners.empty');
		this._widget = this._register(instantiationService.createInstance(SessionInputBannerWidget, []));
		this.domNode.appendChild(this._widget.domNode);
		this._feedbackChanged = observableSignalFromEvent(this, this.feedbackService.onDidChangeFeedback);

		this._loadDismissedState();
		this._registerStorageListener(STORAGE_KEY_DISMISSED, this._dismissed);
		this._registerStorageListener(LEGACY_STORAGE_KEY_CI_DISMISSED, this._legacyCIDismissed);
		this._registerStorageListener(LEGACY_STORAGE_KEY_COMMENTS_DISMISSED, this._legacyCommentsDismissed);

		this._register(autorun(reader => {
			const states = this._states.read(reader);
			const banners = states.map((state, index) => this._toBanner(state, index, states.length));
			this.domNode.classList.toggle('empty', banners.length === 0);
			this._widget.setBanners(banners);
		}));

		this._register(autorun(reader => {
			const session = this._session.read(reader);
			if (!session || this._agentMergeEnabled.read(reader)) {
				return;
			}
			const gitHubInfo = session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			for (const pullRequest of getGitHubPullRequestRefs(gitHubInfo)) {
				const prModelRef = reader.store.add(this.gitHubService.createPullRequestModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number));
				const prModel = prModelRef.object;
				void prModel.refresh();
				reader.store.add(prModel.startPolling());
				const livePullRequest = prModel.pullRequest.read(reader);
				if (!livePullRequest || livePullRequest.isDraft || livePullRequest.state !== GitHubPullRequestState.Open) {
					continue;
				}
				const ciModelRef = reader.store.add(this.gitHubService.createPullRequestCIModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number, livePullRequest.headSha));
				void ciModelRef.object.refresh();
				reader.store.add(ciModelRef.object.startPolling());
			}
		}));
	}

	setActive(active: boolean): void {
		this._active.set(active, undefined);
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
	}

	private _debugStates(data: ISessionChatPillsDebugData): readonly BannerState[] {
		const states: BannerState[] = [];
		if (data.ciFailed > 0 || data.prFeedback > 0) {
			states.push({
				id: 'debug:pullRequest',
				kind: 'pullRequest',
				sessionId: 'debug',
				sessionResource: URI.from({ scheme: 'session-chat-pills-debug', path: '/pull-request' }),
				pullRequest: {
					owner: 'microsoft',
					repo: 'vscode',
					number: 123,
					uri: URI.parse('https://github.com/microsoft/vscode/pull/123'),
				},
				title: localize('inputBanner.examplePullRequest', "Example Pull Request"),
				failed: data.ciFailed,
				completed: data.ciFailed,
				pending: data.ciPending,
				commentIds: Array.from({ length: data.prFeedback }, (_, index) => `debug-pr-${index}`),
				firstCommentId: data.prFeedback > 0 ? 'debug-pr-0' : undefined,
				multiplePullRequests: false,
				debug: true,
			});
		}
		if (data.agentFeedback > 0) {
			states.push({
				id: 'debug:agentComments',
				kind: 'agentComments',
				sessionId: 'debug',
				sessionResource: URI.from({ scheme: 'session-chat-pills-debug', path: '/agent-comments' }),
				commentIds: Array.from({ length: data.agentFeedback }, (_, index) => `debug-agent-${index}`),
				firstCommentId: 'debug-agent-0',
				debug: true,
			});
		}
		return states;
	}

	private _toBanner(state: BannerState, index: number, total: number): ISessionInputBanner {
		const compact = total > 1;
		const text = state.kind === 'pullRequest'
			? this._pullRequestText(state, compact)
			: this._commentsText('agent', state.commentIds.length);
		const reference = state.kind === 'pullRequest'
			? {
				label: `#${state.pullRequest.number}`,
				hover: state.title
					? localize('inputBanner.pullRequestHoverWithTitle', "Pull Request #{0}: {1}", state.pullRequest.number, state.title)
					: localize('inputBanner.pullRequestHover', "Pull Request #{0}", state.pullRequest.number),
			}
			: compact ? {
				label: localize('inputBanner.agentReview', "Agent Review"),
				hover: localize('inputBanner.agentReviewHover', "In-product agent review comments"),
			} : undefined;
		const showReference = state.kind === 'pullRequest' ? state.multiplePullRequests : compact;
		const position = compact
			? localize('inputBanner.positionAria', "Item {0} of {1}", index + 1, total)
			: undefined;
		const referenceLabel = showReference ? reference?.label : undefined;
		const ariaLabel = position && referenceLabel
			? localize('inputBanner.ariaLabelWithPositionAndReference', "{0}, {1}, {2}", position, referenceLabel, text)
			: position
				? localize('inputBanner.ariaLabelWithPosition', "{0}, {1}", position, text)
				: referenceLabel
					? localize('inputBanner.ariaLabelWithReference', "{0}, {1}", referenceLabel, text)
					: text;

		return {
			id: state.id,
			icon: state.kind === 'pullRequest' && state.failed > 0 ? Codicon.warning : Codicon.commentDiscussion,
			accent: state.kind === 'pullRequest' && state.failed > 0,
			text,
			ariaLabel,
			reference: showReference ? reference : undefined,
			dismissTooltip: localize('inputBanner.dismiss', "Hide this item for this session"),
			actions: state.kind === 'pullRequest' ? this._pullRequestActions(state) : this._agentCommentActions(state),
			focusAfterDismiss: () => this.chatWidgetService.getWidgetBySessionResource(state.sessionResource)?.focusInput(),
			dismiss: () => { if (!state.debug) { this._dismiss(state.id); } },
		};
	}

	private _pullRequestText(state: IPRBannerState, compact: boolean): string {
		const checks = state.failed > 0 ? this._checksText(state, compact) : undefined;
		const comments = state.commentIds.length > 0 ? this._commentsText('pr', state.commentIds.length) : undefined;
		return checks && comments
			? localize('inputBanner.combinedText', "{0} | {1}", checks, comments)
			: checks ?? comments ?? '';
	}

	private _checksText(state: IPRBannerState, compact: boolean): string {
		if (compact) {
			return state.failed === 1
				? localize('inputBanner.oneCheckFailing', "1 Check Failing")
				: localize('inputBanner.checksFailing', "{0} Checks Failing", state.failed);
		}
		const failedText = state.completed === 1
			? localize('inputBanner.oneCheckFailed', "1 check failed")
			: localize('inputBanner.checksFailed', "{0} out of {1} checks failed", state.failed, state.completed);
		return state.pending > 0
			? localize('inputBanner.checksFailedPending', "{0}, {1} pending", failedText, state.pending)
			: failedText;
	}

	private _commentsText(kind: 'pr' | 'agent', count: number): string {
		if (kind === 'pr') {
			return count === 1
				? localize('inputBanner.onePRComment', "1 PR Comment")
				: localize('inputBanner.prComments', "{0} PR Comments", count);
		}
		return count === 1
			? localize('inputBanner.oneAgentComment', "1 Agent Comment")
			: localize('inputBanner.agentComments', "{0} Agent Comments", count);
	}

	private _pullRequestActions(state: IPRBannerState): readonly ISessionInputBannerAction[] {
		const hasCI = state.failed > 0;
		const hasComments = state.commentIds.length > 0;
		const fixCI: ISessionInputBannerAction = {
			id: 'fixCI',
			label: localize('inputBanner.fixChecks', "Fix Checks"),
			primary: true,
			waitUntilReady: () => state.debug ? Promise.resolve(true) : this._waitForChatModel(state.sessionResource),
			run: () => state.debug ? undefined : this._fixChecks(state),
		};
		const addressComments: ISessionInputBannerAction = {
			id: 'addressComments',
			label: localize('inputBanner.addressComments', "Address Comments"),
			primary: true,
			waitUntilReady: () => state.debug ? Promise.resolve(true) : this._waitForChatModel(state.sessionResource),
			run: () => state.debug ? undefined : this._addressComments(state, this._queryFor(state, '/act-on-feedback')),
		};
		const primary = hasCI && hasComments ? {
			id: 'fixCIAndAddressComments',
			label: localize('inputBanner.fixChecksAndAddressComments', "Fix Checks & Address Comments"),
			primary: true,
			dropdownActions: [fixCI, addressComments],
			waitUntilReady: () => state.debug ? Promise.resolve(true) : this._waitForChatModel(state.sessionResource),
			run: () => state.debug ? undefined : this._fixCIAndAddressComments(state),
		} satisfies ISessionInputBannerAction : hasCI ? fixCI : addressComments;

		const revealCI: ISessionInputBannerAction = {
			id: 'revealCI',
			label: localize('inputBanner.revealChecks', "Reveal"),
			run: () => { if (!state.debug) { void this._revealPullRequest(state.pullRequest); } },
		};
		const revealComments: ISessionInputBannerAction = {
			id: 'revealComments',
			label: localize('inputBanner.revealPRComments', "Reveal"),
			run: () => { if (!state.debug && state.firstCommentId) { this._revealComment(state.sessionResource, state.firstCommentId); } },
		};
		return hasCI && hasComments ? [primary] : [primary, hasCI ? revealCI : revealComments];
	}

	private _agentCommentActions(state: IAgentCommentsBannerState): readonly ISessionInputBannerAction[] {
		return [{
			id: 'addressComments',
			label: localize('inputBanner.addressComments', "Address Comments"),
			primary: true,
			waitUntilReady: () => state.debug ? Promise.resolve(true) : this._waitForChatModel(state.sessionResource),
			run: () => state.debug ? undefined : this._addressComments(state, '/act-on-feedback'),
		}, {
			id: 'revealComments',
			label: localize('inputBanner.revealAgentComments', "Reveal"),
			run: () => { if (!state.debug && state.firstCommentId) { this._revealComment(state.sessionResource, state.firstCommentId); } },
		}];
	}

	private _queryFor(state: IPRBannerState, query: string): string {
		return state.multiplePullRequests ? `${query} for #${state.pullRequest.number}` : query;
	}

	private async _fixChecks(state: IPRBannerState): Promise<void> {
		const widget = this.chatWidgetService.getWidgetBySessionResource(state.sessionResource);
		if (!widget) {
			this.logService.error('[SessionInputBanners] Cannot fix CI checks: chat model is unavailable', state.sessionResource.toString(), state.pullRequest.number);
			return;
		}
		await this._withCurrentCIModel(state, ciModel => submitFixCIChecks(ciModel, widget, this._queryFor(state, '/fix-ci')));
	}

	private async _fixCIAndAddressComments(state: IPRBannerState): Promise<void> {
		await this._withCurrentCIModel(state, async ciModel => {
			this._acceptComments(state);
			const prompt = await buildFixCIPrompt(ciModel, this._queryFor(state, '/fix-ci and /act-on-feedback'));
			if (!prompt) {
				this.logService.warn('[SessionInputBanners] CI failures disappeared before the combined request was submitted', state.pullRequest.number);
				await this._submitComments(state, this._queryFor(state, '/act-on-feedback'));
				return;
			}
			const submitted = await this.feedbackService.submitFeedback(state.sessionResource, {
				query: prompt,
				feedbackIds: state.commentIds,
				onRequestAccepted: () => ciModel.markFixRequested(),
			});
			if (!submitted) {
				this.logService.error('[SessionInputBanners] Failed to submit combined CI and comments request', state.sessionResource.toString(), state.pullRequest.number);
			}
		});
	}

	private async _withCurrentCIModel(state: IPRBannerState, task: (ciModel: GitHubPullRequestCIModel) => Promise<void>): Promise<void> {
		const store = new DisposableStore();
		try {
			const pullRequestRef = store.add(this.gitHubService.createPullRequestModelReference(state.pullRequest.owner, state.pullRequest.repo, state.pullRequest.number));
			const pullRequest = pullRequestRef.object.pullRequest.get();
			if (!pullRequest) {
				this.logService.error('[SessionInputBanners] Cannot act on CI: pull request model is unavailable', state.sessionResource.toString(), state.pullRequest.number);
				return;
			}
			const ciModelRef = store.add(this.gitHubService.createPullRequestCIModelReference(state.pullRequest.owner, state.pullRequest.repo, state.pullRequest.number, pullRequest.headSha));
			await task(ciModelRef.object);
		} finally {
			store.dispose();
		}
	}

	private async _addressComments(state: IBaseBannerState, query: string): Promise<void> {
		this._acceptComments(state);
		await this._submitComments(state, query);
	}

	private _acceptComments(state: IBaseBannerState): void {
		for (const commentId of state.commentIds) {
			this.feedbackService.acceptFeedback(state.sessionResource, commentId);
		}
	}

	private async _submitComments(state: IBaseBannerState, query: string): Promise<void> {
		const submitted = await this.feedbackService.submitFeedback(state.sessionResource, {
			query,
			feedbackIds: state.commentIds,
		});
		if (!submitted) {
			this.logService.error('[SessionInputBanners] Failed to submit comments', state.sessionResource.toString());
		}
	}

	private async _waitForChatModel(sessionResource: URI): Promise<boolean> {
		const widget = await whenChatWidgetForSession(this.chatWidgetService, sessionResource);
		if (widget) {
			return true;
		}
		this.logService.error('[SessionInputBanners] Chat model did not load for session', sessionResource.toString());
		return false;
	}

	private async _revealPullRequest(pullRequest: IGitHubPullRequestRef): Promise<void> {
		try {
			await this.commandService.executeCommand(OPEN_PULL_REQUEST_ACTION_ID, { pullRequest });
		} catch (err) {
			this.logService.error('[SessionInputBanners] Failed to reveal pull request', pullRequest.number, err);
		}
	}

	private _revealComment(sessionResource: URI, commentId: string): void {
		this.feedbackService.revealFeedback(sessionResource, commentId).catch(err => this.logService.error('[SessionInputBanners] Failed to reveal comment', err));
	}

	private _dismiss(id: string): void {
		const next = new Set(this._dismissed.get());
		next.add(id);
		this.storageService.store(STORAGE_KEY_DISMISSED, JSON.stringify([...next]), StorageScope.PROFILE, StorageTarget.USER);
		this._dismissed.set(next, undefined);
	}

	private _loadDismissedState(): void {
		this._dismissed.set(this._readDismissed(STORAGE_KEY_DISMISSED), undefined);
		this._legacyCIDismissed.set(this._readDismissed(LEGACY_STORAGE_KEY_CI_DISMISSED), undefined);
		this._legacyCommentsDismissed.set(this._readDismissed(LEGACY_STORAGE_KEY_COMMENTS_DISMISSED), undefined);
	}

	private _registerStorageListener(storageKey: string, target: ISettableObservable<ReadonlySet<string>>): void {
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, storageKey, this._store)(() => {
			target.set(this._readDismissed(storageKey), undefined);
		}));
	}

	private _readDismissed(storageKey: string): ReadonlySet<string> {
		const raw = this.storageService.get(storageKey, StorageScope.PROFILE);
		if (!raw) {
			return new Set();
		}
		try {
			const parsed: unknown = JSON.parse(raw);
			return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
		} catch {
			return new Set();
		}
	}
}
