/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IPosition } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { ContiguousMultilineTokens } from 'vs/editor/common/tokens/contiguousMultilineTokens';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { SparseMultilineTokens } from 'vs/editor/common/tokens/sparseMultilineTokens';

/**
 * Provides tokenization related functionality of the text model.
*/
export interface ITokenizationTextModelPart {
	/**
	 * @internal
	 */
	setTokens(tokens: ContiguousMultilineTokens[]): void;

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
	tokenizeLineWithEdit(position: IPosition, length: number, newText: string): LineTokens | null;

	/**
	 * @internal
	 */
	tokenizeViewport(startLineNumber: number, endLineNumber: number): void;

	getLanguageId(): string;
	getLanguageIdAtPosition(lineNumber: number, column: number): string;

	setLanguageId(languageId: string, source?: string): void;

	readonly backgroundTokenizationState: BackgroundTokenizationState;
	readonly onBackgroundTokenizationStateChanged: Event<void>;
}

export const enum BackgroundTokenizationState {
	Uninitialized = 0,
	InProgress = 1,
	Completed = 2,
}
