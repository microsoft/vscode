/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toUint32 } from '../../../../base/common/uint.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConstantTimePrefixSumComputer, PrefixSumComputer, PrefixSumIndexOfResult } from '../../../common/model/prefixSumComputer.js';

interface IPrefixSumComputer {
	getTotalSum(): number;
	/**
	 * Returns sum of first `count` values: SUM(0 <= j < count, values[j]).
	 */
	getPrefixSum(count: number): number;
	getIndexOf(sum: number): PrefixSumIndexOfResult;
	setValue(index: number, value: number): void;
	insertValues(insertIndex: number, insertArr: number[]): void;
	removeValues(start: number, deleteCount: number): void;
}

function toUint32Array(arr: number[]): Uint32Array {
	const len = arr.length;
	const r = new Uint32Array(len);
	for (let i = 0; i < len; i++) {
		r[i] = toUint32(arr[i]);
	}
	return r;
}

function createBoth(values: number[]): IPrefixSumComputer[] {
	const psc = new PrefixSumComputer(toUint32Array(values));
	const wrapped: IPrefixSumComputer = {
		getTotalSum: () => psc.getTotalSum(),
		getPrefixSum: (count: number) => count === 0 ? 0 : psc.getPrefixSum(count - 1),
		getIndexOf: (sum: number) => psc.getIndexOf(sum),
		setValue: (index: number, value: number) => { psc.setValue(index, value); },
		insertValues: (insertIndex: number, insertArr: number[]) => { psc.insertValues(insertIndex, toUint32Array(insertArr)); },
		removeValues: (start: number, deleteCount: number) => { psc.removeValues(start, deleteCount); },
	};
	const ct = new ConstantTimePrefixSumComputer([...values]);
	const wrappedCt: IPrefixSumComputer = {
		getTotalSum: () => ct.getTotalSum(),
		getPrefixSum: (count: number) => ct.getPrefixSum(count),
		getIndexOf: (sum: number) => ct.getIndexOf(sum),
		setValue: (index: number, value: number) => { ct.setValue(index, value); },
		insertValues: (insertIndex: number, insertArr: number[]) => { ct.insertValues(insertIndex, insertArr); },
		removeValues: (start: number, deleteCount: number) => { ct.removeValues(start, deleteCount); },
	};
	return [wrapped, wrappedCt];
}

function forBoth(values: number[], callback: (psc: IPrefixSumComputer) => void): void {
	for (const psc of createBoth(values)) {
		callback(psc);
	}
}

suite('Editor ViewModel - PrefixSumComputer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('comprehensive setValue and getIndexOf', () => {
		forBoth([1, 1, 2, 1, 3], psc => {
			assert.strictEqual(psc.getTotalSum(), 8);
			assert.strictEqual(psc.getPrefixSum(0), 0);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 2);
			assert.strictEqual(psc.getPrefixSum(3), 4);
			assert.strictEqual(psc.getPrefixSum(4), 5);
			assert.strictEqual(psc.getPrefixSum(5), 8);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 1));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 0));
			assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 1));
			assert.deepStrictEqual(psc.getIndexOf(7), new PrefixSumIndexOfResult(4, 2));
			assert.deepStrictEqual(psc.getIndexOf(8), new PrefixSumIndexOfResult(4, 3));

			// [1, 2, 2, 1, 3]
			psc.setValue(1, 2);
			assert.strictEqual(psc.getTotalSum(), 9);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 3);
			assert.strictEqual(psc.getPrefixSum(3), 5);
			assert.strictEqual(psc.getPrefixSum(4), 6);
			assert.strictEqual(psc.getPrefixSum(5), 9);

			// [1, 0, 2, 1, 3]
			psc.setValue(1, 0);
			assert.strictEqual(psc.getTotalSum(), 7);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 1);
			assert.strictEqual(psc.getPrefixSum(3), 3);
			assert.strictEqual(psc.getPrefixSum(4), 4);
			assert.strictEqual(psc.getPrefixSum(5), 7);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 1));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(4, 0));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 1));
			assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 2));

			// [1, 0, 0, 1, 3]
			psc.setValue(2, 0);
			assert.strictEqual(psc.getTotalSum(), 5);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 1);
			assert.strictEqual(psc.getPrefixSum(3), 1);
			assert.strictEqual(psc.getPrefixSum(4), 2);
			assert.strictEqual(psc.getPrefixSum(5), 5);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(4, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 1));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(4, 2));

			// [1, 0, 0, 0, 3]
			psc.setValue(3, 0);
			assert.strictEqual(psc.getTotalSum(), 4);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 1);
			assert.strictEqual(psc.getPrefixSum(3), 1);
			assert.strictEqual(psc.getPrefixSum(4), 1);
			assert.strictEqual(psc.getPrefixSum(5), 4);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(4, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(4, 1));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 2));

			// [1, 1, 0, 1, 1]
			psc.setValue(1, 1);
			psc.setValue(3, 1);
			psc.setValue(4, 1);
			assert.strictEqual(psc.getTotalSum(), 4);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 2);
			assert.strictEqual(psc.getPrefixSum(3), 2);
			assert.strictEqual(psc.getPrefixSum(4), 3);
			assert.strictEqual(psc.getPrefixSum(5), 4);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 0));
		});
	});

	// --- getTotalSum ---

	test('getTotalSum with typical values', () => {
		forBoth([1, 1, 2, 1, 3], psc => assert.strictEqual(psc.getTotalSum(), 8));
		forBoth([10], psc => assert.strictEqual(psc.getTotalSum(), 10));
		forBoth([5, 5, 5], psc => assert.strictEqual(psc.getTotalSum(), 15));
	});

	test('getTotalSum with all zeroes', () => {
		forBoth([0, 0, 0], psc => assert.strictEqual(psc.getTotalSum(), 0));
		forBoth([0], psc => assert.strictEqual(psc.getTotalSum(), 0));
	});

	test('getTotalSum with empty array', () => {
		forBoth([], psc => assert.strictEqual(psc.getTotalSum(), 0));
	});

	test('getTotalSum with single element', () => {
		forBoth([0], psc => assert.strictEqual(psc.getTotalSum(), 0));
		forBoth([1], psc => assert.strictEqual(psc.getTotalSum(), 1));
		forBoth([100], psc => assert.strictEqual(psc.getTotalSum(), 100));
	});

	// --- getPrefixSum ---

	test('getPrefixSum with typical values', () => {
		forBoth([1, 1, 2, 1, 3], psc => {
			assert.strictEqual(psc.getPrefixSum(0), 0);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 2);
			assert.strictEqual(psc.getPrefixSum(3), 4);
			assert.strictEqual(psc.getPrefixSum(4), 5);
			assert.strictEqual(psc.getPrefixSum(5), 8);
		});
	});

	test('getPrefixSum with all zeroes', () => {
		forBoth([0, 0, 0], psc => {
			assert.strictEqual(psc.getPrefixSum(0), 0);
			assert.strictEqual(psc.getPrefixSum(1), 0);
			assert.strictEqual(psc.getPrefixSum(2), 0);
			assert.strictEqual(psc.getPrefixSum(3), 0);
		});
	});

	test('getPrefixSum with single element', () => {
		forBoth([7], psc => {
			assert.strictEqual(psc.getPrefixSum(0), 0);
			assert.strictEqual(psc.getPrefixSum(1), 7);
		});
	});

	test('getPrefixSum with empty array', () => {
		forBoth([], psc => {
			assert.strictEqual(psc.getPrefixSum(0), 0);
		});
	});

	test('getPrefixSum with leading/trailing zeroes', () => {
		forBoth([0, 0, 3, 0, 0], psc => {
			assert.strictEqual(psc.getPrefixSum(0), 0);
			assert.strictEqual(psc.getPrefixSum(1), 0);
			assert.strictEqual(psc.getPrefixSum(2), 0);
			assert.strictEqual(psc.getPrefixSum(3), 3);
			assert.strictEqual(psc.getPrefixSum(4), 3);
			assert.strictEqual(psc.getPrefixSum(5), 3);
		});
	});

	// --- getIndexOf ---

	test('getIndexOf with typical values', () => {
		forBoth([1, 1, 2, 1, 3], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 1));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 0));
			assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 1));
			assert.deepStrictEqual(psc.getIndexOf(7), new PrefixSumIndexOfResult(4, 2));
			assert.deepStrictEqual(psc.getIndexOf(8), new PrefixSumIndexOfResult(4, 3));
		});
	});

	test('getIndexOf with all zeroes', () => {
		forBoth([0, 0, 0], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('getIndexOf with single zero', () => {
		forBoth([0], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
		});
	});

	test('getIndexOf with single element', () => {
		forBoth([5], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(0, 1));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
		});
	});

	test('getIndexOf with leading zeroes', () => {
		forBoth([0, 0, 3], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 1));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 2));
		});
	});

	test('getIndexOf with trailing zeroes', () => {
		forBoth([3, 0, 0], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(0, 1));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(0, 2));
		});
	});

	test('getIndexOf with interleaved zeroes', () => {
		forBoth([0, 1, 0, 2, 0], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(3, 1));
		});
	});

	test('getIndexOf with all ones', () => {
		forBoth([1, 1, 1, 1, 1], psc => {
			for (let i = 0; i < 5; i++) {
				assert.deepStrictEqual(psc.getIndexOf(i), new PrefixSumIndexOfResult(i, 0));
			}
		});
	});

	test('getIndexOf with large value in single element', () => {
		forBoth([1000], psc => {
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(500), new PrefixSumIndexOfResult(0, 500));
			assert.deepStrictEqual(psc.getIndexOf(999), new PrefixSumIndexOfResult(0, 999));
		});
	});

	// --- setValue ---

	test('setValue no-op when value unchanged', () => {
		forBoth([1, 2, 3], psc => {
			assert.strictEqual(psc.getTotalSum(), 6);
			psc.setValue(1, 2);
			assert.strictEqual(psc.getTotalSum(), 6);
		});
	});

	test('setValue increase', () => {
		forBoth([1, 2, 3], psc => {
			psc.setValue(1, 5);
			assert.strictEqual(psc.getTotalSum(), 9);
			assert.strictEqual(psc.getPrefixSum(2), 6);
			assert.strictEqual(psc.getPrefixSum(3), 9);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 4));
			assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('setValue decrease', () => {
		forBoth([1, 5, 3], psc => {
			psc.setValue(1, 2);
			assert.strictEqual(psc.getTotalSum(), 6);
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 1));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('setValue to zero', () => {
		forBoth([1, 2, 3], psc => {
			psc.setValue(1, 0);
			assert.strictEqual(psc.getTotalSum(), 4);
			assert.strictEqual(psc.getPrefixSum(2), 1);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('setValue from zero', () => {
		forBoth([0, 0, 0], psc => {
			psc.setValue(1, 3);
			assert.strictEqual(psc.getTotalSum(), 3);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 2));
		});
	});

	test('setValue on first element', () => {
		forBoth([1, 2, 3], psc => {
			psc.setValue(0, 10);
			assert.strictEqual(psc.getTotalSum(), 15);
			assert.strictEqual(psc.getPrefixSum(1), 10);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(9), new PrefixSumIndexOfResult(0, 9));
			assert.deepStrictEqual(psc.getIndexOf(10), new PrefixSumIndexOfResult(1, 0));
		});
	});

	test('setValue on last element', () => {
		forBoth([1, 2, 3], psc => {
			psc.setValue(2, 10);
			assert.strictEqual(psc.getTotalSum(), 13);
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(12), new PrefixSumIndexOfResult(2, 9));
		});
	});

	test('set all values to zero then restore', () => {
		forBoth([1, 2, 3], psc => {
			psc.setValue(0, 0);
			psc.setValue(1, 0);
			psc.setValue(2, 0);
			assert.strictEqual(psc.getTotalSum(), 0);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));

			psc.setValue(0, 4);
			assert.strictEqual(psc.getTotalSum(), 4);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(0, 3));
		});
	});

	test('setValue multiple times on same index', () => {
		forBoth([1, 1, 1], psc => {
			psc.setValue(1, 5);
			psc.setValue(1, 2);
			psc.setValue(1, 10);
			assert.strictEqual(psc.getTotalSum(), 12);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(10), new PrefixSumIndexOfResult(1, 9));
			assert.deepStrictEqual(psc.getIndexOf(11), new PrefixSumIndexOfResult(2, 0));
		});
	});

	// --- insertValues ---

	test('insertValues at beginning', () => {
		forBoth([3, 4], psc => {
			psc.insertValues(0, [1, 2]);
			assert.strictEqual(psc.getTotalSum(), 10);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 3);
			assert.strictEqual(psc.getPrefixSum(3), 6);
			assert.strictEqual(psc.getPrefixSum(4), 10);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('insertValues at end', () => {
		forBoth([1, 2], psc => {
			psc.insertValues(2, [3, 4]);
			assert.strictEqual(psc.getTotalSum(), 10);
			assert.strictEqual(psc.getPrefixSum(3), 6);
			assert.strictEqual(psc.getPrefixSum(4), 10);
		});
	});

	test('insertValues in the middle', () => {
		forBoth([1, 4], psc => {
			psc.insertValues(1, [2, 3]);
			assert.strictEqual(psc.getTotalSum(), 10);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 3);
			assert.strictEqual(psc.getPrefixSum(3), 6);
			assert.strictEqual(psc.getPrefixSum(4), 10);
		});
	});

	test('insertValues with zeroes', () => {
		forBoth([1, 2], psc => {
			psc.insertValues(1, [0, 0]);
			assert.strictEqual(psc.getTotalSum(), 3);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 1);
			assert.strictEqual(psc.getPrefixSum(3), 1);
			assert.strictEqual(psc.getPrefixSum(4), 3);
		});
	});

	test('insertValues into all-zeroes', () => {
		forBoth([0, 0, 0], psc => {
			psc.insertValues(1, [2, 3]);
			assert.strictEqual(psc.getTotalSum(), 5);
			assert.strictEqual(psc.getPrefixSum(1), 0);
			assert.strictEqual(psc.getPrefixSum(2), 2);
			assert.strictEqual(psc.getPrefixSum(3), 5);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(2, 2));
		});
	});

	test('insertValues into empty computer', () => {
		forBoth([], psc => {
			psc.insertValues(0, [5, 3]);
			assert.strictEqual(psc.getTotalSum(), 8);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
		});
	});

	// --- removeValues ---

	test('removeValues from beginning', () => {
		forBoth([1, 2, 3, 4], psc => {
			psc.removeValues(0, 2);
			assert.strictEqual(psc.getTotalSum(), 7);
			assert.strictEqual(psc.getPrefixSum(1), 3);
			assert.strictEqual(psc.getPrefixSum(2), 7);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(1, 0));
		});
	});

	test('removeValues from end', () => {
		forBoth([1, 2, 3, 4], psc => {
			psc.removeValues(2, 2);
			assert.strictEqual(psc.getTotalSum(), 3);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 3);
		});
	});

	test('removeValues from the middle', () => {
		forBoth([1, 2, 3, 4], psc => {
			psc.removeValues(1, 2);
			assert.strictEqual(psc.getTotalSum(), 5);
			assert.strictEqual(psc.getPrefixSum(1), 1);
			assert.strictEqual(psc.getPrefixSum(2), 5);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(1, 3));
		});
	});

	test('removeValues all', () => {
		forBoth([1, 2, 3], psc => {
			psc.removeValues(0, 3);
			assert.strictEqual(psc.getTotalSum(), 0);
		});
	});

	test('removeValues single element', () => {
		forBoth([5, 10, 15], psc => {
			psc.removeValues(1, 1);
			assert.strictEqual(psc.getTotalSum(), 20);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(19), new PrefixSumIndexOfResult(1, 14));
		});
	});

	test('removeValues zero-valued elements', () => {
		forBoth([0, 0, 5, 0, 0], psc => {
			psc.removeValues(0, 2);
			assert.strictEqual(psc.getTotalSum(), 5);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
		});
	});

	// --- combined operations ---

	test('insert then remove', () => {
		forBoth([1, 2, 3], psc => {
			psc.insertValues(1, [10, 20]);
			assert.strictEqual(psc.getTotalSum(), 36);
			psc.removeValues(1, 2);
			assert.strictEqual(psc.getTotalSum(), 6);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('remove then insert at same position', () => {
		forBoth([1, 2, 3], psc => {
			psc.removeValues(1, 1);
			psc.insertValues(1, [5]);
			assert.strictEqual(psc.getTotalSum(), 9);
			assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 4));
			assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('setValue then insert then remove', () => {
		forBoth([1, 1, 1], psc => {
			psc.setValue(0, 5);
			psc.insertValues(1, [10]);
			psc.removeValues(3, 1);
			// [5, 10, 1]
			assert.strictEqual(psc.getTotalSum(), 16);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
			assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(14), new PrefixSumIndexOfResult(1, 9));
			assert.deepStrictEqual(psc.getIndexOf(15), new PrefixSumIndexOfResult(2, 0));
		});
	});

	test('multiple queries between mutations are consistent', () => {
		forBoth([2, 3, 5], psc => {
			assert.strictEqual(psc.getTotalSum(), 10);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));

			psc.setValue(1, 0);
			assert.strictEqual(psc.getTotalSum(), 7);
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));

			psc.setValue(1, 3);
			assert.strictEqual(psc.getTotalSum(), 10);
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 0));
		});
	});

	// --- edge cases ---

	test('large values', () => {
		forBoth([100, 200, 300], psc => {
			assert.strictEqual(psc.getTotalSum(), 600);
			assert.strictEqual(psc.getPrefixSum(1), 100);
			assert.strictEqual(psc.getPrefixSum(2), 300);
			assert.strictEqual(psc.getPrefixSum(3), 600);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
			assert.deepStrictEqual(psc.getIndexOf(99), new PrefixSumIndexOfResult(0, 99));
			assert.deepStrictEqual(psc.getIndexOf(100), new PrefixSumIndexOfResult(1, 0));
			assert.deepStrictEqual(psc.getIndexOf(299), new PrefixSumIndexOfResult(1, 199));
			assert.deepStrictEqual(psc.getIndexOf(300), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(599), new PrefixSumIndexOfResult(2, 299));
		});
	});

	test('many elements', () => {
		forBoth(new Array(100).fill(1), psc => {
			assert.strictEqual(psc.getTotalSum(), 100);
			assert.strictEqual(psc.getPrefixSum(50), 50);

			for (let i = 0; i < 100; i++) {
				assert.deepStrictEqual(psc.getIndexOf(i), new PrefixSumIndexOfResult(i, 0));
			}
		});
	});

	test('many elements all zeroes', () => {
		forBoth(new Array(100).fill(0), psc => {
			assert.strictEqual(psc.getTotalSum(), 0);
			for (let i = 0; i <= 100; i++) {
				assert.strictEqual(psc.getPrefixSum(i), 0);
			}
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(99, 0));
		});
	});

	test('setValue between queries re-validates correctly', () => {
		forBoth([1, 1, 1, 1, 1], psc => {
			assert.strictEqual(psc.getTotalSum(), 5);

			psc.setValue(2, 10);
			assert.strictEqual(psc.getTotalSum(), 14);
			assert.strictEqual(psc.getPrefixSum(3), 12);
			assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
			assert.deepStrictEqual(psc.getIndexOf(11), new PrefixSumIndexOfResult(2, 9));
			assert.deepStrictEqual(psc.getIndexOf(12), new PrefixSumIndexOfResult(3, 0));
			assert.deepStrictEqual(psc.getIndexOf(13), new PrefixSumIndexOfResult(4, 0));

			psc.setValue(0, 0);
			assert.strictEqual(psc.getTotalSum(), 13);
			assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
		});
	});
});
