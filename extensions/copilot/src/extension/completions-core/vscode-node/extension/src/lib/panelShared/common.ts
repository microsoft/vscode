/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { IInstantiationService, type ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { createCompletionState } from '../../../../lib/src/completionState';
import { BlockMode } from '../../../../lib/src/config';
import { ICompletionsFeaturesService } from '../../../../lib/src/experiments/featuresService';
import { ICompletionsBlockModeConfig } from '../../../../lib/src/ghostText/configBlockMode';
import { ICompletionsLogTargetService, type Logger } from '../../../../lib/src/logger';
import { getEngineRequestInfo } from '../../../../lib/src/openai/config';
import { CompletionHeaders, CompletionRequestExtra, PostOptions } from '../../../../lib/src/openai/fetch';
import { APIChoice, FinishedCallback } from '../../../../lib/src/openai/openai';
import { contextIndentation, parsingBlockFinished } from '../../../../lib/src/prompt/parseBlock';
import { extractPrompt, Prompt } from '../../../../lib/src/prompt/prompt';
import { extractRepoInfoInBackground, MaybeRepoInfo } from '../../../../lib/src/prompt/repository';
import { telemetrizePromptLength, telemetry, TelemetryData, TelemetryWithExp } from '../../../../lib/src/telemetry';
import { IPosition, ITextDocument, LocationFactory, TextDocumentContents } from '../../../../lib/src/textDocument';
import { isSupportedLanguageId } from '../../../../prompt/src/parse';
import { Position } from '../../../../types/src';
import { ISolutionHandler, SolutionsStream, UnformattedSolution } from './panelTypes';

export const solutionCountTarget = 10;

export function panelPositionForDocument(document: TextDocumentContents, position: Position): IPosition {
	let returnPosition = position;
	const line = document.lineAt(position.line);
	if (!line.isEmptyOrWhitespace) {
		returnPosition = line.range.end;
	}
	return returnPosition;
}

/**
 * Trim trailing whitespace.
 */
export async function* trimChoices(choices: AsyncIterable<APIChoice>): AsyncIterable<APIChoice> {
	for await (const choice of choices) {
		const choiceCopy = { ...choice };
		choiceCopy.completionText = choiceCopy.completionText.trimEnd();
		yield choiceCopy;
	}
}

export class SolutionManager {
	private _savedTelemetryData?: TelemetryWithExp | undefined;
	readonly targetPosition = panelPositionForDocument(this.textDocument, this.startPosition);

	constructor(
		readonly textDocument: ITextDocument,
		public startPosition: IPosition,
		readonly cancellationToken: CancellationToken,
		readonly solutionCountTarget: number
	) { }

	get savedTelemetryData(): TelemetryWithExp | undefined {
		return this._savedTelemetryData;
	}

	set savedTelemetryData(data: TelemetryWithExp | undefined) {
		this._savedTelemetryData = data;
	}
}

export async function reportSolutions(
	nextSolutionPromise: Promise<SolutionsStream>,
	solutionHandler: ISolutionHandler
): Promise<void> {
	const nextSolution = await nextSolutionPromise;
	switch (nextSolution.status) {
		case 'Solution':
			await solutionHandler.onSolution(nextSolution.solution);
			await reportSolutions(nextSolution.next, solutionHandler);
			break;
		case 'FinishedNormally':
			await solutionHandler.onFinishedNormally();
			break;
		case 'FinishedWithError':
			await solutionHandler.onFinishedWithError(nextSolution.error);
			break;
	}
}

export async function generateSolutionsStream(
	cancellationToken: CancellationToken,
	solutions: AsyncIterator<UnformattedSolution>
): Promise<SolutionsStream> {
	if (cancellationToken.isCancellationRequested) {
		return { status: 'FinishedWithError', error: 'Cancelled' };
	}
	const nextResult = await solutions.next();
	if (nextResult.done === true) {
		return { status: 'FinishedNormally' };
	}
	return {
		status: 'Solution',
		solution: nextResult.value,
		next: generateSolutionsStream(cancellationToken, solutions),
	};
}

export function normalizeCompletionText(text: string): string {
	return text.replace(/\s+/g, '');
}

/**
 * Result of prompt processing setup
 */
export interface PromptSetupResult {
	prompt: Prompt;
	trailingWs: string;
	telemetryData: TelemetryWithExp;
	repoInfo: MaybeRepoInfo;
	ourRequestId: string;
}

/**
 * Sets up prompt extraction, telemetry, and handles common error cases.
 * Returns null if an error occurred that should terminate processing.
 */
export async function setupPromptAndTelemetry(
	accessor: ServicesAccessor,
	solutionManager: SolutionManager,
	source: 'open copilot' | 'open comparison',
	solutionsLogger: Logger,
	engineName?: string,
	comparisonRequestId?: string
): Promise<PromptSetupResult | SolutionsStream> {
	const position = solutionManager.targetPosition;
	const document = solutionManager.textDocument;

	const repoInfo = extractRepoInfoInBackground(accessor, document.uri);

	// Telemetry setup
	const ourRequestId = generateUuid();
	const tempTelemetry = TelemetryData.createAndMarkAsIssued(
		{
			headerRequestId: ourRequestId,
			languageId: document.detectedLanguageId,
			source,
		},
		{}
	);

	const featuresService = accessor.get(ICompletionsFeaturesService);
	const instantiationService = accessor.get(IInstantiationService);
	const logTarget = accessor.get(ICompletionsLogTargetService);
	// Update telemetry with experiment values
	solutionManager.savedTelemetryData = await featuresService
		.fetchTokenAndUpdateExPValuesAndAssignments(
			{ uri: document.uri, languageId: document.detectedLanguageId },
			tempTelemetry
		);

	// Add in comparison panel specific info
	if (engineName) {
		solutionManager.savedTelemetryData = solutionManager.savedTelemetryData!.extendedBy({
			engineName,
		});
	}
	if (comparisonRequestId) {
		solutionManager.savedTelemetryData = solutionManager.savedTelemetryData!.extendedBy({
			comparisonRequestId,
		});
	}

	// Extract prompt
	const promptResponse = await instantiationService.invokeFunction(extractPrompt,
		ourRequestId,
		createCompletionState(document, position),
		solutionManager.savedTelemetryData!
	);

	// Handle prompt extraction errors
	if (promptResponse.type === 'copilotContentExclusion') {
		return { status: 'FinishedNormally' };
	}
	if (promptResponse.type === 'contextTooShort') {
		return { status: 'FinishedWithError', error: 'Context too short' };
	}
	if (promptResponse.type === 'promptCancelled') {
		return { status: 'FinishedWithError', error: 'Prompt cancelled' };
	}
	if (promptResponse.type === 'promptTimeout') {
		return { status: 'FinishedWithError', error: 'Prompt timeout' };
	}
	if (promptResponse.type === 'promptError') {
		return { status: 'FinishedWithError', error: 'Prompt error' };
	}

	const prompt = promptResponse.prompt;
	const trailingWs = promptResponse.trailingWs;

	// Handle trailing whitespace adjustment
	if (trailingWs.length > 0) {
		solutionManager.startPosition = LocationFactory.position(
			solutionManager.startPosition.line,
			solutionManager.startPosition.character - trailingWs.length
		);
	}

	// Update telemetry with prompt information
	solutionManager.savedTelemetryData = solutionManager.savedTelemetryData!.extendedBy(
		{},
		{
			...telemetrizePromptLength(prompt),
			solutionCount: solutionManager.solutionCountTarget,
			promptEndPos: document.offsetAt(position),
		}
	);

	solutionsLogger.debug(logTarget, 'prompt:', prompt);
	instantiationService.invokeFunction(telemetry, 'solution.requested', solutionManager.savedTelemetryData);

	return {
		prompt,
		trailingWs,
		telemetryData: solutionManager.savedTelemetryData,
		repoInfo,
		ourRequestId,
	};
}

/**
 * Result of completion parameters setup
 */
export interface CompletionSetupResult {
	extra: CompletionRequestExtra;
	postOptions: PostOptions;
	finishedCb: FinishedCallback;
	engineInfo: { modelId: string; headers: CompletionHeaders };
}

/**
 * Sets up block mode, completion parameters, and finished callback.
 */
export function setupCompletionParams(
	accessor: ServicesAccessor,
	document: ITextDocument,
	position: IPosition,
	prompt: Prompt,
	solutionManager: SolutionManager,
	telemetryData: TelemetryWithExp
): CompletionSetupResult {
	// Compute block mode
	const blockMode = accessor.get(ICompletionsBlockModeConfig).forLanguage(document.detectedLanguageId, telemetryData);
	const isSupportedLanguage = isSupportedLanguageId(document.detectedLanguageId);

	const contextIndent = contextIndentation(document, position);
	const extra: CompletionRequestExtra = {
		language: document.detectedLanguageId,
		next_indent: contextIndent.next ?? 0,
		prompt_tokens: prompt.prefixTokens ?? 0,
		suffix_tokens: prompt.suffixTokens ?? 0,
	};

	const postOptions: PostOptions = {};
	if (blockMode === BlockMode.Parsing && !isSupportedLanguage) {
		postOptions['stop'] = ['\n\n', '\r\n\r\n'];
	}

	const engineInfo = getEngineRequestInfo(accessor, telemetryData);

	let finishedCb: FinishedCallback;

	switch (blockMode) {
		case BlockMode.Server:
			// Client knows the block is done when the completion is.
			finishedCb = () => undefined;
			// If requested at the top-level, don't trim at all.
			extra.force_indent = contextIndent.prev ?? -1;
			extra.trim_by_indentation = true;
			break;
		case BlockMode.ParsingAndServer:
			finishedCb = isSupportedLanguage
				? parsingBlockFinished(document, solutionManager.startPosition)
				: () => undefined;
			// If requested at the top-level, don't trim at all.
			extra.force_indent = contextIndent.prev ?? -1;
			extra.trim_by_indentation = true;
			break;
		case BlockMode.Parsing:
		default:
			finishedCb = isSupportedLanguage
				? parsingBlockFinished(document, solutionManager.startPosition)
				: () => undefined;
			break;
	}

	return {
		extra,
		postOptions,
		finishedCb,
		engineInfo,
	};
}