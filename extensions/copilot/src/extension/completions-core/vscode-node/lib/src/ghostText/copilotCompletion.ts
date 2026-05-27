/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CopilotNamedAnnotationList } from '../../../../../../platform/completions-core/common/openai/copilotAnnotations';
import { generateUuid } from '../../../../../../util/vs/base/common/uuid';
import { TelemetryWithExp } from '../telemetry';
import { IPosition, IRange, LocationFactory, TextDocumentContents } from '../textDocument';
import { CompletionResult } from './ghostText';
import { ITextEditorOptions, normalizeIndentCharacter } from './normalizeIndent';
import { ResultType } from './resultType';

export interface CopilotCompletion {
	uuid: string;
	insertText: string;
	range: IRange;
	uri: string;
	telemetry: TelemetryWithExp;
	displayText: string;
	position: IPosition;
	offset: number;
	index: number;
	resultType: ResultType;
	copilotAnnotations?: CopilotNamedAnnotationList;
	clientCompletionId: string;
}

export function completionsFromGhostTextResults(
	completionResults: CompletionResult[],
	resultType: ResultType,
	document: TextDocumentContents,
	position: IPosition,
	textEditorOptions?: ITextEditorOptions,
	lastShownCompletionIndex?: number
): CopilotCompletion[] {
	const currentLine = document.lineAt(position);
	let completions = completionResults.map(result => {
		const range = LocationFactory.range(
			LocationFactory.position(position.line, 0),
			LocationFactory.position(position.line, position.character + result.suffixCoverage)
		);
		let insertText = '';
		if (textEditorOptions) {
			result.completion = normalizeIndentCharacter(
				textEditorOptions,
				result.completion,
				currentLine.isEmptyOrWhitespace
			);
		}
		if (
			currentLine.isEmptyOrWhitespace &&
			(result.completion.displayNeedsWsOffset || // Deindenting case
				// This enables stable behavior for deleting whitespace on blank lines
				result.completion.completionText.startsWith(currentLine.text))
		) {
			insertText = result.completion.completionText;
		} else {
			const rangeFromStart = LocationFactory.range(range.start, position);
			insertText = document.getText(rangeFromStart) + result.completion.displayText;
		}

		const completion: CopilotCompletion = {
			uuid: generateUuid(),
			insertText,
			range,
			uri: document.uri,
			index: result.completion.completionIndex,
			telemetry: result.telemetry,
			displayText: result.completion.displayText,
			position,
			offset: document.offsetAt(position),
			resultType,
			copilotAnnotations: result.copilotAnnotations,
			clientCompletionId: result.clientCompletionId,
		};
		return completion;
	});
	//If we are in typing as suggested flow, we want to put the last displayed completion at the top of the list to keep it selected
	if (resultType === ResultType.TypingAsSuggested && lastShownCompletionIndex !== undefined) {
		const lastShownCompletion = completions.find(predicate => predicate.index === lastShownCompletionIndex);
		if (lastShownCompletion) {
			const restCompletions = completions.filter(predicate => predicate.index !== lastShownCompletionIndex);
			completions = [lastShownCompletion, ...restCompletions];
		}
	}
	return completions;
}
