/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';
import { ILinesDiffComputerOptions, MovedText } from '../../../util/vs/editor/common/diff/linesDiffComputer';
import { DetailedLineRangeMapping } from '../../../util/vs/editor/common/diff/rangeMapping';


export const IDiffService = createServiceIdentifier<IDiffService>('IDiffService');

export interface IDiffService {

	readonly _serviceBrand: undefined;

	computeDiff(original: string, modified: string, options: ILinesDiffComputerOptions): Promise<IDocumentDiff>;
}

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
