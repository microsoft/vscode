/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * A line based folding range. To be valid, start and end line must be bigger than zero and smaller than the number of lines in the document.
	 * Invalid ranges will be ignored.
	 */
	export class FoldingRange2 {

		/**
		 * The zero-based start line of the range to fold.
		 * The folded area starts at the start column if set, otherwise, after the line's last character.
		 * To be valid, the end must be zero or larger and smaller than the number of lines in the document.
		 */
		start: number;

		/**
		 * The zero-based character offset from where the folded range starts. If not defined, defaults to the length of the start line.
		 */
		startColumn?: number;

		/**
		 * The zero-based end line of the range to fold. The folded area ends with the line's last character.
		 * To be valid, the end must be zero or larger and smaller than the number of lines in the document.
		 */
		end: number;

		/**
		 * Describes the {@link FoldingRangeKind Kind} of the folding range such as {@link FoldingRangeKind.Comment Comment} or
		 * {@link FoldingRangeKind.Region Region}. The kind is used to categorize folding ranges and used by commands
		 * like 'Fold all comments'. See
		 * {@link FoldingRangeKind} for an enumeration of all kinds.
		 * If not set, the range is originated from a syntax element.
		 */
		kind?: FoldingRangeKind;

		/**
		 * The text to be shown instead of the folded area.
		 */
		collapsedText?: string;

		/**
		 * Creates a new folding range.
		 *
		 * @param start The start line of the folded range.
		 * @param end The end line of the folded range.
		 * @param kind The kind of the folding range.
		 */
		constructor(start: number, end: number, kind?: FoldingRangeKind, collapsedText?: string, startColumn?: number);
	}
}
