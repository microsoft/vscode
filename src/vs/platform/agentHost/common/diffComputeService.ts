/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IArcTextReplacement } from '../../../base/common/editArcTracker.js';

export interface IDiffCountResult {
	added: number;
	removed: number;
	changes: readonly IOffsetEdit[];
}

export interface IOffsetEdit {
	startOffset: number;
	endOffsetExclusive: number;
	newText: string;
}

export interface IDetailedDiffResult {
	added: number;
	removed: number;
	replacements: readonly IArcTextReplacement[];
	hitTimeout: boolean;
}

/**
 * A run of changed lines, as a diff editor shows it, with the exact
 * replacements on the original text that make its changes.
 */
export interface IDiffHunk {
	/** One-based first line of the hunk in the original text. */
	readonly originalStartLineNumber: number;
	/** One-based line after the hunk in the original text; the start line when the hunk only inserts lines. */
	readonly originalEndLineNumberExclusive: number;
	/** One-based first line of the hunk in the modified text. */
	readonly modifiedStartLineNumber: number;
	/** One-based line after the hunk in the modified text; the start line when the hunk only removes lines. */
	readonly modifiedEndLineNumberExclusive: number;
	/** Sorted, disjoint replacements on the original text that make the hunk's changes. */
	readonly replacements: readonly IArcTextReplacement[];
	/** Sorted, disjoint replacements on the modified text that undo the hunk's changes. */
	readonly reverseReplacements: readonly IArcTextReplacement[];
}

export interface IDiffHunksResult {
	/**
	 * Hunks in the order of their lines. Applying the replacements of any of
	 * them to the original text makes their changes and keeps the rest of it,
	 * and applying their reverse replacements to the modified text undoes their
	 * changes and keeps the rest of it. A change only to the line breaks of
	 * lines belongs to no hunk, so applying the replacements of every hunk to
	 * the original text can still leave its line breaks different.
	 */
	readonly hunks: readonly IDiffHunk[];
	readonly hitTimeout: boolean;
}

export const IDiffComputeService = createDecorator<IDiffComputeService>('diffComputeService');

/** Default timeout for diff computation in milliseconds. */
export const DEFAULT_DIFF_TIMEOUT_MS = 5000;

/**
 * Service that computes line diff counts (added/removed) between two
 * text strings. Implementations may offload computation to a worker
 * thread to avoid blocking the main thread.
 */
export interface IDiffComputeService {
	readonly _serviceBrand: undefined;

	/**
	 * Computes line-level diff counts and character edits between two text strings.
	 * @param original - The original text.
	 * @param modified - The modified text to compare against the original.
	 * @param timeoutMs - Maximum time in milliseconds before aborting. Defaults to {@link DEFAULT_DIFF_TIMEOUT_MS}.
	 */
	computeDiffCounts(original: string, modified: string, timeoutMs?: number): Promise<IDiffCountResult>;

	/**
	 * Computes whitespace-sensitive offset replacements between two text strings.
	 */
	computeDetailedDiff(original: string, modified: string, timeoutMs?: number): Promise<IDetailedDiffResult>;

	/**
	 * Computes the whitespace-sensitive hunks between two text strings, as a
	 * diff editor shows them. Changes only to line breaks belong to no hunk.
	 */
	computeDiffHunks(original: string, modified: string, timeoutMs?: number): Promise<IDiffHunksResult>;
}
