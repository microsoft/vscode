/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ISequence, ITimeout } from '../../../common/diff/defaultLinesDiffComputer/algorithms/diffAlgorithm.js';
import { DynamicProgrammingDiffing } from '../../../common/diff/defaultLinesDiffComputer/algorithms/dynamicProgrammingDiffing.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

function createSequence(elements: number[], onRead?: () => void): ISequence {
	return {
		length: elements.length,
		getElement(offset: number): number {
			onRead?.();
			return elements[offset];
		},
		isStronglyEqual(offset1: number, offset2: number): boolean {
			return elements[offset1] === elements[offset2];
		},
	};
}

suite('DynamicProgrammingDiffing', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('checks the timeout once per row', () => {
		let timeoutChecks = 0;
		const timeout: ITimeout = {
			isValid: () => {
				timeoutChecks++;
				return true;
			}
		};

		const result = new DynamicProgrammingDiffing().compute(
			createSequence([1, 2, 3]),
			createSequence([1, 4, 3, 5]),
			timeout
		);

		assert.deepStrictEqual(
			{ timeoutChecks, hitTimeout: result.hitTimeout },
			{ timeoutChecks: 3, hitTimeout: false }
		);
	});

	test('stops before processing the next row after timeout', () => {
		let timeoutChecks = 0;
		let sequence1Reads = 0;
		const timeout: ITimeout = {
			isValid: () => {
				timeoutChecks++;
				return timeoutChecks === 1;
			}
		};

		const result = new DynamicProgrammingDiffing().compute(
			createSequence([1, 2, 3], () => sequence1Reads++),
			createSequence([1, 4, 3, 5]),
			timeout
		);

		assert.deepStrictEqual(
			{ timeoutChecks, sequence1Reads, hitTimeout: result.hitTimeout },
			{ timeoutChecks: 2, sequence1Reads: 4, hitTimeout: true }
		);
	});
});
