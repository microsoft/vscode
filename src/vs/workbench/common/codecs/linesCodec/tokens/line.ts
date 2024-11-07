/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RangedToken } from '../../rangedToken.js';
import { assert } from '../../../../../base/common/assert.js';
import { Range } from '../../../../../editor/common/core/range.js';

/**
 * Token representing a line of text with a `range` which
 * reflects the line's position in the original data.
 */
export class Line extends RangedToken {
	constructor(
		// the line index
		// Note! 1-based indexing
		lineNumber: number,
		// the line contents
		public readonly text: string,
	) {
		assert(
			!isNaN(lineNumber),
			`The line number must not be a NaN.`,
		);

		assert(
			lineNumber > 0,
			`The line number must be >= 1, got "${lineNumber}".`,
		);

		super(
			new Range(
				lineNumber,
				1,
				lineNumber,
				text.length + 1,
			),
		);
	}
}
