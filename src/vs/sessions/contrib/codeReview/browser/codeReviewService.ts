/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

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
	| { readonly kind: PRReviewStateKind.Loaded; readonly comments: readonly IPRReviewComment[] }
	| { readonly kind: PRReviewStateKind.Error; readonly reason: string };

export interface IPRReviewComment {
	readonly id: string;
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
	 * Returns unresolved review comments from the PR associated with the session.
	 */
	getPRReviewState(sessionResource: URI): IObservable<IPRReviewState>;

	/**
	 * Resolve a PR review thread on GitHub and remove it from local state.
	 */
	resolvePRReviewThread(sessionResource: URI, threadId: string): Promise<void>;

	/**
	 * Mark a PR review comment as locally converted to agent feedback.
	 * The comment is hidden from the PR review state until the session is
	 * cleaned up.
	 */
	markPRReviewCommentConverted(sessionResource: URI, commentId: string): void;
}

// --- Implementation ----------------------------------------------------------

interface IPRSessionReviewData {
	readonly state: ISettableObservable<IPRReviewState>;
}

export class CodeReviewService extends Disposable implements ICodeReviewService {

	declare readonly _serviceBrand: undefined;

	private readonly _prReviewBySession = new Map<string, IPRSessionReviewData>();
	/** PR review comment IDs that have been converted to agent feedback (per session). */
	private readonly _convertedPRCommentsBySession = new Map<string, Set<string>>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._registerSessionListeners();

		const activeSessionResourceObs = derivedOpts({ equalsFn: isEqual }, reader => {
			return this._sessionsManagementService.activeSession.read(reader)?.resource;
		});

		// Subscribe to the active session's PR review threads model and project
		// review threads into per-session PR review state. The model lifetime is
		// owned by `IGitHubService.activeSessionPullRequestReviewThreadsObs`; we
		// only consume it here.
		this._register(autorun(reader => {
			const activeSessionResource = activeSessionResourceObs.read(reader);
			if (!activeSessionResource) {
				return;
			}

			const reviewThreadsModel = this._gitHubService.activeSessionPullRequestReviewThreadsObs.read(reader);
			if (!reviewThreadsModel) {
				return;
			}

			const data = this._getOrCreatePRReviewData(activeSessionResource);
			if (data.state.read(undefined).kind === PRReviewStateKind.None) {
				data.state.set({ kind: PRReviewStateKind.Loading }, undefined);
			}

			const session = this._sessionsManagementService.getSession(activeSessionResource);
			const workspace = session?.workspace.read(undefined);

			// Map review threads -> local state.
			reader.store.add(autorun(innerReader => {
				const threads = reviewThreadsModel.reviewThreads.read(innerReader);
				const converted = this._convertedPRCommentsBySession.get(activeSessionResource.toString());
				const comments: IPRReviewComment[] = [];

				for (const thread of threads) {
					if (thread.isResolved) {
						continue;
					}
					const threadId = String(thread.id);
					if (converted?.has(threadId)) {
						continue;
					}
					const baseUri = workspace?.folders[0]?.workingDirectory;
					if (!baseUri) {
						continue;
					}
					const fileUri = URI.joinPath(baseUri, thread.path);
					const line = thread.line ?? 1;
					const firstComment = thread.comments[0];
					comments.push({
						id: String(thread.id),
						uri: fileUri,
						range: new Range(line, 1, line, 1),
						body: firstComment?.body ?? '',
						author: firstComment?.author.login ?? '',
					});
				}

				data.state.set({ kind: PRReviewStateKind.Loaded, comments }, undefined);
			}));
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

	async resolvePRReviewThread(sessionResource: URI, threadId: string): Promise<void> {
		const session = this._sessionsManagementService.getSession(sessionResource);
		const gitHubInfo = session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
		if (gitHubInfo?.pullRequest) {
			const modelRef = this._gitHubService.createPullRequestReviewThreadsModelReference(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
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
				data.state.set({ kind: PRReviewStateKind.Loaded, comments: filtered }, undefined);
			}
		}
	}

	markPRReviewCommentConverted(sessionResource: URI, commentId: string): void {
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
				data.state.set({ kind: PRReviewStateKind.Loaded, comments: filtered }, undefined);
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
