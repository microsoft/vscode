/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../editor/common/core/range.js';

/**
 * Base class for all tokens with a `range` that reflects
 * token's position in the original data.
 */
export class RangedToken {
	constructor(
		public readonly range: Range,
	) {
	}

	// 	// TODO: @legomushroom - remove
	// 	public putInsideLine(
	// 		line: Line,
	// 		atColumnNumber: number,
	// 	): this {
	// 		const { range } = line;

	// 		const endPosition = new Position(range.startLineNumber, atColumnNumber + value.length);

	// 		this.range = Range.fromPositions(
	// 			range.getStartPosition(),
	// 			endPosition,
	// 		);

	// 		return this;
	// 	}
}
