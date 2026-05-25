/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { ChatFetchResponseType, ChatLocation } from '../../../platform/chat/common/commonTypes';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { ChatEndpoint } from '../../../platform/endpoint/node/chatEndpoint';
import { NextCursorLinePrediction } from '../../../platform/inlineEdits/common/dataTypes/nextCursorLinePrediction';
import * as xtabPromptOptions from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { DEFAULT_CURSOR_PREDICTION_LINT_OPTIONS, parseLintOptionString } from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { StatelessNextEditTelemetryBuilder } from '../../../platform/inlineEdits/common/statelessNextEditProvider';
import { ILanguageDiagnosticsService } from '../../../platform/languages/common/languageDiagnosticsService';
import { ILogger } from '../../../platform/log/common/logService';
import { OptionalChatRequestParams } from '../../../platform/networking/common/fetch';
import { IChatEndpoint } from '../../../platform/networking/common/networking';
import { IProxyModelsService } from '../../../platform/proxyModels/common/proxyModelsService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { backwardCompatSetting } from '../../../util/common/backwardCompatSetting';
import { ErrorUtils } from '../../../util/common/errors';
import { Result } from '../../../util/common/result';
import { TokenizerType } from '../../../util/common/tokenizer';
import { assertNever } from '../../../util/vs/base/common/assert';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { OffsetRange } from '../../../util/vs/editor/common/core/ranges/offsetRange';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LintErrors } from '../common/lintErrors';
import { constructTaggedFile, getUserPrompt, PromptPieces } from '../common/promptCrafting';
import { constructMessages } from './xtabUtils';

export type CursorJumpPrediction =
	| { readonly kind: 'sameFile'; readonly lineNumber: number }
	| { readonly kind: 'differentFile'; readonly filePath: string; readonly lineNumber: number };

const DEFAULT_CURSOR_JUMP_MODEL_NAME = 'copilot-suggestions-himalia-001';

export class XtabNextCursorPredictor {

	private isDisabled: boolean;

	constructor(
		private readonly computeTokens: (text: string) => number,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IConfigurationService private readonly configService: IConfigurationService,
		@IExperimentationService private readonly expService: IExperimentationService,
		@ILanguageDiagnosticsService private readonly langDiagService: ILanguageDiagnosticsService,
		@IEndpointProvider private readonly endpointProvider: IEndpointProvider,
		@IProxyModelsService private readonly proxyModelsService: IProxyModelsService,
	) {
		this.isDisabled = false;
	}

	public determineEnablement(supportsNextCursorLinePrediction?: boolean): NextCursorLinePrediction | undefined {
		if (this.isDisabled) {
			return undefined;
		}

		if (supportsNextCursorLinePrediction === false) {
			return undefined;
		}

		// the cast is for backward compatibility with older experiments
		const originalNextCursorLinePrediction = this.configService.getExperimentBasedConfig(ConfigKey.InlineEditsNextCursorPredictionEnabled, this.expService) as (NextCursorLinePrediction | boolean | undefined);

		switch (originalNextCursorLinePrediction) {
			case true:
				return NextCursorLinePrediction.OnlyWithEdit;

			case false:
			case undefined:
				return undefined;

			// for backward compatibility
			case NextCursorLinePrediction.OnlyWithEdit:
			case NextCursorLinePrediction.Jump:
				return NextCursorLinePrediction.OnlyWithEdit;

			default:
				assertNever(originalNextCursorLinePrediction);
		}
	}


	public async predictNextCursorPosition(promptPieces: PromptPieces, parentTracer: ILogger, telemetryBuilder: StatelessNextEditTelemetryBuilder | undefined, cancellationToken: CancellationToken): Promise<Result<CursorJumpPrediction, Error>> {

		const tracer = parentTracer.createSubLogger('predictNextCursorPosition');

		const systemMessage = `Your task is to predict the line number where the developer is most likely to make their next edit. If you jump in the current file, just output the line number. If you want to jump to another file, output the filepath (relative to workspace root), colon, then line number. If you don't think anywhere is a good next line jump target, just output the current line number of the cursor. Make sure to output no explanation, reasoning, extra spaces, etc.`;

		const maxTokens = this.configService.getExperimentBasedConfig(ConfigKey.Advanced.InlineEditsNextCursorPredictionCurrentFileMaxTokens, this.expService);

		const currentFileContentR = constructTaggedFile(
			promptPieces.currentDocument,
			promptPieces.editWindowLinesRange,
			promptPieces.areaAroundEditWindowLinesRange,
			{
				...promptPieces.opts,
				currentFile: {
					...promptPieces.opts.currentFile,
					maxTokens,
					includeTags: false,
				}
			},
			this.computeTokens,
			{
				includeLineNumbers: {
					areaAroundCodeToEdit: xtabPromptOptions.IncludeLineNumbersOption.None,
					currentFileContent: xtabPromptOptions.IncludeLineNumbersOption.WithSpaceAfter
				}
			}
		);

		if (currentFileContentR.isError()) {
			tracer.trace(`Failed to construct tagged file: ${currentFileContentR.err}`);
			return Result.fromString(currentFileContentR.err);
		}

		const { clippedTaggedCurrentDoc, areaAroundCodeToEdit } = currentFileContentR.val;

		// Get lint diagnostics if enabled for cursor prediction
		const lintOptions = this.determineLintOptions();
		const lintErrors = new LintErrors(promptPieces.activeDoc.id, promptPieces.currentDocument, this.langDiagService, promptPieces.xtabHistory);

		const includeLineNumbersInRecentSnippets = backwardCompatSetting<boolean, xtabPromptOptions.IncludeLineNumbersOption>(
			this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionRecentSnippetsIncludeLineNumbers, this.expService),
			(oldValue) => {
				if (typeof oldValue === 'boolean') {
					return oldValue ? xtabPromptOptions.IncludeLineNumbersOption.WithSpaceAfter : xtabPromptOptions.IncludeLineNumbersOption.None;
				}
				return oldValue;
			}
		);

		const newPromptPieces = new PromptPieces(
			promptPieces.currentDocument,
			promptPieces.editWindowLinesRange,
			promptPieces.areaAroundEditWindowLinesRange,
			promptPieces.activeDoc,
			promptPieces.xtabHistory,
			clippedTaggedCurrentDoc.lines,
			areaAroundCodeToEdit,
			promptPieces.langCtx,
			promptPieces.aggressivenessLevel,
			lintErrors,
			this.computeTokens,
			{
				...promptPieces.opts,
				includePostScript: false,
				lintOptions,
				recentlyViewedDocuments: {
					...promptPieces.opts.recentlyViewedDocuments,
					includeLineNumbers: includeLineNumbersInRecentSnippets,
				},
			},
		);

		const { prompt: userMessage } = getUserPrompt(newPromptPieces);

		const messages = constructMessages({
			systemMsg: systemMessage,
			userMsg: userMessage
		});

		telemetryBuilder?.setCursorJumpPrompt(messages);

		const modelName = this.determineModelName();
		telemetryBuilder?.setCursorJumpModelName(modelName);

		const resolvedEndpoint = await this.resolveEndpoint(modelName, tracer);
		if (!resolvedEndpoint) {
			return Result.fromString('endpointNotResolved');
		}
		const { endpoint, usesResponsesApi } = resolvedEndpoint;

		const secretKey = this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionApiKey);

		const maxResponseTokens = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionMaxResponseTokens, this.expService);

		let requestOptions: OptionalChatRequestParams = {
			// Responses API models include reasoning tokens in max_output_tokens,
			// so we need a larger budget to leave room for actual output.
			max_tokens: usesResponsesApi ? Math.max(maxResponseTokens, 2048) : maxResponseTokens,
		};

		if (secretKey) {
			requestOptions = { ...requestOptions, secretKey };
		}

		const response = await endpoint.makeChatRequest2(
			{
				messages,
				debugName: 'nes.nextCursorPosition',
				finishedCb: undefined,
				location: ChatLocation.Other,
				requestOptions,
			},
			cancellationToken,
		);

		if (response.type !== ChatFetchResponseType.Success) {
			if (response.type === ChatFetchResponseType.NotFound) {
				tracer.trace('Next cursor position prediction endpoint not found; disabling predictor for current session.');
				this.isDisabled = true;
			}
			return Result.fromString(`fetchError:${response.type}`);
		}

		try {
			telemetryBuilder?.setCursorJumpResponse(response.value);
			const trimmed = response.value.trim();
			return this.parseResponse(trimmed, clippedTaggedCurrentDoc.keptRange);
		} catch (err: unknown) {
			tracer.trace(`Failed to parse predicted line number from response '${response.value}': ${err}`);
			return Result.fromString(`failedToParseLine:"${response.value}". Error ${ErrorUtils.fromUnknown(err).message}`);
		}
	}

	private async resolveEndpoint(modelName: string, tracer: ILogger): Promise<{ endpoint: IChatEndpoint; usesResponsesApi: boolean } | undefined> {
		const useEndpointProvider = this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionUseEndpointProvider);
		if (useEndpointProvider) {
			const allEndpoints = await this.endpointProvider.getAllChatEndpoints();
			const endpoint = allEndpoints.find(e => e.model === modelName || e.family === modelName);
			if (!endpoint) {
				tracer.trace(`Could not find endpoint for model '${modelName}' via endpoint provider`);
				return undefined;
			}
			const usesResponsesApi = endpoint.apiType === 'responses';
			return { endpoint, usesResponsesApi };
		}

		const url = this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionUrl);
		return {
			endpoint: this.instaService.createInstance(ChatEndpoint, {
				id: modelName,
				name: 'nes.nextCursorPosition',
				vendor: modelName,
				urlOrRequestMetadata: url ? url : { type: RequestType.ProxyChatCompletions },
				model_picker_enabled: false,
				is_chat_default: false,
				is_chat_fallback: false,
				version: '',
				capabilities: {
					type: 'chat',
					family: '',
					tokenizer: TokenizerType.CL100K,
					limits: undefined,
					supports: {
						parallel_tool_calls: false,
						tool_calls: false,
						streaming: true,
						vision: false,
						prediction: false,
						thinking: false
					}
				},
			}),
			usesResponsesApi: false,
		};
	}

	private determineModelName(): string {
		// Priority: experiment-configured model name, then the first `CursorJumpChat`
		// model advertised by the `/models` endpoint, then a hard-coded fallback.
		return this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionModelName, this.expService)
			?? this.proxyModelsService.cursorJumpModels?.[0]?.name
			?? DEFAULT_CURSOR_JUMP_MODEL_NAME;
	}

	private determineLintOptions(): xtabPromptOptions.LintOptions | undefined {
		const localLintOptions = this.configService.getConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionLintOptions);
		if (localLintOptions) {
			return { ...DEFAULT_CURSOR_PREDICTION_LINT_OPTIONS, ...localLintOptions };
		}

		const expLintOptions = this.configService.getExperimentBasedConfig(ConfigKey.TeamInternal.InlineEditsNextCursorPredictionLintOptionsString, this.expService);
		if (expLintOptions) {
			return parseLintOptionString(expLintOptions, DEFAULT_CURSOR_PREDICTION_LINT_OPTIONS);
		}

		return DEFAULT_CURSOR_PREDICTION_LINT_OPTIONS;
	}

	public parseResponse(rawResponse: string, keptRange: OffsetRange): Result<CursorJumpPrediction, Error> {
		const trimmed = stripThinkTags(rawResponse);

		// Try parsing as a plain line number (same-file jump)
		const lineNumber = parseInt(trimmed, 10);
		if (!isNaN(lineNumber) && String(lineNumber) === trimmed) {
			return this.parseSameFileLineNumber(lineNumber, keptRange);
		}

		// Try parsing as filepath:lineNumber (cross-file jump)
		const lastColonIdx = trimmed.lastIndexOf(':');
		if (lastColonIdx <= 0) {
			return Result.fromString(`gotNaN`);
		}

		const filePath = trimmed.substring(0, lastColonIdx);
		const lineNumberStr = trimmed.substring(lastColonIdx + 1);
		const crossFileLineNumber = parseInt(lineNumberStr, 10);

		if (isNaN(crossFileLineNumber) || crossFileLineNumber < 0) {
			return Result.fromString(`crossFileInvalidLineNumber`);
		}

		if (filePath.trim().length === 0) {
			return Result.fromString(`crossFileEmptyFilePath`);
		}

		return Result.ok({ kind: 'differentFile', filePath: filePath.trim(), lineNumber: crossFileLineNumber });
	}

	private parseSameFileLineNumber(lineNumber: number, keptRange: OffsetRange): Result<CursorJumpPrediction, Error> {
		if (lineNumber < 0) {
			return Result.fromString(`negativeLineNumber`);
		}
		if (lineNumber < keptRange.start || keptRange.endExclusive <= lineNumber) {
			return Result.fromString(`modelNotSeenLineNumber`);
		}
		return Result.ok({ kind: 'sameFile', lineNumber });
	}
}

/**
 * Strip `<think>...</think>` reasoning blocks emitted by thinking models.
 * Mirrors the post-processing logic specified by the model owners: remove
 * any complete think blocks, and drop any unterminated leading `<think>`
 * (which can happen when generation hits the max tokens limit).
 */
function stripThinkTags(text: string): string {
	let result = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
	if (result.trimStart().startsWith('<think>')) {
		result = '';
	}
	return result.trim();
}

