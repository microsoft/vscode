/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { wait } from './testUtils.js';
import { randomInt } from '../../common/numbers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { ILogger, logTime } from '../../common/decorators/logTime.js';
// TODO: @legomushroom
import { mockObject } from '../../../platform/prompts/test/common/utils/mock.js';

suite('logTime decorator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('logs execution time with provided log level', async () => {
		const traceSpy = sinon.spy();

		const mockLogService = mockObject<ILogger>({
			trace(...args) {
				traceSpy(...args);
			},
		});
		class TestClass {
			public logService = mockLogService;

			constructor(
				private readonly returnValue: number
			) { }

			@logTime()
			public async myMethod(): Promise<number> {
				// TODO: @legomushroom - test the timeout
				await wait(10);

				return this.returnValue;
			}
		}

		const expectedReturnValue = randomInt(1000);
		const testObject = new TestClass(expectedReturnValue);

		const resultPromise = testObject.myMethod();

		assert(
			resultPromise instanceof Promise,
			'My method must return a promise.',
		);

		const result = await resultPromise;
		assert.strictEqual(
			result,
			expectedReturnValue,
			'My method must return correct value.',
		);

		assert(
			traceSpy.calledOnce,
			'The trace logger method must be called.',
		);

		const callArgs = traceSpy.getCalls()[0].args;

		assert(
			callArgs.length === 1,
			'Logger method must be called with correct number of arguments.',
		);

		assert(
			callArgs[0].startsWith('[⏱][TestClass.myMethod] took '),
			'Logger method must be called with correct message.',
		);
	});
});
