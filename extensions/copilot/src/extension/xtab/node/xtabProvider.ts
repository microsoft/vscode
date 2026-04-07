/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { FetchStreamSource } from '../../../platform/chat/common/chatMLFetcher';
import { ChatFetchError, ChatFetchResponseType, ChatLocation, RESPONSE_CONTAINED_NO_CHOICES } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService, XTabProviderId } from '../../../platform/configuration/common/configurationService';
import { IDiffService } from '../../../platform/diff/common/diffService';
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { createProxyXtabEndpoint } from '../../../platform/endpoint/node/proxyXtabEndpoint';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { Edits } from '../../../platform/inlineEdits/common/dataTypes/edit';
import { LanguageContextEntry, LanguageContextResponse } from '../../../platform/inlineEdits/common/dataTypes/languageContext';
import { LanguageId } from '../../../platform/inlineEdits/common/dataTypes/languageId';
import { NextCursorLinePrediction, NextCursorLinePredictionCursorPlacement } from '../../../platform/inlineEdits/common/dataTypes/nextCursorLinePrediction';
import * as xtabPromptOptions from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { AggressivenessSetting, isAggressivenessStrategy, LanguageContextLanguages, LanguageContextOptions } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { InlineEditRequestLogContext } from '../../../platform/inlineEdits/common/inlineEditLogContext';
import { IInlineEditsModelService } from '../../../platform/inlineEdits/common/inlineEditsModelService';
import { ResponseProcessor } from '../../../platform/inlineEdits/common/responseProcessor';
import { EditStreaming, EditStreamingWithTelemetry, IStatelessNextEditProvider, NoNextEditReason, RequestEditWindow, RequestEditWindowWithCursorJump, StatelessNextEditDocument, StatelessNextEditRequest, StatelessNextEditTelemetryBuilder, WithStatelessProviderTelemetry } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { editWouldDeleteWhatWasJustInserted, editWouldDeleteWhatWasJustInserted2, IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges, IgnoreWhitespaceOnlyChanges } from '../../../platform/inlineEdits/common/statelessNextEditProviders';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { ContextKind, SnippetContext } from '../../../platform/languageServer/common/languageContextService';
import { ILogger } from '../../../platform/log/common/logService';
import { OptionalChatRequestParams, Prediction } from '../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { ISimulationTestContext } from '../../../platform/simulationTestContext/common/simulationTestContext';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { raceFilter } from '../../../util/common/async';
import { AsyncIterUtils, AsyncIterUtilsExt } from '../../../util/common/asyncIterableUtils';
import { ErrorUtils } from '../../../util/common/errors';
import { Result } from '../../../util/common/result';
import { assertNever } from '../../../util/vs/base/common/assert';
import { DeferredPromise, raceCancellation, raceTimeout, timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { StopWatch } from '../../../util/vs/base/common/stopwatch';
import { URI } from '../../../util/vs/base/common/uri';
import { LineEdit, LineReplacement } from '../../../util/vs/editor/common/core/edits/lineEdit';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../util/vs/editor/common/core/position';
import { Range } from '../../../util/vs/editor/common/core/range';
import { LineRange } from '../../../util/vs/editor/common/core/ranges/lineRange';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../util/vs/editor/common/core/text/abstractText';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Position as VscodePosition } from '../../../vscodeTypes';
import { DelaySession } from '../../inlineEdits/common/delay';
import { getOrDeduceSelectionFromLastEdit } from '../../inlineEdits/common/nearbyCursorInlineEditProvider';
import { UserInteractionMonitor } from '../../inlineEdits/common/userInteractionMonitor';
import { IgnoreImportChangesAspect } from '../../inlineEdits/node/importFiltering';
import { determineIsInlineSuggestionPosition } from '../common/inlineSuggestion';
import { LintErrors } from '../common/lintErrors';
import { ClippedDocument, constructTaggedFile, getUserPrompt, N_LINES_ABOVE, N_LINES_AS_CONTEXT, N_LINES_BELOW, PromptPieces } from '../common/promptCrafting';
import { countTokensForLines, toUniquePath } from '../common/promptCraftingUtils';
import { ISimilarFilesContextService } from '../common/similarFilesContextService';
import { nes41Miniv3SystemPrompt, simplifiedPrompt, systemPromptTemplate, unifiedModelSystemPrompt, xtab275SystemPrompt } from '../common/systemMessages';
import { PromptTags, ResponseTags } from '../common/tags';
import { TerminalMonitor } from '../common/terminalOutput';
import { CurrentDocument } from '../common/xtabCurrentDocument';
import { XtabCustomDiffPatchResponseHandler } from './xtabCustomDiffPatchResponseHandler';
import { XtabEndpoint } from './xtabEndpoint';
import { CursorJumpPrediction, XtabNextCursorPredictor } from './xtabNextCursorPredictor';
import { charCount, constructMessages, linesWithBackticksRemoved } from './xtabUtils';

/**
 * Returns true if the user has made document edits since the request was created.
 * Used to skip costly sub-requests (e.g. next cursor prediction) whose results will
 * be stale by the time they return.
 */
function hasUserTypedSinceRequestStarted(request: StatelessNextEditRequest): boolean {
	return request.intermediateUserEdit === undefined || !request.intermediateUserEdit.isEmpty();
}

namespace RetryState {
	export class NotRetrying { public static INSTANCE = new NotRetrying(); }
	export class Retrying { constructor(public readonly reason: 'cursorJump' | 'expandedWindow') { } }

	export type t =
		| NotRetrying
		| Retrying;
}

export interface ModelConfig extends xtabPromptOptions.PromptOptions {
	modelName: string | undefined;
}

export class XtabProvider implements IStatelessNextEditProvider {

	public static readonly ID = XTabProviderId;

	public readonly ID = XtabProvider.ID;

	private static computeTokens = (s: string) => Math.floor(s.length / 4);

	private readonly userInteractionMonitor: UserInteractionMonitor;

	private readonly terminalMonitor: TerminalMonitor;

	private forceUseDefaultModel: boolean = false;

	private nextCursorPredictor: XtabNextCursorPredictor;

	constructor(
		@IInlineEditsModelService private readonly modelService: IInlineEditsModelService,
		@ISimulationTestContext private readonly simulationCtx: ISimulationTestContext,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IDiffService private readonly diffService: IDiffService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IExperimentationService private readonly expService: IExperimentationService,
		@ILanguageContextProviderService private readonly langCtxService: ILanguageContextProviderService,
		@ILanguageDiagnosticsService private readonly langDiagService: ILanguageDiagnosticsService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@ISimilarFilesContextService private readonly similarFilesContextService: ISimilarFilesContextService,
	) {
		this.userInteractionMonitor = this.instaService.createInstance(UserInteractionMonitor);
		this.terminalMonitor = this.instaService.createInstance(TerminalMonitor);
		this.nextCursorPredictor = this.instaService.createInstance(XtabNextCursorPredictor, XtabProvider.computeTokens);
	}

	public handleAcceptance(): void {
		this.userInteractionMonitor.handleAcceptance();
	}

	public handleRejection(): void {
		this.userInteractionMonitor.handleRejection();
	}

	public handleIgnored(): void {
		this.userInteractionMonitor.handleIgnored();
	}

	public async *provideNextEdit(request: StatelessNextEditRequest, logger: ILogger, logContext: InlineEditRequestLogContext, cancellationToken: CancellationToken): EditStreamingWithTelemetry {
		const telemetry = new StatelessNextEditTelemetryBuilder(request.headerRequestId);

		logContext.setProviderStartTime();
		try {
			if (request.xtabEditHistory.length === 0) {
				const noSuggestionReason = new NoNextEditReason.ActiveDocumentHasNoEdits();
				return new WithStatelessProviderTelemetry(noSuggestionReason, telemetry.build(Result.error(noSuggestionReason)));
			}

			const delaySession = this.userInteractionMonitor.createDelaySession(request.providerRequestStartDateTime);

			const iterator = this.doGetNextEdit(request, delaySession, logger, logContext, cancellationToken, telemetry, RetryState.NotRetrying.INSTANCE);

			let res = await iterator.next(); // for-async-await loop doesn't work because we need to access the final return value

			while (!res.done) {
				yield new WithStatelessProviderTelemetry(res.value, telemetry.build(Result.ok(undefined)));
				res = await iterator.next();
			}

			const noNextEditReason = res.value;

			if (noNextEditReason instanceof NoNextEditReason.GotCancelled) {
				logContext.setIsSkipped();
			}

			return new WithStatelessProviderTelemetry(noNextEditReason, telemetry.build(Result.error(noNextEditReason)));
		} catch (err: unknown) {
			const error = ErrorUtils.fromUnknown(err);
			const noSuggestionReason = new NoNextEditReason.Unexpected(error);
			return new WithStatelessProviderTelemetry(noSuggestionReason, telemetry.build(Result.error(noSuggestionReason)));
		} finally {
			logContext.setProviderEndTime();
		}
	}

	private doGetNextEdit(
		request: StatelessNextEditRequest,
		delaySession: DelaySession,
		logger: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
		retryState: RetryState.t,
	): EditStreaming {
		return this.doGetNextEditWithSelection(
			request,
			getOrDeduceSelectionFromLastEdit(request.getActiveDocument()),
			delaySession,
			logger,
			logContext,
			cancellationToken,
			telemetryBuilder,
			retryState,
		);
	}

	private async *doGetNextEditWithSelection(
		request: StatelessNextEditRequest,
		selection: Range | null,
		delaySession: DelaySession,
		parentTracer: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
		retryState: RetryState.t,
		/**
		 * For cursor jump scenarios, this is the edit window around the original cursor position
		 * (before the jump). When provided, yielded edits will include this as `originalWindow`
		 * so the cache can serve the edit when the cursor is in either location.
		 */
		originalEditWindow?: OffsetRange,
	): EditStreaming {

		const tracer = parentTracer.createSubLogger(['XtabProvider', 'doGetNextEditWithSelection']);

		const activeDocument = request.getActiveDocument();

		if (selection === null) {
			return new NoNextEditReason.Uncategorized(new Error('NoSelection'));
		}

		const { promptOptions, modelServiceConfig } = this.determineModelConfiguration(activeDocument);

		telemetryBuilder.setModelConfig(JSON.stringify(modelServiceConfig));

		const endpoint = this.getEndpointWithLogging(promptOptions.modelName, logContext, telemetryBuilder);

		const cursorPosition = new Position(selection.endLineNumber, selection.endColumn);

		const currentDocument = new CurrentDocument(activeDocument.documentAfterEdits, cursorPosition);

		this._configureDebounceTimings(request, currentDocument, promptOptions, telemetryBuilder, delaySession, tracer);

		const areaAroundEditWindowLinesRange = computeAreaAroundEditWindowLinesRange(currentDocument);

		const editWindowLinesRange = this.computeEditWindowLinesRange(currentDocument, request, tracer, telemetryBuilder);

		const cursorOriginalLinesOffset = Math.max(0, currentDocument.cursorLineOffset - editWindowLinesRange.start);
		const editWindowLastLineLength = currentDocument.transformer.getLineLength(editWindowLinesRange.endExclusive);
		const editWindow = currentDocument.transformer.getOffsetRange(new Range(editWindowLinesRange.start + 1, 1, editWindowLinesRange.endExclusive, editWindowLastLineLength + 1));

		request.requestEditWindow = originalEditWindow
			? new RequestEditWindowWithCursorJump(editWindow, originalEditWindow)
			: new RequestEditWindow(editWindow);

		const editWindowLines = currentDocument.lines.slice(editWindowLinesRange.start, editWindowLinesRange.endExclusive);

		const editWindowTokenLimit = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabEditWindowMaxTokens, this.expService);
		if (editWindowTokenLimit !== undefined && countTokensForLines(editWindowLines, XtabProvider.computeTokens) > editWindowTokenLimit) {
			return new NoNextEditReason.PromptTooLarge('editWindow');
		}

		// Expected: editWindow.substring(activeDocument.documentAfterEdits.value) === editWindowLines.join('\n')

		const doesIncludeCursorTag = editWindowLines.some(line => line.includes(PromptTags.CURSOR));
		const shouldRemoveCursorTagFromResponse = !doesIncludeCursorTag; // we'd like to remove the tag only if the original edit-window didn't include the tag

		const taggedCurrentFileContentResult = constructTaggedFile(
			currentDocument,
			editWindowLinesRange,
			areaAroundEditWindowLinesRange,
			promptOptions,
			XtabProvider.computeTokens,
			{
				includeLineNumbers: {
					areaAroundCodeToEdit: xtabPromptOptions.IncludeLineNumbersOption.None,
					currentFileContent: promptOptions.currentFile.includeLineNumbers,
				}
			}
		);

		if (taggedCurrentFileContentResult.isError()) {
			return new NoNextEditReason.PromptTooLarge('currentFile');
		}

		const { clippedTaggedCurrentDoc, areaAroundCodeToEdit } = taggedCurrentFileContentResult.val;

		telemetryBuilder.setNLinesOfCurrentFileInPrompt(clippedTaggedCurrentDoc.lines.length);

		const { aggressivenessLevel, userHappinessScore } = this.userInteractionMonitor.getAggressivenessLevel();

		// Log user's raw aggressiveness setting when explicitly changed from default
		const userAggressivenessSetting = this.configService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsAggressiveness, this.expService);
		telemetryBuilder.setUserAggressivenessSetting(userAggressivenessSetting);

		// Log aggressiveness level and user happiness score
		telemetryBuilder.setXtabAggressivenessLevel(aggressivenessLevel);
		if (userHappinessScore !== undefined) {
			telemetryBuilder.setXtabUserHappinessScore(userHappinessScore);
		}

		const langCtx = await this.getAndProcessLanguageContext(
			request,
			delaySession,
			activeDocument,
			cursorPosition,
			promptOptions,
			tracer,
			logContext,
			cancellationToken,
		);

		if (cancellationToken.isCancellationRequested) {
			return new NoNextEditReason.GotCancelled('afterLanguageContextAwait');
		}

		const lintErrors = new LintErrors(activeDocument.id, currentDocument, this.langDiagService, request.xtabEditHistory);

		const promptPieces = new PromptPieces(
			currentDocument,
			editWindowLinesRange,
			areaAroundEditWindowLinesRange,
			activeDocument,
			request.xtabEditHistory,
			clippedTaggedCurrentDoc.lines,
			areaAroundCodeToEdit,
			langCtx,
			aggressivenessLevel,
			lintErrors,
			XtabProvider.computeTokens,
			promptOptions
		);

		const { prompt: userPrompt, nDiffsInPrompt, diffTokensInPrompt } = getUserPrompt(promptPieces);

		telemetryBuilder.setNDiffsInPrompt(nDiffsInPrompt);
		telemetryBuilder.setDiffTokensInPrompt(diffTokensInPrompt);

		const responseFormat = xtabPromptOptions.ResponseFormat.fromPromptingStrategy(promptOptions.promptingStrategy);

		const prediction = this.getPredictedOutput(activeDocument, editWindowLines, responseFormat);

		const messages = constructMessages({
			systemMsg: pickSystemPrompt(promptOptions.promptingStrategy),
			userMsg: userPrompt,
		});

		logContext.setPrompt(messages);
		telemetryBuilder.setPrompt(messages);

		const HARD_CHAR_LIMIT = 30000 * 4; // 30K tokens, assuming 4 chars per token -- we use approximation here because counting tokens exactly is time-consuming
		const promptCharCount = charCount(messages);
		if (promptCharCount > HARD_CHAR_LIMIT) {
			return new NoNextEditReason.PromptTooLarge('final');
		}

		await this.debounce(delaySession, retryState, tracer, telemetryBuilder, cancellationToken);
		if (cancellationToken.isCancellationRequested) {
			return new NoNextEditReason.GotCancelled('afterDebounce');
		}

		// Fire-and-forget: collect lint errors and terminal output for telemetry in background to avoid blocking the main path
		Promise.resolve().then(() => {
			const lintErrorsData = lintErrors.getData();
			telemetryBuilder.setLintErrors(lintErrorsData);
			logContext.setDiagnosticsData(lintErrorsData);

			const terminalOutputData = this.terminalMonitor.getData();
			telemetryBuilder.setTerminalOutput(terminalOutputData);
			logContext.setTerminalData(terminalOutputData);
		});

		// Fire-and-forget: compute GhostText-style similar files context for telemetry
		telemetryBuilder.setSimilarFilesContext(
			this.similarFilesContextService.compute(activeDocument.id.uri, activeDocument.languageId, activeDocument.documentAfterEdits.value, currentDocument.cursorOffset)
		);

		request.fetchIssued = true;

		return yield* this.streamEditsWithFiltering(
			request,
			endpoint,
			modelServiceConfig,
			messages,
			clippedTaggedCurrentDoc,
			editWindow,
			editWindowLines,
			cursorOriginalLinesOffset,
			editWindowLinesRange,
			promptPieces,
			prediction,
			{
				shouldRemoveCursorTagFromResponse,
				responseFormat,
				retryState,
				aggressivenessLevel,
				userHappinessScore,
			},
			delaySession,
			tracer,
			telemetryBuilder,
			logContext,
			cancellationToken,
			originalEditWindow,
		);
	}

	private _configureDebounceTimings(
		request: StatelessNextEditRequest,
		currentDocument: CurrentDocument,
		promptOptions: ModelConfig,
		telemetry: StatelessNextEditTelemetryBuilder,
		delaySession: DelaySession,
		tracer: ILogger,
	) {

		const isCursorAtEndOfLine = currentDocument.isCursorAtEndOfLine();
		telemetry.setIsCursorAtLineEnd(isCursorAtEndOfLine);

		// Apply extra debounce based on cursor position - only one applies
		const isInlineSuggestionPosition = determineIsInlineSuggestionPosition(currentDocument);
		telemetry.setIsInlineSuggestion(!!isInlineSuggestionPosition);

		if (request.isSpeculative) {
			tracer.trace('No extra debounce applied for speculative request');
		} else {
			const inlineSuggestionDebounce = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceInlineSuggestion, this.expService);
			if (isInlineSuggestionPosition && inlineSuggestionDebounce > 0) {
				tracer.trace('Debouncing for inline suggestion position');
				delaySession.setExtraDebounce(inlineSuggestionDebounce);
			} else if (isCursorAtEndOfLine) {
				tracer.trace('Debouncing for cursor at end of line');
				delaySession.setExtraDebounce(this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine, this.expService));
			} else {
				tracer.trace('No extra debounce applied');
			}
		}

		// Adjust debounce based on user aggressiveness setting for non-aggressiveness models
		if (!isAggressivenessStrategy(promptOptions.promptingStrategy)) {
			this._applyAggressivenessSettings(delaySession, tracer);
		}
	}

	private _applyAggressivenessSettings(delaySession: DelaySession, tracer: ILogger): void {
		const userAggressiveness = this.configService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsAggressiveness, this.expService);
		type MinResponseTimeConfigKey = typeof ConfigKey.TeamInternal.InlineEditsAggressivenessLowMinResponseTimeMs;
		type DebounceConfigKey = typeof ConfigKey.TeamInternal.InlineEditsAggressivenessHighDebounceMs;
		const configsByLevel: Record<AggressivenessSetting, { debounceConfigKey?: DebounceConfigKey; minResponseConfigKey?: MinResponseTimeConfigKey } | undefined> = {
			[AggressivenessSetting.Low]: { minResponseConfigKey: ConfigKey.TeamInternal.InlineEditsAggressivenessLowMinResponseTimeMs },
			[AggressivenessSetting.Medium]: { minResponseConfigKey: ConfigKey.TeamInternal.InlineEditsAggressivenessMediumMinResponseTimeMs },
			[AggressivenessSetting.High]: { debounceConfigKey: ConfigKey.TeamInternal.InlineEditsAggressivenessHighDebounceMs },
			[AggressivenessSetting.Default]: undefined,
		};
		const entry = configsByLevel[userAggressiveness];
		if (!entry) {
			return;
		}

		// Apply debounce override if configured for this level
		if (entry.debounceConfigKey) {
			const debounceMs = this.configService.getExperimentBasedConfig(entry.debounceConfigKey, this.expService);
			delaySession.setBaseDebounceTime(debounceMs);
			tracer.trace(`Aggressiveness ${userAggressiveness}: debounce set to ${debounceMs}ms`);
		}

		// Apply min response time if configured for this level
		if (entry.minResponseConfigKey) {
			// Skip min response time delay if the user just accepted a suggestion
			if (this.userInteractionMonitor.wasLastActionAcceptance) {
				tracer.trace(`Aggressiveness ${userAggressiveness}: skipping min response time (last action was acceptance)`);
				return;
			}

			const minResponseTimeMs = this.configService.getExperimentBasedConfig(entry.minResponseConfigKey, this.expService);
			delaySession.setExpectedTotalTime(minResponseTimeMs);
			tracer.trace(`Aggressiveness ${userAggressiveness}: min response time set to ${minResponseTimeMs}ms`);
		}
	}

	private getAndProcessLanguageContext(
		request: StatelessNextEditRequest,
		delaySession: DelaySession,
		activeDocument: StatelessNextEditDocument,
		cursorPosition: Position,
		promptOptions: ModelConfig,
		tracer: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
	): Promise<LanguageContextResponse | undefined> {
		const recordingEnabled = this.configService.getConfig<boolean>(ConfigKey.TeamInternal.InlineEditsLogContextRecorderEnabled);

		if (!promptOptions.languageContext.enabled && !recordingEnabled) {
			return Promise.resolve(undefined);
		}

		const langCtxPromise = this.getLanguageContext(request, delaySession, activeDocument, cursorPosition, tracer, logContext, cancellationToken);

		// if recording, add diagnostics for the file to the recording and hook up the language context promise to write to the recording
		if (recordingEnabled) {
			langCtxPromise.then(langCtxs => {
				if (langCtxs) {
					logContext.setLanguageContext(langCtxs);
				}
			});
		}

		return promptOptions.languageContext.enabled
			? langCtxPromise
			: Promise.resolve(undefined);
	}


	private async getLanguageContext(
		request: StatelessNextEditRequest,
		delaySession: DelaySession,
		activeDocument: StatelessNextEditDocument,
		cursorPosition: Position,
		tracer: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
	): Promise<LanguageContextResponse | undefined> {
		try {
			const textDoc = this.workspaceService.textDocuments.find(doc => doc.uri.toString() === activeDocument.id.uri);
			if (textDoc === undefined) {
				return undefined;
			}

			const providers = this.langCtxService.getContextProviders(textDoc, ProviderTarget.NES);
			if (providers.length < 1) {
				return undefined;
			}

			const debounceTime = delaySession.getDebounceTime();

			const cursorPositionVscode = new VscodePosition(cursorPosition.lineNumber - 1, cursorPosition.column - 1);

			const ctxRequest: Copilot.ResolveRequest = {
				opportunityId: request.opportunityId,
				completionId: request.headerRequestId,
				documentContext: {
					uri: textDoc.uri.toString(),
					languageId: textDoc.languageId,
					version: textDoc.version,
					offset: textDoc.offsetAt(cursorPositionVscode),
					position: cursorPositionVscode
				},
				activeExperiments: new Map(),
				timeBudget: debounceTime,
				timeoutEnd: Date.now() + debounceTime,
				source: 'nes',
			};

			const isSnippetIgnored = async (item: SnippetContext): Promise<boolean> => {
				const uris = [item.uri, ...(item.additionalUris ?? [])];
				const isIgnored = await raceFilter(uris.map(uri => this.ignoreService.isCopilotIgnored(uri)), r => r);
				return !!isIgnored;
			};

			const langCtxItems: LanguageContextEntry[] = [];
			const getContextPromise = async () => {
				const ctxIter = this.langCtxService.getContextItems(textDoc, ctxRequest, cancellationToken);
				for await (const item of ctxIter) {
					if (item.kind === ContextKind.Snippet && await isSnippetIgnored(item)) {
						// If the snippet is ignored, we don't want to include it in the context
						continue;
					}
					langCtxItems.push({ context: item, timeStamp: Date.now(), onTimeout: false });
				}
			};

			const start = Date.now();
			await raceCancellation(raceTimeout(getContextPromise(), debounceTime), cancellationToken);
			if (cancellationToken.isCancellationRequested) {
				return undefined;
			}
			const end = Date.now();

			const langCtxOnTimeout = this.langCtxService.getContextItemsOnTimeout(textDoc, ctxRequest);
			for (const item of langCtxOnTimeout) {
				if (item.kind === ContextKind.Snippet && await isSnippetIgnored(item)) {
					// If the snippet is ignored, we don't want to include it in the context
					continue;
				}
				langCtxItems.push({ context: item, timeStamp: end, onTimeout: true });
			}

			return { start, end, items: langCtxItems };

		} catch (error: unknown) {
			logContext.setError(ErrorUtils.fromUnknown(error));
			tracer.trace(`Failed to fetch language context: ${error}`);
			return undefined;
		}
	}

	private async *streamEditsWithFiltering(
		request: StatelessNextEditRequest,
		endpoint: IChatEndpoint,
		modelServiceConfig: xtabPromptOptions.ModelConfiguration,
		messages: Raw.ChatMessage[],
		clippedTaggedCurrentDoc: ClippedDocument,
		editWindow: OffsetRange,
		editWindowLines: string[],
		cursorOriginalLinesOffset: number,
		editWindowLineRange: OffsetRange,
		promptPieces: PromptPieces,
		prediction: Prediction | undefined,
		opts: {
			responseFormat: xtabPromptOptions.ResponseFormat;
			shouldRemoveCursorTagFromResponse: boolean;
			retryState: RetryState.t;
			aggressivenessLevel: xtabPromptOptions.AggressivenessLevel;
			userHappinessScore: number | undefined;
		},
		delaySession: DelaySession,
		parentTracer: ILogger,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		originalEditWindow: OffsetRange | undefined,
	): EditStreaming {
		const tracer = parentTracer.createSubLogger('streamEditsWithFiltering');

		const iterator = this.streamEdits(
			request,
			endpoint,
			modelServiceConfig,
			messages,
			clippedTaggedCurrentDoc,
			editWindow,
			editWindowLines,
			cursorOriginalLinesOffset,
			editWindowLineRange,
			promptPieces,
			prediction,
			opts,
			delaySession,
			tracer,
			telemetryBuilder,
			logContext,
			cancellationToken,
			originalEditWindow,
		);

		let nEdits = 0;

		let r = await iterator.next();

		while (!r.done) {
			const edit = r.value.edit;
			const [filteredEdits, filterNames] = this.filterEdit(request.getActiveDocument(), [edit]);
			const isFilteredOut = filteredEdits.length === 0;
			if (isFilteredOut) {
				tracer.trace(`Filtered out an edit: ${edit.toString()} using ${filterNames.join(', ')} filter(s)`);
			} else {
				tracer.trace(`Yielding an edit: ${edit.toString()}`);
				yield r.value;
				nEdits++;
			}
			r = await iterator.next();
		}

		if (nEdits === 0 &&
			r.value instanceof NoNextEditReason.NoSuggestions // only retry if there was no error, cancellation, etc.
		) {
			return yield* this.doGetNextEditsWithCursorJump(request, modelServiceConfig, editWindow, promptPieces, delaySession, parentTracer, logContext, cancellationToken, telemetryBuilder, opts.retryState);
		}

		return r.value;
	}

	private async *streamEdits(
		request: StatelessNextEditRequest,
		endpoint: IChatEndpoint,
		modelServiceConfig: xtabPromptOptions.ModelConfiguration,
		messages: Raw.ChatMessage[],
		clippedTaggedCurrentDoc: ClippedDocument,
		editWindow: OffsetRange,
		editWindowLines: string[],
		cursorOriginalLinesOffset: number,
		editWindowLineRange: OffsetRange,
		promptPieces: PromptPieces,
		prediction: Prediction | undefined,
		opts: {
			responseFormat: xtabPromptOptions.ResponseFormat;
			shouldRemoveCursorTagFromResponse: boolean;
			retryState: RetryState.t;
			aggressivenessLevel: xtabPromptOptions.AggressivenessLevel;
			userHappinessScore: number | undefined;
		},
		delaySession: DelaySession,
		parentTracer: ILogger,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		originalEditWindow: OffsetRange | undefined,
	): EditStreaming {
		const tracer = parentTracer.createSubLogger('streamEdits');

		const targetDocument = request.getActiveDocument().id;

		const useFetcher = this.configService.getExperimentBasedConfig(ConfigKey.NextEditSuggestionsFetcher, this.expService) || undefined;

		const fetchStreamSource = new FetchStreamSource();

		const fetchRequestStopWatch = new StopWatch();

		let responseSoFar = '';

		let chatResponseFailure: ChatFetchError | undefined;

		let ttft: number | undefined;

		const firstTokenReceived = new DeferredPromise<void>();

		logContext.setHeaderRequestId(request.headerRequestId);

		telemetryBuilder.setFetchStartedAt();
		logContext.setFetchStartTime();

		// we must not await this promise because we want to stream edits as they come in
		const fetchResultPromise = endpoint.makeChatRequest2(
			{
				debugName: XtabProvider.ID,
				messages,
				finishedCb: async (text, _, delta) => {
					if (!firstTokenReceived.isSettled) {
						firstTokenReceived.complete();
					}
					if (ttft === undefined && text !== '') {
						ttft = fetchRequestStopWatch.elapsed();
						logContext.addLog(`TTFT ${ttft} ms`);
					}

					fetchStreamSource.update(text, delta);
					responseSoFar = text;
					logContext.setResponse(responseSoFar);
					return undefined;
				},
				location: ChatLocation.Other,
				source: undefined,
				requestOptions: {
					temperature: 0,
					stream: true,
					prediction,
				} satisfies OptionalChatRequestParams,
				userInitiatedRequest: undefined,
				telemetryProperties: {
					requestId: request.headerRequestId,
				},
				useFetcher,
				customMetadata: {
					aggressivenessLevel: opts.aggressivenessLevel,
					userHappinessScore: opts.userHappinessScore,
				},
			},
			cancellationToken,
		);

		telemetryBuilder.setResponse(fetchResultPromise.then((response) => ({ response, ttft })));
		logContext.setFullResponse(fetchResultPromise.then((response) => response.type === ChatFetchResponseType.Success ? response.value : undefined));

		const fetchRes = await Promise.race([firstTokenReceived.p, fetchResultPromise]);
		if (fetchRes && fetchRes.type !== ChatFetchResponseType.Success) {
			if (fetchRes.type === ChatFetchResponseType.NotFound &&
				!this.forceUseDefaultModel // if we haven't already forced using the default model; otherwise, this could cause an infinite loop
			) {
				this.forceUseDefaultModel = true;
				return yield* this.doGetNextEdit(request, delaySession, tracer, logContext, cancellationToken, telemetryBuilder, opts.retryState); // use the same retry state
			}
			// diff-patch based model returns no choices if it has no edits to suggest
			if (fetchRes.type === ChatFetchResponseType.Unknown && fetchRes.reason === RESPONSE_CONTAINED_NO_CHOICES) {
				return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);
			}
			return mapChatFetcherErrorToNoNextEditReason(fetchRes);
		}

		fetchResultPromise
			.then((response) => {
				// this's a way to signal the edit-pushing code to know if the request failed and
				// 	it shouldn't push edits constructed from an erroneous response
				chatResponseFailure = response.type !== ChatFetchResponseType.Success ? response : undefined;
			})
			.catch((err: unknown) => {
				// in principle this shouldn't happen because ChatMLFetcher's fetchOne should not throw
				logContext.setError(ErrorUtils.fromUnknown(err));
				logContext.addLog(`ChatMLFetcher fetch call threw -- this's UNEXPECTED!`);
			}).finally(() => {
				logContext.setFetchEndTime();

				if (!firstTokenReceived.isSettled) {
					firstTokenReceived.complete();
				}

				fetchStreamSource.resolve();

				logContext.setResponse(responseSoFar);
			});

		const llmLinesStream = AsyncIterUtilsExt.splitLines(AsyncIterUtils.map(fetchStreamSource.stream, (chunk) => chunk.delta.text));

		// logging of times
		// removal of cursor tag if option is set
		const linesStream: AsyncIterable<string> = (async function* () {
			let i = 0;
			for await (const v of llmLinesStream) {
				const trace = `Line ${i++} emitted with latency ${fetchRequestStopWatch.elapsed()} ms`;
				tracer.trace(trace);

				yield opts.shouldRemoveCursorTagFromResponse
					? v.replaceAll(PromptTags.CURSOR, '')
					: v;
			}
		})();

		const isFromCursorJump = opts.retryState instanceof RetryState.Retrying && opts.retryState.reason === 'cursorJump';

		let cleanedLinesStream: AsyncIterable<string>;

		if (opts.responseFormat === xtabPromptOptions.ResponseFormat.EditWindowOnly) {
			cleanedLinesStream = linesStream;
		} else if (opts.responseFormat === xtabPromptOptions.ResponseFormat.EditWindowWithEditIntent ||
			opts.responseFormat === xtabPromptOptions.ResponseFormat.EditWindowWithEditIntentShort) {
			// Determine parse mode based on response format
			const parseMode = opts.responseFormat === xtabPromptOptions.ResponseFormat.EditWindowWithEditIntentShort
				? EditIntentParseMode.ShortName
				: EditIntentParseMode.Tags;

			// Parse the edit_intent from the response
			const { editIntent, remainingLinesStream, parseError } = await parseEditIntentFromStream(linesStream, tracer, parseMode);

			// Log the edit intent for telemetry
			telemetryBuilder.setEditIntent(editIntent);

			// Log parse errors for telemetry - this helps detect malformed model output during flights
			if (parseError) {
				telemetryBuilder.setEditIntentParseError(parseError);
			}

			// Check if we should show this edit based on intent and aggressiveness
			if (!xtabPromptOptions.EditIntent.shouldShowEdit(editIntent, promptPieces.aggressivenessLevel)) {
				tracer.trace(`Filtered out edit due to edit intent "${editIntent}" with aggressiveness "${promptPieces.aggressivenessLevel}"`);
				return new NoNextEditReason.FilteredOut(`editIntent:${editIntent} aggressivenessLevel:${promptPieces.aggressivenessLevel}`);
			}

			cleanedLinesStream = remainingLinesStream;
		} else if (opts.responseFormat === xtabPromptOptions.ResponseFormat.CustomDiffPatch) {
			const activeDoc = request.getActiveDocument();
			const currentDocument = promptPieces.currentDocument;
			const lastLine = currentDocument.lines[clippedTaggedCurrentDoc.keptRange.endExclusive - 1];
			const lastLineLength = lastLine.length;
			const pseudoEditWindow = currentDocument.transformer.getOffsetRange(new Range(clippedTaggedCurrentDoc.keptRange.start + 1, 1, clippedTaggedCurrentDoc.keptRange.endExclusive, lastLineLength + 1));
			return yield* XtabCustomDiffPatchResponseHandler.handleResponse(
				linesStream,
				currentDocument,
				activeDoc.id,
				activeDoc.workspaceRoot,
				pseudoEditWindow,
				tracer,
				() => chatResponseFailure ? mapChatFetcherErrorToNoNextEditReason(chatResponseFailure) : undefined,
			);
		} else if (opts.responseFormat === xtabPromptOptions.ResponseFormat.UnifiedWithXml) {
			const linesIter = linesStream[Symbol.asyncIterator]();
			const firstLine = await linesIter.next();

			if (chatResponseFailure !== undefined) { // handle fetch failure
				return new NoNextEditReason.Unexpected(ErrorUtils.fromUnknown(chatResponseFailure));
			}

			if (firstLine.done) { // no lines in response -- unexpected case but take as no suggestions
				return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);
			}

			const trimmedLines = firstLine.value.trim();

			if (trimmedLines === ResponseTags.NO_CHANGE.start) {
				return yield* this.doGetNextEditsWithCursorJump(request, modelServiceConfig, editWindow, promptPieces, delaySession, tracer, logContext, cancellationToken, telemetryBuilder, opts.retryState);
			}

			if (trimmedLines === ResponseTags.INSERT.start) {
				const lineWithCursorContinued = await linesIter.next();
				if (lineWithCursorContinued.done || lineWithCursorContinued.value.includes(ResponseTags.INSERT.end)) {
					return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);
				}
				const cursorColumnOffsetZeroBased = promptPieces.currentDocument.cursorPosition.column - 1;
				const edit = new LineReplacement(
					new LineRange(editWindowLineRange.start + cursorOriginalLinesOffset + 1 /* 0-based to 1-based */, editWindowLineRange.start + cursorOriginalLinesOffset + 2),
					[editWindowLines[cursorOriginalLinesOffset].slice(0, cursorColumnOffsetZeroBased) + lineWithCursorContinued.value + editWindowLines[cursorOriginalLinesOffset].slice(cursorColumnOffsetZeroBased)]
				);
				yield { edit, isFromCursorJump, window: editWindow, originalWindow: originalEditWindow, targetDocument };

				const lines: string[] = [];
				let v = await linesIter.next();
				while (!v.done) {
					if (v.value.includes(ResponseTags.INSERT.end)) {
						break;
					} else {
						lines.push(v.value);
					}
					v = await linesIter.next();
				}

				const line = editWindowLineRange.start + cursorOriginalLinesOffset + 2;
				yield {
					edit: new LineReplacement(
						new LineRange(line, line),
						lines
					),
					isFromCursorJump,
					window: editWindow,
					originalWindow: originalEditWindow,
					targetDocument,
				};

				return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);
			}

			if (trimmedLines === ResponseTags.EDIT.start) {
				cleanedLinesStream = (async function* () {
					let v = await linesIter.next();
					while (!v.done) {
						if (v.value.includes(ResponseTags.EDIT.end)) {
							return;
						}
						yield v.value;
						v = await linesIter.next();
					}
				})();
			} else {
				return new NoNextEditReason.Unexpected(new Error(`unexpected tag ${trimmedLines}`));
			}
		} else if (opts.responseFormat === xtabPromptOptions.ResponseFormat.CodeBlock) {
			cleanedLinesStream = linesWithBackticksRemoved(linesStream);
		} else {
			assertNever(opts.responseFormat);
		}

		const diffOptions: ResponseProcessor.DiffParams = {
			emitFastCursorLineChange: ResponseProcessor.mapEmitFastCursorLineChange(this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderEmitFastCursorLineChange, this.expService)),
			nLinesToConverge: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabNNonSignificantLinesToConverge, this.expService),
			nSignificantLinesToConverge: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabNSignificantLinesToConverge, this.expService),
		};

		tracer.trace(`starting to diff stream against edit window lines with latency ${fetchRequestStopWatch.elapsed()} ms`);

		let i = 0;
		let hasBeenDelayed = false;
		try {
			for await (const edit of ResponseProcessor.diff(editWindowLines, cleanedLinesStream, cursorOriginalLinesOffset, diffOptions)) {

				tracer.trace(`ResponseProcessor streamed edit #${i} with latency ${fetchRequestStopWatch.elapsed()} ms`);

				const singleLineEdits: LineReplacement[] = [];
				if (edit.lineRange.startLineNumber === edit.lineRange.endLineNumberExclusive || // we don't want to run diff on insertion
					edit.newLines.length === 0 || // we don't want to run diff on deletion
					edit.lineRange.endLineNumberExclusive - edit.lineRange.startLineNumber === 1 && edit.newLines.length === 1 // we want to run diff on single line edits
				) {
					const singleLineEdit = new LineReplacement(new LineRange(edit.lineRange.startLineNumber + editWindowLineRange.start, edit.lineRange.endLineNumberExclusive + editWindowLineRange.start), edit.newLines);
					singleLineEdits.push(singleLineEdit);
				} else {
					const affectedOriginalLines = editWindowLines.slice(edit.lineRange.startLineNumber - 1, edit.lineRange.endLineNumberExclusive - 1).join('\n');

					const diffResult = await this.diffService.computeDiff(affectedOriginalLines, edit.newLines.join('\n'), {
						ignoreTrimWhitespace: false,
						maxComputationTimeMs: 0,
						computeMoves: false
					});
					tracer.trace(`Ran diff for #${i} with latency ${fetchRequestStopWatch.elapsed()} ms`);

					const translateByNLines = editWindowLineRange.start + edit.lineRange.startLineNumber;
					for (const change of diffResult.changes) {
						const singleLineEdit = new LineReplacement(
							new LineRange(
								translateByNLines + change.original.startLineNumber - 1,
								translateByNLines + change.original.endLineNumberExclusive - 1
							),
							edit.newLines.slice(change.modified.startLineNumber - 1, change.modified.endLineNumberExclusive - 1)
						);
						singleLineEdits.push(singleLineEdit);
					}
				}

				if (chatResponseFailure) { // do not emit edits if chat response failed
					break;
				}

				logContext.setResponse(responseSoFar);

				for (const singleLineEdit of singleLineEdits) {
					tracer.trace(`extracting edit #${i}: ${singleLineEdit.toString()}`);

					if (!hasBeenDelayed) { // delay only the first one
						hasBeenDelayed = true;
						const artificialDelay = this.determineArtificialDelayMs(delaySession, tracer, telemetryBuilder);
						if (artificialDelay) {
							await timeout(artificialDelay);
							tracer.trace(`Artificial delay of ${artificialDelay} ms completed`);
							if (cancellationToken.isCancellationRequested) {
								return new NoNextEditReason.GotCancelled('afterArtificialDelay');
							}
						}
					}

					yield { edit: singleLineEdit, isFromCursorJump, window: editWindow, originalWindow: originalEditWindow, targetDocument };
					i++;
				}
			}

			if (chatResponseFailure) {
				return mapChatFetcherErrorToNoNextEditReason(chatResponseFailure);
			}

			return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);

		} catch (err) {
			logContext.setError(err);
			// Properly handle the error by pushing it as a result
			return new NoNextEditReason.Unexpected(ErrorUtils.fromUnknown(err));
		}
	}

	private async *doGetNextEditsWithCursorJump(
		request: StatelessNextEditRequest,
		modelConfig: xtabPromptOptions.ModelConfiguration,
		editWindow: OffsetRange,
		promptPieces: PromptPieces,
		delaySession: DelaySession,
		tracer: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
		retryState: RetryState.t,
	): EditStreaming {

		const noSuggestions = new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);

		const nextCursorLinePrediction = this.nextCursorPredictor.determineEnablement(modelConfig.supportsNextCursorLinePrediction);

		if (nextCursorLinePrediction === undefined || retryState instanceof RetryState.Retrying) {
			return noSuggestions;
		}

		if (hasUserTypedSinceRequestStarted(request)) {
			tracer.trace('Skipping cursor prediction: user typed during request');
			return new NoNextEditReason.GotCancelled('beforeNextCursorPredictionFetchUserTyped');
		}

		const nextCursorLineR = await this.nextCursorPredictor.predictNextCursorPosition(promptPieces, tracer, telemetryBuilder, cancellationToken);

		if (cancellationToken.isCancellationRequested) {
			return new NoNextEditReason.GotCancelled('afterNextCursorPredictionFetch');
		}

		if (hasUserTypedSinceRequestStarted(request)) {
			tracer.trace('Skipping cursor prediction: user typed during prediction fetch');
			return new NoNextEditReason.GotCancelled('afterNextCursorPredictionFetchUserTyped');
		}

		if (nextCursorLineR.isError()) {
			tracer.trace(`Predicted next cursor line error: ${nextCursorLineR.err.message}`);
			telemetryBuilder.setNextCursorLineError(nextCursorLineR.err.message);
			return noSuggestions;
		}

		const prediction: CursorJumpPrediction = nextCursorLineR.val;

		if (prediction.kind === 'differentFile') {
			return yield* this.handleCrossFilePrediction(prediction, nextCursorLinePrediction, request, editWindow, promptPieces, delaySession, tracer, logContext, cancellationToken, telemetryBuilder);
		}

		const nextCursorLineZeroBased = prediction.lineNumber;

		const lineDistanceFromCursorLine = nextCursorLineZeroBased - promptPieces.currentDocument.cursorLineOffset;
		telemetryBuilder.setNextCursorLineDistance(lineDistanceFromCursorLine);
		telemetryBuilder.setNextCursorIsCrossFile(false);

		tracer.trace(`Predicted next cursor line: ${nextCursorLineZeroBased}`);

		if (nextCursorLineZeroBased >= promptPieces.currentDocument.lines.length) { // >= because the line index is zero-based
			tracer.trace(`Predicted next cursor line error: exceedsDocumentLines`);
			telemetryBuilder.setNextCursorLineError('exceedsDocumentLines');
			return noSuggestions;
		}

		if (promptPieces.editWindowLinesRange.contains(nextCursorLineZeroBased)) {
			tracer.trace(`Predicted next cursor line error: withinEditWindow`);
			telemetryBuilder.setNextCursorLineError('withinEditWindow');
			return noSuggestions;
		}

		const nextCursorLineOneBased = nextCursorLineZeroBased + 1;
		const nextCursorLine = promptPieces.activeDoc.documentAfterEditsLines.at(nextCursorLineZeroBased);

		const cursorPlacement = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionCursorPlacement, this.expService);
		const nextCursorColumn = XtabProvider.getNextCursorColumn(nextCursorLine, cursorPlacement);

		switch (nextCursorLinePrediction) {
			case NextCursorLinePrediction.Jump: {
				const nextCursorPosition = new Position(nextCursorLineOneBased, nextCursorColumn);
				return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow, nextCursorPosition);
			}
			case NextCursorLinePrediction.OnlyWithEdit: {
				const v = this.doGetNextEditWithSelection(
					request,
					new Range(nextCursorLineOneBased, nextCursorColumn, nextCursorLineOneBased, nextCursorColumn),
					delaySession,
					tracer,
					logContext,
					cancellationToken,
					telemetryBuilder,
					new RetryState.Retrying('cursorJump'),
					editWindow, // Pass the original edit window (before cursor jump) so the cache can serve the edit from both locations
				);
				return yield* v;
			}
			default: {
				assertNever(nextCursorLinePrediction);
			}
		}
	}

	private async *handleCrossFilePrediction(
		prediction: Extract<CursorJumpPrediction, { kind: 'differentFile' }>,
		nextCursorLinePrediction: NextCursorLinePrediction,
		request: StatelessNextEditRequest,
		editWindow: OffsetRange,
		promptPieces: PromptPieces,
		delaySession: DelaySession,
		tracer: ILogger,
		logContext: InlineEditRequestLogContext,
		cancellationToken: CancellationToken,
		telemetryBuilder: StatelessNextEditTelemetryBuilder,
	): EditStreaming {
		const workspaceRoot = promptPieces.activeDoc.workspaceRoot;
		if (!workspaceRoot && !isAbsolute(prediction.filePath)) {
			tracer.trace('Predicted cross-file cursor jump error: noWorkspaceRoot');
			telemetryBuilder.setNextCursorLineError('crossFile:noWorkspaceRoot');
			return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow);
		}

		const targetUri = isAbsolute(prediction.filePath)
			? URI.file(prediction.filePath)
			: URI.joinPath(workspaceRoot!, prediction.filePath);
		const targetDocumentId = DocumentId.create(targetUri.toString());
		const nextCursorLineOneBased = prediction.lineNumber + 1;
		const nextCursorPosition = new Position(nextCursorLineOneBased, 1);

		telemetryBuilder.setNextCursorIsCrossFile(true);
		tracer.trace(`Predicted cross-file cursor jump: ${prediction.filePath}:${prediction.lineNumber}`);

		switch (nextCursorLinePrediction) {
			case NextCursorLinePrediction.Jump: {
				return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow, nextCursorPosition, targetDocumentId);
			}
			case NextCursorLinePrediction.OnlyWithEdit: {
				let targetTextDoc;
				try {
					targetTextDoc = await this.workspaceService.openTextDocument(targetUri);
				} catch (err) {
					tracer.trace(`Failed to open target file for cross-file edit: ${ErrorUtils.fromUnknown(err).message}`);
					telemetryBuilder.setNextCursorLineError('crossFile:failedToOpenFile');
					return new NoNextEditReason.NoSuggestions(request.documentBeforeEdits, editWindow, nextCursorPosition, targetDocumentId);
				}

				if (cancellationToken.isCancellationRequested) {
					return new NoNextEditReason.GotCancelled('afterCrossFileOpenTextDocument');
				}

				if (hasUserTypedSinceRequestStarted(request)) {
					tracer.trace('Skipping cross-file edit: user typed during openTextDocument');
					return new NoNextEditReason.GotCancelled('afterCrossFileOpenTextDocumentUserTyped');
				}

				const targetContent = new StringText(targetTextDoc.getText());
				const syntheticDoc = new StatelessNextEditDocument(
					targetDocumentId,
					promptPieces.activeDoc.workspaceRoot,
					LanguageId.create(targetTextDoc.languageId),
					targetContent.getLines(),
					LineEdit.empty,
					targetContent,
					new Edits(StringEdit, []),
				);

				const syntheticRequest = new StatelessNextEditRequest(
					request.headerRequestId,
					request.opportunityId,
					targetContent,
					[syntheticDoc],
					0,
					request.xtabEditHistory,
					new DeferredPromise<Result<unknown, NoNextEditReason>>(),
					request.expandedEditWindowNLines,
					request.isSpeculative,
					request.logContext,
					request.recordingBookmark,
					request.recording,
					request.providerRequestStartDateTime,
				);

				return yield* this.doGetNextEditWithSelection(
					syntheticRequest,
					new Range(nextCursorLineOneBased, 1, nextCursorLineOneBased, 1),
					delaySession,
					tracer,
					logContext,
					cancellationToken,
					telemetryBuilder,
					new RetryState.Retrying('cursorJump'),
					editWindow,
				);
			}
			default: {
				assertNever(nextCursorLinePrediction);
			}
		}
	}

	private computeEditWindowLinesRange(currentDocument: CurrentDocument, request: StatelessNextEditRequest, tracer: ILogger, telemetry: StatelessNextEditTelemetryBuilder): OffsetRange {
		const currentDocLines = currentDocument.lines;
		const cursorLineOffset = currentDocument.cursorLineOffset;

		let nLinesAbove: number;
		{
			const useVaryingLinesAbove = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderUseVaryingLinesAbove, this.expService);

			if (useVaryingLinesAbove) {
				nLinesAbove = 0; // default

				for (let i = 0; i < 8; ++i) {
					const lineIdx = cursorLineOffset - i;
					if (lineIdx < 0) {
						break;
					}
					if (currentDocLines[lineIdx].trim() !== '') {
						nLinesAbove = i;
						break;
					}
				}
			} else {
				nLinesAbove = (this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesAbove, this.expService)
					?? N_LINES_ABOVE);
			}
		}

		let nLinesBelow;

		if (request.expandedEditWindowNLines !== undefined) {
			tracer.trace(`Using expanded nLinesBelow: ${request.expandedEditWindowNLines}`);
			nLinesBelow = request.expandedEditWindowNLines;
		} else {
			const overriddenNLinesBelow = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderNLinesBelow, this.expService);
			if (overriddenNLinesBelow !== undefined) {
				tracer.trace(`Using overridden nLinesBelow: ${overriddenNLinesBelow}`);
				nLinesBelow = overriddenNLinesBelow;
			} else {
				tracer.trace(`Using default nLinesBelow: ${N_LINES_BELOW}`);
				nLinesBelow = N_LINES_BELOW; // default
			}
		}

		let codeToEditStart = Math.max(0, cursorLineOffset - nLinesAbove);
		let codeToEditEndExcl = Math.min(currentDocLines.length, cursorLineOffset + nLinesBelow + 1);

		const maxMergeConflictLines = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabMaxMergeConflictLines, this.expService);
		if (maxMergeConflictLines) {
			const tentativeEditWindow = new OffsetRange(codeToEditStart, codeToEditEndExcl);
			const mergeConflictRange = findMergeConflictMarkersRange(currentDocLines, tentativeEditWindow, maxMergeConflictLines);
			if (mergeConflictRange) {
				const onlyMergeConflictLines = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabOnlyMergeConflictLines, this.expService);
				telemetry.setMergeConflictExpanded(onlyMergeConflictLines ? 'only' : 'normal');
				if (onlyMergeConflictLines) {
					tracer.trace(`Expanding edit window to include ONLY merge conflict markers: ${mergeConflictRange.toString()}`);
					codeToEditStart = mergeConflictRange.start;
					codeToEditEndExcl = mergeConflictRange.endExclusive;
				} else {
					tracer.trace(`Expanding edit window to include merge conflict markers: ${mergeConflictRange.toString()}; edit window range [${codeToEditStart}, ${codeToEditEndExcl})`);
					codeToEditEndExcl = Math.max(codeToEditEndExcl, mergeConflictRange.endExclusive);
				}
			}
		}

		return new OffsetRange(codeToEditStart, codeToEditEndExcl);
	}

	private determineModelConfiguration(activeDocument: StatelessNextEditDocument): { promptOptions: ModelConfig; modelServiceConfig: xtabPromptOptions.ModelConfiguration } {
		if (this.forceUseDefaultModel) {
			const defaultOptions = {
				modelName: undefined,
				...xtabPromptOptions.DEFAULT_OPTIONS,
			};
			const defaultModelConfig = this.modelService.defaultModelConfiguration();
			return {
				promptOptions: overrideModelConfig(defaultOptions, defaultModelConfig),
				modelServiceConfig: defaultModelConfig
			};
		}

		const sourcedModelConfig: ModelConfig = {
			modelName: undefined,
			promptingStrategy: undefined,
			currentFile: {
				maxTokens: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabCurrentFileMaxTokens, this.expService),
				includeTags: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabIncludeTagsInCurrentFile, this.expService),
				includeLineNumbers: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabIncludeLineNumbersInCurrentFile, this.expService),
				includeCursorTag: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabIncludeCursorTagInCurrentFile, this.expService),
				prioritizeAboveCursor: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabPrioritizeAboveCursor, this.expService)
			},
			pagedClipping: {
				pageSize: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabPageSize, this.expService)
			},
			recentlyViewedDocuments: {
				nDocuments: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabNRecentlyViewedDocuments, this.expService),
				maxTokens: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabRecentlyViewedDocumentsMaxTokens, this.expService),
				includeViewedFiles: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabIncludeViewedFiles, this.expService),
				includeLineNumbers: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabRecentlyViewedIncludeLineNumbers, this.expService),
				clippingStrategy: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabRecentlyViewedClippingStrategy, this.expService),
			},
			languageContext: determineLanguageContextOptions(activeDocument.languageId, {
				enabled: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabLanguageContextEnabled, this.expService),
				enabledLanguages: this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsXtabLanguageContextEnabledLanguages),
				enableAllContextProviders: this.configService.getExperimentBasedConfig<boolean>(ConfigKey.Advanced.DiagnosticsContextProvider, this.expService)
					|| this.configService.getExperimentBasedConfig<boolean>(ConfigKey.Advanced.ChatSessionContextProvider, this.expService),
				maxTokens: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabLanguageContextMaxTokens, this.expService),
				traitPosition: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabLanguageContextTraitsPosition, this.expService),
			}),
			diffHistory: {
				nEntries: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabDiffNEntries, this.expService),
				maxTokens: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabDiffMaxTokens, this.expService),
				onlyForDocsInPrompt: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabDiffOnlyForDocsInPrompt, this.expService),
				useRelativePaths: this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabDiffUseRelativePaths, this.expService),
			},
			lintOptions: undefined,
			includePostScript: true,
		};

		const selectedModelConfig = this.modelService.selectedModelConfiguration();
		// proxy /models doesn't know about includeTagsInCurrentFile field as of now, so hard code it to true for CopilotNesXtab strategy
		const modelConfig: xtabPromptOptions.ModelConfiguration = selectedModelConfig.promptingStrategy === xtabPromptOptions.PromptingStrategy.CopilotNesXtab
			? { ...selectedModelConfig, includeTagsInCurrentFile: true }
			: selectedModelConfig;
		return {
			promptOptions: overrideModelConfig(sourcedModelConfig, modelConfig),
			modelServiceConfig: modelConfig
		};
	}

	private getEndpointWithLogging(configuredModelName: string | undefined, logContext: InlineEditRequestLogContext, telemetry: StatelessNextEditTelemetryBuilder): ChatEndpoint {
		const endpoint = this.getEndpoint(configuredModelName);
		logContext.setEndpointInfo(typeof endpoint.urlOrRequestMetadata === 'string' ? endpoint.urlOrRequestMetadata : JSON.stringify(endpoint.urlOrRequestMetadata.type), endpoint.model);
		telemetry.setModelName(endpoint.model);
		return endpoint;
	}

	private getEndpoint(configuredModelName: string | undefined): ChatEndpoint {
		const url = this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderUrl);
		const apiKey = this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderApiKey);
		const hasOverriddenUrlAndApiKey = url !== undefined && apiKey !== undefined;

		if (hasOverriddenUrlAndApiKey) {
			return this.instaService.createInstance(XtabEndpoint, url, apiKey, configuredModelName);
		}

		return createProxyXtabEndpoint(this.instaService, configuredModelName);
	}

	private getPredictedOutput(doc: StatelessNextEditDocument, editWindowLines: string[], responseFormat: xtabPromptOptions.ResponseFormat): Prediction | undefined {
		return this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsXtabProviderUsePrediction, this.expService)
			? {
				type: 'content',
				content: getPredictionContents(doc, editWindowLines, responseFormat)
			}
			: undefined;
	}

	private async debounce(delaySession: DelaySession, retryState: RetryState.t, logger: ILogger, telemetry: StatelessNextEditTelemetryBuilder, cancellationToken: CancellationToken) {
		if (this.simulationCtx.isInSimulationTests) {
			return;
		}
		if (retryState instanceof RetryState.Retrying) {
			logger.trace('Skipping debounce on retry');
			return;
		}
		const debounceTime = delaySession.getDebounceTime();

		logger.trace(`Debouncing for ${debounceTime} ms`);
		telemetry.setDebounceTime(debounceTime);

		try {
			await timeout(debounceTime, cancellationToken);
		} catch {
			// CancellationToken fired; return early and let the caller check isCancellationRequested
		}
	}

	private determineArtificialDelayMs(delaySession: DelaySession, logger: ILogger, telemetry: StatelessNextEditTelemetryBuilder): number | undefined {
		if (this.simulationCtx.isInSimulationTests) {
			return;
		}
		const artificialDelay = delaySession.getArtificialDelay();

		if (artificialDelay <= 0) {
			return undefined;
		}

		logger.trace(`Enforcing artificial delay of ${artificialDelay} ms`);
		telemetry.setArtificialDelay(artificialDelay);

		return artificialDelay;
	}


	private filterEdit(activeDoc: StatelessNextEditDocument, edits: readonly LineReplacement[]): [filteredEdits: readonly LineReplacement[], filterNames: string[]] {
		type EditFilter = (edits: readonly LineReplacement[]) => { filterName: string; filteredEdits: readonly LineReplacement[] };

		const allowImportChanges = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsAllowImportChanges, this.expService);
		const filters: EditFilter[] = [
			(edits) => ({ filterName: 'IgnoreImportChangesAspect', filteredEdits: IgnoreImportChangesAspect.filterEdit(activeDoc, edits, allowImportChanges) }),
			(edits) => ({ filterName: 'IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges', filteredEdits: IgnoreEmptyLineAndLeadingTrailingWhitespaceChanges.filterEdit(activeDoc, edits) }),
		];

		if (!this.configService.getExperimentBasedConfig(ConfigKey.InlineEditsAllowWhitespaceOnlyChanges, this.expService)) {
			filters.push((edits) => ({ filterName: 'IgnoreWhitespaceOnlyChanges', filteredEdits: IgnoreWhitespaceOnlyChanges.filterEdit(activeDoc, edits) }));
		}

		const undoInsertionFiltering = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsUndoInsertionFiltering, this.expService);
		if (undoInsertionFiltering !== undefined) {
			let filter;
			switch (undoInsertionFiltering) {
				case 'v1':
					filter = editWouldDeleteWhatWasJustInserted;
					break;
				case 'v2':
					filter = editWouldDeleteWhatWasJustInserted2;
					break;
				default:
					assertNever(undoInsertionFiltering);
			}
			filters.push((edits) => ({ filterName: `UndoInsertionFiltering:${undoInsertionFiltering}`, filteredEdits: filter(activeDoc, new LineEdit(edits)) ? [] : edits }));
		}

		const substringsToFilterOut = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsFilterOutEditsWithSubstrings, this.expService);
		if (substringsToFilterOut) {
			const substrings = substringsToFilterOut
				.split(',')
				.map(s => s.trim())
				.filter(s => s.length > 0);
			filters.push((edits) => ({ filterName: 'FilterOutEditsWithSubstrings', filteredEdits: filterOutEditsWithSubstrings(edits, substrings) }));
		}

		return filters.reduce<[readonly LineReplacement[], string[]]>(([filteredEdits, filterNames], filter) => {
			const result = filter(filteredEdits);
			if (result.filteredEdits.length === filteredEdits.length) {
				return [filteredEdits, filterNames];
			}
			return [result.filteredEdits, [...filterNames, result.filterName]];
		}, [edits, []]);
	}

	public static getNextCursorColumn(nextCursorLine: string | undefined, cursorPlacement: NextCursorLinePredictionCursorPlacement): number {
		let nextCursorColumn: number;
		switch (cursorPlacement) {
			case NextCursorLinePredictionCursorPlacement.BeforeLine:
				nextCursorColumn = (nextCursorLine?.match(/^(\s*)/)?.at(1)?.length ?? 0) + 1;
				break;
			case NextCursorLinePredictionCursorPlacement.AfterLine:
				nextCursorColumn = (nextCursorLine?.length ?? 0) + 1;
				break;
			default:
				assertNever(cursorPlacement);
		}
		return nextCursorColumn;
	}
}

export function filterOutEditsWithSubstrings(edits: readonly LineReplacement[], substringsToFilterOut: string[]): readonly LineReplacement[] {
	return edits.filter(edit => {
		return edit.newLines.every(line => substringsToFilterOut.every(substring => !line.includes(substring)));
	});
}

export function computeAreaAroundEditWindowLinesRange(currentDocument: CurrentDocument): OffsetRange {
	const cursorLine = currentDocument.cursorLineOffset;
	const areaAroundStart = Math.max(0, cursorLine - N_LINES_AS_CONTEXT);
	const areaAroundEndExcl = Math.min(currentDocument.lines.length, cursorLine + N_LINES_AS_CONTEXT + 1);

	return new OffsetRange(areaAroundStart, areaAroundEndExcl);
}

export function mapChatFetcherErrorToNoNextEditReason(fetchError: ChatFetchError): NoNextEditReason {
	switch (fetchError.type) {
		case ChatFetchResponseType.Canceled:
			return new NoNextEditReason.GotCancelled('afterFetchCall');
		case ChatFetchResponseType.OffTopic:
		case ChatFetchResponseType.Filtered:
		case ChatFetchResponseType.PromptFiltered:
		case ChatFetchResponseType.Length:
		case ChatFetchResponseType.RateLimited:
		case ChatFetchResponseType.QuotaExceeded:
		case ChatFetchResponseType.ExtensionBlocked:
		case ChatFetchResponseType.AgentUnauthorized:
		case ChatFetchResponseType.AgentFailedDependency:
		case ChatFetchResponseType.InvalidStatefulMarker:
			return new NoNextEditReason.Uncategorized(ErrorUtils.fromUnknown(fetchError));
		case ChatFetchResponseType.BadRequest:
		case ChatFetchResponseType.NotFound:
		case ChatFetchResponseType.Failed:
		case ChatFetchResponseType.NetworkError:
		case ChatFetchResponseType.Unknown:
			return new NoNextEditReason.FetchFailure(ErrorUtils.fromUnknown(fetchError));
	}
}

export function overrideModelConfig(modelConfig: ModelConfig, overridingConfig: xtabPromptOptions.ModelConfiguration): ModelConfig {
	return {
		...modelConfig,
		modelName: overridingConfig.modelName,
		promptingStrategy: overridingConfig.promptingStrategy,
		includePostScript: overridingConfig.includePostScript ?? modelConfig.includePostScript,
		currentFile: {
			...modelConfig.currentFile,
			...overridingConfig.currentFile,
			includeTags: overridingConfig.includeTagsInCurrentFile,
		},
		recentlyViewedDocuments: { ...modelConfig.recentlyViewedDocuments, ...overridingConfig.recentlyViewedDocuments },
		lintOptions: overridingConfig.lintOptions
			? mergeLintOptions(modelConfig.lintOptions, overridingConfig.lintOptions)
			: modelConfig.lintOptions,
	};
}

const DEFAULT_XTAB_PROVIDER_LINT_OPTIONS: xtabPromptOptions.LintOptions = {
	...xtabPromptOptions.DEFAULT_CURSOR_PREDICTION_LINT_OPTIONS,
	maxLineDistance: 10,
};

function mergeLintOptions(base: xtabPromptOptions.LintOptions | undefined, override: Partial<xtabPromptOptions.LintOptions>): xtabPromptOptions.LintOptions {
	const resolved = base ?? DEFAULT_XTAB_PROVIDER_LINT_OPTIONS;
	return { ...resolved, ...override };
}

export function pickSystemPrompt(promptingStrategy: xtabPromptOptions.PromptingStrategy | undefined): string {
	switch (promptingStrategy) {
		case xtabPromptOptions.PromptingStrategy.UnifiedModel:
			return unifiedModelSystemPrompt;
		case xtabPromptOptions.PromptingStrategy.Codexv21NesUnified:
		case xtabPromptOptions.PromptingStrategy.SimplifiedSystemPrompt:
			return simplifiedPrompt;
		case xtabPromptOptions.PromptingStrategy.PatchBased:
		case xtabPromptOptions.PromptingStrategy.PatchBased01:
		case xtabPromptOptions.PromptingStrategy.PatchBased02:
		case xtabPromptOptions.PromptingStrategy.Xtab275:
		case xtabPromptOptions.PromptingStrategy.XtabAggressiveness:
		case xtabPromptOptions.PromptingStrategy.Xtab275Aggressiveness:
		case xtabPromptOptions.PromptingStrategy.Xtab275EditIntent:
		case xtabPromptOptions.PromptingStrategy.Xtab275EditIntentShort:
			return xtab275SystemPrompt;
		case xtabPromptOptions.PromptingStrategy.Nes41Miniv3:
			return nes41Miniv3SystemPrompt;
		case xtabPromptOptions.PromptingStrategy.CopilotNesXtab:
		case undefined:
			return systemPromptTemplate;
		default:
			assertNever(promptingStrategy);
	}
}

export function determineLanguageContextOptions(languageId: LanguageId, { enabled, enabledLanguages, maxTokens, enableAllContextProviders, traitPosition }: { enabled: boolean; enabledLanguages: LanguageContextLanguages; maxTokens: number; enableAllContextProviders: boolean; traitPosition: 'before' | 'after' }): LanguageContextOptions {
	if (languageId in enabledLanguages) {
		return { enabled: enabledLanguages[languageId], maxTokens, traitPosition };
	}

	if (enableAllContextProviders) {
		return { enabled: true, maxTokens, traitPosition };
	}

	return { enabled, maxTokens, traitPosition };
}

export function getPredictionContents(doc: StatelessNextEditDocument, editWindowLines: readonly string[], responseFormat: xtabPromptOptions.ResponseFormat): string {
	if (responseFormat === xtabPromptOptions.ResponseFormat.UnifiedWithXml) {
		return ['<EDIT>', ...editWindowLines, '</EDIT>'].join('\n');
	} else if (responseFormat === xtabPromptOptions.ResponseFormat.EditWindowOnly) {
		return editWindowLines.join('\n');
	} else if (responseFormat === xtabPromptOptions.ResponseFormat.EditWindowWithEditIntent) {
		// For EditWindowWithIntent, we predict the edit intent as high (most likely case) followed by the code
		return ['<|edit_intent|>high<|/edit_intent|>', ...editWindowLines].join('\n');
	} else if (responseFormat === xtabPromptOptions.ResponseFormat.EditWindowWithEditIntentShort) {
		// For EditWindowWithIntentShort, we predict 'H' (high) followed by the code
		return ['H', ...editWindowLines].join('\n');
	} else if (responseFormat === xtabPromptOptions.ResponseFormat.CodeBlock) {
		return ['```', ...editWindowLines, '```'].join('\n');
	} else if (responseFormat === xtabPromptOptions.ResponseFormat.CustomDiffPatch) {
		const workspacePath = doc.workspaceRoot?.path;
		const workspaceRelativeDocPath = toUniquePath(doc.id, workspacePath);
		return `${workspaceRelativeDocPath}:`;
	} else {
		assertNever(responseFormat);
	}
}

export interface ParseEditIntentResult {
	editIntent: xtabPromptOptions.EditIntent;
	remainingLinesStream: AsyncIterable<string>;
	parseError?: string;
}

/**
 * Mode for parsing edit intent from the model response.
 */
export enum EditIntentParseMode {
	/** Parse using XML-style tags: <|edit_intent|>value<|/edit_intent|> */
	Tags = 'tags',
	/** Parse using short names on the first line: N|L|M|H */
	ShortName = 'shortName',
}

/**
 * Parses the edit_intent from the first line of the response stream.
 * The edit_intent MUST be on the first line, otherwise it's treated as not provided.
 * Returns the parsed EditIntent and a new stream with the remaining content.
 *
 * Supports two modes:
 * - Tags (default): <|edit_intent|>low|medium|high|no_edit<|/edit_intent|>
 * - ShortName: N|L|M|H on the first line
 *
 * @param linesStream The stream of lines from the model response
 * @param tracer Logger for tracing
 * @param mode The parse mode (Tags or ShortName), defaults to Tags
 */
export async function parseEditIntentFromStream(
	linesStream: AsyncIterable<string>,
	tracer: ILogger,
	mode: EditIntentParseMode = EditIntentParseMode.Tags,
): Promise<ParseEditIntentResult> {
	if (mode === EditIntentParseMode.ShortName) {
		return parseEditIntentFromStreamShortName(linesStream, tracer);
	}

	return parseEditIntentFromStreamTags(linesStream, tracer);
}

/**
 * Parses the edit_intent using short name format (N|L|M|H on first line).
 */
async function parseEditIntentFromStreamShortName(
	linesStream: AsyncIterable<string>,
	tracer: ILogger,
): Promise<ParseEditIntentResult> {
	let editIntent: xtabPromptOptions.EditIntent = xtabPromptOptions.EditIntent.High; // Default to high (always show) if no short name found
	let parseError: string | undefined;

	const linesIter = linesStream[Symbol.asyncIterator]();
	const firstLineResult = await linesIter.next();

	if (firstLineResult.done) {
		// Empty stream
		parseError = 'emptyResponse';
		tracer.warn(`Empty response stream, no edit_intent short name found`);
		const remainingLinesStream: AsyncIterable<string> = (async function* () { })();
		return { editIntent, remainingLinesStream, parseError };
	}

	const firstLine = firstLineResult.value.trim();

	// Check if the first line is a single character short name
	const parsedIntent = xtabPromptOptions.EditIntent.fromShortName(firstLine);

	if (parsedIntent !== undefined) {
		editIntent = parsedIntent;
		tracer.trace(`Parsed edit_intent short name from first line: "${firstLine}" -> ${editIntent}`);

		// Create a new stream with the remaining lines (excluding the short name line)
		const remainingLinesStream: AsyncIterable<string> = (async function* () {
			let next = await linesIter.next();
			while (!next.done) {
				yield next.value;
				next = await linesIter.next();
			}
		})();

		return { editIntent, remainingLinesStream, parseError };
	}

	// Short name not found or invalid
	parseError = `unknownIntentValue:${firstLine}`;

	tracer.warn(`Edit intent parse error: ${parseError} (using Xtab275EditIntentShort prompting strategy). ` +
		`Defaulting to High (always show). First line was: "${firstLine.substring(0, 100)}..."`);

	// Return the first line plus the rest of the stream
	const remainingLinesStream: AsyncIterable<string> = (async function* () {
		yield firstLineResult.value; // Use original value, not trimmed
		let next = await linesIter.next();
		while (!next.done) {
			yield next.value;
			next = await linesIter.next();
		}
	})();

	return { editIntent, remainingLinesStream, parseError };
}

/**
 * Parses the edit_intent tag from the first line of the response stream (original tag-based format).
 */
async function parseEditIntentFromStreamTags(
	linesStream: AsyncIterable<string>,
	tracer: ILogger,
): Promise<ParseEditIntentResult> {
	const EDIT_INTENT_START_TAG = '<|edit_intent|>';
	const EDIT_INTENT_END_TAG = '<|/edit_intent|>';

	let editIntent: xtabPromptOptions.EditIntent = xtabPromptOptions.EditIntent.High; // Default to high (always show) if no tag found
	let parseError: string | undefined;

	const linesIter = linesStream[Symbol.asyncIterator]();
	const firstLineResult = await linesIter.next();

	if (firstLineResult.done) {
		// Empty stream
		parseError = 'emptyResponse';
		tracer.warn(`Empty response stream, no edit_intent tag found`);
		const remainingLinesStream: AsyncIterable<string> = (async function* () { })();
		return { editIntent, remainingLinesStream, parseError };
	}

	const firstLine = firstLineResult.value;

	// Check if the first line contains the complete edit_intent tag
	const startIdx = firstLine.indexOf(EDIT_INTENT_START_TAG);
	const endIdx = firstLine.indexOf(EDIT_INTENT_END_TAG);

	if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
		// Found complete tag on first line
		const intentValue = firstLine.substring(
			startIdx + EDIT_INTENT_START_TAG.length,
			endIdx
		).trim().toLowerCase();

		// Check if it's a known intent value
		const knownIntentValues = ['no_edit', 'low', 'medium', 'high'];
		if (!knownIntentValues.includes(intentValue)) {
			parseError = `unknownIntentValue:${intentValue}`;
			tracer.warn(`Unknown edit_intent value: "${intentValue}", defaulting to High`);
		}

		editIntent = xtabPromptOptions.EditIntent.fromString(intentValue);
		tracer.trace(`Parsed edit_intent from first line: "${intentValue}" -> ${editIntent}`);

		// Calculate remaining content after the end tag on the first line
		const afterEndTag = firstLine.substring(endIdx + EDIT_INTENT_END_TAG.length);

		// Create a new stream that first yields remaining content from first line, then continues
		const remainingLinesStream: AsyncIterable<string> = (async function* () {
			// Only yield remaining content from first line if non-empty
			if (afterEndTag.trim() !== '') {
				yield afterEndTag;
			}
			// Continue with rest of the stream
			let next = await linesIter.next();
			while (!next.done) {
				yield next.value;
				next = await linesIter.next();
			}
		})();

		return { editIntent, remainingLinesStream, parseError };
	}

	// Determine the parse error type
	if (startIdx !== -1 && endIdx === -1) {
		// Start tag found but no end tag - malformed (possibly split across lines)
		parseError = 'malformedTag:startWithoutEnd';
	} else if (startIdx === -1 && endIdx !== -1) {
		// End tag found but no start tag - malformed
		parseError = 'malformedTag:endWithoutStart';
	} else {
		// No tag found at all
		parseError = 'noTagFound';
	}

	tracer.warn(`Edit intent parse error: ${parseError} (using Xtab275EditIntent prompting strategy). ` +
		`Defaulting to High (always show). First line was: "${firstLine.substring(0, 100)}..."`);

	// Return the first line plus the rest of the stream
	const remainingLinesStream: AsyncIterable<string> = (async function* () {
		yield firstLine;
		let next = await linesIter.next();
		while (!next.done) {
			yield next.value;
			next = await linesIter.next();
		}
	})();

	return { editIntent, remainingLinesStream, parseError };
}

/**
 * Finds the range of lines containing merge conflict markers within a specified edit window.
 *
 * @param lines - Array of strings representing the lines of text to search through
 * @param editWindowRange - The range within which to search for merge conflict markers
 * @param maxMergeConflictLines - Maximum number of lines to search for conflict markers
 * @returns An OffsetRange object representing the start and end of the conflict markers, or undefined if not found
 */
export function findMergeConflictMarkersRange(lines: string[], editWindowRange: OffsetRange, maxMergeConflictLines: number): OffsetRange | undefined {
	for (let i = editWindowRange.start; i < Math.min(lines.length, editWindowRange.endExclusive); ++i) {
		if (!lines[i].startsWith('<<<<<<<')) {
			continue;
		}

		// found start of merge conflict markers -- now find the end
		for (let j = i + 1; j < lines.length && (j - i) < maxMergeConflictLines; ++j) {
			if (lines[j].startsWith('>>>>>>>')) {
				return new OffsetRange(i, j + 1 /* because endExclusive */);
			}
		}
	}
	return undefined;
}
