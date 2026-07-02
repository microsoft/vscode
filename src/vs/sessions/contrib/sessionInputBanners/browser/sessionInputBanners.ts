/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { autorun, derived, IObservable, ISettableObservable, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { GitHubCheckStatus } from '../../github/common/types.js';
import { FIX_CI_CHECKS_COMMAND_ID, getFailedChecks, REVEAL_CI_CHECKS_COMMAND_ID } from '../../changes/browser/checksActions.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from '../../agentFeedback/browser/agentFeedbackService.js';
import { ISessionInputBanner, SessionInputBannerWidget } from './sessionInputBannerWidget.js';

/** Persisted set of session ids whose CI banner the user dismissed. */
const STORAGE_KEY_CI_DISMISSED = 'sessions.inputBanners.ci.dismissed';
/** Persisted set of session ids whose comments banner the user dismissed. */
const STORAGE_KEY_COMMENTS_DISMISSED = 'sessions.inputBanners.comments.dismissed';

/**
 * Feedback kinds that originate from a review the user triages (a pull request
 * review or an in-product code review), matching the comments surfaced to the
 * agent via the `viewUnreviewedComments` tool.
 */
const REVIEWABLE_KINDS: ReadonlySet<AgentFeedbackKind> = new Set([AgentFeedbackKind.PRReview, AgentFeedbackKind.AgentReview]);

interface ICIBannerState {
	readonly sessionId: string;
	readonly failed: number;
	/** Number of checks that have completed (succeeded or failed). */
	readonly completed: number;
	/** Number of checks still running or queued. */
	readonly pending: number;
}

interface ICommentsBannerState {
	readonly sessionId: string;
	readonly sessionResource: URI;
	readonly count: number;
	/** Whether all counted comments are PR reviews, all are agent reviews, or mixed. */
	readonly kind: 'pr' | 'agent' | 'mixed';
	readonly firstCommentId: string;
}

/**
 * Hosts the banners that render directly above the active session's chat input:
 * a CI failures banner and a created-comments banner. Each banner can be
 * permanently dismissed per session.
 *
 * The host is owned by the session's chat view and only shows content while
 * that view is the active session (driven via {@link setActive}); the CI model
 * and feedback are read for the active session.
 */
export class SessionInputBanners extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _ciSlot: HTMLElement;
	private readonly _commentsSlot: HTMLElement;

	private readonly _ciContent = this._register(new MutableDisposable<DisposableStore>());
	private readonly _commentsContent = this._register(new MutableDisposable<DisposableStore>());

	private readonly _active = observableValue<boolean>(this, false);

	private readonly _ciDismissed = observableValue<ReadonlySet<string>>(this, new Set());
	private readonly _commentsDismissed = observableValue<ReadonlySet<string>>(this, new Set());

	private _feedbackChanged!: IObservable<void>;

	/**
	 * The session whose banners should be shown, or undefined when inactive or
	 * while the session/chat is still in progress. Banners only surface once the
	 * session has completed so they don't distract from a running agent.
	 */
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

	private readonly _ciState: IObservable<ICIBannerState | undefined> = derived(this, reader => {
		const session = this._session.read(reader);
		if (!session || this._ciDismissed.read(reader).has(session.sessionId)) {
			return undefined;
		}
		const ciModel = this.gitHubService.activeSessionPullRequestCIObs.read(reader);
		if (!ciModel) {
			return undefined;
		}
		// Once the user has requested a CI fix for the current PR head commit,
		// hide the entire banner until a new commit lands on the PR.
		if (ciModel.fixRequested.read(reader)) {
			return undefined;
		}
		const checks = ciModel.checks.read(reader);
		const failed = getFailedChecks(checks).length;
		if (failed === 0) {
			return undefined;
		}
		const completed = checks.filter(check => check.status === GitHubCheckStatus.Completed).length;
		const pending = checks.length - completed;
		return { sessionId: session.sessionId, failed, completed, pending };
	});

	private readonly _commentsState: IObservable<ICommentsBannerState | undefined> = derived(this, reader => {
		const session = this._session.read(reader);
		if (!session || this._commentsDismissed.read(reader).has(session.sessionId)) {
			return undefined;
		}
		this._feedbackChanged.read(reader);
		const created = this.feedbackService.getFeedback(session.resource)
			.filter(item => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind));
		if (created.length === 0) {
			return undefined;
		}
		const allPR = created.every(item => item.kind === AgentFeedbackKind.PRReview);
		const allAgent = created.every(item => item.kind === AgentFeedbackKind.AgentReview);
		const kind = allPR ? 'pr' : allAgent ? 'agent' : 'mixed';
		return { sessionId: session.sessionId, sessionResource: session.resource, count: created.length, kind, firstCommentId: created[0].id };
	});

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@IGitHubService private readonly gitHubService: IGitHubService,
		@IAgentFeedbackService private readonly feedbackService: IAgentFeedbackService,
		@ICommandService private readonly commandService: ICommandService,
		@IStorageService private readonly storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.domNode = dom.$('.session-input-banners');
		this._ciSlot = dom.append(this.domNode, dom.$('.session-input-banner-slot'));
		this._commentsSlot = dom.append(this.domNode, dom.$('.session-input-banner-slot'));

		this._feedbackChanged = observableSignalFromEvent(this, this.feedbackService.onDidChangeFeedback);

		// Load persisted dismissal state and keep it in sync with other windows/profiles.
		this._ciDismissed.set(this._readDismissed(STORAGE_KEY_CI_DISMISSED), undefined);
		this._commentsDismissed.set(this._readDismissed(STORAGE_KEY_COMMENTS_DISMISSED), undefined);
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_CI_DISMISSED, this._store)(() => {
			this._ciDismissed.set(this._readDismissed(STORAGE_KEY_CI_DISMISSED), undefined);
		}));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, STORAGE_KEY_COMMENTS_DISMISSED, this._store)(() => {
			this._commentsDismissed.set(this._readDismissed(STORAGE_KEY_COMMENTS_DISMISSED), undefined);
		}));

		this._register(autorun(reader => this._renderCIBanner(this._ciState.read(reader))));
		this._register(autorun(reader => this._renderCommentsBanner(this._commentsState.read(reader))));
	}

	/** Marks whether the owning chat view is the active session. */
	setActive(active: boolean): void {
		this._active.set(active, undefined);
	}

	private _renderCIBanner(state: ICIBannerState | undefined): void {
		const store = this._ciContent.value = new DisposableStore();
		dom.clearNode(this._ciSlot);
		if (!state) {
			return;
		}

		const failedText = state.completed === 1
			? localize('ci.oneCheckFailed', "1 check failed")
			: localize('ci.checksFailed', "{0} out of {1} checks failed", state.failed, state.completed);
		const text = state.pending > 0
			? localize('ci.checksFailedPending', "{0}, {1} pending", failedText, state.pending)
			: failedText;

		this._renderBanner(this._ciSlot, store, {
			icon: Codicon.warning,
			accent: true,
			text,
			ariaLabel: text,
			dismissTooltip: localize('ci.dismiss', "Hide for this session"),
			actions: [
				{
					label: localize('ci.fixChecks', "Fix Checks"),
					primary: true,
					run: () => this._executeCommand(FIX_CI_CHECKS_COMMAND_ID),
				},
				{
					label: localize('ci.revealChecks', "Reveal Checks"),
					run: () => { void this._executeCommand(REVEAL_CI_CHECKS_COMMAND_ID); },
				},
			],
			dismiss: () => this._dismiss(STORAGE_KEY_CI_DISMISSED, this._ciDismissed, state.sessionId),
		});
	}

	private _renderCommentsBanner(state: ICommentsBannerState | undefined): void {
		const store = this._commentsContent.value = new DisposableStore();
		dom.clearNode(this._commentsSlot);
		if (!state) {
			return;
		}

		const text = this._commentsBannerText(state.kind, state.count);

		this._renderBanner(this._commentsSlot, store, {
			icon: Codicon.commentDiscussion,
			accent: false,
			text,
			ariaLabel: text,
			dismissTooltip: localize('comments.dismiss', "Hide for this session"),
			actions: [
				{
					label: localize('comments.address', "Address Comments"),
					primary: true,
					run: () => this._addressComments(state.sessionResource).catch(err => this.logService.error('[SessionInputBanners] Failed to address comments', err)),
				},
				{
					label: localize('comments.reveal', "Reveal Comments"),
					run: () => this._revealComment(state.sessionResource, state.firstCommentId),
				},
			],
			dismiss: () => this._dismiss(STORAGE_KEY_COMMENTS_DISMISSED, this._commentsDismissed, state.sessionId),
		});
	}

	private _renderBanner(container: HTMLElement, store: DisposableStore, banner: ISessionInputBanner): void {
		const widget = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, banner));
		container.appendChild(widget.domNode);
	}

	private _commentsBannerText(kind: 'pr' | 'agent' | 'mixed', count: number): string {
		switch (kind) {
			case 'pr':
				return count === 1
					? localize('comments.pr.one', "1 PR comment")
					: localize('comments.pr.many', "{0} PR comments", count);
			case 'agent':
				return count === 1
					? localize('comments.agent.one', "1 agent comment")
					: localize('comments.agent.many', "{0} agent comments", count);
			case 'mixed':
				return count === 1
					? localize('comments.one', "1 comment")
					: localize('comments.many', "{0} comments", count);
		}
	}

	private async _executeCommand(commandId: string): Promise<void> {
		try {
			await this.commandService.executeCommand(commandId);
		} catch (err) {
			this.logService.error('[SessionInputBanners] command failed', commandId, err);
		}
	}

	private async _addressComments(sessionResource: URI): Promise<void> {
		// Accept the reviewable comments surfaced in the banner so they become
		// attachable feedback, then submit them to the agent. This mirrors the
		// agent feedback editor overlay's Submit button: rather than sending a
		// bare `/act-on-feedback` command, the accepted feedback items are
		// attached to the request so the agent receives the comments.
		const created = this.feedbackService.getFeedback(sessionResource)
			.filter(item => item.state === AgentFeedbackState.Created && REVIEWABLE_KINDS.has(item.kind));
		for (const item of created) {
			this.feedbackService.acceptFeedback(sessionResource, item.id);
		}

		const submitted = await this.feedbackService.submitFeedback(sessionResource);
		if (!submitted) {
			this.logService.error('[SessionInputBanners] Failed to submit feedback for session', sessionResource.toString());
		}
	}

	private _revealComment(sessionResource: URI, commentId: string): void {
		this.feedbackService.revealFeedback(sessionResource, commentId).catch(err => this.logService.error('[SessionInputBanners] Failed to reveal comment', err));
	}

	private _dismiss(storageKey: string, observable: ISettableObservable<ReadonlySet<string>>, sessionId: string): void {
		const next = new Set(observable.get());
		next.add(sessionId);
		this.storageService.store(storageKey, JSON.stringify([...next]), StorageScope.PROFILE, StorageTarget.USER);
		observable.set(next, undefined);
	}

	private _readDismissed(storageKey: string): ReadonlySet<string> {
		const raw = this.storageService.get(storageKey, StorageScope.PROFILE);
		if (!raw) {
			return new Set();
		}
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
		} catch {
			return new Set();
		}
	}
}
