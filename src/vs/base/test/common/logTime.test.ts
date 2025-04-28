/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { randomInt } from '../../common/numbers.js';
import { mockObject, waitRandom } from './testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { ILogger, logTime, TLogLevel } from '../../common/decorators/logTime.js';

suite('logTime decorator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// TODO: @legomushroom - add separators?
	suite('async method', () => {
		const logLevels: TLogLevel[] = [
			'trace', 'debug', 'info', 'warn', 'error',
		];

		for (const logLevel of logLevels) {
			test(`'${logLevel}' log level`, async () => {
				const logSpy = sinon.spy();

				const mockLogService = mockObject<ILogger>({
					[logLevel]: logSpy,
				});
				class TestClass {
					public logService = mockLogService;

					constructor(
						private readonly returnValue: number
					) { }

					@logTime(logLevel)
					public async myMethod(): Promise<number> {
						await waitRandom(10);

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
					logSpy.calledOnce,
					'The trace logger method must be called.',
				);

				const callArgs = logSpy.getCalls()[0].args;

				assert(
					callArgs.length === 1,
					'Logger method must be called with correct number of arguments.',
				);

				assert(
					callArgs[0].startsWith('[⏱][TestClass.myMethod] took '),
					'Logger method must be called with correct message.',
				);
			});
		}
	});

	suite('sync method', () => {
		const logLevels: TLogLevel[] = [
			'trace', 'debug', 'info', 'warn', 'error',
		];

		for (const logLevel of logLevels) {
			test(`'${logLevel}' log level`, async () => {
				const logSpy = sinon.spy();

				const mockLogService = mockObject<ILogger>({
					[logLevel]: logSpy,
				});
				class TestClass {
					public logService = mockLogService;

					constructor(
						private readonly returnValue: number
					) { }

					@logTime(logLevel)
					public myMethod(): number {
						return this.returnValue;
					}
				}

				const expectedReturnValue = randomInt(1000);
				const testObject = new TestClass(expectedReturnValue);

				const result = testObject.myMethod();
				assert.strictEqual(
					result,
					expectedReturnValue,
					'My method must return correct value.',
				);

				assert(
					logSpy.calledOnce,
					'The trace logger method must be called.',
				);

				const callArgs = logSpy.getCalls()[0].args;

				assert(
					callArgs.length === 1,
					'Logger method must be called with correct number of arguments.',
				);

				assert(
					callArgs[0].startsWith('[⏱][TestClass.myMethod] took '),
					'Logger method must be called with correct message.',
				);
			});
		}
	});

	test('uses \'trace\' level by default', async () => {
		const logSpy = sinon.spy();

		const mockLogService = mockObject<ILogger>({
			trace: logSpy,
		});
		class TestClass {
			public logService = mockLogService;

			constructor(
				private readonly returnValue: number
			) { }

			@logTime()
			public async myMethod(): Promise<number> {
				await waitRandom(10);

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
			logSpy.calledOnce,
			'The trace logger method must be called.',
		);

		const callArgs = logSpy.getCalls()[0].args;

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
