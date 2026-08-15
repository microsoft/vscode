/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { PromptMetadata } from '../../../prompt/src/components/components';
import { commentBlockAsSingles } from '../../../prompt/src/languageMarker';
import { PromptOptions } from '../../../prompt/src/prompt';
import { SimilarFilesOptions } from '../../../prompt/src/snippetInclusion/similarFiles';
import { TokenizerName } from '../../../prompt/src/tokenization';
import { CancellationToken as ICancellationToken } from '../../../types/src';
import { CompletionState } from '../completionState';
import { ICompletionsFeaturesService } from '../experiments/featuresService';
import { getNumberOfSnippets, getSimilarFilesOptions } from '../experiments/similarFileOptionsProvider';
import { getMaxSolutionTokens } from '../openai/openai';
import { TelemetryWithExp } from '../telemetry';
import { INotebookCell, INotebookDocument, IntelliSenseInsertion } from '../textDocument';
import { ICompletionsTextDocumentManagerService } from '../textDocumentManager';
import { ICompletionsPromptFactoryService } from './completionsPromptFactory/completionsPromptFactory';
import { ContextProviderTelemetry } from './contextProviderRegistry';
import { NeighboringFileType, considerNeighborFile } from './similarFiles/neighborFiles';

// The minimum number of prompt-eligible characters before we offer a completion
export const MIN_PROMPT_CHARS = 10;
export const MIN_PROMPT_EXCLUDED_LANGUAGE_IDS = ['scminput'];

export interface Prompt {
	prefix: string;
	suffix: string;
	context?: string[];
	prefixTokens?: number;
	suffixTokens?: number;
	isFimEnabled: boolean;
}

export interface PromptResponsePresent {
	type: 'prompt';
	prompt: Prompt;
	/**
	 * The prefix is sent to the model without trailing whitespace. However the trailing whitespace will
	 * be kept around to do position adjustments when applying the completion.
	 */
	trailingWs: string;
	computeTimeMs: number;
	// evaluate whether we need to keep this. If yes, populate it
	neighborSource: Map<NeighboringFileType, string[]>;
	metadata: PromptMetadata;
	contextProvidersTelemetry?: ContextProviderTelemetry[];
}

export interface ExtractPromptOptions {
	selectedCompletionInfo?: IntelliSenseInsertion;
	data?: unknown;
	tokenizer?: TokenizerName;
}

interface ContextTooShort {
	type: 'contextTooShort';
}
interface CopilotContentExclusion {
	type: 'copilotContentExclusion';
}
interface PromptError {
	type: 'promptError';
}
interface PromptCancelled {
	type: 'promptCancelled';
}

interface PromptTimeout {
	type: 'promptTimeout';
}

export const _contextTooShort: ContextTooShort = { type: 'contextTooShort' };
export const _copilotContentExclusion: CopilotContentExclusion = { type: 'copilotContentExclusion' };
export const _promptError: PromptError = { type: 'promptError' };
export const _promptCancelled: PromptCancelled = { type: 'promptCancelled' };
export const _promptTimeout: PromptTimeout = { type: 'promptTimeout' };
export type PromptResponse =
	| PromptResponsePresent
	| CopilotContentExclusion
	| ContextTooShort
	| PromptError
	| PromptCancelled
	| PromptTimeout;

export namespace PromptResponse {
	export function toString(response: PromptResponse): string {
		switch (response.type) {
			case 'prompt':
				return [
					{ header: 'PREFIX', content: response.prompt.prefix },
					{ header: 'SUFFIX', content: response.prompt.suffix },
					{ header: 'CONTEXT', content: (response.prompt.context || []).join('\n---\n') },
					{ header: 'FIM', content: 'Is Fim enabled: ' + response.prompt.isFimEnabled },
					{ header: 'TOKENS', content: `Prefix tokens: ${response.prompt.prefixTokens}\nSuffix tokens: ${response.prompt.suffixTokens}` },
					{ header: 'NEIGHBORS', content: Array.from(response.neighborSource.entries()).map(([key, value]) => `neighboring file type: ${key}\n--\n${value.join(', ')}`).join('\n') },
					{ header: 'METADATA', content: JSON.stringify(response.metadata, null, '\t') },
				]
					.map(section => `${section.header}\n---\n${section.content}\n---------------`)
					.join('\n');
			default:
				return JSON.stringify(response, null, '\t');
		}
	}

}

/** Record trailing whitespace, and trim it from prompt if the last line is only whitespace */
export function trimLastLine(source: string): [string, string] {
	const lines = source.split('\n');
	const lastLine = lines[lines.length - 1];
	const extraSpace: number = lastLine.length - lastLine.trimEnd().length;
	const promptTrim = source.slice(0, source.length - extraSpace);
	const trailingWs = source.slice(promptTrim.length);
	const resPrompt = lastLine.length === extraSpace ? promptTrim : source;
	return [resPrompt, trailingWs];
}

export function extractPrompt(
	accessor: ServicesAccessor,
	completionId: string,
	completionState: CompletionState,
	telemetryData: TelemetryWithExp,
	cancellationToken?: ICancellationToken,
	promptOpts: ExtractPromptOptions = {}
): Promise<PromptResponse> {
	const textDocumentManagerService = accessor.get(ICompletionsTextDocumentManagerService);
	const notebook = textDocumentManagerService.findNotebook(completionState.textDocument);
	const activeCell = notebook?.getCellFor(completionState.textDocument);
	if (notebook && activeCell) {
		completionState = applyEditsForNotebook(completionState, notebook, activeCell);
	}

	telemetryData.extendWithConfigProperties(accessor);
	telemetryData.sanitizeKeys();
	const separateContext = true;
	const promptFactory = accessor.get(ICompletionsPromptFactoryService);
	return promptFactory.prompt(
		{
			completionId,
			completionState,
			telemetryData,
			promptOpts: { ...promptOpts, separateContext },
		},
		cancellationToken
	);
}

function addNeighboringCellsToPrompt(neighboringCell: INotebookCell, activeCellLanguageId: string) {
	const languageId = neighboringCell.document.detectedLanguageId;
	const text = neighboringCell.document.getText();
	if (languageId === activeCellLanguageId) {
		// Blocks of the same language are added as is
		return text;
	} else {
		// Consider adding a languageMarker to cells of different languages
		// Note, that comments should be added with markers from the language of the active cell!
		return commentBlockAsSingles(text, activeCellLanguageId);
	}
}

function applyEditsForNotebook(state: CompletionState, notebook: INotebookDocument, activeCell: INotebookCell) {
	const cells = notebook.getCells();
	const beforeCells = cells.filter(
		cell =>
			cell.index < activeCell.index &&
			considerNeighborFile(activeCell.document.detectedLanguageId, cell.document.detectedLanguageId)
	);
	const newText =
		beforeCells.length > 0
			? beforeCells
				.map(cell => addNeighboringCellsToPrompt(cell, activeCell.document.detectedLanguageId))
				.join('\n\n') + '\n\n'
			: '';
	const top = { line: 0, character: 0 };
	return state.applyEdits([{ newText, range: { start: top, end: top } }]);
}

export function getPromptOptions(accessor: ServicesAccessor, telemetryData: TelemetryWithExp, languageId: string): PromptOptions {
	// Note: the default values of the EXP flags currently overwrite the default `PromptOptions`
	const featuresService = accessor.get(ICompletionsFeaturesService);
	const maxTokens = featuresService.maxPromptCompletionTokens(telemetryData);
	const maxPromptLength = maxTokens - getMaxSolutionTokens();

	const numberOfSnippets = getNumberOfSnippets(telemetryData, languageId);
	const similarFilesOptions: SimilarFilesOptions = getSimilarFilesOptions(accessor, telemetryData, languageId);

	const suffixPercent = featuresService.suffixPercent(telemetryData);
	const suffixMatchThreshold = featuresService.suffixMatchThreshold(telemetryData);

	if (suffixPercent < 0 || suffixPercent > 100) {
		throw new Error(`suffixPercent must be between 0 and 100, but was ${suffixPercent}`);
	}

	if (suffixMatchThreshold < 0 || suffixMatchThreshold > 100) {
		throw new Error(`suffixMatchThreshold must be between 0 and 100, but was ${suffixMatchThreshold}`);
	}

	return {
		maxPromptLength,
		similarFilesOptions,
		numberOfSnippets,
		suffixPercent,
		suffixMatchThreshold,
	};
}
