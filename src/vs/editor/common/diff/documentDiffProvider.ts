/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { MovedText } from './linesDiffComputer.js';
import { DetailedLineRangeMapping } from './rangeMapping.js';
import { ITextModel } from '../model.js';

/**
 * A document diff provider computes the diff between two text models.
 * @internal
 */
export interface IDocumentDiffProvider {
	/**
	 * Computes the diff between the text models `original` and `modified`.
	 */
	computeDiff(original: ITextModel, modified: ITextModel, options: IDocumentDiffProviderOptions, cancellationToken: CancellationToken): Promise<IDocumentDiff>;

	/**
	 * Is fired when settings of the diff algorithm change that could alter the result of the diffing computation.
	 * Any user of this provider should recompute the diff when this event is fired.
	 */
	onDidChange: Event<void>;
}

/**
 * Options for the diff computation.
 * @internal
 */
export interface IDocumentDiffProviderOptions {
	/**
	 * When set to true, the diff should ignore whitespace changes.
	 */
	ignoreTrimWhitespace: boolean;

	/**
	 * A diff computation should throw if it takes longer than this value.
	 */
	maxComputationTimeMs: number;

	/**
	 * If set, the diff computation should compute moves in addition to insertions and deletions.
	 */
	computeMoves: boolean;

	extendToSubwords?: boolean;
}

/**
 * Represents a diff between two text models.
 * @internal
 */
export interface IDocumentDiff {
	/**
	 * If true, both text models are identical (byte-wise).
	 */
	readonly identical: boolean;

	/**
	 * If true, the diff computation timed out and the diff might not be accurate.
	 */
	readonly quitEarly: boolean;

	/**
	 * Maps all modified line ranges in the original to the corresponding line ranges in the modified text model.
	 */
	readonly changes: readonly DetailedLineRangeMapping[];

	/**
	 * Sorted by original line ranges.
	 * The original line ranges and the modified line ranges must be disjoint (but can be touching).
	 */
	readonly moves: readonly MovedText[];
}


export const nullDocumentDiff: IDocumentDiff = Object.freeze({
	identical: true,
	quitEarly: false,
	changes: Object.freeze([]),
	moves: Object.freeze([])
});
