/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { randomInt } from '../../../../../../../../../base/common/numbers.js';
import { randomBoolean } from '../../../../../../../../../base/test/common/testUtils.js';

/**
 * Generates a random {@link Range} object.
 *
 * @throws if {@link maxNumber} argument is less than `2`,
 *         is equal to `NaN` or is `infinite`.
 */
export function randomRange(maxNumber: number = 1_000): Range {
	assert(
		maxNumber > 1,
		`Max number must be greater than 1, got '${maxNumber}'.`,
	);

	const startLineNumber = randomInt(maxNumber, 1);
	const endLineNumber = (randomBoolean() === true)
		? startLineNumber
		: randomInt(2 * maxNumber, startLineNumber);

	const startColumnNumber = randomInt(maxNumber, 1);
	const endColumnNumber = (randomBoolean() === true)
		? startColumnNumber + 1
		: randomInt(2 * maxNumber, startColumnNumber + 1);

	return new Range(
		startLineNumber,
		startColumnNumber,
		endLineNumber,
		endColumnNumber,
	);
}

/**
 * Generates a random {@link Range} object that is different
 * from the provided one.
 */
export function randomRangeNotEqualTo(differentFrom: Range, maxTries: number = 10): Range {
	let retriesLeft = maxTries;

	while (retriesLeft-- > 0) {
		const range = randomRange();
		if (range.equalsRange(differentFrom) === false) {
			return range;
		}
	}

	throw new Error(
		`Failed to generate a random range different from '${differentFrom}' in ${maxTries} tries.`,
	);
}
