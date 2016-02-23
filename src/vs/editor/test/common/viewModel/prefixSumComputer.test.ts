/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IPrefixSumIndexOfResult, PrefixSumComputer} from 'vs/editor/common/viewModel/prefixSumComputer';

suite('Editor ViewModel - PrefixSumComputer', () => {

	test('PrefixSumComputer', () => {
		var indexOfResult:IPrefixSumIndexOfResult = {
			index: 0,
			remainder: 0
		};

		var psc = new PrefixSumComputer([1, 1, 2, 1, 3]);
		assert.equal(psc.getTotalValue(), 8);
		assert.equal(psc.getAccumulatedValue(-1), 0);
		assert.equal(psc.getAccumulatedValue(0), 1);
		assert.equal(psc.getAccumulatedValue(1), 2);
		assert.equal(psc.getAccumulatedValue(2), 4);
		assert.equal(psc.getAccumulatedValue(3), 5);
		assert.equal(psc.getAccumulatedValue(4), 8);
		psc.getIndexOf(0, indexOfResult);
		assert.equal(indexOfResult.index, 0);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(1, indexOfResult);
		assert.equal(indexOfResult.index, 1);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(2, indexOfResult);
		assert.equal(indexOfResult.index, 2);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(3, indexOfResult);
		assert.equal(indexOfResult.index, 2);
		assert.equal(indexOfResult.remainder, 1);
		psc.getIndexOf(4, indexOfResult);
		assert.equal(indexOfResult.index, 3);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(5, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(6, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 1);
		psc.getIndexOf(7, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 2);
		psc.getIndexOf(8, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 3);

		// [1, 2, 2, 1, 3]
		psc.changeValue(1, 2);
		assert.equal(psc.getTotalValue(), 9);
		assert.equal(psc.getAccumulatedValue(0), 1);
		assert.equal(psc.getAccumulatedValue(1), 3);
		assert.equal(psc.getAccumulatedValue(2), 5);
		assert.equal(psc.getAccumulatedValue(3), 6);
		assert.equal(psc.getAccumulatedValue(4), 9);

		// [1, 0, 2, 1, 3]
		psc.changeValue(1, 0);
		assert.equal(psc.getTotalValue(), 7);
		assert.equal(psc.getAccumulatedValue(0), 1);
		assert.equal(psc.getAccumulatedValue(1), 1);
		assert.equal(psc.getAccumulatedValue(2), 3);
		assert.equal(psc.getAccumulatedValue(3), 4);
		assert.equal(psc.getAccumulatedValue(4), 7);
		psc.getIndexOf(0, indexOfResult);
		assert.equal(indexOfResult.index, 0);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(1, indexOfResult);
		assert.equal(indexOfResult.index, 2);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(2, indexOfResult);
		assert.equal(indexOfResult.index, 2);
		assert.equal(indexOfResult.remainder, 1);
		psc.getIndexOf(3, indexOfResult);
		assert.equal(indexOfResult.index, 3);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(4, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(5, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 1);
		psc.getIndexOf(6, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 2);
		psc.getIndexOf(7, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 3);

		// [1, 0, 0, 1, 3]
		psc.changeValue(2, 0);
		assert.equal(psc.getTotalValue(), 5);
		assert.equal(psc.getAccumulatedValue(0), 1);
		assert.equal(psc.getAccumulatedValue(1), 1);
		assert.equal(psc.getAccumulatedValue(2), 1);
		assert.equal(psc.getAccumulatedValue(3), 2);
		assert.equal(psc.getAccumulatedValue(4), 5);
		psc.getIndexOf(0, indexOfResult);
		assert.equal(indexOfResult.index, 0);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(1, indexOfResult);
		assert.equal(indexOfResult.index, 3);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(2, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(3, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 1);
		psc.getIndexOf(4, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 2);
		psc.getIndexOf(5, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 3);

		// [1, 0, 0, 0, 3]
		psc.changeValue(3, 0);
		assert.equal(psc.getTotalValue(), 4);
		assert.equal(psc.getAccumulatedValue(0), 1);
		assert.equal(psc.getAccumulatedValue(1), 1);
		assert.equal(psc.getAccumulatedValue(2), 1);
		assert.equal(psc.getAccumulatedValue(3), 1);
		assert.equal(psc.getAccumulatedValue(4), 4);
		psc.getIndexOf(0, indexOfResult);
		assert.equal(indexOfResult.index, 0);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(1, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(2, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 1);
		psc.getIndexOf(3, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 2);
		psc.getIndexOf(4, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 3);

		// [1, 1, 0, 1, 1]
		psc.changeValue(1, 1);
		psc.changeValue(3, 1);
		psc.changeValue(4, 1);
		assert.equal(psc.getTotalValue(), 4);
		assert.equal(psc.getAccumulatedValue(0), 1);
		assert.equal(psc.getAccumulatedValue(1), 2);
		assert.equal(psc.getAccumulatedValue(2), 2);
		assert.equal(psc.getAccumulatedValue(3), 3);
		assert.equal(psc.getAccumulatedValue(4), 4);
		psc.getIndexOf(0, indexOfResult);
		assert.equal(indexOfResult.index, 0);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(1, indexOfResult);
		assert.equal(indexOfResult.index, 1);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(2, indexOfResult);
		assert.equal(indexOfResult.index, 3);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(3, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 0);
		psc.getIndexOf(4, indexOfResult);
		assert.equal(indexOfResult.index, 4);
		assert.equal(indexOfResult.remainder, 1);
	});
});
