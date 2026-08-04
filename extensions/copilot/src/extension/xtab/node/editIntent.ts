/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as xtabPromptOptions from '../../../platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { ILogger } from '../../../platform/log/common/logService';

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
	ShortName = 'shortName'
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
	mode: EditIntentParseMode = EditIntentParseMode.Tags
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
	tracer: ILogger
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
	tracer: ILogger
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

