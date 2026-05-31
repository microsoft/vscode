/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService, ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { isSupportedLanguageId } from '../../../prompt/src/parse';
import { CompletionState } from '../completionState';
import { BlockMode } from '../config';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { FinishedCallback } from '../openai/fetch';
import { APIChoice } from '../openai/openai';
import { isEmptyBlockStartUtil, parsingBlockFinished } from '../prompt/parseBlock';
import { Prompt, PromptResponsePresent } from '../prompt/prompt';
import { telemetry, TelemetryData, TelemetryWithExp } from '../telemetry';
import { IPosition, LocationFactory, TextDocumentContents } from '../textDocument';
import { BlockPositionType, BlockTrimmer, getBlockPositionType } from './blockTrimmer';
import { appendToCache } from './cacheUtils';
import { ICompletionsCacheService } from './completionsCache';
import { ICompletionsBlockModeConfig } from './configBlockMode';
import { requestMultilineScore } from './multilineModel';
import { StreamedCompletionSplitter } from './streamedCompletionSplitter';

// p50 line length is 19 characters (p95 is 73)
// average token length is around 4 characters
// the below values have quite a bit of buffer while bringing the limit in significantly from 500
const maxSinglelineTokens = 20;

type GhostTextStrategy = {
	blockMode: BlockMode;
	requestMultiline: boolean;
	finishedCb: FinishedCallback;
	stop?: string[];
	maxTokens?: number;
};

function takeNLines(n: number): FinishedCallback {
	return (text: string): number | undefined => {
		// If the text is longer than n lines, return the offset.
		// Checks for n+1 lines because of the leading newline.
		const lines = text?.split('\n') ?? [];
		if (lines.length > n + 1) {
			return lines.slice(0, n + 1).join('\n').length;
		}
	};
}

export async function getGhostTextStrategy(
	accessor: ServicesAccessor,
	completionState: CompletionState,
	prefix: string,
	prompt: PromptResponsePresent,
	inlineSuggestion: boolean,
	hasAcceptedCurrentCompletion: boolean,
	preIssuedTelemetryData: TelemetryWithExp,
): Promise<GhostTextStrategy> {
	const instantiationService = accessor.get(IInstantiationService);
	const featuresService = accessor.get(ICompletionsFeaturesService);
	const blockModeConfig = accessor.get(ICompletionsBlockModeConfig);
	const multilineAfterAcceptLines = featuresService.multilineAfterAcceptLines(preIssuedTelemetryData);
	const blockMode = blockModeConfig.forLanguage(completionState.textDocument.detectedLanguageId, preIssuedTelemetryData);
	switch (blockMode) {
		case BlockMode.Server:
			// Override the server-side trimming after accepting a completion
			if (hasAcceptedCurrentCompletion) {
				return {
					blockMode: BlockMode.Parsing,
					requestMultiline: true,
					finishedCb: takeNLines(multilineAfterAcceptLines),
					stop: ['\n\n'],
					maxTokens: maxSinglelineTokens * multilineAfterAcceptLines,
				};
			}
			return {
				blockMode: BlockMode.Server,
				requestMultiline: true,
				finishedCb: _ => undefined,
			};
		case BlockMode.Parsing:
		case BlockMode.ParsingAndServer:
		case BlockMode.MoreMultiline:
		default: {
			// we shouldn't drop through to here, but in case we do, be explicit about the behaviour
			let requestMultiline: MultilineDetermination;
			try {
				requestMultiline = await instantiationService.invokeFunction(shouldRequestMultiline,
					blockMode,
					completionState.textDocument,
					completionState.position,
					inlineSuggestion,
					hasAcceptedCurrentCompletion,
					prompt
				);
			} catch (err) {
				// Fallback to non-multiline
				requestMultiline = { requestMultiline: false };
			}
			if (!hasAcceptedCurrentCompletion &&
				requestMultiline.requestMultiline &&
				featuresService.singleLineUnlessAccepted(preIssuedTelemetryData)) {
				requestMultiline.requestMultiline = false;
			}
			if (requestMultiline.requestMultiline) {
				// Note that `trailingWs` contains *any* trailing whitespace from the prompt, but the prompt itself
				// is only trimmed if the entire last line is whitespace.  We have to account for that here when we
				// check whether the block body is finished.
				let adjustedPosition;
				if (prompt.trailingWs.length > 0 && !prompt.prompt.prefix.endsWith(prompt.trailingWs)) {
					// Prompt was adjusted, so adjust the position to match
					adjustedPosition = LocationFactory.position(
						completionState.position.line,
						Math.max(completionState.position.character - prompt.trailingWs.length, 0)
					);
				} else {
					// Otherwise, just use the original position
					adjustedPosition = completionState.position;
				}
				return {
					blockMode: blockMode,
					requestMultiline: true,
					...instantiationService.invokeFunction(buildFinishedCallback,
						blockMode,
						completionState.textDocument,
						adjustedPosition,
						requestMultiline.blockPosition,
						prefix,
						true,
						prompt.prompt,
						preIssuedTelemetryData
					),
				};
			}
			// Override single-line to multiline after accepting a completion
			if (hasAcceptedCurrentCompletion) {
				const result: GhostTextStrategy = {
					blockMode: BlockMode.Parsing,
					requestMultiline: true,
					finishedCb: takeNLines(multilineAfterAcceptLines),
					stop: ['\n\n'],
					maxTokens: maxSinglelineTokens * multilineAfterAcceptLines,
				};
				if (blockMode === BlockMode.MoreMultiline) {
					result.blockMode = BlockMode.MoreMultiline;
				}
				return result;
			}
			// not multiline
			return {
				blockMode: blockMode,
				requestMultiline: false,
				...instantiationService.invokeFunction(buildFinishedCallback,
					blockMode,
					completionState.textDocument,
					completionState.position,
					requestMultiline.blockPosition,
					prefix,
					false,
					prompt.prompt,
					preIssuedTelemetryData
				),
			};
		}
	}
}

function buildFinishedCallback(
	accessor: ServicesAccessor,
	blockMode: BlockMode,
	document: TextDocumentContents,
	position: IPosition,
	positionType: BlockPositionType | undefined,
	prefix: string,
	multiline: boolean,
	prompt: Prompt,
	telemetryData: TelemetryWithExp
): { finishedCb: FinishedCallback; maxTokens?: number } {
	const featuresService = accessor.get(ICompletionsFeaturesService);
	const instantiationService = accessor.get(IInstantiationService);
	if (multiline && blockMode === BlockMode.MoreMultiline && BlockTrimmer.isSupported(document.detectedLanguageId)) {
		const lookAhead = positionType === BlockPositionType.EmptyBlock || positionType === BlockPositionType.BlockEnd
			? featuresService.longLookaheadSize(telemetryData)
			: featuresService.shortLookaheadSize(telemetryData);

		const completionsCacheService = accessor.get(ICompletionsCacheService);
		const finishedCb = instantiationService.createInstance(StreamedCompletionSplitter,
			prefix,
			document.detectedLanguageId,
			false,
			lookAhead,
			(extraPrefix: string, item: APIChoice) => {
				const cacheContext = {
					prefix: prefix + extraPrefix,
					prompt: { ...prompt, prefix: prompt.prefix + extraPrefix },
				};
				appendToCache(completionsCacheService, cacheContext, item);
			}
		).getFinishedCallback();

		return {
			finishedCb,
			maxTokens: featuresService.maxMultilineTokens(telemetryData),
		};
	}

	return { finishedCb: multiline ? parsingBlockFinished(document, position) : _ => undefined };
}

type MultilineDetermination = {
	requestMultiline: boolean;
	blockPosition?: BlockPositionType;
};

async function shouldRequestMultiline(
	accessor: ServicesAccessor,
	blockMode: BlockMode,
	document: TextDocumentContents,
	position: IPosition,
	inlineSuggestion: boolean,
	afterAccept: boolean,
	prompt: PromptResponsePresent
): Promise<MultilineDetermination> {

	// Parsing long files for multiline completions is slow, so we only do
	// it for files with less than 8000 lines
	if (document.lineCount >= 8000) {
		telemetry(
			accessor,
			'ghostText.longFileMultilineSkip',
			TelemetryData.createAndMarkAsIssued({
				languageId: document.detectedLanguageId,
				lineCount: String(document.lineCount),
				currentLine: String(position.line),
			})
		);
	} else {
		if (blockMode === BlockMode.MoreMultiline && BlockTrimmer.isSupported(document.detectedLanguageId)) {
			if (!afterAccept) {
				return { requestMultiline: false };
			}
			const blockPosition = await getBlockPositionType(document, position);
			return { requestMultiline: true, blockPosition };
		}

		const targetLanguagesNewLine = ['typescript', 'typescriptreact'];
		if (targetLanguagesNewLine.includes(document.detectedLanguageId)) {
			const newLine = isNewLine(position, document);
			if (newLine) {
				return { requestMultiline: true };
			}
		}
		let requestMultiline = false;
		if (!inlineSuggestion && isSupportedLanguageId(document.detectedLanguageId)) {
			// Can only check block-level nodes of languages we support
			requestMultiline = await isEmptyBlockStartUtil(document, position);
		} else if (inlineSuggestion && isSupportedLanguageId(document.detectedLanguageId)) {
			//If we are inline, check if we would suggest multiline for current position or if we would suggest a multiline completion if we were at the end of the line
			requestMultiline =
				(await isEmptyBlockStartUtil(document, position)) ||
				(await isEmptyBlockStartUtil(document, document.lineAt(position).range.end));
		}
		// If requestMultiline is false, for specific languages check multiline score
		if (!requestMultiline) {
			const requestMultiModelThreshold = 0.5;
			const targetLanguagesModel = ['javascript', 'javascriptreact', 'python'];
			if (targetLanguagesModel.includes(document.detectedLanguageId)) {
				// Call multiline model if not multiline and EXP flag is set.
				const multiModelScore = requestMultilineScore(prompt.prompt, document.detectedLanguageId);
				requestMultiline = multiModelScore > requestMultiModelThreshold;
			}
		}
		return { requestMultiline };
	}
	return { requestMultiline: false };
}

/** Checks if position is the beginning of an empty line (including indentation) */
function isNewLine(selectionPosition: IPosition, doc: TextDocumentContents): boolean {
	const line = doc.lineAt(selectionPosition);
	const lineTrimmed = line.text.trim();
	return lineTrimmed.length === 0;
}

