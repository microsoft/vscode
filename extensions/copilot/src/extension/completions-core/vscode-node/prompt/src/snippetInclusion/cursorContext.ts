/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cursor contexts used by snippet providers, e.g. similar files.
 *
 * A 'cursor context' is quite similar to a prompt, but it is meant as a more
 * basic, lightweight and ultimately myopic look at what the user is currently doing.
 */

import { DocumentInfoWithOffset } from '../prompt';
import { getTokenizer, TokenizerName } from '../tokenization';

/**
 * Options for cursor context generation.
 */
type CursorContextOptions = {
	/** The maximum cursor context length in tokens */
	maxTokenLength?: number;

	/** The maximum number of lines in a cursor context */
	maxLineCount?: number;

	/** TokenizerName for the tokenization */
	tokenizerName: TokenizerName;
};

const defaultCursorContextOptions: CursorContextOptions = {
	tokenizerName: TokenizerName.o200k,
};

function cursorContextOptions(options?: Partial<CursorContextOptions>): CursorContextOptions {
	return { ...defaultCursorContextOptions, ...options };
}

export interface CursorContextInfo {
	/** The compiled context as a string */
	context: string;
	/** The number of tokens in the context */
	tokenLength: number;
	/** The number of lines in the context */
	lineCount: number;
	/** TokenizerName for the tokenization */
	tokenizerName: TokenizerName;
}

/**
 * Return a cursor context corresponding to this document info.
 * This is essentially a trimmed-down version of a prompt.
 *
 * If maxLineCount or maxTokenLength are 0, an empty context is returned
 * If exactly one of `maxLineCount` or `maxTokenLength` is defined, the limit is applied for that one only
 * If both are defined, we apply both conditions so end up using the shorter of the two constraints
 * If both are undefined, the entire document up to the cursor is returned
 */
export function getCursorContext(
	doc: DocumentInfoWithOffset,
	options: Partial<CursorContextOptions> = {}
): CursorContextInfo {
	const completeOptions = cursorContextOptions(options);
	const tokenizer = getTokenizer(completeOptions.tokenizerName);

	if (completeOptions.maxLineCount !== undefined && completeOptions.maxLineCount < 0) {
		throw new Error('maxLineCount must be non-negative if defined');
	}
	if (completeOptions.maxTokenLength !== undefined && completeOptions.maxTokenLength < 0) {
		throw new Error('maxTokenLength must be non-negative if defined');
	}

	if (completeOptions.maxLineCount === 0 || completeOptions.maxTokenLength === 0) {
		return {
			context: '',
			lineCount: 0,
			tokenLength: 0,
			tokenizerName: completeOptions.tokenizerName,
		};
	}

	let context = doc.source.slice(0, doc.offset); // Trim to cursor location, offset is a character location
	if (completeOptions.maxLineCount !== undefined) {
		context = context.split('\n').slice(-completeOptions.maxLineCount).join('\n');
	}
	if (completeOptions.maxTokenLength !== undefined) {
		context = tokenizer.takeLastLinesTokens(context, completeOptions.maxTokenLength);
	}
	return {
		context,
		lineCount: context.split('\n').length,
		tokenLength: tokenizer.tokenLength(context),
		tokenizerName: completeOptions.tokenizerName,
	};
}
