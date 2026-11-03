/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// General utility functions for all kinds of suggestions (Ghost Text, Open Copilot)

import { ILogger } from '../../../../../../platform/log/common/logService';
import { ServicesAccessor } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { getBlockCloseToken } from '../../../prompt/src/parse';
import { APIChoice } from '../openai/openai';
import { TelemetryData, TelemetryStore, telemetry } from '../telemetry';
import { IPosition, TextDocumentContents } from '../textDocument';
import { isRepetitive } from './anomalyDetection';

/**
 * To avoid double-closing blocks (#272), maybe snip a trailing block-close token
 * from the given completion.
 *
 * We check whether the completion ends with a block-close token, and the next line
 * after the cursor starts with that same token at the same indentation. If so,
 * we snip.
 */
function maybeSnipCompletion(accessor: ServicesAccessor, doc: TextDocumentContents, position: IPosition, completion: string): string {
	// Default to `}` for block closing token
	let blockCloseToken = '}';

	//TODO: This should be properly handled in promptlib (in `getBlockCloseToken`)
	//but we don't want to change it before Universe.
	try {
		blockCloseToken = getBlockCloseToken(doc.detectedLanguageId) ?? '}';
	} catch (e) {
		// Ignore errors
	}

	return maybeSnipCompletionImpl(
		{ getLineText: lineIdx => doc.lineAt(lineIdx).text, getLineCount: () => doc.lineCount },
		position,
		completion,
		blockCloseToken
	);
}

export interface ILines {
	getLineText(lineIdx: number): string;
	getLineCount(): number;
}

export function maybeSnipCompletionImpl(
	doc: ILines,
	position: IPosition,
	completion: string,
	blockCloseToken: string
): string {
	// if the last lines of the completion are just indented block close tokens (e.g. `\t}\n}`),
	// and if these lines exactly match the lines of the document after the insertion position (ignoring empty lines in both the document and the completion),
	// these lines are removed from the completion.
	// Additionally, the last line of the completion can be a prefix of a line in the model.
	// Thus, if `\tif (true) {\n\t}` is suggested and the next line of the doc is `\t} else {`, only `if (true) {` will be suggested.

	const completionLinesInfo = splitByNewLine(completion);
	const completionLines = completionLinesInfo.lines;
	if (completionLines.length === 1) {
		return completion;
	}

	for (let completionLineStartIdx = 1; completionLineStartIdx < completionLines.length; completionLineStartIdx++) {
		let matched = true;
		let docSkippedEmptyLineCount = 0;
		let completionSkippedEmptyLineCount = 0;
		for (
			let offset = 0;
			offset + completionLineStartIdx + completionSkippedEmptyLineCount < completionLines.length;
			offset++
		) {
			let docLine: string | undefined;
			while (true) {
				const docLineIdx = position.line + 1 + offset + docSkippedEmptyLineCount;
				docLine = docLineIdx >= doc.getLineCount() ? undefined : doc.getLineText(docLineIdx);
				if (docLine !== undefined && docLine.trim() === '') {
					// Skip empty lines in the document and loop
					docSkippedEmptyLineCount++;
				} else {
					break;
				}
			}

			let completionLineIdx: number | undefined;
			let completionLine: string | undefined;
			while (true) {
				completionLineIdx = completionLineStartIdx + offset + completionSkippedEmptyLineCount;
				completionLine =
					completionLineIdx >= completionLines.length ? undefined : completionLines[completionLineIdx];
				if (completionLine !== undefined && completionLine.trim() === '') {
					// Skip empty lines in the completion and loop
					completionSkippedEmptyLineCount++;
				} else {
					break;
				}
			}

			const isLastCompletionLine = completionLineIdx === completionLines.length - 1;
			if (
				!completionLine ||
				!(
					docLine &&
					(isLastCompletionLine
						? // For the last line, accept any line that starts with the completion line and vice versa.
						// This allows for brackets, braces, parentheses, quotes, identifiers like "end" and "fi",
						// heredocs, etc.
						docLine.startsWith(completionLine) || completionLine.startsWith(docLine)
						: // For other lines, strictly require the block close token, and nothing else
						docLine === completionLine && completionLine.trim() === blockCloseToken)
				)
			) {
				matched = false;
				break;
			}
		}
		if (matched) {
			const completionWithoutClosingBracketLines = completionLines
				.slice(0, completionLineStartIdx)
				.join(completionLinesInfo.newLineCharacter);
			return completionWithoutClosingBracketLines;
		}
	}

	return completion;
}

function splitByNewLine(text: string): { lines: string[]; newLineCharacter: string } {
	const newLineCharacter = text.includes('\r\n') ? '\r\n' : '\n';
	return {
		lines: text.split(newLineCharacter),
		newLineCharacter,
	};
}

function matchesNextLine(
	document: TextDocumentContents,
	position: IPosition,
	text: string,
	shouldTrim: boolean
): boolean {
	let nextLine = '';
	let lineNo: number = position.line + 1;
	const compareText = shouldTrim ? text.trim() : text;
	while (nextLine === '' && lineNo < document.lineCount) {
		nextLine = document.lineAt(lineNo).text;
		if (shouldTrim) {
			nextLine = nextLine.trim();
		}
		if (nextLine === compareText) {
			return true;
		}
		lineNo++;
	}
	return false;
}

/**
 * Post-processed a completion choice in the context of the document where the choice is offered.
 */
export function postProcessChoiceInContext(
	accessor: ServicesAccessor,
	document: TextDocumentContents,
	position: IPosition,
	choice: APIChoice,
	isMoreMultiline: boolean,
	logger: ILogger
): APIChoice | undefined {
	if (isRepetitive(choice.tokens)) {
		const telemetryData = TelemetryData.createAndMarkAsIssued();
		telemetryData.extendWithRequestId(choice.requestId);
		telemetry(accessor, 'repetition.detected', telemetryData, TelemetryStore.Enhanced);
		// FIXME: trim request at start of repetitive block? for now we just skip
		logger.info('Filtered out repetitive solution');
		return undefined;
	}

	const postProcessedChoice = { ...choice };

	// Avoid single-line completions that duplicate the next line (#993)
	if (matchesNextLine(document, position, postProcessedChoice.completionText, !isMoreMultiline)) {
		const baseTelemetryData = TelemetryData.createAndMarkAsIssued();
		baseTelemetryData.extendWithRequestId(choice.requestId);
		telemetry(accessor, 'completion.alreadyInDocument', baseTelemetryData);
		telemetry(
			accessor,
			'completion.alreadyInDocument',
			baseTelemetryData.extendedBy({
				completionTextJson: JSON.stringify(postProcessedChoice.completionText),
			}),
			TelemetryStore.Enhanced
		);
		logger.info('Filtered out solution matching next line');
		return undefined;
	}

	// Avoid double-closing blocks (#272)
	postProcessedChoice.completionText = maybeSnipCompletion(
		accessor,
		document,
		position,
		postProcessedChoice.completionText
	);

	return postProcessedChoice.completionText ? postProcessedChoice : undefined;
}

export function checkSuffix(document: TextDocumentContents, position: IPosition, choice: APIChoice): number {
	const currentLine = document.lineAt(position.line);
	const restOfLine = currentLine.text.substring(position.character);
	if (restOfLine.length > 0) {
		if (choice.completionText.indexOf(restOfLine) !== -1) {
			//If current suggestion contains rest of the line as substring
			//then we will include it in our suggestion range
			return restOfLine.length;
		} else {
			let lastIndex = -1;
			let suffixLength = 0;
			for (const c of restOfLine) {
				const idx = choice.completionText.indexOf(c, lastIndex + 1);
				if (idx > lastIndex) {
					suffixLength++;
					lastIndex = idx;
				} else {
					break;
				}
			}
			return suffixLength;
		}
	}
	return 0;
}
