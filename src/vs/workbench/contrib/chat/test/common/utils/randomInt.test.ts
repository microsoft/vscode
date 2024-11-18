/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomInt } from './randomInt.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

/**
 * Run a `testName` test suite with specified `max` and `min` values.
 */
const runTests = (max: number, min: number | undefined, testName: string) => {
	suite(testName, () => {
		let i = 0;
		while (++i < 5) {
			test(`should generate random boolean attempt#${i}`, async () => {
				let iterations = 100;
				while (iterations-- > 0) {
					const int = randomInt(max, min);

					assert(
						int <= max,
						`Expected ${int} to be less than or equal to ${max}.`
					);
					assert(
						int >= (min ?? 0),
						`Expected ${int} to be greater than or equal to ${min ?? 0}.`,
					);
				}
			});
		}

		test(`should include min and max`, async () => {
			let iterations = 100;
			const results = [];
			while (iterations-- > 0) {
				results.push(randomInt(max, min));
			}

			assert(
				results.includes(max),
				`Expected ${results} to include ${max}.`,
			);
			assert(
				results.includes(min ?? 0),
				`Expected ${results} to include ${min ?? 0}.`,
			);
		});
	});
};

suite('randomInt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('positive numbers', () => {
		runTests(5, 2, 'max: 5, min: 2');
		runTests(5, 0, 'max: 5, min: 0');
		runTests(5, undefined, 'max: 5, min: undefined');
		runTests(1, 0, 'max: 0, min: 0');
	});

	suite('negative numbers', () => {
		runTests(-2, -5, 'max: -2, min: -5');
		runTests(0, -5, 'max: 0, min: -5');
		runTests(0, -1, 'max: 0, min: -1');
	});

	suite('split numbers', () => {
		runTests(3, -1, 'max: 3, min: -1');
		runTests(2, -2, 'max: 2, min: -2');
		runTests(1, -3, 'max: 2, min: -2');
	});

	suite('errors', () => {
		test('should throw if "min" is == "max" #1', () => {
			assert.throws(() => {
				randomInt(200, 200);
			}, `"max"(200) param should be greater than "min"(200)."`);
		});

		test('should throw if "min" is == "max" #2', () => {
			assert.throws(() => {
				randomInt(2, 2);
			}, `"max"(2) param should be greater than "min"(2)."`);
		});

		test('should throw if "min" is == "max" #3', () => {
			assert.throws(() => {
				randomInt(0);
			}, `"max"(0) param should be greater than "min"(0)."`);
		});

		test('should throw if "min" is > "max" #1', () => {
			assert.throws(() => {
				randomInt(2, 3);
			}, `"max"(2) param should be greater than "min"(3)."`);
		});

		test('should throw if "min" is > "max" #2', () => {
			assert.throws(() => {
				randomInt(999, 2000);
			}, `"max"(999) param should be greater than "min"(2000)."`);
		});

		test('should throw if "min" is > "max" #3', () => {
			assert.throws(() => {
				randomInt(0, 1);
			}, `"max"(0) param should be greater than "min"(1)."`);
		});

		test('should throw if "min" is > "max" #4', () => {
			assert.throws(() => {
				randomInt(-5, 2);
			}, `"max"(-5) param should be greater than "min"(2)."`);
		});

		test('should throw if "min" is > "max" #5', () => {
			assert.throws(() => {
				randomInt(-5, 0);
			}, `"max"(-5) param should be greater than "min"(0)."`);
		});

		test('should throw if "min" is > "max" #6', () => {
			assert.throws(() => {
				randomInt(-5);
			}, `"max"(-5) param should be greater than "min"(0)."`);
		});

		test('should throw if "max" is `NaN`', () => {
			assert.throws(() => {
				randomInt(NaN);
			}, `"max" param is not a number."`);
		});

		test('should throw if "min" is `NaN`', () => {
			assert.throws(() => {
				randomInt(5, NaN);
			}, `"min" param is not a number."`);
		});

		suite('infinite arguments', () => {
			test('should throw if "max" is infinite [Infinity]', () => {
				assert.throws(() => {
					randomInt(Infinity);
				}, `"max" param is not finite."`);
			});

			test('should throw if "max" is infinite [-Infinity]', () => {
				assert.throws(() => {
					randomInt(-Infinity);
				}, `"max" param is not finite."`);
			});

			test('should throw if "max" is infinite [+Infinity]', () => {
				assert.throws(() => {
					randomInt(+Infinity);
				}, `"max" param is not finite."`);
			});

			test('should throw if "min" is infinite [Infinity]', () => {
				assert.throws(() => {
					randomInt(Infinity, Infinity);
				}, `"max" param is not finite."`);
			});

			test('should throw if "min" is infinite [-Infinity]', () => {
				assert.throws(() => {
					randomInt(Infinity, -Infinity);
				}, `"max" param is not finite."`);
			});

			test('should throw if "min" is infinite [+Infinity]', () => {
				assert.throws(() => {
					randomInt(Infinity, +Infinity);
				}, `"max" param is not finite."`);
			});
		});
	});
});
