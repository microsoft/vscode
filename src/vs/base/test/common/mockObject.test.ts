/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { typeCheck } from '../../common/types.js';
import { randomInt } from '../../common/numbers.js';
import { mockObject, randomBoolean } from './testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';


suite('mockObject', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
			'bar should be overridden',
		);

		assert.strictEqual(
			mock.baz,
			42,
			'baz should be overridden',
		);

		assert(
			!(mock.anotherMethod(randomInt(100))),
			'Must execute overridden method correctly 1.',
		);

		assert(
			mock.anotherMethod(NaN),
			'Must execute overridden method correctly 2.',
		);

		assert.throws(() => {
			// property is not overridden so must throw
			// eslint-disable-next-line local/code-no-unused-expressions
			mock.foo;
		});

		assert.throws(() => {
			// function is not overridden so must throw
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
			'baz should be overridden',
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
