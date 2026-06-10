/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

// --- Types -------------------------------------------------------------------

export interface ICodeReviewComment {
	readonly id: string;
	readonly uri: URI;
	readonly range: IRange;
	readonly body: string;
	readonly kind: string;
	readonly severity: string;
	readonly suggestion?: ICodeReviewSuggestion;
}

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
	 * Get the observable list of code review comments for a session. Comments
	 * are added and removed by the agent via tool calls.
	 */
	getComments(sessionResource: URI): IObservable<readonly ICodeReviewComment[]>;

	/**
	 * Add a single code review comment to the session.
	 */
	addComment(sessionResource: URI, uri: URI, range: IRange, body: string): ICodeReviewComment;

	/**
	 * Remove a single comment from the session.
	 */
	removeComment(sessionResource: URI, commentId: string): void;

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

// --- Storage Types -----------------------------------------------------------

interface IStoredCodeReviewComment {
	readonly id: string;
	readonly uri: UriComponents;
	readonly range: IRange;
	readonly body: string;
	readonly kind: string;
	readonly severity: string;
	readonly suggestion?: ICodeReviewSuggestion;
}

// --- Implementation ----------------------------------------------------------

interface ISessionReviewData {
	readonly comments: ISettableObservable<readonly ICodeReviewComment[]>;
}

interface IPRSessionReviewData {
	readonly state: ISettableObservable<IPRReviewState>;
}

export class CodeReviewService extends Disposable implements ICodeReviewService {

	declare readonly _serviceBrand: undefined;

	private static readonly _STORAGE_KEY = 'codeReview.reviews';

	private readonly _reviewsBySession = new Map<string, ISessionReviewData>();
	private readonly _prReviewBySession = new Map<string, IPRSessionReviewData>();
	/** PR review comment IDs that have been converted to agent feedback (per session). */
	private readonly _convertedPRCommentsBySession = new Map<string, Set<string>>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._loadFromStorage();
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

	getComments(sessionResource: URI): IObservable<readonly ICodeReviewComment[]> {
		return this._getOrCreateData(sessionResource).comments;
	}

	addComment(sessionResource: URI, uri: URI, range: IRange, body: string): ICodeReviewComment {
		const data = this._getOrCreateData(sessionResource);
		const comment: ICodeReviewComment = {
			id: generateUuid(),
			uri,
			range,
			body,
			kind: 'comment',
			severity: 'info',
		};
		data.comments.set([...data.comments.get(), comment], undefined);
		this._saveToStorage();
		return comment;
	}

	removeComment(sessionResource: URI, commentId: string): void {
		const data = this._reviewsBySession.get(sessionResource.toString());
		if (!data) {
			return;
		}

		const filtered = data.comments.get().filter(c => c.id !== commentId);
		if (filtered.length === data.comments.get().length) {
			return;
		}

		data.comments.set(filtered, undefined);
		this._saveToStorage();
	}

	private _getOrCreateData(sessionResource: URI): ISessionReviewData {
		const key = sessionResource.toString();
		let data = this._reviewsBySession.get(key);
		if (!data) {
			data = {
				comments: observableValue<readonly ICodeReviewComment[]>(`codeReview.comments.${key}`, []),
			};
			this._reviewsBySession.set(key, data);
		}
		return data;
	}

	private _loadFromStorage(): void {
		const raw = this._storageService.get(CodeReviewService._STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}

		try {
			const stored: Record<string, readonly IStoredCodeReviewComment[]> = JSON.parse(raw);
			for (const [key, storedComments] of Object.entries(stored)) {
				if (!Array.isArray(storedComments)) {
					continue;
				}
				const comments: ICodeReviewComment[] = storedComments.map(c => ({
					id: c.id,
					uri: URI.revive(c.uri),
					range: c.range,
					body: c.body,
					kind: c.kind,
					severity: c.severity,
					suggestion: c.suggestion,
				}));
				const data = this._getOrCreateData(URI.parse(key));
				data.comments.set(comments, undefined);
			}
		} catch {
			// Corrupted storage data - ignore
		}
	}

	private _saveToStorage(): void {
		const stored: Record<string, readonly IStoredCodeReviewComment[]> = {};
		for (const [key, data] of this._reviewsBySession) {
			const comments = data.comments.get();
			if (comments.length > 0) {
				stored[key] = comments.map(c => ({
					id: c.id,
					uri: c.uri.toJSON(),
					range: c.range,
					body: c.body,
					kind: c.kind,
					severity: c.severity,
					suggestion: c.suggestion,
				}));
			}
		}

		if (Object.keys(stored).length === 0) {
			this._storageService.remove(CodeReviewService._STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this._storageService.store(CodeReviewService._STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private _registerSessionListeners(): void {
		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			let changed = false;

			// Clean up reviews for removed/archived sessions
			for (const session of [...e.removed, ...e.changed.filter(s => s.isArchived.get())]) {
				this._disposePRReview(session.resource);

				const key = session.resource.toString();
				const data = this._reviewsBySession.get(key);
				if (data && data.comments.get().length > 0) {
					data.comments.set([], undefined);
					changed = true;
				}
			}

			// Clean up reviews whose sessions no longer exist
			for (const [key, data] of this._reviewsBySession) {
				if (data.comments.get().length === 0) {
					continue;
				}

				if (!this._sessionsManagementService.getSession(URI.parse(key))) {
					data.comments.set([], undefined);
					changed = true;
				}
			}

			if (changed) {
				this._saveToStorage();
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
