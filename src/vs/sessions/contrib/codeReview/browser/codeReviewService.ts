/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { arrayEquals } from '../../../../base/common/equals.js';
import { autorun, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { getGitHubPullRequestRefs, IGitHubPullRequestRef } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
// --- Types -------------------------------------------------------------------

export interface ICodeReviewSuggestion {
	readonly edits: readonly ICodeReviewSuggestionChange[];
}

export interface ICodeReviewSuggestionChange {
	readonly range: IRange;
	readonly newText: string;
	readonly oldText: string;
}

// --- PR Review Types ---------------------------------------------------------

export const enum PRReviewStateKind {
	None = 'none',
	Loading = 'loading',
	Loaded = 'loaded',
	Error = 'error',
}

export type IPRReviewState =
	| { readonly kind: PRReviewStateKind.None }
	| { readonly kind: PRReviewStateKind.Loading }
	| { readonly kind: PRReviewStateKind.Loaded; readonly comments: readonly IPRReviewComment[]; readonly incompletePullRequests: readonly Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>[] }
	| { readonly kind: PRReviewStateKind.Error; readonly reason: string };

export interface IPRReviewComment {
	readonly id: string;
	readonly pullRequest: IGitHubPullRequestRef;
	readonly uri: URI;
	readonly range: IRange;
	readonly body: string;
	readonly author: string;
}

// --- Service Interface -------------------------------------------------------

export const ICodeReviewService = createDecorator<ICodeReviewService>('codeReviewService');

export interface ICodeReviewService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the observable PR review state for a session.
	 * Returns unresolved review comments from every PR associated with the session.
	 */
	getPRReviewState(sessionResource: URI): IObservable<IPRReviewState>;

	/**
	 * Resolve a PR review thread on GitHub and remove it from local state.
	 */
	resolvePRReviewThread(sessionResource: URI, threadId: string, pullRequest?: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>): Promise<void>;

	/**
	 * Mark a PR review comment as locally converted to agent feedback.
	 * The comment is hidden from the PR review state until the session is
	 * cleaned up.
	 */
	markPRReviewCommentConverted(sessionResource: URI, commentId: string): void;

	/**
	 * Dismiss a PR review comment so it no longer appears in the review state.
	 * Used when the user deletes the comment's pending agent-feedback mirror
	 * from the `viewUnreviewedComments` confirmation: without suppressing the
	 * source comment the mirror would be seeded again. Like
	 * {@link markPRReviewCommentConverted} this is a local, in-memory filter that
	 * does not touch GitHub and is reset when the session is cleaned up.
	 */
	dismissPRReviewComment(sessionResource: URI, commentId: string): void;
}

// --- Implementation ----------------------------------------------------------

interface IPRSessionReviewData {
	readonly state: ISettableObservable<IPRReviewState>;
}

interface IActivePRReviewContext {
	readonly sessionResource: URI;
	readonly workingDirectory: URI | undefined;
	readonly pullRequests: readonly IGitHubPullRequestRef[];
}

export class CodeReviewService extends Disposable implements ICodeReviewService {

	declare readonly _serviceBrand: undefined;

	private readonly _prReviewBySession = new Map<string, IPRSessionReviewData>();
	/**
	 * PR review comment IDs that have been locally handled — converted to agent
	 * feedback or dismissed from the `viewUnreviewedComments` confirmation — and
	 * are therefore hidden from the PR review state (per session).
	 */
	private readonly _convertedPRCommentsBySession = new Map<string, Set<string>>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();
		this._registerSessionListeners();

		const activeReviewContext = derivedOpts<IActivePRReviewContext | undefined>({
			owner: this,
			equalsFn: (a, b) => a === b || !!a && !!b &&
				isEqual(a.sessionResource, b.sessionResource) &&
				isEqual(a.workingDirectory, b.workingDirectory) &&
				arrayEquals(a.pullRequests, b.pullRequests, (x, y) =>
					x.owner === y.owner && x.repo === y.repo && x.number === y.number)
		}, reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			if (!activeSession) {
				return undefined;
			}
			const workspace = activeSession.workspace.read(reader);
			const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
			return {
				sessionResource: activeSession.resource,
				workingDirectory: workspace?.folders[0]?.workingDirectory,
				pullRequests: getGitHubPullRequestRefs(gitHubInfo),
			};
		});

		this._register(autorun(reader => {
			const context = activeReviewContext.read(reader);
			for (const pullRequest of context?.pullRequests ?? []) {
				const reviewThreadsRef = reader.store.add(this._gitHubService.createPullRequestReviewThreadsModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number));
				void reviewThreadsRef.object.refresh();
				reader.store.add(reviewThreadsRef.object.startPolling());
			}
		}));

		this._register(autorun(reader => {
			const context = activeReviewContext.read(reader);
			if (!context || context.pullRequests.length === 0) {
				return;
			}

			const data = this._getOrCreatePRReviewData(context.sessionResource);
			if (data.state.read(undefined).kind === PRReviewStateKind.None) {
				data.state.set({ kind: PRReviewStateKind.Loading }, undefined);
			}

			const converted = this._convertedPRCommentsBySession.get(context.sessionResource.toString());
			const comments: IPRReviewComment[] = [];
			const incompletePullRequests: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>[] = [];
			let initialRefreshCompleted = true;
			for (const pullRequest of context.pullRequests) {
				const reviewThreadsRef = reader.store.add(this._gitHubService.createPullRequestReviewThreadsModelReference(pullRequest.owner, pullRequest.repo, pullRequest.number));
				const reviewThreadsModel = reviewThreadsRef.object;
				initialRefreshCompleted = reviewThreadsModel.initialRefreshCompleted.read(reader) && initialRefreshCompleted;
				if (!reviewThreadsModel.hasLoaded.read(reader)) {
					incompletePullRequests.push(pullRequest);
				}
				const threads = reviewThreadsModel.reviewThreads.read(reader);
				for (const thread of threads) {
					if (thread.isResolved) {
						continue;
					}
					const threadId = String(thread.id);
					if (converted?.has(threadId)) {
						continue;
					}
					const baseUri = context.workingDirectory;
					if (!baseUri) {
						continue;
					}
					const fileUri = URI.joinPath(baseUri, thread.path);
					const line = thread.line ?? 1;
					const firstComment = thread.comments[0];
					comments.push({
						id: String(thread.id),
						pullRequest,
						uri: fileUri,
						range: new Range(line, 1, line, 1),
						body: firstComment?.body ?? '',
						author: firstComment?.author.login ?? '',
					});
				}
			}
			if (!initialRefreshCompleted) {
				data.state.set({ kind: PRReviewStateKind.Loading }, undefined);
				return;
			}
			data.state.set({ kind: PRReviewStateKind.Loaded, comments, incompletePullRequests }, undefined);
		}));
	}

	private _registerSessionListeners(): void {
		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			// Dispose PR review state for removed or archived sessions.
			for (const session of [...e.removed, ...e.changed.filter(s => s.isArchived.get())]) {
				this._disposePRReview(session.resource);
			}
		}));
	}

	getPRReviewState(sessionResource: URI): IObservable<IPRReviewState> {
		return this._getOrCreatePRReviewData(sessionResource).state;
	}

	async resolvePRReviewThread(sessionResource: URI, threadId: string, pullRequest?: Pick<IGitHubPullRequestRef, 'owner' | 'repo' | 'number'>): Promise<void> {
		const session = this._sessionsManagementService.getSession(sessionResource);
		const gitHubInfo = session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		const state = this._prReviewBySession.get(sessionResource.toString())?.state.get();
		const source = pullRequest
			?? (state?.kind === PRReviewStateKind.Loaded ? state.comments.find(comment => comment.id === threadId)?.pullRequest : undefined)
			?? getGitHubPullRequestRefs(gitHubInfo)[0];
		if (source) {
			const modelRef = this._gitHubService.createPullRequestReviewThreadsModelReference(source.owner, source.repo, source.number);
			try {
				await modelRef.object.resolveThread(threadId);
			} catch (err) {
				this._logService.warn('[CodeReviewService] Failed to resolve PR thread on GitHub:', err);
			} finally {
				modelRef.dispose();
			}
		}

		// Remove from local state regardless of GitHub success
		const data = this._prReviewBySession.get(sessionResource.toString());
		if (data) {
			const currentState = data.state.get();
			if (currentState.kind === PRReviewStateKind.Loaded) {
				const filtered = currentState.comments.filter(c => c.id !== threadId);
				data.state.set({ ...currentState, comments: filtered }, undefined);
			}
		}
	}

	markPRReviewCommentConverted(sessionResource: URI, commentId: string): void {
		this._suppressPRReviewComment(sessionResource, commentId);
	}

	dismissPRReviewComment(sessionResource: URI, commentId: string): void {
		this._suppressPRReviewComment(sessionResource, commentId);
	}

	/**
	 * Hide a PR review comment from the session's review state and remember it
	 * so the projection autorun keeps filtering it. Shared by
	 * {@link markPRReviewCommentConverted} and {@link dismissPRReviewComment}.
	 */
	private _suppressPRReviewComment(sessionResource: URI, commentId: string): void {
		const key = sessionResource.toString();
		let converted = this._convertedPRCommentsBySession.get(key);
		if (!converted) {
			converted = new Set();
			this._convertedPRCommentsBySession.set(key, converted);
		}
		converted.add(commentId);

		// Immediately filter the comment from the observable PR review state
		const data = this._prReviewBySession.get(key);
		if (data) {
			const currentState = data.state.get();
			if (currentState.kind === PRReviewStateKind.Loaded) {
				const filtered = currentState.comments.filter(c => c.id !== commentId);
				data.state.set({ ...currentState, comments: filtered }, undefined);
			}
		}
	}

	private _getOrCreatePRReviewData(sessionResource: URI): IPRSessionReviewData {
		const key = sessionResource.toString();
		let data = this._prReviewBySession.get(key);
		if (!data) {
			data = {
				state: observableValue<IPRReviewState>(`prReview.state.${key}`, { kind: PRReviewStateKind.None }),
			};
			this._prReviewBySession.set(key, data);
		}
		return data;
	}

	private _disposePRReview(sessionResource: URI): void {
		const key = sessionResource.toString();
		this._convertedPRCommentsBySession.delete(key);
		this._prReviewBySession.delete(key);
	}

	override dispose(): void {
		this._prReviewBySession.clear();

		super.dispose();
	}
}
