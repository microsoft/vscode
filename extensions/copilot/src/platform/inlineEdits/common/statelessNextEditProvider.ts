/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { Result } from '../../../util/common/result';
import { assert, assertNever } from '../../../util/vs/base/common/assert';
import { DeferredPromise } from '../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { LineEdit, LineReplacement, SerializedLineEdit } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../util/vs/editor/common/core/position';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { ChatFetchResponseType, FetchResponse } from '../../chat/common/commonTypes';
import { ILogger } from '../../log/common/logService';
import { ISerializedOffsetRange, LogEntry, serializeOffsetRange } from '../../workspaceRecorder/common/workspaceLog';
import { DocumentId } from './dataTypes/documentId';
import { Edits } from './dataTypes/edit';
import { SerializedEdit } from './dataTypes/editUtils';
import { LanguageId } from './dataTypes/languageId';
import { DebugRecorderBookmark } from './debugRecorderBookmark';
import { InlineEditRequestLogContext } from './inlineEditLogContext';
import { stringifyChatMessages } from './utils/stringifyChatMessages';
import { IXtabHistoryEntry } from './workspaceEditTracker/nesXtabHistoryTracker';

export type EditStreaming = AsyncGenerator<StreamedEdit, NoNextEditReason, void>;

export class WithStatelessProviderTelemetry<T> {
	constructor(
		public readonly v: T,
		public readonly telemetryBuilder: IStatelessNextEditTelemetry,
	) {
	}
}

export type EditStreamingWithTelemetry = AsyncGenerator<WithStatelessProviderTelemetry<StreamedEdit>, WithStatelessProviderTelemetry<NoNextEditReason>, void>;

export type StreamedEdit = {
	readonly targetDocument: DocumentId;
	readonly edit: LineReplacement;
	readonly isFromCursorJump: boolean;
	readonly window?: OffsetRange;
	/**
	 * For cursor jump edits, this is the edit window around the original cursor position
	 * (before the jump). This allows the cached edit to be served when the cursor is
	 * in either the original location or the jump target location.
	 */
	readonly originalWindow?: OffsetRange;
};

export type PushEdit = (edit: Result<StreamedEdit, NoNextEditReason>) => void;

export class RequestEditWindow {
	constructor(readonly window: OffsetRange) { }
	containsCursor(cursor: OffsetRange): boolean {
		return this.window.containsRange(cursor);
	}
}

export class RequestEditWindowWithCursorJump {
	constructor(readonly window: OffsetRange, readonly originalWindow: OffsetRange) { }
	containsCursor(cursor: OffsetRange): boolean {
		return this.window.containsRange(cursor) || this.originalWindow.containsRange(cursor);
	}
}

export interface IStatelessNextEditProvider {
	readonly ID: string;
	provideNextEdit(request: StatelessNextEditRequest, logger: ILogger, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken): EditStreamingWithTelemetry;
	handleAcceptance?(): void;
	handleRejection?(): void;
	handleIgnored?(): void;
}

export class StatelessNextEditRequest<TFirstEdit = any> {

	private static ID = 0;
	public readonly seqid = String(++StatelessNextEditRequest.ID);

	public readonly cancellationTokenSource = new CancellationTokenSource();
	public liveDependentants = 0; // number of invocations which haven't been canceled and depend on this request
	public fetchIssued = false;
	public intermediateUserEdit: StringEdit | undefined = StringEdit.empty;

	/**
	 * Set by the stateless provider early in its execution (before any async work).
	 * Used to check whether a new cursor position falls within the edit window when
	 * deciding whether to reuse an in-flight request.
	 */
	public requestEditWindow: RequestEditWindow | RequestEditWindowWithCursorJump | undefined;

	private readonly _result: DeferredPromise<StatelessNextEditResult> = new DeferredPromise<StatelessNextEditResult>();
	public get result(): Promise<StatelessNextEditResult> {
		return this._result.p;
	}

	constructor(
		public readonly headerRequestId: string,
		public readonly opportunityId: string,
		/** this's the active document current contents (not sure "before" which edits this's named after -- maybe NES edits) */
		public readonly documentBeforeEdits: StringText,
		public readonly documents: readonly StatelessNextEditDocument[],
		public readonly activeDocumentIdx: number,
		public readonly xtabEditHistory: readonly IXtabHistoryEntry[],
		public readonly firstEdit: DeferredPromise<Result<TFirstEdit, NoNextEditReason>>,
		public readonly expandedEditWindowNLines: number | undefined,
		public readonly isSpeculative: boolean,
		public readonly logContext: InlineEditRequestLogContext,
		public readonly recordingBookmark: DebugRecorderBookmark | undefined,
		public readonly recording: LogEntry[] | undefined,
		public readonly providerRequestStartDateTime: number | undefined,
	) {
		assert(documents.length > 0);
		assert(activeDocumentIdx >= 0 && activeDocumentIdx < documents.length);
	}

	public setResult(nextEditResult: StatelessNextEditResult) {
		this._result.complete(nextEditResult);
	}

	public setResultError(err: any) {
		this._result.error(err);
	}

	public hasDocument(docId: DocumentId): boolean {
		return this.documents.find(d => d.id === docId) !== undefined;
	}

	getActiveDocument(): StatelessNextEditDocument {
		return this.documents[this.activeDocumentIdx];
	}

	serialize(): ISerializedNextEditRequest {
		return {
			id: this.headerRequestId,
			documents: this.documents.map(d => d.serialize()),
			activeDocumentIdx: this.activeDocumentIdx,
			recording: this.recording,
		};
	}

	toString(): string {
		return this.toMarkdown();
	}

	toMarkdown(): string {
		const docs = this.documents.map((d, idx) => ` * [${idx + 1}/${this.documents.length}] ${idx === this.activeDocumentIdx ? '(active document) ' : ''}` + d.toMarkdown()).join('\n\n');
		return `### StatelessNextEditRequest\n\n${docs}`;
	}
}

export interface ISerializedNextEditRequest {
	id: string;
	documents: ISerializedNextEditDocument[];
	activeDocumentIdx: number;
	recording: LogEntry[] | undefined;
}

export class StatelessNextEditDocument {
	public readonly documentAfterEdits = new StringText(this.recentEdits.apply(this.documentBeforeEdits.value));
	public readonly documentAfterEditsLines: string[] = this.documentAfterEdits.getLines();

	/**
	 * NOTE: if you add new public fields to this class, please also update {@link ISerializedNextEditDocument} and {@link serialize()} methods,
	 * which are used to send this to http-server-powered NES provider.
	 */
	constructor(
		public readonly id: DocumentId,
		public readonly workspaceRoot: URI | undefined,
		public readonly languageId: LanguageId,
		public readonly documentLinesBeforeEdit: string[],
		public readonly recentEdit: LineEdit,
		public readonly documentBeforeEdits: StringText,
		public readonly recentEdits: Edits,
		public readonly lastSelectionInAfterEdit: OffsetRange | undefined = undefined,
	) { }

	serialize(): ISerializedNextEditDocument {
		return {
			id: this.id.uri,
			workspaceRoot: this.workspaceRoot?.toString(),
			languageId: this.languageId,
			documentLinesBeforeEdit: this.documentLinesBeforeEdit,
			recentEdit: this.recentEdit.serialize(),
			documentBeforeEdits: this.documentBeforeEdits.value,
			recentEdits: this.recentEdits.serialize(),
			lastSelectionInAfterEdit: this.lastSelectionInAfterEdit === undefined ? undefined : serializeOffsetRange(this.lastSelectionInAfterEdit),
		};
	}

	toString(): string {
		return this.toMarkdown();
	}

	toMarkdown(): string {
		const lines: string[] = [];

		lines.push(`StatelessNextEditDocument: **${this.id.uri}**\n`);
		lines.push('```patch');
		lines.push(this.recentEdit.humanReadablePatch(this.documentLinesBeforeEdit));
		lines.push('```');
		lines.push('');

		return lines.join('\n');
	}
}

export interface ISerializedNextEditDocument {
	id: string;
	workspaceRoot: string | undefined;
	languageId: string;
	documentLinesBeforeEdit: string[];
	recentEdit: SerializedLineEdit;
	documentBeforeEdits: string;
	recentEdits: SerializedEdit[];
	lastSelectionInAfterEdit: ISerializedOffsetRange | undefined;
}

export enum FilteredOutReason {
	LowLogProbSuggestions = 'lowLogProbSuggestions',
	EnforcingNextEditOptions = 'enforcingNextEditOptions',
	PromptTooLarge = 'promptTooLarge',
	Uncategorized = 'uncategorized',
}

export namespace NoNextEditReason {
	abstract class NoNextEditReason {
		abstract toString(): string;
	}
	export class ActiveDocumentHasNoEdits extends NoNextEditReason {
		public readonly kind = 'activeDocumentHasNoEdits';

		toString(): string {
			return this.kind;
		}
	}
	export class NoSuggestions extends NoNextEditReason {
		public readonly kind = 'noSuggestions';

		constructor(
			public readonly documentBeforeEdits: StringText,
			public readonly window: OffsetRange | undefined,
			public readonly nextCursorPosition?: Position | undefined,
			public readonly nextCursorDocumentId?: DocumentId | undefined,
		) {
			super();
		}

		toString(): string {
			return this.kind;
		}
	}
	export class GotCancelled extends NoNextEditReason {
		public readonly kind = 'gotCancelled';
		constructor(public readonly message: string | 'afterDebounce' | 'afterGettingEndpoint' | 'afterLanguageContextAwait' | 'afterPromptConstruction' | 'afterFetchCall' | 'duringStreaming' | 'afterResponse' | 'afterFailedRebase' | 'beforeExecutingNewRequest' | 'afterArtificialDelay' | 'afterNextCursorPredictionFetch') {
			super();
		}

		toString(): string {
			return `${this.kind}:${this.message}`;
		}
	}
	export class FetchFailure extends NoNextEditReason {
		public readonly kind = 'fetchFailure';
		constructor(public readonly error: Error) {
			super();
		}
		toString(): string {
			return `${this.kind}:${this.error.message}`;
		}
	}
	export class FilteredOut extends NoNextEditReason {
		public readonly kind = 'filteredOut';
		constructor(public readonly message: FilteredOutReason | string) {
			super();
		}
		toString(): string {
			return `${this.kind}:${this.message}`;
		}
	}
	export class PromptTooLarge extends NoNextEditReason {
		public readonly kind = 'promptTooLarge';
		constructor(public readonly message: 'editWindow' | 'currentFile' | 'final') {
			super();
		}
		toString(): string {
			return `${this.kind}:${this.message}`;
		}
	}
	export class Uncategorized extends NoNextEditReason {
		public readonly kind = 'uncategorized';
		constructor(public readonly error: Error) {
			super();
		}
		toString(): string {
			return `${this.kind}:${this.error.message}`;
		}
	}
	export class Unexpected extends NoNextEditReason {
		public readonly kind = 'unexpected';
		constructor(public readonly error: Error) {
			super();
		}
		toString(): string {
			return `${this.kind}:${this.error.message}`;
		}
	}
}

export type NoNextEditReason =
	| NoNextEditReason.ActiveDocumentHasNoEdits
	| NoNextEditReason.NoSuggestions
	| NoNextEditReason.GotCancelled
	| NoNextEditReason.FetchFailure
	| NoNextEditReason.FilteredOut
	| NoNextEditReason.PromptTooLarge
	| NoNextEditReason.Uncategorized
	| NoNextEditReason.Unexpected
	;

export class StatelessNextEditResult {
	public static noEdit(reason: NoNextEditReason, telemetryBuilder: StatelessNextEditTelemetryBuilder): StatelessNextEditResult {
		const result = Result.error(reason);
		const telemetry = telemetryBuilder.build(result);
		return new StatelessNextEditResult(result, telemetry);
	}

	public static streaming(telemetryBuilder: StatelessNextEditTelemetryBuilder): StatelessNextEditResult {
		const result = Result.ok<void>(undefined);
		const telemetry = telemetryBuilder.build(result);
		return new StatelessNextEditResult(result, telemetry);
	}

	constructor(
		public readonly nextEdit: Result<void, NoNextEditReason>,
		public readonly telemetry: IStatelessNextEditTelemetry,
	) {
	}
}

export interface IStatelessNextEditTelemetry {

	readonly hadStatelessNextEditProviderCall: boolean;

	/* general info */
	readonly statelessNextEditProviderDuration: number;
	readonly isCursorAtEndOfLine: boolean | undefined;
	readonly isInlineSuggestion: boolean | undefined;
	readonly nLinesOfCurrentFileInPrompt: number | undefined;
	readonly modelName: string | undefined;

	/* options info */
	readonly logProbThreshold: number | undefined;

	/* prompt info */

	readonly prompt: string | undefined;
	readonly promptLineCount: number | undefined;
	readonly promptCharCount: number | undefined;
	readonly mergeConflictExpanded: 'normal' | 'only' | undefined;

	/* fetch request info */

	readonly debounceTime: number | undefined;
	/** This's only used to compute time from inline edit provider call to fetch init. Not included in telemetry. */
	readonly fetchStartedAt: number | undefined;

	/* response info */

	/** Artificial delay (aka backoff) on the response based on previous user acceptance/rejection in milliseconds */
	readonly artificialDelay: number | undefined;

	readonly hadLowLogProbSuggestion: boolean | undefined;
	readonly response: undefined | Promise<FetchResultWithStats>;

	/* suggestions info */

	readonly nEditsSuggested: number | undefined;
	readonly lineDistanceToMostRecentEdit: number | undefined;

	/* result info */
	readonly nextEditLogprob: number | undefined;
	readonly noNextEditReasonKind: string | undefined;
	readonly noNextEditReasonMessage: string | undefined;

	/* next cursor line info */
	readonly nextCursorPrediction: {
		nextCursorLineError: string | undefined;
		/** nextCursorLineNumber - currentCursorLineNumber */
		nextCursorLineDistance: number | undefined;
		isCrossFile: boolean | undefined;
	};

	/* xtab aggressiveness telemetry (only set when promptingStrategy is aggressiveness-based) */
	readonly xtabAggressivenessLevel: string | undefined;
	readonly xtabUserHappinessScore: number | undefined;

	/** The raw user-facing aggressiveness setting value (only set when user changed from default) */
	readonly userAggressivenessSetting: string | undefined;

	/* edit intent telemetry (only set when promptingStrategy is Xtab275EditIntent or Xtab275EditIntentShort) */
	readonly editIntent: string | undefined;
	readonly editIntentParseError: string | undefined;

	/* cursor jump info */
	readonly cursorJumpModelName: string | undefined;
	readonly cursorJumpPrompt: string | undefined;
	readonly cursorJumpResponse: string | undefined;

	/* diff history info */
	readonly nDiffsInPrompt: number | undefined;
	readonly diffTokensInPrompt: number | undefined;

	/* neighbor (similar files) snippets info */
	readonly nNeighborSnippetsComputed: number | undefined;
	readonly nNeighborSnippetsInPrompt: number | undefined;
	/** JSON-encoded array of original input indices of snippets included in the prompt. */
	readonly neighborSnippetIndicesInPrompt: string | undefined;

	/* lint errors info */
	readonly lintErrors: string | undefined;

	/* terminal output info */
	readonly terminalOutput: string | undefined;

	/* similar files context for telemetry (GhostText-style neighbor code snippets) */
	readonly similarFilesContext: Promise<string | undefined> | undefined;

	/* JSON-encoded model configuration from the model service */
	readonly modelConfig: string | undefined;
}

export type FetchResultWithStats = {
	readonly ttft: number | undefined;
	readonly response: FetchResponse<string>;
	readonly fetchTime: number;
	readonly fetchResult: ChatFetchResponseType;
};

export class StatelessNextEditTelemetryBuilder {

	public readonly startTime: number;
	public readonly requestUuid: string;

	/**
	 * It takes a request to automatically capture some properties from the request.
	 */
	constructor(headerRequestId: string) {
		this.startTime = Date.now();
		this.requestUuid = headerRequestId;
	}

	public build(result: Result<void, NoNextEditReason>): IStatelessNextEditTelemetry {
		const endTime = Date.now();
		const timeSpent = endTime - this.startTime;

		const prompt = this._prompt ? JSON.stringify(this._prompt.map(({ role, content }) => ({ role, content }))) : undefined;
		const promptText = this._prompt ? stringifyChatMessages(this._prompt) : undefined;
		const promptLineCount = promptText?.split('\n').length;
		const promptCharCount = promptText?.length;

		const noNextEditReasonKind = result.isOk() ? undefined : result.err.kind;

		let noNextEditReasonMessage: string | undefined;
		if (result.isError()) {
			if (result.err instanceof NoNextEditReason.ActiveDocumentHasNoEdits || result.err instanceof NoNextEditReason.NoSuggestions) {
				// ignore
			} else if (result.err instanceof NoNextEditReason.GotCancelled || result.err instanceof NoNextEditReason.FilteredOut || result.err instanceof NoNextEditReason.PromptTooLarge) {
				noNextEditReasonMessage = result.err.message;
			} else if (result.err instanceof NoNextEditReason.FetchFailure || result.err instanceof NoNextEditReason.Uncategorized || result.err instanceof NoNextEditReason.Unexpected) {
				noNextEditReasonMessage = result.err.error.stack ? result.err.error.stack : result.err.error.message;
			} else {
				assertNever(result.err);
			}
		}

		return {
			hadStatelessNextEditProviderCall: true,

			noNextEditReasonKind,
			noNextEditReasonMessage,

			statelessNextEditProviderDuration: timeSpent,
			logProbThreshold: this._logProbThreshold,
			mergeConflictExpanded: this._mergeConflictExpanded,
			nLinesOfCurrentFileInPrompt: this._nLinesOfCurrentFileInPrompt,
			modelName: this._modelName,
			prompt,
			promptLineCount,
			promptCharCount,
			isCursorAtEndOfLine: this._isCursorAtLineEnd,
			isInlineSuggestion: this._isInlineSuggestion,
			debounceTime: this._debounceTime,
			artificialDelay: this._artificialDelay,
			fetchStartedAt: this._fetchStartedAt,
			hadLowLogProbSuggestion: this._hadLowLogProbSuggestion,
			response: this._response,
			nEditsSuggested: this._nEditsSuggested,
			nextEditLogprob: this._nextEditLogProb,
			nextCursorPrediction: this._nextCursorPrediction,
			lineDistanceToMostRecentEdit: this._lineDistanceToMostRecentEdit,
			xtabAggressivenessLevel: this._xtabAggressivenessLevel,
			xtabUserHappinessScore: this._xtabUserHappinessScore,
			userAggressivenessSetting: this._userAggressivenessSetting,
			editIntent: this._editIntent,
			editIntentParseError: this._editIntentParseError,
			cursorJumpModelName: this._cursorJumpModelName,
			cursorJumpPrompt: this._cursorJumpPrompt ? JSON.stringify(this._cursorJumpPrompt.map(({ role, content }) => ({ role, content }))) : undefined,
			cursorJumpResponse: this._cursorJumpResponse,
			nDiffsInPrompt: this._nDiffsInPrompt,
			diffTokensInPrompt: this._diffTokensInPrompt,
			nNeighborSnippetsComputed: this._nNeighborSnippetsComputed,
			nNeighborSnippetsInPrompt: this._nNeighborSnippetsInPrompt,
			neighborSnippetIndicesInPrompt: this._neighborSnippetIndicesInPrompt,
			lintErrors: this._lintErrors,
			terminalOutput: this._terminalOutput,
			similarFilesContext: this._similarFilesContext,
			modelConfig: this._modelConfig,
		};
	}

	private _logProbThreshold: number | undefined;
	public setLogProbThreshold(logProbThreshold: number): this {
		this._logProbThreshold = logProbThreshold;
		return this;
	}

	private _mergeConflictExpanded: 'normal' | 'only' | undefined;
	public setMergeConflictExpanded(mergeConflictExpanded: 'normal' | 'only'): this {
		this._mergeConflictExpanded = mergeConflictExpanded;
		return this;
	}

	private _hadLowLogProbSuggestion: boolean | undefined;
	public setHadLowLogProbSuggestion(hadLowLogProbSuggestions: boolean): this {
		this._hadLowLogProbSuggestion = hadLowLogProbSuggestions;
		return this;
	}

	private _nLinesOfCurrentFileInPrompt: number | undefined;
	public setNLinesOfCurrentFileInPrompt(nLines: number): this {
		this._nLinesOfCurrentFileInPrompt = nLines;
		return this;
	}

	private _modelName: string | undefined;
	public setModelName(modelName: string): this {
		this._modelName = modelName;
		return this;
	}

	private _prompt: Raw.ChatMessage[] | undefined;
	public setPrompt(prompt: Raw.ChatMessage[]): this {
		this._prompt = prompt;
		return this;
	}

	private _isCursorAtLineEnd: boolean | undefined;
	public setIsCursorAtLineEnd(isCursorAtLineEnd: boolean): this {
		this._isCursorAtLineEnd = isCursorAtLineEnd;
		return this;
	}

	private _isInlineSuggestion: boolean | undefined;
	public setIsInlineSuggestion(isInlineSuggestion: boolean): this {
		this._isInlineSuggestion = isInlineSuggestion;
		return this;
	}

	private _debounceTime: number | undefined;
	public setDebounceTime(debounceTime: number): this {
		this._debounceTime = debounceTime;
		return this;
	}

	private _artificialDelay: number | undefined;
	public setArtificialDelay(artificialDelay: number): this {
		this._artificialDelay = artificialDelay;
		return this;
	}

	private _fetchStartedAt: number | undefined;
	public setFetchStartedAt(): this {
		this._fetchStartedAt = Date.now();
		return this;
	}
	public get fetchStartedAt(): number | undefined {
		return this._fetchStartedAt;
	}

	private _response: Promise<FetchResultWithStats> | undefined;
	public setResponse(response: Promise<{ ttft: number | undefined; response: FetchResponse<string> }>): this {
		this._response = response.then(({ response, ttft }) => {

			const fetchTime = Date.now() - this._fetchStartedAt!;

			const fetchResult = response.type;

			return {
				ttft,
				response,
				fetchTime,
				fetchResult,
			};
		});

		return this;
	}

	private _cursorJumpModelName: string | undefined;
	public setCursorJumpModelName(modelName: string | undefined): this {
		this._cursorJumpModelName = modelName;
		return this;
	}

	private _cursorJumpPrompt: Raw.ChatMessage[] | undefined;
	public setCursorJumpPrompt(prompt: Raw.ChatMessage[] | undefined): this {
		this._cursorJumpPrompt = prompt;
		return this;
	}

	private _cursorJumpResponse: string | undefined;
	public setCursorJumpResponse(response: string | undefined): this {
		this._cursorJumpResponse = response;
		return this;
	}

	private _nextEditLogProb: number | undefined;
	public setNextEditLogProb(logProb: number): this {
		this._nextEditLogProb = logProb;
		return this;
	}

	private _nEditsSuggested: number | undefined;
	public setNEditsSuggested(nEditsSuggested: number): this {
		this._nEditsSuggested = nEditsSuggested;
		return this;
	}

	private _lineDistanceToMostRecentEdit: number | undefined;
	public setLineDistanceToMostRecentEdit(distanceToMostRecentEdit: number): this {
		this._lineDistanceToMostRecentEdit = distanceToMostRecentEdit;
		return this;
	}

	private _nextCursorPrediction: IStatelessNextEditTelemetry['nextCursorPrediction'] = {
		nextCursorLineError: undefined,
		nextCursorLineDistance: undefined,
		isCrossFile: undefined
	};

	public setNextCursorLineError(error: string): this {
		this._nextCursorPrediction.nextCursorLineError = error;
		return this;
	}

	/**
	 * nextCursorLineNumber - currentCursorLineNumber
	 */
	public setNextCursorLineDistance(distance: number): this {
		this._nextCursorPrediction.nextCursorLineDistance = distance;
		return this;
	}

	public setNextCursorIsCrossFile(isCrossFile: boolean): this {
		this._nextCursorPrediction.isCrossFile = isCrossFile;
		return this;
	}

	private _xtabAggressivenessLevel: string | undefined;
	public setXtabAggressivenessLevel(level: string): this {
		this._xtabAggressivenessLevel = level;
		return this;
	}

	private _xtabUserHappinessScore: number | undefined;
	public setXtabUserHappinessScore(score: number): this {
		this._xtabUserHappinessScore = score;
		return this;
	}

	private _userAggressivenessSetting: string | undefined;
	public setUserAggressivenessSetting(setting: string): this {
		this._userAggressivenessSetting = setting;
		return this;
	}

	private _editIntent: string | undefined;
	public setEditIntent(editIntent: string): this {
		this._editIntent = editIntent;
		return this;
	}

	private _editIntentParseError: string | undefined;
	public setEditIntentParseError(error: string): this {
		this._editIntentParseError = error;
		return this;
	}

	private _nDiffsInPrompt: number | undefined;
	public setNDiffsInPrompt(n: number): this {
		this._nDiffsInPrompt = n;
		return this;
	}

	private _diffTokensInPrompt: number | undefined;
	public setDiffTokensInPrompt(n: number): this {
		this._diffTokensInPrompt = n;
		return this;
	}

	private _nNeighborSnippetsComputed: number | undefined;
	public setNNeighborSnippetsComputed(n: number): this {
		this._nNeighborSnippetsComputed = n;
		return this;
	}

	private _nNeighborSnippetsInPrompt: number | undefined;
	public setNNeighborSnippetsInPrompt(n: number): this {
		this._nNeighborSnippetsInPrompt = n;
		return this;
	}

	private _neighborSnippetIndicesInPrompt: string | undefined;
	public setNeighborSnippetIndicesInPrompt(indices: readonly number[]): this {
		this._neighborSnippetIndicesInPrompt = JSON.stringify(indices);
		return this;
	}

	private _lintErrors: string | undefined;
	public setLintErrors(lintErrors: string): this {
		this._lintErrors = lintErrors;
		return this;
	}

	private _terminalOutput: string | undefined;
	public setTerminalOutput(terminalOutput: string): this {
		this._terminalOutput = terminalOutput;
		return this;
	}

	private _similarFilesContext: Promise<string | undefined> | undefined;
	public setSimilarFilesContext(similarFilesContext: Promise<string | undefined>): this {
		this._similarFilesContext = similarFilesContext;
		return this;
	}

	private _modelConfig: string | undefined;
	public setModelConfig(modelConfig: string): this {
		this._modelConfig = modelConfig;
		return this;
	}
}
