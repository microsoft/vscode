/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { IRange, Range } from '../../../../editor/common/core/range.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { hash } from '../../../../base/common/hash.js';
import { hasKey } from '../../../../base/common/types.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

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

export function getCodeReviewFilesFromSessionChanges(changes: readonly (IChatSessionFileChange | IChatSessionFileChange2)[]): readonly ICodeReviewFile[] {
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

export const enum CodeReviewStateKind {
	Idle = 'idle',
	Loading = 'loading',
	Result = 'result',
	Error = 'error',
}

export type ICodeReviewState =
	| { readonly kind: CodeReviewStateKind.Idle }
	| { readonly kind: CodeReviewStateKind.Loading; readonly version: string }
	| { readonly kind: CodeReviewStateKind.Result; readonly version: string; readonly comments: readonly ICodeReviewComment[] }
	| { readonly kind: CodeReviewStateKind.Error; readonly version: string; readonly reason: string };

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
	 * progress or completed for this version, this is a no-op.
	 */
	requestReview(sessionResource: URI, version: string, files: readonly { readonly currentUri: URI; readonly baseUri?: URI }[]): void;

	/**
	 * Remove a single comment from the review results.
	 */
	removeComment(sessionResource: URI, commentId: string): void;

	/**
	 * Dismiss/clear the review for a session entirely.
	 */
	dismissReview(sessionResource: URI): void;
}

// --- Implementation ----------------------------------------------------------

interface ISessionReviewData {
	readonly state: ReturnType<typeof observableValue<ICodeReviewState>>;
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

	private readonly _reviewsBySession = new Map<string, ISessionReviewData>();

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();
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

		// Don't re-request if already loading or completed for this version
		if (currentState.kind === CodeReviewStateKind.Loading && currentState.version === version) {
			return;
		}
		if (currentState.kind === CodeReviewStateKind.Result && currentState.version === version) {
			return;
		}

		data.state.set({ kind: CodeReviewStateKind.Loading, version }, undefined);

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
		data.state.set({ kind: CodeReviewStateKind.Result, version: state.version, comments: filtered }, undefined);
	}

	dismissReview(sessionResource: URI): void {
		const data = this._reviewsBySession.get(sessionResource.toString());
		if (data) {
			data.state.set({ kind: CodeReviewStateKind.Idle }, undefined);
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
				data.state.set({ kind: CodeReviewStateKind.Error, version, reason: result.reason ?? 'Unknown error' }, undefined);
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
					data.state.set({ kind: CodeReviewStateKind.Result, version, comments }, tx);
				});
			}
		} catch (err) {
			const currentState = data.state.get();
			if (currentState.kind === CodeReviewStateKind.Loading && currentState.version === version) {
				data.state.set({ kind: CodeReviewStateKind.Error, version, reason: String(err) }, undefined);
			}
		}
	}
}
