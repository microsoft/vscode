/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'path';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { Edits, RootedEdit } from '../../../platform/inlineEdits/common/dataTypes/edit';
import { RootedLineEdit } from '../../../platform/inlineEdits/common/dataTypes/rootedLineEdit';
import { SpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsCursorPlacement, SpeculativeRequestsEnablement } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { InlineEditRequestLogContext, type MarkdownLoggable } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { IObservableDocument, ObservableWorkspace } from '../../../platform/inlineEdits/common/observableWorkspace';
import { IStatelessNextEditProvider, IStatelessNextEditTelemetry, NoNextEditReason, StatelessNextEditDocument, StatelessNextEditRequest, StatelessNextEditResult } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { autorunWithChanges } from '../../../platform/inlineEdits/common/utils/observable';
import { DocumentHistory, HistoryContext, IHistoryContextProvider } from '../../../platform/inlineEdits/common/workspaceEditTracker/historyContextProvider';
import { IXtabHistoryEditEntry, IXtabHistoryEntry, NesXtabHistoryTracker } from '../../../platform/inlineEdits/common/workspaceEditTracker/nesXtabHistoryTracker';
import { ILogger, ILogService, LogTarget } from '../../../platform/log/common/logService';
import { CapturingToken } from '../../../platform/requestLogger/common/capturingToken';
import { IRequestLogger, LoggedRequestKind } from '../../../platform/requestLogger/common/requestLogger';
import { ISnippyService } from '../../../platform/snippy/common/snippyService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { ErrorUtils } from '../../../util/common/errors';
import { Result } from '../../../util/common/result';
import { assert, assertNever } from '../../../util/vs/base/common/assert';
import { DeferredPromise, timeout, TimeoutTimer } from '../../../util/vs/base/common/async';
import { CachedFunction } from '../../../util/vs/base/common/cache';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../util/vs/base/common/lifecycle';
import { mapObservableArrayCached, runOnChange } from '../../../util/vs/base/common/observable';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { assertType } from '../../../util/vs/base/common/types';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { LineEdit, LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit, StringReplacement } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../util/vs/editor/common/core/position';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { checkEditConsistency } from '../common/editRebase';
import { NesChangeHint } from '../common/nesTriggerHint';
import { RejectionCollector } from '../common/rejectionCollector';
import { DebugRecorder } from './debugRecorder';
import { INesConfigs } from './nesConfigs';
import { CachedOrRebasedEdit, NextEditCache } from './nextEditCache';
import { LlmNESTelemetryBuilder, ReusedRequestKind } from './nextEditProviderTelemetry';
import { INextEditResult, NextEditResult } from './nextEditResult';

/**
 * Computes a reduced window range that encompasses both the original window (shrunk by one line
 * on each end) and the full line where the cursor is located.
 *
 * This ensures the cache invalidation window always includes the cursor's line while trimming
 * the edges of the original window.
 */
function computeReducedWindow(
	window: OffsetRange,
	activeDocSelection: OffsetRange | undefined,
	documentBeforeEdits: StringText
): OffsetRange {
	if (!activeDocSelection) {
		return window;
	}
	const cursorOffset = activeDocSelection.endExclusive;
	const t = documentBeforeEdits.getTransformer();
	const cursorPosition = t.getPosition(cursorOffset);
	const lineOffset = t.getOffset(cursorPosition.with(undefined, 1));
	const lineEndOffset = t.getOffset(cursorPosition.with(undefined, t.getLineLength(cursorPosition.lineNumber) + 1));
	const reducedOffset = t.getOffset(t.getPosition(window.start).delta(1));
	const reducedEndPosition = t.getPosition(window.endExclusive).delta(-2);
	const reducedEndOffset = t.getOffset(reducedEndPosition.column > 1 ? reducedEndPosition.with(undefined, t.getLineLength(reducedEndPosition.lineNumber) + 1) : reducedEndPosition);
	return new OffsetRange(
		Math.min(reducedOffset, lineOffset),
		Math.max(reducedEndOffset, lineEndOffset)
	);
}

function convertLineEditToEdit(nextLineEdit: LineEdit, document: StringText): StringEdit {
	const rootedLineEdit = new RootedLineEdit(document, nextLineEdit);
	const suggestedEdit = rootedLineEdit.toEdit();
	// LineReplacement.toSingleTextEdit always joins newLines with '\n'.
	// If the document uses '\r\n' line endings, we need to match that in
	// the replacement text so that applying the edit produces consistent
	// line endings and the resulting content matches what VS Code reports.
	if (document.value.includes('\r\n')) {
		return new StringEdit(suggestedEdit.replacements.map(
			r => new StringReplacement(r.replaceRange, r.newText.replace(/\n/g, '\r\n'))
		));
	}
	return suggestedEdit;
}

function createDocStateLookupMap(projectedDocuments: readonly ProcessedDoc[], xtabEditHistory: readonly IXtabHistoryEntry[]): CachedFunction<DocumentId, {
	baseDocState: StringText;
	docContents: StringText;
	editsSoFar: StringEdit;
	nextEdits: StringReplacement[];
	docId: DocumentId;
}> {
	const statePerDoc = new CachedFunction((id: DocumentId) => {
		const doc = projectedDocuments.find(d => d.nextEditDoc.id === id);
		if (!doc) {
			for (let i = xtabEditHistory.length - 1; i >= 0; i--) {
				const entry = xtabEditHistory[i];
				if (entry.docId === id && entry.kind === 'edit') {
					const baseDocState = entry.edit.getEditedState();
					return {
						baseDocState,
						docContents: baseDocState,
						editsSoFar: StringEdit.empty,
						nextEdits: [] as StringReplacement[],
						docId: id,
					};
				}
			}
			throw new BugIndicatingError();
		}
		return {
			baseDocState: doc.documentAfterEdits,
			docContents: doc.documentAfterEdits,
			editsSoFar: StringEdit.empty,
			nextEdits: [] as StringReplacement[],
			docId: id,
		};
	});


	return statePerDoc;
}

export interface NESInlineCompletionContext extends vscode.InlineCompletionContext {
	enforceCacheDelay: boolean;
	changeHint?: NesChangeHint;
}

export enum NesOutcome {
	Accepted = 'accepted',
	Rejected = 'rejected',
	Ignored = 'ignored',
}

export interface INextEditProvider<T extends INextEditResult, TTelemetry, TData = void> extends IDisposable {
	readonly ID: string;
	getNextEdit(docId: DocumentId, context: NESInlineCompletionContext, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken, telemetryBuilder: TTelemetry, data?: TData): Promise<T>;
	handleShown(suggestion: T): void;
	handleAcceptance(docId: DocumentId, suggestion: T): void;
	handleRejection(docId: DocumentId, suggestion: T): void;
	handleIgnored(docId: DocumentId, suggestion: T, supersededBy: INextEditResult | undefined): void;
	lastRejectionTime: number;
	lastTriggerTime: number;
	lastOutcome: NesOutcome | undefined;
}

interface ProcessedDoc {
	recentEdit: RootedEdit<StringEdit>;
	nextEditDoc: StatelessNextEditDocument;
	documentAfterEdits: StringText;
}

export class NextEditProvider extends Disposable implements INextEditProvider<NextEditResult, LlmNESTelemetryBuilder> {

	public readonly ID = this._statelessNextEditProvider.ID;

	private readonly _rejectionCollector = this._register(new RejectionCollector(this._workspace, this._logService));
	private readonly _nextEditCache: NextEditCache;

	private _pendingStatelessNextEditRequest: StatelessNextEditRequest<CachedOrRebasedEdit> | null = null;

	/**
	 * Tracks a speculative request for the post-edit document state.
	 * When a suggestion is shown, we speculatively fetch the next edit as if the user had already accepted.
	 * This allows reusing the in-flight request when the user actually accepts the suggestion.
	 */
	private _speculativePendingRequest: {
		request: StatelessNextEditRequest<CachedOrRebasedEdit>;
		docId: DocumentId;
		postEditContent: string;
	} | null = null;

	/**
	 * A speculative request that is deferred until the originating stream completes.
	 * When a suggestion is shown while its stream is still running, we schedule the
	 * speculative request here instead of firing immediately. If more edits arrive
	 * from the stream, the schedule is cleared (the shown edit wasn't the last one).
	 * When the stream ends, if the schedule is still present, the speculative fires.
	 */
	private _scheduledSpeculativeRequest: {
		suggestion: NextEditResult;
		headerRequestId: string;
	} | null = null;

	private _lastShownTime = 0;
	/** The requestId of the last shown suggestion. We store only the requestId (not the object) to avoid preventing garbage collection. */
	private _lastShownSuggestionId: number | undefined = undefined;

	private _lastRejectionTime = 0;
	public get lastRejectionTime() {
		return this._lastRejectionTime;
	}

	private _lastTriggerTime = 0;
	public get lastTriggerTime() {
		return this._lastTriggerTime;
	}

	private _lastOutcome: NesOutcome | undefined;
	public get lastOutcome() {
		return this._lastOutcome;
	}

	private _lastNextEditResult: NextEditResult | undefined;
	private _shouldExpandEditWindow = false;

	private _logger: ILogger;

	constructor(
		private readonly _workspace: ObservableWorkspace,
		private readonly _statelessNextEditProvider: IStatelessNextEditProvider,
		private readonly _historyContextProvider: IHistoryContextProvider,
		private readonly _xtabHistoryTracker: NesXtabHistoryTracker,
		private readonly _debugRecorder: DebugRecorder | undefined,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@ISnippyService private readonly _snippyService: ISnippyService,
		@ILogService private readonly _logService: ILogService,
		@IExperimentationService private readonly _expService: IExperimentationService,
		@IRequestLogger private readonly _requestLogger: IRequestLogger,
	) {
		super();

		this._logger = this._logService.createSubLogger(['NES', 'NextEditProvider']);
		this._nextEditCache = new NextEditCache(this._workspace, this._logService, this._configService, this._expService);

		mapObservableArrayCached(this, this._workspace.openDocuments, (doc, store) => {
			store.add(runOnChange(doc.value, (value) => {
				this._cancelPendingRequestDueToDocChange(doc.id, value);
			}));
		}).recomputeInitiallyAndOnChange(this._store);
	}

	private _cancelSpeculativeRequest(): void {
		this._scheduledSpeculativeRequest = null;
		if (this._speculativePendingRequest) {
			this._speculativePendingRequest.request.cancellationTokenSource.cancel();
			this._speculativePendingRequest = null;
		}
	}

	private _cancelPendingRequestDueToDocChange(docId: DocumentId, docValue: StringText) {
		// Note: we intentionally do NOT cancel the speculative request here.
		// The speculative request's postEditContent represents a *future* document state
		// (after the user would accept the suggestion), so it will almost never match the
		// current document value while the user is still typing. Cancelling here would
		// wastefully kill and recreate the speculative request on every keystroke.
		// Instead, speculative requests are cancelled by the appropriate lifecycle handlers:
		// handleRejection, handleIgnored, _triggerSpeculativeRequest, and _executeNewNextEditRequest.

		const isAsyncCompletions = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAsyncCompletions, this._expService);
		if (isAsyncCompletions || this._pendingStatelessNextEditRequest === null) {
			return;
		}
		const activeDoc = this._pendingStatelessNextEditRequest.getActiveDocument();
		if (activeDoc.id === docId && activeDoc.documentAfterEdits.value !== docValue.value) {
			this._pendingStatelessNextEditRequest.cancellationTokenSource.cancel();
		}
	}

	public async getNextEdit(
		docId: DocumentId,
		context: NESInlineCompletionContext,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		telemetryBuilder: LlmNESTelemetryBuilder
	): Promise<NextEditResult> {
		const now = Date.now();

		this._lastTriggerTime = now;

		const sw = new StopWatch();

		const logger = this._logger.createSubLogger(context.requestUuid.substring(4, 8))
			.withExtraTarget(LogTarget.fromCallback((_level, msg) => {
				logContext.trace(`[${Math.floor(sw.elapsed()).toString().padStart(4, ' ')}ms] ${msg}`);
			}));

		const shouldExpandEditWindow = this._shouldExpandEditWindow;

		logContext.setStatelessNextEditProviderId(this._statelessNextEditProvider.ID);

		let result: NextEditResult;
		try {
			result = await this._getNextEditCanThrow(docId, context, now, shouldExpandEditWindow, logger, logContext, cancellationToken, telemetryBuilder);
		} catch (error) {
			logContext.setError(error);
			telemetryBuilder.setNextEditProviderError(ErrorUtils.toString(error));
			throw error;
		} finally {
			telemetryBuilder.markEndTime();
		}

		this._lastNextEditResult = result;

		return result;
	}

	private async _getNextEditCanThrow(
		docId: DocumentId,
		context: NESInlineCompletionContext,
		triggerTime: number,
		shouldExpandEditWindow: boolean,
		parentLogger: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		telemetryBuilder: LlmNESTelemetryBuilder
	): Promise<NextEditResult> {

		const logger = parentLogger.createSubLogger('_getNextEdit');
		logger.trace(`invoked with trigger id = ${context.changeHint === undefined ? 'undefined' : `uuid = ${context.changeHint.data.uuid}, reason = ${context.changeHint.data.reason}`}`);

		const doc = this._workspace.getDocument(docId);
		if (!doc) {
			logger.trace(`Document "${docId.baseName}" not found`);
			throw new BugIndicatingError(`Document "${docId.baseName}" not found`);
		}

		const documentAtInvocationTime = doc.value.get();
		const selections = doc.selection.get();

		const nesConfigs = this.determineNesConfigs(telemetryBuilder, logContext);

		const cachedEdit = this._nextEditCache.lookupNextEdit(docId, documentAtInvocationTime, selections);
		if (cachedEdit?.rejected) {
			logger.trace('cached edit was previously rejected');
			telemetryBuilder.setStatus('previouslyRejectedCache');
			telemetryBuilder.setWasPreviouslyRejected();
			logContext.markAsPreviouslyRejected();
			const rejectedEdit = cachedEdit.rebasedEdit ?? cachedEdit.edit;
			if (rejectedEdit) {
				this._rejectionCollector.reject(docId, rejectedEdit);
			}
			const nextEditResult = new NextEditResult(logContext.requestId, cachedEdit.source, undefined);
			return nextEditResult;
		}

		let edit: { actualEdit: StringReplacement; isFromCursorJump: boolean } | undefined;
		let currentDocument: StringText | undefined;
		let error: NoNextEditReason | undefined;
		let req: NextEditFetchRequest;
		let targetDocumentId = docId;

		let isRebasedCachedEdit = false;
		let isSubsequentCachedEdit = false;
		let isFromSpeculativeRequest = false;

		if (cachedEdit) {
			logger.trace('using cached edit');
			const actualEdit = cachedEdit.rebasedEdit || cachedEdit.edit;
			if (actualEdit) {
				edit = { actualEdit, isFromCursorJump: cachedEdit.isFromCursorJump };
			}
			isRebasedCachedEdit = !!cachedEdit.rebasedEdit;
			isSubsequentCachedEdit = cachedEdit.subsequentN !== undefined && cachedEdit.subsequentN > 0;
			isFromSpeculativeRequest = cachedEdit.source.isSpeculative;
			req = cachedEdit.source;
			logContext.setIsCachedResult(cachedEdit.source.log);
			currentDocument = documentAtInvocationTime;
			telemetryBuilder.setHeaderRequestId(req.headerRequestId);
			telemetryBuilder.setIsFromCache();
			telemetryBuilder.setSubsequentEditOrder(cachedEdit.rebasedEditIndex ?? cachedEdit.subsequentN);
			// back-date the recording bookmark of the cached edit to the bookmark of the original request.
			logContext.recordingBookmark = req.log.recordingBookmark;

		} else {
			logger.trace(`fetching next edit with shouldExpandEditWindow=${shouldExpandEditWindow}`);
			const providerRequestStartDateTime = (this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsDebounceUseCoreRequestTime, this._expService)
				? (context.requestIssuedDateTime ?? undefined)
				: undefined);
			req = new NextEditFetchRequest(context.requestUuid, logContext, providerRequestStartDateTime, false);
			telemetryBuilder.setHeaderRequestId(req.headerRequestId);

			const startVersion = doc.value.get();
			logger.trace('awaiting firstEdit promise');
			const result = await this.fetchNextEdit(req, doc, nesConfigs, shouldExpandEditWindow, logger, telemetryBuilder, cancellationToken);
			logger.trace('resolved firstEdit promise');
			const latency = `First edit latency: ${Date.now() - this._lastTriggerTime} ms`;
			logContext.addLog(latency);
			logger.trace(latency);

			if (result.isError()) {
				logger.trace(`failed to fetch next edit ${result.err.toString()}`);
				telemetryBuilder.setStatus(`noEdit:${result.err.kind}`);
				error = result.err;
			} else {
				targetDocumentId = result.val.docId ?? targetDocumentId;
				const targetDoc = targetDocumentId ? this._workspace.getDocument(targetDocumentId)! : doc;
				currentDocument = targetDoc.value.get();
				const docDidChange = targetDocumentId === doc.id && startVersion.value !== currentDocument.value;

				if (docDidChange) {
					logger.trace('document changed while fetching next edit');
					telemetryBuilder.setStatus('docChanged');
					logContext.setIsSkipped();
				} else {
					const suggestedNextEdit = result.val.rebasedEdit || result.val.edit;
					if (!suggestedNextEdit) {
						logger.trace('empty edits');
						telemetryBuilder.setStatus('emptyEdits');
					} else {
						logger.trace('fetch succeeded');
						logContext.setResponseResults([suggestedNextEdit]); // TODO: other streamed edits?
						edit = { actualEdit: suggestedNextEdit, isFromCursorJump: result.val.isFromCursorJump };
						isFromSpeculativeRequest = result.val.isFromSpeculativeRequest ?? false;
					}
				}
			}
		}

		if (error instanceof NoNextEditReason.FetchFailure || error instanceof NoNextEditReason.Unexpected) {
			logger.trace(`has throwing error: ${error.error}`);
			throw error.error;
		} else if (error instanceof NoNextEditReason.NoSuggestions) {
			if (error.nextCursorPosition === undefined) {
				logContext.markAsNoSuggestions();
			} else {
				telemetryBuilder.setStatus('emptyEditsButHasNextCursorPosition');
				return new NextEditResult(logContext.requestId, req, { jumpToPosition: error.nextCursorPosition, targetDocumentId: error.nextCursorDocumentId, documentBeforeEdits: documentAtInvocationTime, isFromCursorJump: false, isSubsequentEdit: false });
			}
		} else if (error instanceof NoNextEditReason.GotCancelled) {
			logContext.setIsSkipped();
		}

		const emptyResult = new NextEditResult(logContext.requestId, req, undefined);

		if (!edit) {
			logger.trace('had no edit');
			// telemetry builder status must've been set earlier
			return emptyResult;
		}

		if (cancellationToken.isCancellationRequested) {
			logger.trace('cancelled');
			telemetryBuilder.setStatus(`noEdit:gotCancelled`);
			return emptyResult;
		}

		if (this._rejectionCollector.isRejected(targetDocumentId, edit.actualEdit) || currentDocument && this._nextEditCache.isRejectedNextEdit(targetDocumentId, currentDocument, edit.actualEdit)) {
			logger.trace('edit was previously rejected');
			telemetryBuilder.setStatus('previouslyRejected');
			telemetryBuilder.setWasPreviouslyRejected();
			logContext.markAsPreviouslyRejected();
			return emptyResult;
		}

		logContext.setResult(RootedLineEdit.fromEdit(new RootedEdit(documentAtInvocationTime, new StringEdit([edit.actualEdit]))));

		assert(currentDocument !== undefined, 'should be defined if edit is defined');

		telemetryBuilder.setStatus('notAccepted'); // Acceptance pending.

		const nextEditResult = new NextEditResult(logContext.requestId, req, { edit: edit.actualEdit, isFromCursorJump: edit.isFromCursorJump, documentBeforeEdits: currentDocument, targetDocumentId, isSubsequentEdit: isSubsequentCachedEdit });

		telemetryBuilder.setHasNextEdit(true);

		const delay = this.computeMinimumResponseDelay({ triggerTime, isRebasedCachedEdit, isSubsequentCachedEdit, isFromSpeculativeRequest, enforceCacheDelay: context.enforceCacheDelay }, logger);
		if (delay > 0) {
			await timeout(delay);
			if (cancellationToken.isCancellationRequested) {
				logger.trace('cancelled');
				telemetryBuilder.setStatus(`noEdit:gotCancelled`);
				return emptyResult;
			}
		}

		logger.trace('returning next edit result');
		return nextEditResult;
	}

	private determineNesConfigs(telemetryBuilder: LlmNESTelemetryBuilder, logContext: InlineEditRequestLogContext): INesConfigs {
		const nesConfigs: INesConfigs = {
			isAsyncCompletions: this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAsyncCompletions, this._expService),
			isEagerBackupRequest: this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsEagerBackupRequest, this._expService),
			isCheckEditWindowOnReuse: this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsCheckEditWindowOnReuse, this._expService),
		};

		telemetryBuilder.setNESConfigs({ ...nesConfigs });
		logContext.addCodeblockToLog(JSON.stringify(nesConfigs, null, '\t'));

		return nesConfigs;
	}

	private _processDoc(doc: DocumentHistory): ProcessedDoc {
		const documentLinesBeforeEdit = doc.lastEdit.base.getLines();

		const recentEdits = doc.lastEdits;

		const recentEdit = RootedLineEdit.fromEdit(new RootedEdit(doc.lastEdit.base, doc.lastEdits.compose())).removeCommonSuffixPrefixLines().edit;

		const documentBeforeEdits = doc.lastEdit.base;

		const lastSelectionInAfterEdits = doc.lastSelection;

		const workspaceRoot = this._workspace.getWorkspaceRoot(doc.docId);

		const nextEditDoc = new StatelessNextEditDocument(
			doc.docId,
			workspaceRoot,
			doc.languageId,
			documentLinesBeforeEdit,
			recentEdit,
			documentBeforeEdits,
			recentEdits,
			lastSelectionInAfterEdits,
		);

		return {
			recentEdit: doc.lastEdit,
			nextEditDoc,
			documentAfterEdits: nextEditDoc.documentAfterEdits,
		};
	}

	private async fetchNextEdit(req: NextEditFetchRequest, doc: IObservableDocument, nesConfigs: INesConfigs, shouldExpandEditWindow: boolean, parentLogger: ILogger, telemetryBuilder: LlmNESTelemetryBuilder, cancellationToken: CancellationToken): Promise<Result<CachedOrRebasedEdit, NoNextEditReason>> {
		const curDocId = doc.id;
		const logger = parentLogger.createSubLogger('fetchNextEdit');
		const historyContext = this._historyContextProvider.getHistoryContext(curDocId);

		if (!historyContext) {
			return Result.error(new NoNextEditReason.Unexpected(new Error('DocumentMissingInHistoryContext')));
		}

		const documentAtInvocationTime = doc.value.get();
		const selectionAtInvocationTime = doc.selection.get();

		const logContext = req.log;

		logContext.setRecentEdit(historyContext);

		const cursorAtInvocationTime = selectionAtInvocationTime.at(0);
		const cursorInRequestEditWindow = (request: StatelessNextEditRequest) =>
			!nesConfigs.isCheckEditWindowOnReuse || !request.requestEditWindow || !cursorAtInvocationTime || request.requestEditWindow.containsCursor(cursorAtInvocationTime);

		// Check if we can reuse the regular pending request
		const pendingRequestStillCurrent = documentAtInvocationTime.value === this._pendingStatelessNextEditRequest?.documentBeforeEdits.value;
		const cursorWithinPendingEditWindow = !this._pendingStatelessNextEditRequest || cursorInRequestEditWindow(this._pendingStatelessNextEditRequest);
		const existingNextEditRequest = (pendingRequestStillCurrent || nesConfigs.isAsyncCompletions) && cursorWithinPendingEditWindow
			&& !this._pendingStatelessNextEditRequest?.cancellationTokenSource.token.isCancellationRequested
			&& this._pendingStatelessNextEditRequest || undefined;

		// Check if we can reuse the speculative pending request (from when a suggestion was shown)
		const speculativeRequestMatches = this._speculativePendingRequest?.docId === curDocId
			&& this._speculativePendingRequest?.postEditContent === documentAtInvocationTime.value
			&& !this._speculativePendingRequest.request.cancellationTokenSource.token.isCancellationRequested
			&& cursorInRequestEditWindow(this._speculativePendingRequest.request);
		const speculativeRequest = speculativeRequestMatches ? this._speculativePendingRequest?.request : undefined;

		// Prefer speculative request if it matches (it was specifically created for this post-edit state)
		const requestToReuse = speculativeRequest ?? existingNextEditRequest;

		if (requestToReuse) {
			// Nice! No need to make another request, we can reuse the result from a pending request.
			if (speculativeRequest) {
				logger.trace(`reusing speculative pending request (opportunityId=${speculativeRequest.opportunityId}, headerRequestId=${speculativeRequest.headerRequestId})`);
				// Clear the speculative request since we're using it
				this._speculativePendingRequest = null;
			} else {
				logger.trace(`reusing in-flight pending request (opportunityId=${requestToReuse.opportunityId}, headerRequestId=${requestToReuse.headerRequestId})`);
			}

			const requestStillCurrent = speculativeRequest
				? speculativeRequestMatches // For speculative, we already checked it matches
				: pendingRequestStillCurrent;

			const reusedRequestKind = speculativeRequest ? ReusedRequestKind.Speculative : ReusedRequestKind.Async;

			if (requestStillCurrent) {
				const nextEditResult = await this._joinNextEditRequest(requestToReuse, reusedRequestKind, telemetryBuilder, logContext, cancellationToken);
				telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult.telemetry);
				if (speculativeRequest) {
					const firstEdit = await requestToReuse.firstEdit.p;
					return firstEdit.map(val => ({ ...val, isFromSpeculativeRequest: true }));
				}
				return nextEditResult.nextEdit.isError() ? nextEditResult.nextEdit : requestToReuse.firstEdit.p;
			} else if (nesConfigs.isEagerBackupRequest) {
				// The pending request is stale (document diverged). Start a backup request
				// in parallel so that if rebase fails, we already have a head start.
				logger.trace('starting eager backup request in parallel with rebase attempt');

				// _executeNewNextEditRequest cancels the current _pendingStatelessNextEditRequest,
				// but we're still trying to join+rebase requestToReuse. Temporarily clear the
				// pending field so the stale request isn't cancelled prematurely.
				this._pendingStatelessNextEditRequest = null;
				const backupPromise = this._executeNewNextEditRequest(req, doc, historyContext, nesConfigs, shouldExpandEditWindow, logger, telemetryBuilder, cancellationToken);
				const cancelBackupRequest = () => {
					void backupPromise
						.then(r => r.nextEditRequest.cancellationTokenSource.cancel())
						.catch(() => undefined);
				};

				// Simultaneously attempt to join + rebase the stale request
				const nextEditResult = await this._joinNextEditRequest(requestToReuse, reusedRequestKind, telemetryBuilder, logContext, cancellationToken);
				const cacheResult = await requestToReuse.firstEdit.p;
				if (cacheResult.isOk() && cacheResult.val.edit) {
					const rebaseResult = this._nextEditCache.tryRebaseCacheEntry(cacheResult.val, documentAtInvocationTime, selectionAtInvocationTime);
					if (rebaseResult.edit) {
						logger.trace('rebase succeeded, cancelling eager backup request');
						cancelBackupRequest();
						telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult.telemetry);
						return Result.ok(rebaseResult.edit);
					}
					this._logRebaseFailure(rebaseResult.failureInfo, logContext);
				}

				if (cancellationToken.isCancellationRequested) {
					logger.trace('cancelled after rebase failed (eager backup path)');
					cancelBackupRequest();
					telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult.telemetry);
					return Result.error(new NoNextEditReason.GotCancelled('afterFailedRebase'));
				}

				// Rebase failed — use the backup request that's already been running in parallel
				logger.trace('rebase failed, using eager backup request');
				const backupRes = await backupPromise;
				telemetryBuilder.setStatelessNextEditTelemetry(backupRes.nextEditResult.telemetry);
				return backupRes.nextEditResult.nextEdit.isError() ? backupRes.nextEditResult.nextEdit : backupRes.nextEditRequest.firstEdit.p;
			} else {
				const nextEditResult = await this._joinNextEditRequest(requestToReuse, reusedRequestKind, telemetryBuilder, logContext, cancellationToken);

				// Needs rebasing.
				const cacheResult = await requestToReuse.firstEdit.p;
				if (cacheResult.isOk() && cacheResult.val.edit) {
					const rebaseResult = this._nextEditCache.tryRebaseCacheEntry(cacheResult.val, documentAtInvocationTime, selectionAtInvocationTime);
					if (rebaseResult.edit) {
						telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult.telemetry);
						return Result.ok(rebaseResult.edit);
					}
					this._logRebaseFailure(rebaseResult.failureInfo, logContext);
				}

				if (cancellationToken.isCancellationRequested) {
					logger.trace('document changed after rebase failed');
					telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult.telemetry);
					return Result.error(new NoNextEditReason.GotCancelled('afterFailedRebase'));
				}

				// Rebase failed (or result had error). Check if there is a new pending request. Otherwise continue with a new request below.
				const pendingRequestStillCurrent2 = documentAtInvocationTime.value === this._pendingStatelessNextEditRequest?.documentBeforeEdits.value;
				const existingNextEditRequest2 = pendingRequestStillCurrent2 && !this._pendingStatelessNextEditRequest?.cancellationTokenSource.token.isCancellationRequested
					&& this._pendingStatelessNextEditRequest || undefined;
				if (existingNextEditRequest2) {
					logger.trace('reusing 2nd existing next edit request after rebase failed');
					const nextEditResult2 = await this._joinNextEditRequest(existingNextEditRequest2, ReusedRequestKind.Async, telemetryBuilder, logContext, cancellationToken);
					telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult2.telemetry);
					return nextEditResult2.nextEdit.isError() ? nextEditResult2.nextEdit : existingNextEditRequest2.firstEdit.p;
				}

				logger.trace('creating new next edit request after rebase failed');
			}
		}

		const res = await this._executeNewNextEditRequest(req, doc, historyContext, nesConfigs, shouldExpandEditWindow, logger, telemetryBuilder, cancellationToken);
		const nextEditRequest = res.nextEditRequest;
		const nextEditResult = res.nextEditResult;
		telemetryBuilder.setStatelessNextEditTelemetry(nextEditResult.telemetry);
		return nextEditResult.nextEdit.isError() ? nextEditResult.nextEdit : nextEditRequest.firstEdit.p;
	}

	private async _joinNextEditRequest(nextEditRequest: StatelessNextEditRequest, reusedRequestKind: ReusedRequestKind, telemetryBuilder: LlmNESTelemetryBuilder, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken) {
		telemetryBuilder.setHeaderRequestId(nextEditRequest.headerRequestId);
		telemetryBuilder.setReusedRequest(reusedRequestKind);

		telemetryBuilder.setRequest(nextEditRequest);
		logContext.setRequestInput(nextEditRequest);
		logContext.setIsCachedResult(nextEditRequest.logContext);

		const disp = this._hookupCancellation(nextEditRequest, cancellationToken);
		try {
			return await nextEditRequest.result;
		} finally {
			disp.dispose();
		}
	}

	private _logRebaseFailure(failureInfo: MarkdownLoggable | undefined, logContext: InlineEditRequestLogContext): void {
		if (failureInfo) {
			logContext.setRebaseFailure(failureInfo);
		}
	}

	private async _executeNewNextEditRequest(
		req: NextEditFetchRequest,
		doc: IObservableDocument,
		historyContext: HistoryContext,
		nesConfigs: INesConfigs,
		shouldExpandEditWindow: boolean,
		parentLogger: ILogger,
		telemetryBuilder: LlmNESTelemetryBuilder,
		cancellationToken: CancellationToken
	): Promise<{
		nextEditRequest: StatelessNextEditRequest<CachedOrRebasedEdit>;
		nextEditResult: StatelessNextEditResult;
	}> {
		const curDocId = doc.id;
		const logger = parentLogger.createSubLogger('_executeNewNextEditRequest');

		const recording = this._debugRecorder?.getRecentLog();

		const logContext = req.log;

		const activeDocAndIdx = assertDefined(historyContext.getDocumentAndIdx(curDocId));
		const activeDocSelection = doc.selection.get()[0] as OffsetRange | undefined;

		const projectedDocuments = historyContext.documents.map(doc => this._processDoc(doc));

		const xtabEditHistory = this._xtabHistoryTracker.getHistory();

		const firstEdit = new DeferredPromise<Result<CachedOrRebasedEdit, NoNextEditReason>>();

		const nLinesEditWindow = (shouldExpandEditWindow
			? this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAutoExpandEditWindowLines, this._expService)
			: undefined);

		const nextEditRequest = new StatelessNextEditRequest(
			req.headerRequestId,
			req.opportunityId,
			doc.value.get(),
			projectedDocuments.map(d => d.nextEditDoc),
			activeDocAndIdx.idx,
			xtabEditHistory,
			firstEdit,
			nLinesEditWindow,
			false, // isSpeculative
			logContext,
			req.log.recordingBookmark,
			recording,
			req.providerRequestStartDateTime,
		);
		let nextEditResult: StatelessNextEditResult | undefined;

		if (this._pendingStatelessNextEditRequest) {
			this._pendingStatelessNextEditRequest.cancellationTokenSource.cancel();
			this._pendingStatelessNextEditRequest = null;
			// Clear any scheduled (but not yet triggered) speculative request tied to the
			// old stream — it would otherwise fire stale when the old stream's background
			// loop calls handleStreamEnd after the stream has already been superseded.
			this._scheduledSpeculativeRequest = null;
		}

		// Cancel speculative request if it doesn't match the document/state
		// of this new request — it was built for a different document or post-edit state.
		if (this._speculativePendingRequest
			&& (this._speculativePendingRequest.docId !== curDocId
				|| this._speculativePendingRequest.postEditContent !== nextEditRequest.documentBeforeEdits.value)
		) {
			this._cancelSpeculativeRequest();
		}

		this._pendingStatelessNextEditRequest = nextEditRequest;

		const removeFromPending = () => {
			if (this._pendingStatelessNextEditRequest === nextEditRequest) {
				this._pendingStatelessNextEditRequest = null;
			}
		};

		telemetryBuilder.setRequest(nextEditRequest);
		telemetryBuilder.setStatus('requested');
		logContext.setRequestInput(nextEditRequest);

		// A note on cancellation:
		//
		// We don't cancel when the cancellation token is signalled, because we have our own
		// separate cancellation logic which ends up cancelling based on documents changing.
		//
		// But we do cancel requests which didn't start yet if no-one really needs their result
		//
		const disp = this._hookupCancellation(nextEditRequest, cancellationToken, nesConfigs.isAsyncCompletions ? autorunWithChanges(this, {
			value: doc.value,
		}, data => {
			data.value.changes.forEach(edit => {
				if (nextEditRequest.intermediateUserEdit && !edit.isEmpty()) {
					nextEditRequest.intermediateUserEdit = nextEditRequest.intermediateUserEdit.compose(edit);
					if (!checkEditConsistency(nextEditRequest.documentBeforeEdits.value, nextEditRequest.intermediateUserEdit, data.value.value.value, logger)) {
						nextEditRequest.intermediateUserEdit = undefined;
					}
				}
			});
		}) : undefined);


		const statePerDoc = createDocStateLookupMap(projectedDocuments, xtabEditHistory);

		const editStream = this._statelessNextEditProvider.provideNextEdit(nextEditRequest, logger, logContext, nextEditRequest.cancellationTokenSource.token);

		let ithEdit = -1;

		const processEdit = (streamedEdit: { readonly edit: LineReplacement; readonly isFromCursorJump: boolean; readonly window?: OffsetRange; readonly originalWindow?: OffsetRange; readonly targetDocument?: DocumentId }, telemetry: IStatelessNextEditTelemetry): CachedOrRebasedEdit | undefined => {
			++ithEdit;
			const myLogger = logger.createSubLogger('processEdit');
			myLogger.trace(`processing edit #${ithEdit} (starts at 0)`);

			// reset shouldExpandEditWindow to false when we get any edit
			myLogger.trace('resetting shouldExpandEditWindow to false due to receiving an edit');
			this._shouldExpandEditWindow = false;

			const targetDocState = statePerDoc.get(streamedEdit.targetDocument ?? curDocId);

			const singleLineEdit = streamedEdit.edit;
			const lineEdit = new LineEdit([singleLineEdit]);
			const edit = convertLineEditToEdit(lineEdit, targetDocState.baseDocState);
			const rebasedEdit = edit.tryRebase(targetDocState.editsSoFar);

			if (rebasedEdit === undefined) {
				myLogger.trace(`edit ${ithEdit} is undefined after rebasing`);
				if (!firstEdit.isSettled) {
					firstEdit.complete(Result.error(new NoNextEditReason.Uncategorized(new Error('Rebased edit is undefined'))));
				}
				return undefined;
			}

			targetDocState.editsSoFar = targetDocState.editsSoFar.compose(rebasedEdit);

			let cachedEdit: CachedOrRebasedEdit | undefined;
			if (rebasedEdit.replacements.length === 0) {
				myLogger.trace(`WARNING: ${ithEdit} has no edits`);
			} else if (rebasedEdit.replacements.length > 1) {
				myLogger.trace(`WARNING: ${ithEdit} has ${rebasedEdit.replacements.length} edits, but expected only 1`);
			} else {
				// populate the cache
				const nextEditReplacement = rebasedEdit.replacements[0];
				targetDocState.nextEdits.push(nextEditReplacement);
				cachedEdit = this._nextEditCache.setKthNextEdit(
					targetDocState.docId,
					targetDocState.docContents,
					ithEdit === 0 ? streamedEdit.window : undefined,
					nextEditReplacement,
					ithEdit,
					ithEdit === 0 ? targetDocState.nextEdits : undefined,
					ithEdit === 0 ? nextEditRequest.intermediateUserEdit : undefined,
					req,
					{ isFromCursorJump: streamedEdit.isFromCursorJump, originalEditWindow: streamedEdit.originalWindow, cursorOffset: targetDocState.docId === curDocId ? activeDocSelection?.start : undefined }
				);
				myLogger.trace(`populated cache for ${ithEdit}`);
			}

			if (!firstEdit.isSettled) {
				myLogger.trace('resolving firstEdit promise');
				logContext.setResult(new RootedLineEdit(targetDocState.docContents, lineEdit)); // this's correct without rebasing because this's the first edit
				firstEdit.complete(cachedEdit ? Result.ok(cachedEdit) : Result.error(new NoNextEditReason.Unexpected(new Error('No cached edit'))));
			}

			targetDocState.docContents = rebasedEdit.applyOnText(targetDocState.docContents);

			return cachedEdit;
		};

		const handleStreamEnd = (completionReason: NoNextEditReason, lastTelemetry: IStatelessNextEditTelemetry) => {
			const myLogger = logger.createSubLogger('streamEnd');

			// if there was a request made, and it ended without any edits, reset shouldExpandEditWindow
			const hadNoEdits = ithEdit === -1;
			if (hadNoEdits && completionReason instanceof NoNextEditReason.NoSuggestions) {
				myLogger.trace('resetting shouldExpandEditWindow to false due to NoSuggestions');
				this._shouldExpandEditWindow = false;
			}

			if (statePerDoc.get(curDocId).nextEdits.length) {
				myLogger.trace(`${statePerDoc.get(curDocId).nextEdits.length} edits returned`);
			} else {
				myLogger.trace(`no edit, reason: ${completionReason.kind}`);
				if (completionReason instanceof NoNextEditReason.NoSuggestions) {
					const { documentBeforeEdits, window } = completionReason;
					const reducedWindow = window ? computeReducedWindow(window, activeDocSelection, documentBeforeEdits) : undefined;
					this._nextEditCache.setNoNextEdit(curDocId, documentBeforeEdits, reducedWindow, req);
				}
			}

			if (!firstEdit.isSettled) {
				firstEdit.complete(Result.error(completionReason));
			}

			const resultForTelemetry: Result<void, NoNextEditReason> = statePerDoc.get(curDocId).nextEdits.length > 0
				? Result.ok(undefined)
				: Result.error(completionReason);
			const result = new StatelessNextEditResult(resultForTelemetry, lastTelemetry);
			nextEditRequest.setResult(result);

			disp.dispose();
			removeFromPending();

			// Fire any scheduled speculative request — the last shown edit
			// was indeed the last edit from this stream.
			if (this._scheduledSpeculativeRequest?.headerRequestId === nextEditRequest.headerRequestId) {
				const scheduled = this._scheduledSpeculativeRequest;
				this._scheduledSpeculativeRequest = null;
				void this._triggerSpeculativeRequest(scheduled.suggestion);
			}

			return result;
		};

		try {
			let res = await editStream.next();

			if (res.done) {
				// Stream ended immediately without any edits
				const completionReason = res.value.v;
				nextEditResult = handleStreamEnd(completionReason, res.value.telemetryBuilder);
			} else {
				// Process first edit synchronously
				const firstStreamedEdit = res.value.v;
				const firstTelemetry = res.value.telemetryBuilder;
				processEdit(firstStreamedEdit, firstTelemetry);

				// Continue streaming remaining edits in the background (unawaited)
				(async () => {
					try {
						res = await editStream.next();
						while (!res.done) {
							const streamedEdit = res.value.v;
							processEdit(streamedEdit, res.value.telemetryBuilder);

							// A new edit arrived from the stream — the previously-shown
							// edit was not the last one. Clear the scheduled speculative.
							if (this._scheduledSpeculativeRequest?.headerRequestId === nextEditRequest.headerRequestId) {
								this._scheduledSpeculativeRequest = null;
							}

							res = await editStream.next();
						}

						// Stream completed
						const completionReason = res.value.v;
						handleStreamEnd(completionReason, res.value.telemetryBuilder);
					} catch (err) {
						logger.trace(`Error while streaming further edits: ${ErrorUtils.toString(err)}`);
						const errorReason = new NoNextEditReason.Unexpected(ErrorUtils.fromUnknown(err));
						handleStreamEnd(errorReason, firstTelemetry);
					}
				})();

				nextEditResult = new StatelessNextEditResult(Result.ok(undefined), firstTelemetry);
			}

		} catch (err) {
			nextEditRequest.setResultError(err);
			throw err;
		}

		return { nextEditRequest, nextEditResult };
	}

	private _hookupCancellation(nextEditRequest: StatelessNextEditRequest, cancellationToken: CancellationToken, attachedDisposable?: IDisposable): IDisposable {
		const disposables = new DisposableStore();

		let dependantRemoved = false;
		const removeDependant = () => {
			if (!dependantRemoved) {
				dependantRemoved = true;
				nextEditRequest.liveDependentants--;
			}
		};

		const cancellationTimer = disposables.add(new TimeoutTimer());

		disposables.add(cancellationToken.onCancellationRequested(() => {
			removeDependant();
			if (nextEditRequest.liveDependentants > 0) {
				// there are others depending on this request
				return;
			}
			if (!nextEditRequest.fetchIssued) {
				// fetch not issued => cancel!
				nextEditRequest.cancellationTokenSource.cancel();
				attachedDisposable?.dispose();
				return;
			}
			cancellationTimer.setIfNotSet(() => {
				if (nextEditRequest.liveDependentants > 0) {
					// there are others depending on this request
					return;
				}
				nextEditRequest.cancellationTokenSource.cancel();
				attachedDisposable?.dispose();
			}, 1000); // This needs to be longer than the pause between two requests from Core otherwise we cancel running requests too early.
		}));

		disposables.add(toDisposable(() => {
			removeDependant();
			if (nextEditRequest.liveDependentants === 0) {
				attachedDisposable?.dispose();
			}
		}));

		nextEditRequest.liveDependentants++;

		return disposables;
	}

	private computeMinimumResponseDelay({ triggerTime, isRebasedCachedEdit, isSubsequentCachedEdit, isFromSpeculativeRequest, enforceCacheDelay }: { triggerTime: number; isRebasedCachedEdit: boolean; isSubsequentCachedEdit: boolean; isFromSpeculativeRequest: boolean; enforceCacheDelay: boolean }, logger: ILogger): number {

		if (!enforceCacheDelay) {
			logger.trace('[minimumDelay] no minimum delay enforced due to enforceCacheDelay being false');
			return 0;
		}

		const cacheDelay = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, this._expService);
		const rebasedCacheDelay = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsRebasedCacheDelay, this._expService);
		const subsequentCacheDelay = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsSubsequentCacheDelay, this._expService);
		const speculativeRequestDelay = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestDelay, this._expService);

		let minimumResponseDelay = cacheDelay;
		if (isRebasedCachedEdit && rebasedCacheDelay !== undefined) {
			minimumResponseDelay = rebasedCacheDelay;
		} else if (isSubsequentCachedEdit && subsequentCacheDelay !== undefined) {
			minimumResponseDelay = subsequentCacheDelay;
		} else if (isFromSpeculativeRequest && speculativeRequestDelay !== undefined) {
			minimumResponseDelay = speculativeRequestDelay;
		}

		const nextEditProviderCallLatency = Date.now() - triggerTime;

		// if the provider call took longer than the minimum delay, we don't need to delay further
		const delay = Math.max(0, minimumResponseDelay - nextEditProviderCallLatency);

		logger.trace(`[minimumDelay] expected delay: ${minimumResponseDelay}ms, effective delay: ${delay}. isRebasedCachedEdit: ${isRebasedCachedEdit} (rebasedCacheDelay: ${rebasedCacheDelay}), isSubsequentCachedEdit: ${isSubsequentCachedEdit} (subsequentCacheDelay: ${subsequentCacheDelay}), isFromSpeculativeRequest: ${isFromSpeculativeRequest} (speculativeRequestDelay: ${speculativeRequestDelay})`);

		return delay;
	}

	public handleShown(suggestion: NextEditResult) {
		this._lastShownTime = Date.now();
		this._lastShownSuggestionId = suggestion.requestId;
		this._lastOutcome = undefined; // clear so that outcome is "pending" until resolved
		this._scheduledSpeculativeRequest = null; // clear any previously scheduled speculative

		// Trigger speculative request for the post-edit document state
		const speculativeRequestsEnablement = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequests, this._expService);
		if (speculativeRequestsEnablement === SpeculativeRequestsEnablement.On) {
			// If the originating stream is still running, defer the speculative request
			// until the stream completes. If more edits come from this stream, the
			// schedule is cleared (the shown edit wasn't the last one). The speculative
			// request only fires when the stream ends with the shown edit as the last one.
			const originatingRequest = this._pendingStatelessNextEditRequest;
			if (originatingRequest && originatingRequest.headerRequestId === suggestion.source.headerRequestId) {
				this._scheduledSpeculativeRequest = {
					suggestion,
					headerRequestId: originatingRequest.headerRequestId,
				};
			} else {
				void this._triggerSpeculativeRequest(suggestion);
			}
		}
	}

	private async _triggerSpeculativeRequest(suggestion: NextEditResult): Promise<void> {
		const result = suggestion.result;
		if (!result?.edit) {
			return;
		}

		const docId = result.targetDocumentId;
		if (!docId) {
			return;
		}

		const logContext = new InlineEditRequestLogContext(docId.uri, 0, undefined);

		const sw = new StopWatch();
		const logger = this._logger.createSubLogger('_triggerSpeculativeRequest')
			.withExtraTarget(LogTarget.fromCallback((_level, msg) => {
				logContext.trace(`[${Math.floor(sw.elapsed()).toString().padStart(4, ' ')}ms] ${msg}`);
			}));

		// Compute the post-edit document content
		const postEditContent = result.edit.replace(result.documentBeforeEdits.value);
		const preciseEdit = result.edit.removeCommonSuffixPrefix(result.documentBeforeEdits.value);
		const postEditCursorOffset = preciseEdit.replaceRange.start + preciseEdit.newText.length;
		const postEditCursorOffsetRange = new OffsetRange(postEditCursorOffset, postEditCursorOffset);
		const selections = [postEditCursorOffsetRange];
		const rootedEdit = new RootedEdit(result.documentBeforeEdits, new StringEdit([result.edit]));

		const postEditContentST = new StringText(postEditContent);
		let cachedEdit = this._nextEditCache.lookupNextEdit(docId, postEditContentST, selections);
		let shiftedSelection = postEditCursorOffsetRange;
		if (cachedEdit) {
			// first cachedEdit should be without edits because of noSuggestions caching
			if (cachedEdit.edit) {
				logger.trace('already have cached edit for post-edit state');
				return;
			} else if (cachedEdit.editWindow) {
				logger.trace('have cached no-suggestions entry for post-edit state, but it has an edit window. Checking if shifting selection based on cursor placement config can yield a cached edit');
				const cursorPlacement = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestsCursorPlacement, this._expService);
				if (cursorPlacement === SpeculativeRequestsCursorPlacement.AfterEditWindow) {
					logger.trace('cursor placement config is AfterEditWindow, shifting selection to after edit window');
					shiftedSelection = NextEditProvider.shiftSelectionAfterEditWindow(postEditContentST, cachedEdit.editWindow);
					cachedEdit = this._nextEditCache.lookupNextEdit(docId, postEditContentST, [shiftedSelection]);
					if (cachedEdit?.edit) {
						logger.trace('already have cached edit for post-edit state (after shifting selection)');
						return;
					} else {
						logger.trace('no cached edit even after shifting selection');
					}
				} else {
					logger.trace(`cursor placement config is ${cursorPlacement}, not shifting selection`);
				}
			} else {
				logger.trace('already have cached no-suggestions entry for post-edit state');
				return;
			}
		}

		// Check if we already have a pending request for the post-edit state
		if (this._pendingStatelessNextEditRequest?.documentBeforeEdits.value === postEditContent) {
			logger.trace('already have pending request for post-edit state');
			return;
		}

		// Check if we already have a speculative request for this post-edit state
		if (this._speculativePendingRequest?.docId === docId && this._speculativePendingRequest?.postEditContent === postEditContent) {
			logger.trace('already have speculative request for post-edit state');
			return;
		}

		// Get the document to trigger speculative fetch
		// Note: targetDocumentId is defined when the suggestion targets a different document
		// Otherwise, use the file path from the log context
		const doc = this._workspace.getDocument(docId);
		if (!doc) {
			logger.trace('document not found for speculative request');
			return;
		}

		// Cancel any previous speculative request
		this._cancelSpeculativeRequest();

		const historyContext = this._historyContextProvider.getHistoryContext(docId);
		if (!historyContext) {
			logger.trace('no history context for speculative request');
			return;
		}

		const req = new NextEditFetchRequest(`sp-${suggestion.source.opportunityId}`, logContext, undefined, true, `sp-${generateUuid()}`);

		logger.trace(`triggering speculative request for post-edit state (opportunityId=${req.opportunityId}, headerRequestId=${req.headerRequestId})`);

		try {
			const speculativeRequest = await this._createSpeculativeRequest(
				req,
				doc,
				shiftedSelection,
				historyContext,
				postEditContent,
				rootedEdit,
				result.edit,
				{
					triggeredBySpeculativeRequest: suggestion.source.isSpeculative,
					isSubsequentEdit: suggestion.result?.isSubsequentEdit ?? false,
				},
				logger
			);

			if (speculativeRequest) {
				this._speculativePendingRequest = {
					request: speculativeRequest,
					docId,
					postEditContent,
				};
			}
		} catch (e) {
			logger.trace(`speculative request failed: ${ErrorUtils.toString(e)}`);
		}
	}

	/**
	 * Creates and starts a speculative request for the post-edit document state.
	 * The request will populate the cache so that when the user accepts the suggestion,
	 * the next NES request can reuse or find the result in cache.
	 */
	private async _createSpeculativeRequest(
		req: NextEditFetchRequest,
		doc: IObservableDocument,
		shiftedSelection: OffsetRange,
		historyContext: HistoryContext,
		postEditContent: string,
		rootedEdit: RootedEdit,
		appliedEdit: StringReplacement,
		{ triggeredBySpeculativeRequest, isSubsequentEdit }: { triggeredBySpeculativeRequest: boolean; isSubsequentEdit: boolean },
		parentLogger: ILogger
	): Promise<StatelessNextEditRequest<CachedOrRebasedEdit> | undefined> {
		const curDocId = doc.id;

		const recording = this._debugRecorder?.getRecentLog();
		const logContext = req.log;
		logContext.setStatelessNextEditProviderId(this._statelessNextEditProvider.ID);

		const logger = parentLogger.createSubLogger('_createSpeculativeRequest');

		const activeDocAndIdx = historyContext.getDocumentAndIdx(curDocId);
		if (!activeDocAndIdx) {
			logger.trace('active doc not found in history context');
			return undefined;
		}

		// Create the post-edit document content
		const postEditText = new StringText(postEditContent);

		// Process documents, but for the active document, use the post-edit state
		const projectedDocuments: ProcessedDoc[] = historyContext.documents.map(docHist => {
			if (docHist.docId !== curDocId) {
				return this._processDoc(docHist);
			} else {
				// For the active document, create a version representing post-edit state
				// The "recent edit" from the model's perspective is the NES edit we just applied
				const workspaceRoot = this._workspace.getWorkspaceRoot(curDocId);
				const postEditEdit = new StringEdit([appliedEdit]);
				const postEditLineEdit = RootedLineEdit.fromEdit(new RootedEdit(doc.value.get(), postEditEdit)).removeCommonSuffixPrefixLines().edit;

				const nextEditDoc = new StatelessNextEditDocument(
					curDocId,
					workspaceRoot,
					docHist.languageId,
					doc.value.get().getLines(), // lines before the NES edit
					postEditLineEdit, // the NES edit as LineEdit
					doc.value.get(), // document before NES edit
					Edits.single(postEditEdit), // the NES edit as Edits
					shiftedSelection,
				);

				return {
					recentEdit: new RootedEdit(doc.value.get(), postEditEdit),
					nextEditDoc,
					documentAfterEdits: postEditText,
				};
			}
		});

		const xtabEditHistory = this._xtabHistoryTracker.getHistory();
		const suggestedEdit: IXtabHistoryEditEntry = { kind: 'edit', docId: curDocId, edit: rootedEdit };
		xtabEditHistory.push(suggestedEdit);

		const firstEdit = new DeferredPromise<Result<CachedOrRebasedEdit, NoNextEditReason>>();

		// FIXME@ulugbekna: implement advanced expansion
		const autoExpandEditWindowLinesSetting = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsSpeculativeRequestsAutoExpandEditWindowLines, this._expService);
		let nLinesEditWindow: number | undefined;
		switch (autoExpandEditWindowLinesSetting) {
			case SpeculativeRequestsAutoExpandEditWindowLines.Off:
				nLinesEditWindow = undefined;
				break;
			case SpeculativeRequestsAutoExpandEditWindowLines.Always:
				nLinesEditWindow = this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAutoExpandEditWindowLines, this._expService);
				break;
			case SpeculativeRequestsAutoExpandEditWindowLines.Smart: {
				const isModelOnRightTrack = triggeredBySpeculativeRequest || isSubsequentEdit;
				nLinesEditWindow = (isModelOnRightTrack
					? this._configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAutoExpandEditWindowLines, this._expService)
					: undefined);
				break;
			}
			default:
				assertNever(autoExpandEditWindowLinesSetting);
		}

		const nextEditRequest = new StatelessNextEditRequest(
			req.headerRequestId,
			req.opportunityId,
			postEditText, // documentBeforeEdits is the post-edit state
			projectedDocuments.map(d => d.nextEditDoc),
			activeDocAndIdx.idx,
			xtabEditHistory,
			firstEdit,
			nLinesEditWindow,
			true, // isSpeculative
			logContext,
			undefined, // recordingBookmark
			recording,
			undefined, // providerRequestStartDateTime
		);

		logContext.setRequestInput(nextEditRequest);

		logger.trace('starting speculative provider call');

		// Start the provider call - this runs in the background and populates the cache
		const label = `NES | spec | ${basename(doc.id.toUri().fsPath)} (v${doc.version.get()})`;

		const capturingToken = new CapturingToken(label, undefined);

		void this._requestLogger.captureInvocation(capturingToken, async () => {
			this._addLiveLogContextEntry(logContext, label);
			try {
				await this._runSpeculativeProviderCall(nextEditRequest, projectedDocuments, curDocId, req, shiftedSelection.start, logger);
			} catch (e) {
				logContext.setError(e);
			} finally {
				logContext.markCompleted();
			}
		});

		return nextEditRequest;
	}

	/**
	 * Runs the provider call for a speculative request and caches results.
	 */
	private async _runSpeculativeProviderCall(
		nextEditRequest: StatelessNextEditRequest<CachedOrRebasedEdit>,
		projectedDocuments: readonly ProcessedDoc[],
		curDocId: DocumentId,
		req: NextEditFetchRequest,
		cursorOffset: number,
		parentLogger: ILogger
	): Promise<void> {
		const logger = parentLogger.createSubLogger('_runSpeculativeProviderCall');

		const xtabEditHistory = nextEditRequest.xtabEditHistory;

		const statePerDoc = createDocStateLookupMap(projectedDocuments, xtabEditHistory);

		const logContext = req.log;
		const editStream = this._statelessNextEditProvider.provideNextEdit(
			nextEditRequest,
			logger,
			logContext,
			nextEditRequest.cancellationTokenSource.token
		);

		let ithEdit = -1;

		try {
			let res = await editStream.next();

			if (res.done) {
				nextEditRequest.firstEdit.complete(Result.error(res.value.v));
				nextEditRequest.setResult(new StatelessNextEditResult(
					Result.error(res.value.v),
					res.value.telemetryBuilder
				));
				logContext.markAsNoSuggestions();
				logger.trace('speculative request completed with no edits');
			} else {

				(async () => {
					while (!res.done) {
						++ithEdit;
						const streamedEdit = res.value.v;

						const targetDocState = statePerDoc.get(streamedEdit.targetDocument ?? curDocId);

						const singleLineEdit = streamedEdit.edit;
						const lineEdit = new LineEdit([singleLineEdit]);
						const edit = convertLineEditToEdit(lineEdit, targetDocState.baseDocState);
						const rebasedEdit = edit.tryRebase(targetDocState.editsSoFar);

						if (rebasedEdit === undefined) {
							logger.trace(`speculative edit ${ithEdit} rebasing failed`);
							res = await editStream.next();
							continue;
						}

						targetDocState.editsSoFar = targetDocState.editsSoFar.compose(rebasedEdit);

						if (rebasedEdit.replacements.length === 1) {
							const nextEditReplacement = rebasedEdit.replacements[0];
							targetDocState.nextEdits.push(nextEditReplacement);

							// Populate the cache with the speculative result
							const cachedEdit = this._nextEditCache.setKthNextEdit(
								targetDocState.docId,
								targetDocState.docContents,
								ithEdit === 0 ? streamedEdit.window : undefined,
								nextEditReplacement,
								ithEdit,
								ithEdit === 0 ? targetDocState.nextEdits : undefined,
								undefined, // no userEditSince for speculative
								req,
								{ isFromCursorJump: streamedEdit.isFromCursorJump, originalEditWindow: streamedEdit.originalWindow, cursorOffset: targetDocState.docId === curDocId ? cursorOffset : undefined }
							);

							if (!nextEditRequest.firstEdit.isSettled && cachedEdit) {
								nextEditRequest.firstEdit.complete(Result.ok(cachedEdit));
								nextEditRequest.setResult(
									new StatelessNextEditResult(
										Result.ok(undefined),
										res.value.telemetryBuilder
									)
								);
								logContext.setResponseResults([nextEditReplacement]);
							}

							logger.trace(`cached speculative edit ${ithEdit}`);
						}

						targetDocState.docContents = rebasedEdit.applyOnText(targetDocState.docContents);

						res = await editStream.next();
					}
				})().finally(() => {
					if (!nextEditRequest.firstEdit.isSettled) {
						nextEditRequest.firstEdit.complete(Result.error(new NoNextEditReason.Uncategorized(new Error('Speculative request ended without edits'))));
						nextEditRequest.setResult(
							new StatelessNextEditResult(
								Result.error(new NoNextEditReason.Uncategorized(new Error('Speculative request ended without edits'))),
								res.value.telemetryBuilder
							)
						);
						logContext.markAsNoSuggestions();
					}
				});
			}

			logger.trace(`speculative request completed with ${ithEdit + 1} edits`);
		} catch (e) {
			logger.trace(`speculative provider call error: ${ErrorUtils.toString(e)}`);
		}
	}

	private static shiftSelectionAfterEditWindow(postEditContentST: StringText, editWindowOffsetRange: OffsetRange): OffsetRange {
		const trans = postEditContentST.getTransformer();
		const endOfEditWindow = trans.getPosition(editWindowOffsetRange.endExclusive - 1);
		const shiftedCursorLineNumber = (endOfEditWindow.lineNumber + 1 < postEditContentST.lineRange.endLineNumberExclusive
			? endOfEditWindow.lineNumber + 1
			: endOfEditWindow.lineNumber);
		const shiftedSelectionCursorOffset = trans.getOffset(new Position(shiftedCursorLineNumber, 1));
		const shiftedSelection = new OffsetRange(shiftedSelectionCursorOffset, shiftedSelectionCursorOffset);
		return shiftedSelection;
	}

	public handleAcceptance(docId: DocumentId, suggestion: NextEditResult) {
		this.runSnippy(docId, suggestion);
		this._statelessNextEditProvider.handleAcceptance?.();
		this._lastOutcome = NesOutcome.Accepted;

		const logger = this._logger.createSubLogger(suggestion.source.opportunityId.substring(4, 8)).createSubLogger('handleAcceptance');
		if (suggestion === this._lastNextEditResult) {
			logger.trace('setting shouldExpandEditWindow to true due to acceptance of last suggestion');
			this._shouldExpandEditWindow = true;
		} else {
			logger.trace('NOT setting shouldExpandEditWindow to true because suggestion is not the last suggestion');
		}
	}

	public handleRejection(docId: DocumentId, suggestion: NextEditResult) {
		assertType(suggestion.result, '@ulugbekna: undefined edit cannot be rejected?');

		// The user rejected the suggestion, so the speculative request (which
		// predicted the post-accept state) will never be reused. Cancel it to
		// avoid wasting a server slot.
		this._cancelSpeculativeRequest();

		const shownDuration = Date.now() - this._lastShownTime;
		if (shownDuration > 1000 && suggestion.result.edit) {
			// we can argue that the user had the time to review this
			// so it wasn't an accidental rejection
			this._rejectionCollector.reject(docId, suggestion.result.edit);
			this._nextEditCache.rejectedNextEdit(suggestion.source.headerRequestId);
		}

		this._lastRejectionTime = Date.now();
		this._lastOutcome = NesOutcome.Rejected;

		this._statelessNextEditProvider.handleRejection?.();
	}

	public handleIgnored(docId: DocumentId, suggestion: NextEditResult, supersededBy: INextEditResult | undefined): void {
		this._lastOutcome = NesOutcome.Ignored;

		// Check if this was the last shown suggestion
		const wasShown = this._lastShownSuggestionId === suggestion.requestId;
		const wasSuperseded = supersededBy !== undefined;
		if (wasShown && !wasSuperseded) {
			// The shown suggestion was dismissed (not superseded by a new one),
			// so the speculative request for its post-accept state is useless.
			this._cancelSpeculativeRequest();
			this._statelessNextEditProvider.handleIgnored?.();
		}
	}

	private async runSnippy(docId: DocumentId, suggestion: NextEditResult) {
		if (suggestion.result === undefined || suggestion.result.edit === undefined) {
			return;
		}
		this._snippyService.handlePostInsertion(docId.toUri(), suggestion.result.documentBeforeEdits, suggestion.result.edit);
	}

	private _addLiveLogContextEntry(logContext: InlineEditRequestLogContext, debugNameOverride?: string): void {
		this._requestLogger.addEntry({
			type: LoggedRequestKind.MarkdownContentRequest,
			debugName: debugNameOverride ?? logContext.getDebugName(),
			icon: () => logContext.getIcon(),
			startTimeMs: logContext.time,
			markdownContent: () => logContext.toLogDocument(),
			onDidChange: logContext.onDidChange,
			isVisible: () => logContext.includeInLogTree,
		});
	}

	public clearCache() {
		this._nextEditCache.clear();
		this._rejectionCollector.clear();
	}
}

function assertDefined<T>(value: T | undefined): T {
	if (!value) {
		throw new BugIndicatingError('expected value to be defined, but it was not');
	}
	return value;
}

export class NextEditFetchRequest {
	constructor(
		public readonly opportunityId: string,
		public readonly log: InlineEditRequestLogContext,
		public readonly providerRequestStartDateTime: number | undefined,
		public readonly isSpeculative: boolean,
		public readonly headerRequestId = generateUuid(),
	) {
	}
}
