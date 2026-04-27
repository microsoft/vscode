/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { hash } from '../../../../base/common/hash.js';
import { hasKey } from '../../../../base/common/types.js';
import { isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionFileChange } from '../../../services/sessions/common/session.js';

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

export interface ICodeReviewFile {
	readonly currentUri: URI;
	readonly baseUri?: URI;
}

export function getCodeReviewFilesFromSessionChanges(changes: readonly ISessionFileChange[]): readonly ICodeReviewFile[] {
	return changes.map(change => {
		if (isIChatSessionFileChange2(change)) {
			return {
				currentUri: change.modifiedUri ?? change.uri,
				baseUri: change.originalUri,
			};
		}

		return {
			currentUri: change.modifiedUri,
			baseUri: change.originalUri,
		};
	});
}

export function getCodeReviewVersion(files: readonly ICodeReviewFile[]): string {
	const stableFileList = files
		.map(file => `${file.currentUri.toString()}|${file.baseUri?.toString() ?? ''}`)
		.sort();

	return `v1:${stableFileList.length}:${hash(stableFileList)}`;
}

export const MAX_CODE_REVIEWS_PER_SESSION_VERSION = 5;

export const enum CodeReviewStateKind {
	Idle = 'idle',
	Loading = 'loading',
	Result = 'result',
	Error = 'error',
}

export type ICodeReviewState =
	| { readonly kind: CodeReviewStateKind.Idle }
	| { readonly kind: CodeReviewStateKind.Loading; readonly version: string; readonly reviewCount: number }
	| { readonly kind: CodeReviewStateKind.Result; readonly version: string; readonly reviewCount: number; readonly comments: readonly ICodeReviewComment[]; readonly didProduceComments: boolean }
	| { readonly kind: CodeReviewStateKind.Error; readonly version: string; readonly reviewCount: number; readonly reason: string };

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

/** Shape of a single comment as returned by the code review command. */
interface IRawCodeReviewComment {
	readonly uri: IRawCodeReviewUri;
	readonly range: IRawCodeReviewRange;
	readonly body?: string;
	readonly kind?: string;
	readonly severity?: string;
	readonly suggestion?: IRawCodeReviewSuggestion;
}

type IRawCodeReviewUri = URI | UriComponents | string;

interface IRawCodeReviewPosition {
	readonly line?: number;
	readonly character?: number;
}

interface IRawCodeReviewRangeWithPositions {
	readonly start?: IRawCodeReviewPosition;
	readonly end?: IRawCodeReviewPosition;
}

interface IRawCodeReviewRangeWithLines {
	readonly startLine?: number;
	readonly startColumn?: number;
	readonly endLine?: number;
	readonly endColumn?: number;
}

type IRawCodeReviewRangeTuple = readonly [IRawCodeReviewPosition, IRawCodeReviewPosition];

type IRawCodeReviewRange = IRange | IRawCodeReviewRangeWithPositions | IRawCodeReviewRangeWithLines | IRawCodeReviewRangeTuple;

interface IRawCodeReviewSuggestion {
	readonly edits: readonly IRawCodeReviewSuggestionChange[];
}

interface IRawCodeReviewSuggestionChange {
	readonly range: IRawCodeReviewRange;
	readonly newText: string;
	readonly oldText: string;
}

// --- Service Interface -------------------------------------------------------

export const ICodeReviewService = createDecorator<ICodeReviewService>('codeReviewService');

export interface ICodeReviewService {
	readonly _serviceBrand: undefined;

	/**
	 * Get the observable review state for a session.
	 */
	getReviewState(sessionResource: URI): IObservable<ICodeReviewState>;

	/**
	 * Synchronously check if a completed review exists for the given session+version.
	 */
	hasReview(sessionResource: URI, version: string): boolean;

	/**
	 * Request a code review for the given session. The review is associated with
	 * a version string (fingerprint of changed files). If a review is already in
	 * progress or there are still unresolved review comments for this version,
	 * this is a no-op.
	 */
	requestReview(sessionResource: URI, version: string, files: readonly { readonly currentUri: URI; readonly baseUri?: URI }[]): void;

	/**
	 * Remove a single comment from the review results.
	 */
	removeComment(sessionResource: URI, commentId: string): void;

	/**
	 * Update the body text of a single code review comment.
	 */
	updateComment(sessionResource: URI, commentId: string, newBody: string): void;

	/**
	 * Dismiss/clear the review for a session entirely.
	 */
	dismissReview(sessionResource: URI): void;

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

interface IStoredCodeReview {
	readonly version: string;
	readonly reviewCount?: number;
	readonly didProduceComments?: boolean;
	readonly comments: readonly IStoredCodeReviewComment[];
}

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
	readonly state: ReturnType<typeof observableValue<ICodeReviewState>>;
}

interface IPRSessionReviewData {
	readonly state: ReturnType<typeof observableValue<IPRReviewState>>;
	readonly disposables: DisposableStore;
	initialized: boolean;
}

function isRawCodeReviewRangeWithPositions(range: IRawCodeReviewRange): range is IRawCodeReviewRangeWithPositions {
	return typeof range === 'object' && range !== null && hasKey(range, { start: true, end: true });
}

function isRawCodeReviewRangeTuple(range: IRawCodeReviewRange): range is IRawCodeReviewRangeTuple {
	return Array.isArray(range) && range.length >= 2;
}

function normalizeCodeReviewUri(uri: IRawCodeReviewUri): URI {
	return typeof uri === 'string' ? URI.parse(uri) : URI.revive(uri);
}

function normalizeCodeReviewRange(range: IRawCodeReviewRange): IRange {
	if (Range.isIRange(range)) {
		return Range.lift(range);
	}

	if (isRawCodeReviewRangeTuple(range)) {
		const [start, end] = range;
		return new Range(
			(start.line ?? 0) + 1,
			(start.character ?? 0) + 1,
			(end.line ?? start.line ?? 0) + 1,
			(end.character ?? start.character ?? 0) + 1,
		);
	}

	if (isRawCodeReviewRangeWithPositions(range) && range.start && range.end) {
		return new Range(
			(range.start.line ?? 0) + 1,
			(range.start.character ?? 0) + 1,
			(range.end.line ?? range.start.line ?? 0) + 1,
			(range.end.character ?? range.start.character ?? 0) + 1,
		);
	}

	const lineRange = range as IRawCodeReviewRangeWithLines;
	return new Range(
		(lineRange.startLine ?? 0) + 1,
		(lineRange.startColumn ?? 0) + 1,
		(lineRange.endLine ?? lineRange.startLine ?? 0) + 1,
		(lineRange.endColumn ?? lineRange.startColumn ?? 0) + 1,
	);
}

function normalizeCodeReviewSuggestion(suggestion: IRawCodeReviewSuggestion | undefined): ICodeReviewSuggestion | undefined {
	if (!suggestion) {
		return undefined;
	}

	return {
		edits: suggestion.edits.map(edit => ({
			range: normalizeCodeReviewRange(edit.range),
			newText: edit.newText,
			oldText: edit.oldText,
		})),
	};
}

export class CodeReviewService extends Disposable implements ICodeReviewService {

	declare readonly _serviceBrand: undefined;

	private static readonly _STORAGE_KEY = 'codeReview.reviews';

	private readonly _reviewsBySession = new Map<string, ISessionReviewData>();
	private readonly _prReviewBySession = new Map<string, IPRSessionReviewData>();
	/** PR review comment IDs that have been converted to agent feedback (per session). */
	private readonly _convertedPRCommentsBySession = new Map<string, Set<string>>();

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) {
		super();
		this._loadFromStorage();
		this._registerSessionListeners();

		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (activeSession) {
				this._ensurePRReviewInitialized(activeSession.resource);
			}
		}));

		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			const archived = e.changed.filter(s => s.isArchived.get());
			const nonArchived = e.changed.filter(s => !s.isArchived.get());
			// Initialize PR review for new/changed sessions
			for (const session of [...e.added, ...nonArchived]) {
				this._ensurePRReviewInitialized(session.resource);
			}
			// Dispose PR review for removed and archived sessions
			for (const session of [...e.removed, ...archived]) {
				this._disposePRReview(session.resource);
			}
		}));
	}

	getReviewState(sessionResource: URI): IObservable<ICodeReviewState> {
		return this._getOrCreateData(sessionResource).state;
	}

	hasReview(sessionResource: URI, version: string): boolean {
		const data = this._reviewsBySession.get(sessionResource.toString());
		if (!data) {
			return false;
		}
		const state = data.state.get();
		return state.kind === CodeReviewStateKind.Result && state.version === version;
	}

	requestReview(sessionResource: URI, version: string, files: readonly { readonly currentUri: URI; readonly baseUri?: URI }[]): void {
		const data = this._getOrCreateData(sessionResource);
		const currentState = data.state.get();
		const currentReviewCount = currentState.kind !== CodeReviewStateKind.Idle && currentState.version === version ? currentState.reviewCount : 0;

		// Don't re-request if already loading or unresolved comments remain for this version.
		if (currentState.kind === CodeReviewStateKind.Loading && currentState.version === version) {
			return;
		}
		if (currentReviewCount >= MAX_CODE_REVIEWS_PER_SESSION_VERSION) {
			return;
		}
		if (currentState.kind === CodeReviewStateKind.Result && currentState.version === version && currentState.comments.length > 0) {
			return;
		}

		data.state.set({ kind: CodeReviewStateKind.Loading, version, reviewCount: currentReviewCount + 1 }, undefined);

		this._executeReview(sessionResource, version, files, data);
	}

	removeComment(sessionResource: URI, commentId: string): void {
		const data = this._reviewsBySession.get(sessionResource.toString());
		if (!data) {
			return;
		}

		const state = data.state.get();
		if (state.kind !== CodeReviewStateKind.Result) {
			return;
		}

		const filtered = state.comments.filter(c => c.id !== commentId);
		data.state.set({ kind: CodeReviewStateKind.Result, version: state.version, reviewCount: state.reviewCount, comments: filtered, didProduceComments: state.didProduceComments }, undefined);
		this._saveToStorage();
	}

	updateComment(sessionResource: URI, commentId: string, newBody: string): void {
		const data = this._reviewsBySession.get(sessionResource.toString());
		if (!data) {
			return;
		}

		const state = data.state.get();
		if (state.kind !== CodeReviewStateKind.Result) {
			return;
		}

		const updated = state.comments.map(c => c.id === commentId ? { ...c, body: newBody } : c);
		data.state.set({ kind: CodeReviewStateKind.Result, version: state.version, reviewCount: state.reviewCount, comments: updated, didProduceComments: state.didProduceComments }, undefined);
		this._saveToStorage();
	}

	dismissReview(sessionResource: URI): void {
		const data = this._reviewsBySession.get(sessionResource.toString());
		if (data) {
			data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
			this._saveToStorage();
		}
	}

	private _getOrCreateData(sessionResource: URI): ISessionReviewData {
		const key = sessionResource.toString();
		let data = this._reviewsBySession.get(key);
		if (!data) {
			data = {
				state: observableValue<ICodeReviewState>(`codeReview.state.${key}`, { kind: CodeReviewStateKind.Idle }),
			};
			this._reviewsBySession.set(key, data);
		}
		return data;
	}

	private async _executeReview(
		sessionResource: URI,
		version: string,
		files: readonly { readonly currentUri: URI; readonly baseUri?: URI }[],
		data: ISessionReviewData,
	): Promise<void> {
		try {
			const result: { type: string; comments?: IRawCodeReviewComment[]; reason?: string } | undefined =
				await this._commandService.executeCommand('chat.internal.codeReview.run', {
					files: files.map(f => ({
						currentUri: f.currentUri,
						baseUri: f.baseUri,
					})),
				});

			// Check if version is still current (hasn't been dismissed or replaced)
			const currentState = data.state.get();
			if (currentState.kind !== CodeReviewStateKind.Loading || currentState.version !== version) {
				return;
			}

			if (!result || result.type === 'cancelled') {
				data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
				return;
			}

			if (result.type === 'error') {
				data.state.set({ kind: CodeReviewStateKind.Error, version, reviewCount: currentState.reviewCount, reason: result.reason ?? 'Unknown error' }, undefined);
				return;
			}

			if (result.type === 'success') {
				const comments: ICodeReviewComment[] = (result.comments ?? []).map((raw) => ({
					id: generateUuid(),
					uri: normalizeCodeReviewUri(raw.uri),
					range: normalizeCodeReviewRange(raw.range),
					body: raw.body ?? '',
					kind: raw.kind ?? '',
					severity: raw.severity ?? '',
					suggestion: normalizeCodeReviewSuggestion(raw.suggestion),
				}));

				transaction(tx => {
					data.state.set({ kind: CodeReviewStateKind.Result, version, reviewCount: currentState.reviewCount, comments, didProduceComments: comments.length > 0 }, tx);
				});
				this._saveToStorage();
			}
		} catch (err) {
			const currentState = data.state.get();
			if (currentState.kind === CodeReviewStateKind.Loading && currentState.version === version) {
				data.state.set({ kind: CodeReviewStateKind.Error, version, reviewCount: currentState.reviewCount, reason: String(err) }, undefined);
			}
		}
	}

	private _loadFromStorage(): void {
		const raw = this._storageService.get(CodeReviewService._STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}

		try {
			const stored: Record<string, IStoredCodeReview> = JSON.parse(raw);
			for (const [key, review] of Object.entries(stored)) {
				const comments: ICodeReviewComment[] = review.comments.map(c => ({
					id: c.id,
					uri: URI.revive(c.uri),
					range: c.range,
					body: c.body,
					kind: c.kind,
					severity: c.severity,
					suggestion: c.suggestion,
				}));
				const data = this._getOrCreateData(URI.parse(key));
				data.state.set({ kind: CodeReviewStateKind.Result, version: review.version, reviewCount: review.reviewCount ?? 1, comments, didProduceComments: review.didProduceComments ?? comments.length > 0 }, undefined);
			}
		} catch {
			// Corrupted storage data - ignore
		}
	}

	private _saveToStorage(): void {
		const stored: Record<string, IStoredCodeReview> = {};
		for (const [key, data] of this._reviewsBySession) {
			const state = data.state.get();
			if (state.kind === CodeReviewStateKind.Result) {
				stored[key] = {
					version: state.version,
					reviewCount: state.reviewCount,
					didProduceComments: state.didProduceComments,
					comments: state.comments.map(c => ({
						id: c.id,
						uri: c.uri.toJSON(),
						range: c.range,
						body: c.body,
						kind: c.kind,
						severity: c.severity,
						suggestion: c.suggestion,
					})),
				};
			}
		}

		if (Object.keys(stored).length === 0) {
			this._storageService.remove(CodeReviewService._STORAGE_KEY, StorageScope.WORKSPACE);
		} else {
			this._storageService.store(CodeReviewService._STORAGE_KEY, JSON.stringify(stored), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
	}

	private _registerSessionListeners(): void {
		// Clean up when sessions change (archived/removed sessions, stale review versions)
		this._register(this._sessionsManagementService.onDidChangeSessions(e => {
			// Clean up reviews for removed/archived sessions
			for (const session of [...e.removed, ...e.changed.filter(s => s.isArchived.get())]) {
				const key = session.resource.toString();
				const data = this._reviewsBySession.get(key);
				if (data) {
					data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
					this._saveToStorage();
				}
			}

			// Check for stale review versions when sessions change
			let changed = false;
			for (const [key, data] of this._reviewsBySession) {
				const state = data.state.get();
				if (state.kind !== CodeReviewStateKind.Result) {
					continue;
				}

				const session = this._sessionsManagementService.getSession(URI.parse(key));
				if (!session) {
					// Session no longer exists - clean up
					data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
					changed = true;
					continue;
				}

				const changes = session.changes.get();
				if (changes.length === 0) {
					// Session has no file-level changes - clean up
					data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
					changed = true;
					continue;
				}

				const files = getCodeReviewFilesFromSessionChanges(changes);
				const currentVersion = getCodeReviewVersion(files);
				if (state.version !== currentVersion) {
					// Version mismatch - review is stale
					data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
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
		const gitHubInfo = session?.gitHubInfo.get();
		if (gitHubInfo?.pullRequest) {
			const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
			try {
				await prModel.resolveThread(threadId);
			} catch (err) {
				this._logService.warn('[CodeReviewService] Failed to resolve PR thread on GitHub:', err);
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
				disposables: new DisposableStore(),
				initialized: false,
			};
			this._prReviewBySession.set(key, data);
		}
		return data;
	}

	private _ensurePRReviewInitialized(sessionResource: URI): void {
		const data = this._getOrCreatePRReviewData(sessionResource);
		if (data.initialized) {
			return;
		}

		const session = this._sessionsManagementService.getSession(sessionResource);
		const gitHubInfo = session?.gitHubInfo.get();
		if (!gitHubInfo?.pullRequest) {
			return;
		}

		data.initialized = true;
		data.state.set({ kind: PRReviewStateKind.Loading }, undefined);

		const prModel = this._gitHubService.getPullRequest(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
		const workspace = session?.workspace.get();

		// Watch the PR model's review threads and map to local state
		data.disposables.add(autorun(reader => {
			const threads = prModel.reviewThreads.read(reader);
			const converted = this._convertedPRCommentsBySession.get(sessionResource.toString());
			const comments: IPRReviewComment[] = [];

			for (const thread of threads) {
				if (thread.isResolved) {
					continue;
				}
				const threadId = String(thread.id);
				if (converted?.has(threadId)) {
					continue;
				}
				const baseUri = workspace?.repositories[0]?.workingDirectory ?? workspace?.repositories[0]?.uri;
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

		// Start polling and initial fetch
		prModel.refreshThreads().catch(err => {
			this._logService.error('[CodeReviewService] Failed to fetch PR review threads:', err);
			data.state.set({ kind: PRReviewStateKind.Error, reason: String(err) }, undefined);
		});
		prModel.startPolling();
	}

	private _disposePRReview(sessionResource: URI): void {
		const key = sessionResource.toString();
		this._convertedPRCommentsBySession.delete(key);
		const data = this._prReviewBySession.get(key);
		if (data) {
			data.disposables.dispose();
			this._prReviewBySession.delete(key);
		}
	}

	override dispose(): void {
		for (const data of this._prReviewBySession.values()) {
			data.disposables.dispose();
		}
		this._prReviewBySession.clear();
		super.dispose();
	}
}
