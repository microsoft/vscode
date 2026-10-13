/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export namespace workspace {

		/**
		 * Compute the diff between two text documents.
		 *
		 * This uses the same diff algorithm that powers the built-in diff editor,
		 * returning line-level and character-level change mappings.
		 *
		 * @param originalDocument The original (left-hand side) document.
		 * @param modifiedDocument The modified (right-hand side) document.
		 * @param options Options to control the diff computation.
		 * @param token A cancellation token.
		 *
		 * @returns A response object with streaming changes and a completion promise.
		 */
		export function getTextDiff(originalDocument: TextDocument, modifiedDocument: TextDocument, options?: TextDiffOptions, token?: CancellationToken): TextDiffResponse;
	}

	/**
	 * Options for computing a text diff.
	 */
	export interface TextDiffOptions {
		/**
		 * When `true`, the diff algorithm ignores changes in leading and trailing whitespace.
		 * Defaults to `false`.
		 */
		readonly ignoreTrimWhitespace?: boolean;

		/**
		 * Maximum time in milliseconds to spend computing the diff.
		 * `0` means no limit. Defaults to `5000`.
		 */
		readonly maxComputationTimeMs?: number;

		/**
		 * When `true`, the diff algorithm also computes moved text blocks.
		 * Defaults to `false`.
		 */
		readonly computeMoves?: boolean;
	}

	/**
	 * The response from {@link workspace.getTextDiff}.
	 */
	export interface TextDiffResponse {
		/**
		 * The line-level changes between the two documents, streamed as they are computed.
		 */
		readonly changes: AsyncIterable<TextDiffChange>;

		/**
		 * Resolves when the diff computation is complete, with summary information.
		 */
		readonly complete: Thenable<TextDiffComplete>;
	}

	/**
	 * Completion information for a text diff computation.
	 */
	export interface TextDiffComplete {
		/**
		 * `true` if both documents are identical (byte-wise).
		 *
		 * A diff may return 0 changes but still have `identical` be `false`. This can happen if different diff options
		 * are passed in for example.
		 */
		readonly identical: boolean;

		/**
		 * `true` if the diff computation timed out and the result may be inaccurate.
		 */
		readonly mayBeIncomplete: boolean;

		/**
		 * Detected text moves (blocks of text that were moved from one location to another).
		 * Only populated when {@link DocumentDiffOptions.computeMoves} is `true`.
		 */
		readonly moves: readonly TextDiffMove[];
	}

	/**
	 * Represents a line-level change between two documents, optionally
	 * containing character-level (inner) changes.
	 */
	export interface TextDiffChange {
		/**
		 * The line range in the original document.
		 */
		readonly originalRange: Range;

		/**
		 * The line range in the modified document.
		 */
		readonly modifiedRange: Range;

		/**
		 * Character-level changes within this line range change.
		 * May be `undefined` if inner changes were not computed.
		 */
		readonly innerChanges: readonly TextDiffInnerChange[] | undefined;
	}

	/**
	 * Represents a character-level change within a {@link TextDiffChange}.
	 */
	export interface TextDiffInnerChange {
		/**
		 * The range in the original document.
		 */
		readonly originalRange: Range;

		/**
		 * The range in the modified document.
		 */
		readonly modifiedRange: Range;
	}

	/**
	 * Represents a detected text move between two documents.
	 */
	export interface TextDiffMove {
		/**
		 * The line range in the original document that was moved.
		 */
		readonly originalRange: Range;

		/**
		 * The line range in the modified document where the text was moved to.
		 */
		readonly modifiedRange: Range;

		/**
		 * The changes within the moved text (differences between the original
		 * and the moved copy).
		 */
		readonly changes: readonly TextDiffChange[];
	}
}
