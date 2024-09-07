/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OffsetEdit } from './core/offsetEdit.js';
import { OffsetRange } from './core/offsetRange.js';
import { Range } from './core/range.js';
import { StandardTokenType } from './encodedTokenAttributes.js';
import { LineTokens } from './tokens/lineTokens.js';
import { SparseMultilineTokens } from './tokens/sparseMultilineTokens.js';

/**
 * Provides tokenization related functionality of the text model.
*/
export interface ITokenizationTextModelPart {
	readonly hasTokens: boolean;

	/**
	 * Replaces all semantic tokens with the provided `tokens`.
	 * @internal
	 */
	setSemanticTokens(tokens: SparseMultilineTokens[] | null, isComplete: boolean): void;

	/**
	 * Merges the provided semantic tokens into existing semantic tokens.
	 * @internal
	 */
	setPartialSemanticTokens(range: Range, tokens: SparseMultilineTokens[] | null): void;

	/**
	 * @internal
	 */
	hasCompleteSemanticTokens(): boolean;

	/**
	 * @internal
	 */
	hasSomeSemanticTokens(): boolean;

	/**
	 * Flush all tokenization state.
	 * @internal
	 */
	resetTokenization(): void;

	/**
	 * Force tokenization information for `lineNumber` to be accurate.
	 * @internal
	 */
	forceTokenization(lineNumber: number): void;

	/**
	 * If it is cheap, force tokenization information for `lineNumber` to be accurate.
	 * This is based on a heuristic.
	 * @internal
	 */
	tokenizeIfCheap(lineNumber: number): void;

	/**
	 * Check if tokenization information is accurate for `lineNumber`.
	 * @internal
	 */
	hasAccurateTokensForLine(lineNumber: number): boolean;

	/**
	 * Check if calling `forceTokenization` for this `lineNumber` will be cheap (time-wise).
	 * This is based on a heuristic.
	 * @internal
	 */
	isCheapToTokenize(lineNumber: number): boolean;

	/**
	 * Get the tokens for the line `lineNumber`.
	 * The tokens might be inaccurate. Use `forceTokenization` to ensure accurate tokens.
	 * @internal
	 */
	getLineTokens(lineNumber: number): LineTokens;

	/**
	* Returns the standard token type for a character if the character were to be inserted at
	* the given position. If the result cannot be accurate, it returns null.
	* @internal
	*/
	getTokenTypeIfInsertingCharacter(lineNumber: number, column: number, character: string): StandardTokenType;

	/**
	 * @internal
	*/
	tokenizeLineWithEdit(lineNumber: number, edit: LineEditWithAdditionalLines): ITokenizeLineWithEditResult;

	getLanguageId(): string;
	getLanguageIdAtPosition(lineNumber: number, column: number): string;

	setLanguageId(languageId: string, source?: string): void;

	readonly backgroundTokenizationState: BackgroundTokenizationState;
}

export class LineEditWithAdditionalLines {
	public static replace(range: OffsetRange, text: string): LineEditWithAdditionalLines {
		return new LineEditWithAdditionalLines(
			OffsetEdit.replace(range, text),
			null,
		);
	}

	constructor(
		/**
		 * The edit for the main line.
		*/
		readonly lineEdit: OffsetEdit,

		/**
		 * Full lines appended after the main line.
		*/
		readonly additionalLines: string[] | null,
	) { }
}

export interface ITokenizeLineWithEditResult {
	readonly mainLineTokens: LineTokens | null;
	readonly additionalLines: LineTokens[] | null;
}

export const enum BackgroundTokenizationState {
	InProgress = 1,
	Completed = 2,
}
