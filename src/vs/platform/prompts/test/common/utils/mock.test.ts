/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mockObject } from './mock.js';
import { typeCheck } from '../../../../../base/common/types.js';
import { randomInt } from '../../../../../base/common/numbers.js';
import { randomBoolean } from '../../../../../base/test/common/testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('mock', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('• mockObject', () => {
		test('• overrides properties and functions', () => {
			interface ITestObject {
				foo: string;
				bar: string;
				readonly baz: number;
				someMethod(arg: boolean): string;
				anotherMethod(arg: number): boolean;
			}

			const mock = mockObject<ITestObject>({
				bar: 'oh hi!',
				baz: 42,
				anotherMethod(arg: number): boolean {
					return isNaN(arg);
				},
			});

			typeCheck<ITestObject>(mock);

			assert.strictEqual(
				mock.bar,
				'oh hi!',
				'bar should be overriden',
			);

			assert.strictEqual(
				mock.baz,
				42,
				'baz should be overriden',
			);

			assert(
				!(mock.anotherMethod(randomInt(100))),
				'Must execute overriden method correctly 1.',
			);

			assert(
				mock.anotherMethod(NaN),
				'Must execute overriden method correctly 2.',
			);

			assert.throws(() => {
				// property is not overriden so must throw
				// eslint-disable-next-line local/code-no-unused-expressions
				mock.foo;
			});

			assert.throws(() => {
				// function is not overriden so must throw
				mock.someMethod(randomBoolean());
			});
		});

		test('• immutability of the overrides object', () => {
			interface ITestObject {
				foo: string;
				bar: string;
				readonly baz: number;
				someMethod(arg: boolean): string;
				anotherMethod(arg: number): boolean;
			}

			const overrides: Partial<ITestObject> = {
				baz: 4,
			};
			const mock = mockObject<ITestObject>(overrides);
			typeCheck<ITestObject>(mock);

			assert.strictEqual(
				mock.baz,
				4,
				'baz should be overriden',
			);

			// overrides object must be immutable
			assert.throws(() => {
				overrides.foo = 'test';
			});

			assert.throws(() => {
				overrides.someMethod = (arg: boolean) => {
					return `${arg}__${arg}`;
				};
			});
		});
	});

	suite('• mockService', () => {
		test('• overrides properties and functions', () => {
			interface ITestService {
				readonly _serviceBrand: undefined;
				prop1: string;
				id: string;
				readonly counter: number;
				method1(arg: boolean): string;
				testMethod2(arg: number): boolean;
			}

			const mock = mockObject<ITestService>({
				id: 'ciao!',
				counter: 74,
				testMethod2(arg: number): boolean {
					return !isNaN(arg);
				},
			});

			typeCheck<ITestService>(mock);

			assert.strictEqual(
				mock.id,
				'ciao!',
				'id should be overriden',
			);

			assert.strictEqual(
				mock.counter,
				74,
				'counter should be overriden',
			);

			assert(
				mock.testMethod2(randomInt(100)),
				'Must execute overriden method correctly 1.',
			);

			assert(
				!(mock.testMethod2(NaN)),
				'Must execute overriden method correctly 2.',
			);

			assert.throws(() => {
				// property is not overriden so must throw
				// eslint-disable-next-line local/code-no-unused-expressions
				mock.prop1;
			});

			assert.throws(() => {
				// function is not overriden so must throw
				mock.method1(randomBoolean());
			});
		});

		test('• immutability of the overrides object', () => {
			interface ITestService {
				foo: string;
				bar: string;
				readonly baz: boolean;
				someMethod(arg: boolean): string;
				anotherMethod(arg: number): boolean;
			}

			const overrides: Partial<ITestService> = {
				baz: false,
			};
			const mock = mockObject<ITestService>(overrides);
			typeCheck<ITestService>(mock);

			assert.strictEqual(
				mock.baz,
				false,
				'baz should be overriden',
			);

			// overrides object must be immutable
			assert.throws(() => {
				overrides.foo = 'test';
			});

			assert.throws(() => {
				overrides.someMethod = (arg: boolean) => {
					return `${arg}__${arg}`;
				};
			});
		});
	});
});
