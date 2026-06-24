/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as buffer from 'buffer';
import equals from 'fast-deep-equal';
import * as path from 'path';
import * as vscode from 'vscode';
import { DiffSide, IComment, IReviewThread, ViewedState } from '../common/comment';
import { parseDiff } from '../common/diffHunk';
import { GitChangeType, InMemFileChange, SlimFileChange } from '../common/file';
import { GitHubRef } from '../common/githubRef';
import Logger from '../common/logger';
import { Remote } from '../common/remote';
import { ITelemetry } from '../common/telemetry';
import { ReviewEvent as CommonReviewEvent, EventType, TimelineEvent } from '../common/timelineEvent';
import { resolvePath, toPRUri, toReviewUri } from '../common/uri';
import { formatError } from '../common/utils';
import { OctokitCommon } from './common';
import { FolderRepositoryManager } from './folderRepositoryManager';
import { GitHubRepository } from './githubRepository';
import {
	AddCommentResponse,
	AddReactionResponse,
	AddReviewThreadResponse,
	DeleteReactionResponse,
	DeleteReviewResponse,
	EditCommentResponse,
	LatestReviewCommitResponse,
	LatestReviewsResponse,
	MarkPullRequestReadyForReviewResponse,
	PendingReviewIdResponse,
	PullRequestCommentsResponse,
	PullRequestFilesResponse,
	PullRequestMergabilityResponse,
	ReactionGroup,
	ResolveReviewThreadResponse,
	StartReviewResponse,
	SubmitReviewResponse,
	TimelineEventsResponse,
	UnresolveReviewThreadResponse,
	UpdatePullRequestResponse,
} from './graphql';
import {
	CheckState,
	GithubItemStateEnum,
	IAccount,
	IRawFileChange,
	ISuggestedReviewer,
	MergeMethod,
	PullRequest,
	PullRequestChecks,
	PullRequestMergeability,
	ReviewEvent,
} from './interface';
import { IssueModel } from './issueModel';
import {
	convertRESTPullRequestToRawPullRequest,
	convertRESTReviewEvent,
	convertRESTUserToAccount,
	getReactionGroup,
	insertNewCommitsSinceReview,
	parseGraphQLComment,
	parseGraphQLReaction,
	parseGraphQLReviewEvent,
	parseGraphQLReviewThread,
	parseGraphQLTimelineEvents,
	parseMergeability,
	restPaginate,
} from './utils';

interface IPullRequestModel {
	head: GitHubRef | null;
}

export interface IResolvedPullRequestModel extends IPullRequestModel {
	head: GitHubRef;
}

export interface ReviewThreadChangeEvent {
	added: IReviewThread[];
	changed: IReviewThread[];
	removed: IReviewThread[];
}

export interface FileViewedStateChangeEvent {
	changed: {
		fileName: string;
		viewed: ViewedState;
	}[];
}

export const REVIEW_REQUIRED_CHECK_ID = 'reviewRequired';

export type FileViewedState = { [key: string]: ViewedState };

export class PullRequestModel extends IssueModel<PullRequest> implements IPullRequestModel {
	static ID = 'PullRequestModel';

	public isDraft?: boolean;
	public localBranchName?: string;
	public mergeBase?: string;
	public suggestedReviewers?: ISuggestedReviewer[];
	public hasChangesSinceLastReview?: boolean;
	private _showChangesSinceReview: boolean;
	private _hasPendingReview: boolean = false;
	private _onDidChangePendingReviewState: vscode.EventEmitter<boolean> = new vscode.EventEmitter<boolean>();
	public onDidChangePendingReviewState = this._onDidChangePendingReviewState.event;

	private _reviewThreadsCache: IReviewThread[] = [];
	private _reviewThreadsCacheInitialized = false;
	private _onDidChangeReviewThreads = new vscode.EventEmitter<ReviewThreadChangeEvent>();
	public onDidChangeReviewThreads = this._onDidChangeReviewThreads.event;

	private _fileChangeViewedState: FileViewedState = {};
	private _viewedFiles: Set<string> = new Set();
	private _unviewedFiles: Set<string> = new Set();
	private _onDidChangeFileViewedState = new vscode.EventEmitter<FileViewedStateChangeEvent>();
	public onDidChangeFileViewedState = this._onDidChangeFileViewedState.event;

	private _onDidChangeChangesSinceReview = new vscode.EventEmitter<void>();
	public onDidChangeChangesSinceReview = this._onDidChangeChangesSinceReview.event;

	private _comments: IComment[] | undefined;
	private _onDidChangeComments: vscode.EventEmitter<void> = new vscode.EventEmitter();
	public readonly onDidChangeComments: vscode.Event<void> = this._onDidChangeComments.event;

	// Whether the pull request is currently checked out locally
	private _isActive: boolean;
	public get isActive(): boolean {
		return this._isActive;
	}
	public set isActive(isActive: boolean) {
		this._isActive = isActive;
	}

	_telemetry: ITelemetry;

	constructor(
		telemetry: ITelemetry,
		githubRepository: GitHubRepository,
		remote: Remote,
		item: PullRequest,
		isActive?: boolean,
	) {
		super(githubRepository, remote, item, true);

		this._telemetry = telemetry;
		this.isActive = !!isActive;

		this._showChangesSinceReview = false;

		this.update(item);
	}

	public clear() {
		this.comments = [];
		this._reviewThreadsCacheInitialized = false;
		this._reviewThreadsCache = [];
	}

	public async initializeReviewThreadCache(): Promise<void> {
		await this.getReviewThreads();
		this._reviewThreadsCacheInitialized = true;
	}

	public get reviewThreadsCache(): IReviewThread[] {
		return this._reviewThreadsCache;
	}

	public get reviewThreadsCacheReady(): boolean {
		return this._reviewThreadsCacheInitialized;
	}

	public get isMerged(): boolean {
		return this.state === GithubItemStateEnum.Merged;
	}

	public get hasPendingReview(): boolean {
		return this._hasPendingReview;
	}

	public set hasPendingReview(hasPendingReview: boolean) {
		if (this._hasPendingReview !== hasPendingReview) {
			this._hasPendingReview = hasPendingReview;
			this._onDidChangePendingReviewState.fire(this._hasPendingReview);
		}
	}

	public get showChangesSinceReview() {
		return this._showChangesSinceReview;
	}

	public set showChangesSinceReview(isChangesSinceReview: boolean) {
		this._showChangesSinceReview = isChangesSinceReview;
		this._onDidChangeChangesSinceReview.fire();
	}

	get comments(): IComment[] {
		return this._comments ?? [];
	}

	set comments(comments: IComment[]) {
		this._comments = comments;
		this._onDidChangeComments.fire();
	}

	get fileChangeViewedState(): FileViewedState {
		return this._fileChangeViewedState;
	}

	public isRemoteHeadDeleted?: boolean;
	public head: GitHubRef | null;
	public isRemoteBaseDeleted?: boolean;
	public base: GitHubRef;

	protected updateState(state: string) {
		if (state.toLowerCase() === 'open') {
			this.state = GithubItemStateEnum.Open;
		} else {
			this.state = this.item.merged ? GithubItemStateEnum.Merged : GithubItemStateEnum.Closed;
		}
	}

	update(item: PullRequest): void {
		super.update(item);
		this.isDraft = item.isDraft;
		this.suggestedReviewers = item.suggestedReviewers;

		if (item.isRemoteHeadDeleted != null) {
			this.isRemoteHeadDeleted = item.isRemoteHeadDeleted;
		}
		if (item.head) {
			this.head = new GitHubRef(item.head.ref, item.head.label, item.head.sha, item.head.repo.cloneUrl, item.head.repo.owner, item.head.repo.name);
		}

		if (item.isRemoteBaseDeleted != null) {
			this.isRemoteBaseDeleted = item.isRemoteBaseDeleted;
		}
		if (item.base) {
			this.base = new GitHubRef(item.base.ref, item.base!.label, item.base!.sha, item.base!.repo.cloneUrl, item.base.repo.owner, item.base.repo.name);
		}
	}

	/**
	 * Validate if the pull request has a valid HEAD.
	 * Use only when the method can fail silently, otherwise use `validatePullRequestModel`
	 */
	isResolved(): this is IResolvedPullRequestModel {
		return !!this.head;
	}

	/**
	 * Validate if the pull request has a valid HEAD. Show a warning message to users when the pull request is invalid.
	 * @param message Human readable action execution failure message.
	 */
	validatePullRequestModel(message?: string): this is IResolvedPullRequestModel {
		if (!!this.head) {
			return true;
		}

		const reason = vscode.l10n.t('There is no upstream branch for Pull Request #{0}. View it on GitHub for more details', this.number);

		if (message) {
			message += `: ${reason}`;
		} else {
			message = reason;
		}

		const openString = vscode.l10n.t('Open on GitHub');
		vscode.window.showWarningMessage(message, openString).then(action => {
			if (action && action === openString) {
				vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(this.html_url));
			}
		});

		return false;
	}

	/**
	 * Approve the pull request.
	 * @param message Optional approval comment text.
	 */
	async approve(message?: string): Promise<CommonReviewEvent> {
		const action: Promise<CommonReviewEvent> = (await this.getPendingReviewId())
			? this.submitReview(ReviewEvent.Approve, message)
			: this.createReview(ReviewEvent.Approve, message);

		return action.then(x => {
			this._onDidChangeComments.fire();
			return x;
		});
	}

	/**
	 * Request changes on the pull request.
	 * @param message Optional comment text to leave with the review.
	 */
	async requestChanges(message?: string): Promise<CommonReviewEvent> {
		const action: Promise<CommonReviewEvent> = (await this.getPendingReviewId())
			? this.submitReview(ReviewEvent.RequestChanges, message)
			: this.createReview(ReviewEvent.RequestChanges, message);

		return action.then(x => {
			this._onDidChangeComments.fire();
			return x;
		});
	}

	/**
	 * Close the pull request.
	 */
	async close(): Promise<PullRequest> {
		const { octokit, remote } = await this.githubRepository.ensure();
		const ret = await octokit.call(octokit.api.pulls.update, {
			owner: remote.owner,
			repo: remote.repositoryName,
			pull_number: this.number,
			state: 'closed',
		});

		return convertRESTPullRequestToRawPullRequest(ret.data, this.githubRepository);
	}

	/**
	 * Create a new review.
	 * @param event The type of review to create, an approval, request for changes, or comment.
	 * @param message The summary comment text.
	 */
	private async createReview(event: ReviewEvent, message?: string): Promise<CommonReviewEvent> {
		const { octokit, remote } = await this.githubRepository.ensure();

		const { data } = await octokit.call(octokit.api.pulls.createReview, {
			owner: remote.owner,
			repo: remote.repositoryName,
			pull_number: this.number,
			event: event,
			body: message,
		});

		return convertRESTReviewEvent(data, this.githubRepository);
	}

	/**
	 * Submit an existing review.
	 * @param event The type of review to create, an approval, request for changes, or comment.
	 * @param body The summary comment text.
	 */
	async submitReview(event?: ReviewEvent, body?: string): Promise<CommonReviewEvent> {
		let pendingReviewId = await this.getPendingReviewId();
		const { mutate, schema } = await this.githubRepository.ensure();

		if (!pendingReviewId && (event === ReviewEvent.Comment)) {
			// Create a new review so that we can comment on it.
			pendingReviewId = await this.startReview();
		}

		if (pendingReviewId) {
			const { data } = await mutate<SubmitReviewResponse>({
				mutation: schema.SubmitReview,
				variables: {
					id: pendingReviewId,
					event: event || ReviewEvent.Comment,
					body,
				},
			});

			this.hasPendingReview = false;
			await this.updateDraftModeContext();
			const reviewEvent = parseGraphQLReviewEvent(data!.submitPullRequestReview.pullRequestReview, this.githubRepository);

			const threadWithComment = this._reviewThreadsCache.find(thread =>
				thread.comments.length ? (thread.comments[0].pullRequestReviewId === reviewEvent.id) : undefined,
			);
			if (threadWithComment) {
				threadWithComment.comments = reviewEvent.comments;
				threadWithComment.viewerCanResolve = true;
				this._onDidChangeReviewThreads.fire({ added: [], changed: [threadWithComment], removed: [] });
			}
			return reviewEvent;
		} else {
			throw new Error(`Submitting review failed, no pending review for current pull request: ${this.number}.`);
		}
	}

	async updateMilestone(id: string): Promise<void> {
		const { mutate, schema } = await this.githubRepository.ensure();
		const finalId = id === 'null' ? null : id;

		try {
			await mutate<UpdatePullRequestResponse>({
				mutation: schema.UpdatePullRequest,
				variables: {
					input: {
						pullRequestId: this.item.graphNodeId,
						milestoneId: finalId,
					},
				},
			});
		} catch (err) {
			Logger.error(err, PullRequestModel.ID);
		}
	}

	async addAssignees(assignees: string[]): Promise<void> {
		const { octokit, remote } = await this.githubRepository.ensure();
		await octokit.call(octokit.api.issues.addAssignees, {
			owner: remote.owner,
			repo: remote.repositoryName,
			issue_number: this.number,
			assignees,
		});
	}

	/**
	 * Query to see if there is an existing review.
	 */
	async getPendingReviewId(): Promise<string | undefined> {
		const { query, schema } = await this.githubRepository.ensure();
		const currentUser = await this.githubRepository.getAuthenticatedUser();
		try {
			const { data } = await query<PendingReviewIdResponse>({
				query: schema.GetPendingReviewId,
				variables: {
					pullRequestId: this.item.graphNodeId,
					author: currentUser,
				},
			});
			return data.node.reviews.nodes.length > 0 ? data.node.reviews.nodes[0].id : undefined;
		} catch (error) {
			return;
		}
	}

	async getViewerLatestReviewCommit(): Promise<{ sha: string } | undefined> {
		Logger.debug(`Fetch viewers latest review commit`, IssueModel.ID);
		const { query, remote, schema } = await this.githubRepository.ensure();

		try {
			const { data } = await query<LatestReviewCommitResponse>({
				query: schema.LatestReviewCommit,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
				},
			});

			return data.repository.pullRequest.viewerLatestReview ? {
				sha: data.repository.pullRequest.viewerLatestReview.commit.oid,
			} : undefined;
		}
		catch (e) {
			return undefined;
		}
	}

	/**
	 * Delete an existing in progress review.
	 */
	async deleteReview(): Promise<{ deletedReviewId: number; deletedReviewComments: IComment[] }> {
		const pendingReviewId = await this.getPendingReviewId();
		const { mutate, schema } = await this.githubRepository.ensure();
		const { data } = await mutate<DeleteReviewResponse>({
			mutation: schema.DeleteReview,
			variables: {
				input: { pullRequestReviewId: pendingReviewId },
			},
		});

		const { comments, databaseId } = data!.deletePullRequestReview.pullRequestReview;

		this.hasPendingReview = false;
		await this.updateDraftModeContext();

		this.getReviewThreads();

		return {
			deletedReviewId: databaseId,
			deletedReviewComments: comments.nodes.map(comment => parseGraphQLComment(comment, false, this.githubRepository)),
		};
	}

	/**
	 * Start a new review.
	 * @param initialComment The comment text and position information to begin the review with
	 * @param commitId The optional commit id to start the review on. Defaults to using the current head commit.
	 */
	async startReview(commitId?: string): Promise<string> {
		const { mutate, schema } = await this.githubRepository.ensure();
		const { data } = await mutate<StartReviewResponse>({
			mutation: schema.StartReview,
			variables: {
				input: {
					body: '',
					pullRequestId: this.item.graphNodeId,
					commitOID: commitId || this.head?.sha,
				},
			},
		});

		if (!data) {
			throw new Error('Failed to start review');
		}
		this.hasPendingReview = true;
		this._onDidChangeComments.fire();
		return data.addPullRequestReview.pullRequestReview.id;
	}

	/**
	 * Creates a new review thread, either adding it to an existing pending review, or creating
	 * a new review.
	 * @param body The body of the thread's first comment.
	 * @param commentPath The path to the file being commented on.
	 * @param startLine The start line on which to add the comment.
	 * @param endLine The end line on which to add the comment.
	 * @param side The side the comment should be deleted on, i.e. the original or modified file.
	 * @param suppressDraftModeUpdate If a draft mode change should event should be suppressed. In the
	 * case of a single comment add, the review is created and then immediately submitted, so this prevents
	 * a "Pending" label from flashing on the comment.
	 * @returns The new review thread object.
	 */
	async createReviewThread(
		body: string,
		commentPath: string,
		startLine: number,
		endLine: number,
		side: DiffSide,
		suppressDraftModeUpdate?: boolean,
	): Promise<IReviewThread | undefined> {
		if (!this.validatePullRequestModel('Creating comment failed')) {
			return;
		}
		const pendingReviewId = await this.getPendingReviewId();

		const { mutate, schema } = await this.githubRepository.ensure();
		const { data } = await mutate<AddReviewThreadResponse>({
			mutation: schema.AddReviewThread,
			variables: {
				input: {
					path: commentPath,
					body,
					pullRequestId: this.graphNodeId,
					pullRequestReviewId: pendingReviewId,
					startLine: startLine === endLine ? undefined : startLine,
					line: endLine,
					side,
				},
			},
		});

		if (!data) {
			throw new Error('Creating review thread failed.');
		}

		if (!data.addPullRequestReviewThread.thread) {
			throw new Error('File has been deleted.');
		}

		if (!suppressDraftModeUpdate) {
			this.hasPendingReview = true;
			await this.updateDraftModeContext();
		}

		const thread = data.addPullRequestReviewThread.thread;
		const newThread = parseGraphQLReviewThread(thread, this.githubRepository);
		this._reviewThreadsCache.push(newThread);
		this._onDidChangeReviewThreads.fire({ added: [newThread], changed: [], removed: [] });
		return newThread;
	}

	/**
	 * Creates a new comment in reply to an existing comment
	 * @param body The text of the comment to be created
	 * @param inReplyTo The id of the comment this is in reply to
	 * @param isSingleComment Whether this is a single comment, i.e. one that
	 * will be immediately submitted and so should not show a pending label
	 * @param commitId The commit id the comment was made on
	 * @returns The new comment
	 */
	async createCommentReply(
		body: string,
		inReplyTo: string,
		isSingleComment: boolean,
		commitId?: string,
	): Promise<IComment | undefined> {
		if (!this.validatePullRequestModel('Creating comment failed')) {
			return;
		}

		let pendingReviewId = await this.getPendingReviewId();
		if (!pendingReviewId) {
			pendingReviewId = await this.startReview(commitId);
		}

		const { mutate, schema } = await this.githubRepository.ensure();
		const { data } = await mutate<AddCommentResponse>({
			mutation: schema.AddComment,
			variables: {
				input: {
					pullRequestReviewId: pendingReviewId,
					body,
					inReplyTo,
					commitOID: commitId || this.head?.sha,
				},
			},
		});

		if (!data) {
			throw new Error('Creating comment reply failed.');
		}

		const { comment } = data.addPullRequestReviewComment;
		const newComment = parseGraphQLComment(comment, false, this.githubRepository);

		if (isSingleComment) {
			newComment.isDraft = false;
		}

		const threadWithComment = this._reviewThreadsCache.find(thread =>
			thread.comments.some(comment => comment.graphNodeId === inReplyTo),
		);
		if (threadWithComment) {
			threadWithComment.comments.push(newComment);
			this._onDidChangeReviewThreads.fire({ added: [], changed: [threadWithComment], removed: [] });
		}

		return newComment;
	}

	/**
	 * Check whether there is an existing pending review and update the context key to control what comment actions are shown.
	 */
	async validateDraftMode(): Promise<boolean> {
		const inDraftMode = !!(await this.getPendingReviewId());
		if (inDraftMode !== this.hasPendingReview) {
			this.hasPendingReview = inDraftMode;
		}

		await this.updateDraftModeContext();

		return inDraftMode;
	}

	private async updateDraftModeContext() {
		if (this.isActive) {
			await vscode.commands.executeCommand('setContext', 'reviewInDraftMode', this.hasPendingReview);
		}
	}

	/**
	 * Edit an existing review comment.
	 * @param comment The comment to edit
	 * @param text The new comment text
	 */
	async editReviewComment(comment: IComment, text: string): Promise<IComment> {
		const { mutate, schema } = await this.githubRepository.ensure();
		let threadWithComment = this._reviewThreadsCache.find(thread =>
			thread.comments.some(c => c.graphNodeId === comment.graphNodeId),
		);

		if (!threadWithComment) {
			return this.editIssueComment(comment, text);
		}

		const { data } = await mutate<EditCommentResponse>({
			mutation: schema.EditComment,
			variables: {
				input: {
					pullRequestReviewCommentId: comment.graphNodeId,
					body: text,
				},
			},
		});

		if (!data) {
			throw new Error('Editing review comment failed.');
		}

		const newComment = parseGraphQLComment(
			data.updatePullRequestReviewComment.pullRequestReviewComment,
			!!comment.isResolved,
			this.githubRepository
		);
		if (threadWithComment) {
			const index = threadWithComment.comments.findIndex(c => c.graphNodeId === comment.graphNodeId);
			threadWithComment.comments.splice(index, 1, newComment);
			this._onDidChangeReviewThreads.fire({ added: [], changed: [threadWithComment], removed: [] });
		}

		return newComment;
	}

	/**
	 * Deletes a review comment.
	 * @param commentId The comment id to delete
	 */
	async deleteReviewComment(commentId: string): Promise<void> {
		try {
			const { octokit, remote } = await this.githubRepository.ensure();
			const id = Number(commentId);
			const threadIndex = this._reviewThreadsCache.findIndex(thread => thread.comments.some(c => c.id === id));

			if (threadIndex === -1) {
				this.deleteIssueComment(commentId);
			} else {
				await octokit.call(octokit.api.pulls.deleteReviewComment, {
					owner: remote.owner,
					repo: remote.repositoryName,
					comment_id: id,
				});

				if (threadIndex > -1) {
					const threadWithComment = this._reviewThreadsCache[threadIndex];
					const index = threadWithComment.comments.findIndex(c => c.id === id);
					threadWithComment.comments.splice(index, 1);
					if (threadWithComment.comments.length === 0) {
						this._reviewThreadsCache.splice(threadIndex, 1);
						this._onDidChangeReviewThreads.fire({ added: [], changed: [], removed: [threadWithComment] });
					} else {
						this._onDidChangeReviewThreads.fire({ added: [], changed: [threadWithComment], removed: [] });
					}
				}
			}
		} catch (e) {
			throw new Error(formatError(e));
		}
	}

	/**
	 * Get existing requests to review.
	 */
	async getReviewRequests(): Promise<IAccount[]> {
		const githubRepository = this.githubRepository;
		const { remote, octokit } = await githubRepository.ensure();
		const result = await octokit.call(octokit.api.pulls.listRequestedReviewers, {
			owner: remote.owner,
			repo: remote.repositoryName,
			pull_number: this.number,
		});

		return result.data.users.map((user: any) => convertRESTUserToAccount(user, githubRepository));
	}

	/**
	 * Add reviewers to a pull request
	 * @param reviewers A list of GitHub logins
	 */
	async requestReview(reviewers: string[]): Promise<void> {
		const { octokit, remote } = await this.githubRepository.ensure();
		await octokit.call(octokit.api.pulls.requestReviewers, {
			owner: remote.owner,
			repo: remote.repositoryName,
			pull_number: this.number,
			reviewers,
		});
	}

	/**
	 * Remove a review request that has not yet been completed
	 * @param reviewer A GitHub Login
	 */
	async deleteReviewRequest(reviewers: string[]): Promise<void> {
		const { octokit, remote } = await this.githubRepository.ensure();
		await octokit.call(octokit.api.pulls.removeRequestedReviewers, {
			owner: remote.owner,
			repo: remote.repositoryName,
			pull_number: this.number,
			reviewers,
		});
	}

	async deleteAssignees(assignees: string[]): Promise<void> {
		const { octokit, remote } = await this.githubRepository.ensure();
		await octokit.call(octokit.api.issues.removeAssignees, {
			owner: remote.owner,
			repo: remote.repositoryName,
			issue_number: this.number,
			assignees,
		});
	}

	private diffThreads(oldReviewThreads: IReviewThread[], newReviewThreads: IReviewThread[]): void {
		const added: IReviewThread[] = [];
		const changed: IReviewThread[] = [];
		const removed: IReviewThread[] = [];

		newReviewThreads.forEach(thread => {
			const existingThread = oldReviewThreads.find(t => t.id === thread.id);
			if (existingThread) {
				if (!equals(thread, existingThread)) {
					changed.push(thread);
				}
			} else {
				added.push(thread);
			}
		});

		oldReviewThreads.forEach(thread => {
			if (!newReviewThreads.find(t => t.id === thread.id)) {
				removed.push(thread);
			}
		});

		this._onDidChangeReviewThreads.fire({
			added,
			changed,
			removed,
		});
	}

	async getReviewThreads(): Promise<IReviewThread[]> {
		const { remote, query, schema } = await this.githubRepository.ensure();
		try {
			const { data } = await query<PullRequestCommentsResponse>({
				query: schema.PullRequestComments,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
				},
			});

			const reviewThreads = data.repository.pullRequest.reviewThreads.nodes.map(node => {
				return parseGraphQLReviewThread(node, this.githubRepository);
			});

			const oldReviewThreads = this._reviewThreadsCache;
			this._reviewThreadsCache = reviewThreads;
			this.diffThreads(oldReviewThreads, reviewThreads);
			return reviewThreads;
		} catch (e) {
			Logger.error(`Failed to get pull request review comments: ${e}`, PullRequestModel.ID);
			return [];
		}
	}

	/**
	 * Get all review comments.
	 */
	async initializeReviewComments(): Promise<void> {
		const { remote, query, schema } = await this.githubRepository.ensure();
		try {
			const { data } = await query<PullRequestCommentsResponse>({
				query: schema.PullRequestComments,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
				},
			});

			const comments = data.repository.pullRequest.reviewThreads.nodes
				.map(node => node.comments.nodes.map(comment => parseGraphQLComment(comment, node.isResolved, this.githubRepository), remote))
				.reduce((prev, curr) => prev.concat(curr), [])
				.sort((a: IComment, b: IComment) => {
					return a.createdAt > b.createdAt ? 1 : -1;
				});

			this.comments = comments;
		} catch (e) {
			Logger.error(`Failed to get pull request review comments: ${e}`, PullRequestModel.ID);
		}
	}

	/**
	 * Get a list of the commits within a pull request.
	 */
	async getCommits(): Promise<OctokitCommon.PullsListCommitsResponseData> {
		try {
			Logger.debug(`Fetch commits of PR #${this.number} - enter`, PullRequestModel.ID);
			const { remote, octokit } = await this.githubRepository.ensure();
			const commitData = await octokit.call(octokit.api.pulls.listCommits, {
				pull_number: this.number,
				owner: remote.owner,
				repo: remote.repositoryName,
			});
			Logger.debug(`Fetch commits of PR #${this.number} - done`, PullRequestModel.ID);

			return commitData.data;
		} catch (e) {
			vscode.window.showErrorMessage(`Fetching commits failed: ${formatError(e)}`);
			return [];
		}
	}

	/**
	 * Get all changed files within a commit
	 * @param commit The commit
	 */
	async getCommitChangedFiles(
		commit: OctokitCommon.PullsListCommitsResponseData[0],
	): Promise<OctokitCommon.ReposGetCommitResponseFiles> {
		try {
			Logger.debug(
				`Fetch file changes of commit ${commit.sha} in PR #${this.number} - enter`,
				PullRequestModel.ID,
			);
			const { octokit, remote } = await this.githubRepository.ensure();
			const fullCommit = await octokit.call(octokit.api.repos.getCommit, {
				owner: remote.owner,
				repo: remote.repositoryName,
				ref: commit.sha,
			});
			Logger.debug(
				`Fetch file changes of commit ${commit.sha} in PR #${this.number} - done`,
				PullRequestModel.ID,
			);

			return fullCommit.data.files ?? [];
		} catch (e) {
			vscode.window.showErrorMessage(`Fetching commit file changes failed: ${formatError(e)}`);
			return [];
		}
	}

	/**
	 * Gets file content for a file at the specified commit
	 * @param filePath The file path
	 * @param commit The commit
	 */
	async getFile(filePath: string, commit: string) {
		const { octokit, remote } = await this.githubRepository.ensure();
		const fileContent = await octokit.call(octokit.api.repos.getContent, {
			owner: remote.owner,
			repo: remote.repositoryName,
			path: filePath,
			ref: commit,
		});

		if (Array.isArray(fileContent.data)) {
			throw new Error(`Unexpected array response when getting file ${filePath}`);
		}

		const contents = (fileContent.data as any).content ?? '';
		const buff = buffer.Buffer.from(contents, (fileContent.data as any).encoding);
		return buff.toString();
	}

	/**
	 * Get the timeline events of a pull request, including comments, reviews, commits, merges, deletes, and assigns.
	 */
	async getTimelineEvents(): Promise<TimelineEvent[]> {
		Logger.debug(`Fetch timeline events of PR #${this.number} - enter`, PullRequestModel.ID);
		const { query, remote, schema } = await this.githubRepository.ensure();

		try {
			const [{ data }, latestReviewCommitInfo, currentUser, reviewThreads] = await Promise.all([
				query<TimelineEventsResponse>({
					query: schema.TimelineEvents,
					variables: {
						owner: remote.owner,
						name: remote.repositoryName,
						number: this.number,
					},
				}),
				this.getViewerLatestReviewCommit(),
				this.githubRepository.getAuthenticatedUser(),
				this.getReviewThreads()
			]);

			const ret = data.repository.pullRequest.timelineItems.nodes;
			const events = parseGraphQLTimelineEvents(ret, this.githubRepository);

			this.addReviewTimelineEventComments(events, reviewThreads);
			insertNewCommitsSinceReview(events, latestReviewCommitInfo?.sha, currentUser, this.head);

			return events;
		} catch (e) {
			console.log(e);
			return [];
		}
	}

	private addReviewTimelineEventComments(events: TimelineEvent[], reviewThreads: IReviewThread[]): void {
		interface CommentNode extends IComment {
			childComments?: CommentNode[];
		}

		const reviewEvents = events.filter((e): e is CommonReviewEvent => e.event === EventType.Reviewed);
		const reviewComments = reviewThreads.reduce((previous, current) => (previous as IComment[]).concat(current.comments), []);

		const reviewEventsById = reviewEvents.reduce((index, evt) => {
			index[evt.id] = evt;
			evt.comments = [];
			return index;
		}, {} as { [key: number]: CommonReviewEvent });

		const commentsById = reviewComments.reduce((index, evt) => {
			index[evt.id] = evt;
			return index;
		}, {} as { [key: number]: CommentNode });

		const roots: CommentNode[] = [];
		let i = reviewComments.length;
		while (i-- > 0) {
			const c: CommentNode = reviewComments[i];
			if (!c.inReplyToId) {
				roots.unshift(c);
				continue;
			}
			const parent = commentsById[c.inReplyToId];
			parent.childComments = parent.childComments || [];
			parent.childComments = [c, ...(c.childComments || []), ...parent.childComments];
		}

		roots.forEach(c => {
			const review = reviewEventsById[c.pullRequestReviewId!];
			if (review) {
				review.comments = review.comments.concat(c).concat(c.childComments || []);
			}
		});

		reviewThreads.forEach(thread => {
			if (!thread.prReviewDatabaseId || !reviewEventsById[thread.prReviewDatabaseId]) {
				return;
			}
			const prReviewThreadEvent = reviewEventsById[thread.prReviewDatabaseId];
			prReviewThreadEvent.reviewThread = {
				threadId: thread.id,
				canResolve: thread.viewerCanResolve,
				canUnresolve: thread.viewerCanUnresolve,
				isResolved: thread.isResolved
			};

		});

		const pendingReview = reviewEvents.filter(r => r.state.toLowerCase() === 'pending')[0];
		if (pendingReview) {
			// Ensures that pending comments made in reply to other reviews are included for the pending review
			pendingReview.comments = reviewComments.filter(c => c.isDraft);
		}
	}

	private async _getReviewRequiredCheck() {
		const { query, remote, octokit, schema } = await this.githubRepository.ensure();

		const [branch, reviewStates] = await Promise.all([
			octokit.call(octokit.api.repos.getBranch, { branch: this.base.ref, owner: remote.owner, repo: remote.repositoryName }),
			query<LatestReviewsResponse>({
				query: schema.LatestReviews,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
				}
			})
		]);
		if (branch.data.protected && branch.data.protection.required_status_checks && branch.data.protection.required_status_checks.enforcement_level !== 'off') {
			// We need to add the "review required" check manually.
			return {
				id: REVIEW_REQUIRED_CHECK_ID,
				context: 'Branch Protection',
				description: vscode.l10n.t('Other requirements have not been met.'),
				state: (reviewStates.data as LatestReviewsResponse).repository.pullRequest.latestReviews.nodes.every(node => node.state !== 'CHANGES_REQUESTED') ? CheckState.Neutral : CheckState.Failure,
				target_url: this.html_url
			};
		}
		return undefined;
	}

	/**
	 * Get the status checks of the pull request, those for the last commit.
	 */
	async getStatusChecks(): Promise<PullRequestChecks | undefined> {
		let checks = await this.githubRepository.getStatusChecks(this.number);

		// Fun info: The checks don't include whether a review is required.
		// Also, unless you're an admin on the repo, you can't just do octokit.repos.getBranchProtection
		if ((this.item.mergeable === PullRequestMergeability.NotMergeable) && (!checks || checks.statuses.every(status => status.state === CheckState.Success))) {
			const reviewRequiredCheck = await this._getReviewRequiredCheck();
			if (reviewRequiredCheck) {
				if (!checks) {
					checks = {
						state: CheckState.Failure,
						statuses: []
					};
				}
				checks.statuses.push(reviewRequiredCheck);
				checks.state = CheckState.Failure;
			}
		}

		return checks;
	}

	static async openDiffFromComment(
		folderManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
		comment: IComment,
	): Promise<void> {
		const contentChanges = await pullRequestModel.getFileChangesInfo();
		const change = contentChanges.find(
			fileChange => fileChange.fileName === comment.path || fileChange.previousFileName === comment.path,
		);
		if (!change) {
			throw new Error(`Can't find matching file`);
		}

		const pathSegments = comment.path!.split('/');
		this.openDiff(folderManager, pullRequestModel, change, pathSegments[pathSegments.length - 1]);
	}

	static async openFirstDiff(
		folderManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
	) {
		const contentChanges = await pullRequestModel.getFileChangesInfo();
		if (!contentChanges.length) {
			return;
		}

		const firstChange = contentChanges[0];
		this.openDiff(folderManager, pullRequestModel, firstChange, firstChange.fileName);
	}

	static async openDiff(
		folderManager: FolderRepositoryManager,
		pullRequestModel: PullRequestModel,
		change: SlimFileChange | InMemFileChange,
		diffTitle: string
	): Promise<void> {


		let headUri, baseUri: vscode.Uri;
		if (!pullRequestModel.equals(folderManager.activePullRequest)) {
			const headCommit = pullRequestModel.head!.sha;
			const parentFileName = change.status === GitChangeType.RENAME ? change.previousFileName! : change.fileName;
			headUri = toPRUri(
				vscode.Uri.file(resolvePath(folderManager.repository.rootUri, change.fileName)),
				pullRequestModel,
				change.baseCommit,
				headCommit,
				change.fileName,
				false,
				change.status,
				change.previousFileName
			);
			baseUri = toPRUri(
				vscode.Uri.file(resolvePath(folderManager.repository.rootUri, parentFileName)),
				pullRequestModel,
				change.baseCommit,
				headCommit,
				change.fileName,
				true,
				change.status,
				change.previousFileName
			);
		} else {
			const uri = vscode.Uri.file(path.resolve(folderManager.repository.rootUri.fsPath, change.fileName));

			headUri =
				change.status === GitChangeType.DELETE
					? toReviewUri(
						uri,
						undefined,
						undefined,
						'',
						false,
						{ base: false },
						folderManager.repository.rootUri,
					)
					: uri;

			const mergeBase = pullRequestModel.mergeBase || pullRequestModel.base.sha;
			baseUri = toReviewUri(
				uri,
				change.status === GitChangeType.RENAME ? change.previousFileName : change.fileName,
				undefined,
				change.status === GitChangeType.ADD ? '' : mergeBase,
				false,
				{ base: true },
				folderManager.repository.rootUri,
			);
		}

		vscode.commands.executeCommand(
			'vscode.diff',
			baseUri,
			headUri,
			`${diffTitle} (Pull Request)`,
			{},
		);
	}

	private _fileChanges: Map<string, SlimFileChange | InMemFileChange> = new Map();
	get fileChanges(): Map<string, SlimFileChange | InMemFileChange> {
		return this._fileChanges;
	}

	async getFileChangesInfo() {
		this._fileChanges.clear();
		const data = await this.getRawFileChangesInfo();
		const mergebase = this.mergeBase || this.base.sha;
		const parsed = await parseDiff(data, mergebase);
		parsed.forEach(fileChange => {
			this._fileChanges.set(fileChange.fileName, fileChange);
		});
		return parsed;
	}

	/**
	 * List the changed files in a pull request.
	 */
	private async getRawFileChangesInfo(): Promise<IRawFileChange[]> {
		Logger.debug(
			`Fetch file changes, base, head and merge base of PR #${this.number} - enter`,
			PullRequestModel.ID,
		);
		const githubRepository = this.githubRepository;
		const { octokit, remote } = await githubRepository.ensure();

		if (!this.base) {
			const info = await octokit.call(octokit.api.pulls.get, {
				owner: remote.owner,
				repo: remote.repositoryName,
				pull_number: this.number,
			});
			this.update(convertRESTPullRequestToRawPullRequest(info.data, githubRepository));
		}

		let compareWithBaseRef = this.base.sha;
		const latestReview = await this.getViewerLatestReviewCommit();
		const oldHasChangesSinceReview = this.hasChangesSinceLastReview;
		this.hasChangesSinceLastReview = latestReview !== undefined && this.head?.sha !== latestReview.sha;

		if (this._showChangesSinceReview && this.hasChangesSinceLastReview && latestReview != undefined) {
			compareWithBaseRef = latestReview.sha;
		}

		if (this.item.merged) {
			const response = await restPaginate<typeof octokit.api.pulls.listFiles, IRawFileChange>(octokit.api.pulls.listFiles, {
				repo: remote.repositoryName,
				owner: remote.owner,
				pull_number: this.number,
			});

			// Use the original base to compare against for merged PRs
			this.mergeBase = this.base.sha;

			return response;
		}

		const { data } = await octokit.call(octokit.api.repos.compareCommits, {
			repo: remote.repositoryName,
			owner: remote.owner,
			base: `${this.base.repositoryCloneUrl.owner}:${compareWithBaseRef}`,
			head: `${this.head!.repositoryCloneUrl.owner}:${this.head!.sha}`,
		});

		this.mergeBase = data.merge_base_commit.sha;

		const MAX_FILE_CHANGES_IN_COMPARE_COMMITS = 100;
		let files: IRawFileChange[] = [];

		if (data.files && data.files.length >= MAX_FILE_CHANGES_IN_COMPARE_COMMITS) {
			// compareCommits will return a maximum of 100 changed files
			// If we have (maybe) more than that, we'll need to fetch them with listFiles API call
			Logger.debug(
				`More than ${MAX_FILE_CHANGES_IN_COMPARE_COMMITS} files changed, fetching all file changes of PR #${this.number}`,
				PullRequestModel.ID,
			);
			files = await restPaginate<typeof octokit.api.pulls.listFiles, IRawFileChange>(octokit.api.pulls.listFiles, {
				owner: this.base.repositoryCloneUrl.owner,
				pull_number: this.number,
				repo: remote.repositoryName,
			});
		} else {
			// if we're under the limit, just use the result from compareCommits, don't make additional API calls.
			files = data.files ? data.files as IRawFileChange[] : [];
		}

		if (oldHasChangesSinceReview !== undefined && oldHasChangesSinceReview !== this.hasChangesSinceLastReview && this.hasChangesSinceLastReview && this._showChangesSinceReview) {
			this._onDidChangeChangesSinceReview.fire();
		}

		Logger.debug(
			`Fetch file changes and merge base of PR #${this.number} - done, total files ${files.length} `,
			PullRequestModel.ID,
		);
		return files;
	}

	get autoMerge(): boolean {
		return !!this.item.autoMerge;
	}

	get autoMergeMethod(): MergeMethod | undefined {
		return this.item.autoMergeMethod;
	}

	get allowAutoMerge(): boolean {
		return !!this.item.allowAutoMerge;
	}

	/**
	 * Get the current mergeability of the pull request.
	 */
	async getMergeability(): Promise<PullRequestMergeability> {
		try {
			Logger.debug(`Fetch pull request mergeability ${this.number} - enter`, PullRequestModel.ID);
			const { query, remote, schema } = await this.githubRepository.ensure();

			const { data } = await query<PullRequestMergabilityResponse>({
				query: schema.PullRequestMergeability,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
				},
			});
			Logger.debug(`Fetch pull request mergeability ${this.number} - done`, PullRequestModel.ID);
			const mergeability = parseMergeability(data.repository.pullRequest.mergeable, data.repository.pullRequest.mergeStateStatus);
			this.item.mergeable = mergeability;
			return mergeability;
		} catch (e) {
			Logger.error(`Unable to fetch PR Mergeability: ${e}`, PullRequestModel.ID);
			return PullRequestMergeability.Unknown;
		}
	}

	/**
	 * Set a draft pull request as ready to be reviewed.
	 */
	async setReadyForReview(): Promise<any> {
		try {
			const { mutate, schema } = await this.githubRepository.ensure();

			const { data } = await mutate<MarkPullRequestReadyForReviewResponse>({
				mutation: schema.ReadyForReview,
				variables: {
					input: {
						pullRequestId: this.graphNodeId,
					},
				},
			});

			return data!.markPullRequestReadyForReview.pullRequest.isDraft;
		} catch (e) {
			throw e;
		}
	}

	private updateCommentReactions(graphNodeId: string, reactionGroups: ReactionGroup[]) {
		const reviewThread = this._reviewThreadsCache.find(thread =>
			thread.comments.some(c => c.graphNodeId === graphNodeId),
		);
		if (reviewThread) {
			const updatedComment = reviewThread.comments.find(c => c.graphNodeId === graphNodeId);
			if (updatedComment) {
				updatedComment.reactions = parseGraphQLReaction(reactionGroups);
				this._onDidChangeReviewThreads.fire({ added: [], changed: [reviewThread], removed: [] });
			}
		}
	}

	async addCommentReaction(graphNodeId: string, reaction: vscode.CommentReaction): Promise<AddReactionResponse | undefined> {
		const reactionEmojiToContent = getReactionGroup().reduce((prev, curr) => {
			prev[curr.label] = curr.title;
			return prev;
		}, {} as { [key: string]: string });
		const { mutate, schema } = await this.githubRepository.ensure();
		const { data } = await mutate<AddReactionResponse>({
			mutation: schema.AddReaction,
			variables: {
				input: {
					subjectId: graphNodeId,
					content: reactionEmojiToContent[reaction.label!],
				},
			},
		});

		if (!data) {
			throw new Error('Add comment reaction failed.');
		}

		const reactionGroups = data.addReaction.subject.reactionGroups;
		this.updateCommentReactions(graphNodeId, reactionGroups);

		return data;
	}

	async deleteCommentReaction(
		graphNodeId: string,
		reaction: vscode.CommentReaction,
	): Promise<DeleteReactionResponse | undefined> {
		const reactionEmojiToContent = getReactionGroup().reduce((prev, curr) => {
			prev[curr.label] = curr.title;
			return prev;
		}, {} as { [key: string]: string });
		const { mutate, schema } = await this.githubRepository.ensure();
		const { data } = await mutate<DeleteReactionResponse>({
			mutation: schema.DeleteReaction,
			variables: {
				input: {
					subjectId: graphNodeId,
					content: reactionEmojiToContent[reaction.label!],
				},
			},
		});

		if (!data) {
			throw new Error('Delete comment reaction failed.');
		}

		const reactionGroups = data.removeReaction.subject.reactionGroups;
		this.updateCommentReactions(graphNodeId, reactionGroups);

		return data;
	}

	async resolveReviewThread(threadId: string): Promise<void> {
		const { mutate, schema } = await this.githubRepository.ensure();

		// optimistically update
		const oldThread = this._reviewThreadsCache.find(thread => thread.id === threadId);
		if (oldThread && oldThread.viewerCanResolve) {
			oldThread.isResolved = true;
			oldThread.viewerCanResolve = false;
			oldThread.viewerCanUnresolve = true;
			this._onDidChangeReviewThreads.fire({ added: [], changed: [oldThread], removed: [] });
		}

		const { data } = await mutate<ResolveReviewThreadResponse>({
			mutation: schema.ResolveReviewThread,
			variables: {
				input: {
					threadId,
				},
			},
		});

		if (!data) {
			// Undo optimistic update
			if (oldThread && oldThread.viewerCanUnresolve) {
				oldThread.isResolved = false;
				oldThread.viewerCanResolve = true;
				oldThread.viewerCanUnresolve = false;
				this._onDidChangeReviewThreads.fire({ added: [], changed: [oldThread], removed: [] });
			}
			throw new Error('Resolve review thread failed.');
		}

		const index = this._reviewThreadsCache.findIndex(thread => thread.id === threadId);
		if (index > -1) {
			const thread = parseGraphQLReviewThread(data.resolveReviewThread.thread, this.githubRepository);
			this._reviewThreadsCache.splice(index, 1, thread);
			this._onDidChangeReviewThreads.fire({ added: [], changed: [thread], removed: [] });
		}
	}

	async unresolveReviewThread(threadId: string): Promise<void> {
		const { mutate, schema } = await this.githubRepository.ensure();

		// optimistically update
		const oldThread = this._reviewThreadsCache.find(thread => thread.id === threadId);
		if (oldThread && oldThread.viewerCanUnresolve) {
			oldThread.isResolved = false;
			oldThread.viewerCanUnresolve = false;
			oldThread.viewerCanResolve = true;
			this._onDidChangeReviewThreads.fire({ added: [], changed: [oldThread], removed: [] });
		}

		const { data } = await mutate<UnresolveReviewThreadResponse>({
			mutation: schema.UnresolveReviewThread,
			variables: {
				input: {
					threadId,
				},
			},
		});

		if (!data) {
			// Undo optimistic update
			if (oldThread && oldThread.viewerCanResolve) {
				oldThread.isResolved = true;
				oldThread.viewerCanUnresolve = true;
				oldThread.viewerCanResolve = false;
				this._onDidChangeReviewThreads.fire({ added: [], changed: [oldThread], removed: [] });
			}
			throw new Error('Unresolve review thread failed.');
		}

		const index = this._reviewThreadsCache.findIndex(thread => thread.id === threadId);
		if (index > -1) {
			const thread = parseGraphQLReviewThread(data.unresolveReviewThread.thread, this.githubRepository);
			this._reviewThreadsCache.splice(index, 1, thread);
			this._onDidChangeReviewThreads.fire({ added: [], changed: [thread], removed: [] });
		}
	}

	async enableAutoMerge(mergeMethod: MergeMethod): Promise<void> {
		try {
			const { mutate, schema } = await this.githubRepository.ensure();
			const { data } = await mutate({
				mutation: schema.EnablePullRequestAutoMerge,
				variables: {
					input: {
						mergeMethod: mergeMethod.toUpperCase(),
						pullRequestId: this.graphNodeId
					}
				}
			});

			if (!data) {
				throw new Error('Enable auto-merge failed.');
			}
			this.item.autoMerge = true;
			this.item.autoMergeMethod = mergeMethod;
		} catch (e) {
			if (e.message === 'GraphQL error: ["Pull request Pull request is in clean status"]') {
				vscode.window.showWarningMessage(vscode.l10n.t('Unable to enable auto-merge. Pull request status checks are already green.'));
			} else {
				throw e;
			}
		}
	}

	async disableAutoMerge(): Promise<void> {
		try {
			const { mutate, schema } = await this.githubRepository.ensure();
			const { data } = await mutate({
				mutation: schema.DisablePullRequestAutoMerge,
				variables: {
					input: {
						pullRequestId: this.graphNodeId
					}
				}
			});

			if (!data) {
				throw new Error('Disable auto-merge failed.');
			}
			this.item.autoMerge = false;
		} catch (e) {
			if (e.message === 'GraphQL error: ["Pull request Pull request is in clean status"]') {
				vscode.window.showWarningMessage(vscode.l10n.t('Unable to enable auto-merge. Pull request status checks are already green.'));
			} else {
				throw e;
			}
		}
	}

	async initializePullRequestFileViewState(): Promise<void> {
		const { query, schema, remote } = await this.githubRepository.ensure();

		const changed: { fileName: string, viewed: ViewedState }[] = [];
		let after: string | null = null;
		let hasNextPage = false;

		do {
			const { data } = await query<PullRequestFilesResponse>({
				query: schema.PullRequestFiles,
				variables: {
					owner: remote.owner,
					name: remote.repositoryName,
					number: this.number,
					after: after,
				},
			});

			data.repository.pullRequest.files.nodes.forEach(n => {
				if (this._fileChangeViewedState[n.path] !== n.viewerViewedState) {
					changed.push({ fileName: n.path, viewed: n.viewerViewedState });
				}
				// No event for setting the file viewed state here.
				// Instead, wait until all the changes have been made and set the context at the end.
				this.setFileViewedState(n.path, n.viewerViewedState, false);
			});

			hasNextPage = data.repository.pullRequest.files.pageInfo.hasNextPage;
			after = data.repository.pullRequest.files.pageInfo.endCursor;
		} while (hasNextPage);

		if (changed.length) {
			this._onDidChangeFileViewedState.fire({ changed });
		}
	}

	async markFileAsViewed(filePathOrSubpath: string): Promise<void> {
		const { mutate, schema } = await this.githubRepository.ensure();
		const fileName = filePathOrSubpath.startsWith(this.githubRepository.rootUri.path) ?
			filePathOrSubpath.substring(this.githubRepository.rootUri.path.length + 1) : filePathOrSubpath;
		await mutate<void>({
			mutation: schema.MarkFileAsViewed,
			variables: {
				input: {
					path: fileName,
					pullRequestId: this.graphNodeId,
				},
			},
		});

		this.setFileViewedState(fileName, ViewedState.VIEWED, true);
	}

	async unmarkFileAsViewed(filePathOrSubpath: string): Promise<void> {
		const { mutate, schema } = await this.githubRepository.ensure();
		const fileName = filePathOrSubpath.startsWith(this.githubRepository.rootUri.path) ?
			filePathOrSubpath.substring(this.githubRepository.rootUri.path.length + 1) : filePathOrSubpath;
		await mutate<void>({
			mutation: schema.UnmarkFileAsViewed,
			variables: {
				input: {
					path: fileName,
					pullRequestId: this.graphNodeId,
				},
			},
		});

		this.setFileViewedState(fileName, ViewedState.UNVIEWED, true);
	}

	async unmarkAllFilesAsViewed(): Promise<void[]> {
		return Promise.all(Array.from(this.fileChanges.keys()).map(change => this.unmarkFileAsViewed(change)));
	}

	private setFileViewedState(fileSubpath: string, viewedState: ViewedState, event: boolean) {
		const filePath = vscode.Uri.joinPath(this.githubRepository.rootUri, fileSubpath).fsPath;
		switch (viewedState) {
			case ViewedState.DISMISSED: {
				this._viewedFiles.delete(filePath);
				this._unviewedFiles.delete(filePath);
				break;
			}
			case ViewedState.UNVIEWED: {
				this._viewedFiles.delete(filePath);
				this._unviewedFiles.add(filePath);
				break;
			}
			case ViewedState.VIEWED: {
				this._viewedFiles.add(filePath);
				this._unviewedFiles.delete(filePath);
			}
		}
		this._fileChangeViewedState[fileSubpath] = viewedState;
		if (event) {
			this._onDidChangeFileViewedState.fire({ changed: [{ fileName: fileSubpath, viewed: viewedState }] });
		}
	}

	public getViewedFileStates() {
		return {
			viewed: this._viewedFiles,
			unviewed: this._unviewedFiles
		};
	}
}
