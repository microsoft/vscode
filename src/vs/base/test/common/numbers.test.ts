/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { isPointWithinTriangle, randomInt } from '../../common/numbers.js';

suite('isPointWithinTriangle', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return true if the point is within the triangle', () => {
		const result = isPointWithinTriangle(0.25, 0.25, 0, 0, 1, 0, 0, 1);
		assert.ok(result);
	});

	test('should return false if the point is outside the triangle', () => {
		const result = isPointWithinTriangle(2, 2, 0, 0, 1, 0, 0, 1);
		assert.ok(!result);
	});

	test('should return true if the point is on the edge of the triangle', () => {
		const result = isPointWithinTriangle(0.5, 0, 0, 0, 1, 0, 0, 1);
		assert.ok(result);
	});
});

suite('randomInt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Test helper that allows to run a test on the `randomInt()`
	 * utility with specified `max` and `min` values.
	 */
	const testRandomIntUtil = (max: number, min: number | undefined, testName: string) => {
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

	suite('positive numbers', () => {
		testRandomIntUtil(5, 2, 'max: 5, min: 2');
		testRandomIntUtil(5, 0, 'max: 5, min: 0');
		testRandomIntUtil(5, undefined, 'max: 5, min: undefined');
		testRandomIntUtil(1, 0, 'max: 0, min: 0');
	});

	suite('negative numbers', () => {
		testRandomIntUtil(-2, -5, 'max: -2, min: -5');
		testRandomIntUtil(0, -5, 'max: 0, min: -5');
		testRandomIntUtil(0, -1, 'max: 0, min: -1');
	});

	suite('split numbers', () => {
		testRandomIntUtil(3, -1, 'max: 3, min: -1');
		testRandomIntUtil(2, -2, 'max: 2, min: -2');
		testRandomIntUtil(1, -3, 'max: 2, min: -2');
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
