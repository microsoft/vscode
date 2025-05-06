/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { randomInt } from '../../common/numbers.js';
import { mockObject, waitRandom } from './testUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { ILogger, logExecutionTime, logTime } from '../../common/decorators/logTime.js';

suite('logTime', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Helper that replaces the timing part of a message to
	 * a predictable constant value so the message can be
	 * consistently compared in the tests
	 */
	const cleanupTimingMessage = (
		message: string,
	): string => {
		// sanity check on the message type since this function
		// can be called with `any` inside these tests
		assert(
			typeof message === 'string',
			`Message must be a string, got '${message}'.`,
		);

		// regex: targets the ' 123.75 ms' part at the end
		//        of the provided 'message' string
		return message
			.replaceAll(/\s\d+.\d{2}\sms$/gi, ' 100.50 ms');
	};

	suite('• decorator', () => {
		suite('• async method', () => {
			const logLevels: (keyof ILogger)[] = [
				'trace', 'debug', 'info', 'warn', 'error',
			];

			for (const logLevel of logLevels) {
				test(`• '${logLevel}' log level`, async () => {
					const logSpy = sinon.spy();

					const mockLogger = mockObject<ILogger>({
						[logLevel]: logSpy,
					});
					class TestClass {
						public logger = mockLogger;

						constructor(
							private readonly returnValue: number
						) { }

						@logTime(logLevel)
						public async myAsyncMethod(): Promise<number> {
							await waitRandom(10);

							return this.returnValue;
						}
					}

					const expectedReturnValue = randomInt(1000);
					const testObject = new TestClass(expectedReturnValue);

					const resultPromise = testObject.myAsyncMethod();

					assert(
						resultPromise instanceof Promise,
						'My method must return a promise.',
					);

					const result = await resultPromise;
					assert.strictEqual(
						result,
						expectedReturnValue,
						'Decorator must return correct value.',
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

					assert.strictEqual(
						cleanupTimingMessage(callArgs[0]),
						'[⏱][TestClass.myAsyncMethod] took 100.50 ms',
						'Logger method must be called with correct message.',
					);
				});
			}
		});

		suite('• sync method', () => {
			const logLevels: (keyof ILogger)[] = [
				'trace', 'debug', 'info', 'warn', 'error',
			];

			for (const logLevel of logLevels) {
				test(`• '${logLevel}' log level`, async () => {
					const logSpy = sinon.spy();

					const mockLogger = mockObject<ILogger>({
						[logLevel]: logSpy,
					});
					class TestClass {
						public logger = mockLogger;

						constructor(
							private readonly returnValue: number
						) { }

						@logTime(logLevel)
						public mySyncMethod(): number {
							return this.returnValue;
						}
					}

					const expectedReturnValue = randomInt(1000);
					const testObject = new TestClass(expectedReturnValue);

					const result = testObject.mySyncMethod();
					assert.strictEqual(
						result,
						expectedReturnValue,
						'Decorator must return correct value.',
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

					assert.strictEqual(
						cleanupTimingMessage(callArgs[0]),
						'[⏱][TestClass.mySyncMethod] took 100.50 ms',
						'Logger method must be called with correct message.',
					);
				});
			}
		});

		test('• uses \'trace\' level by default', async () => {
			const logSpy = sinon.spy();

			const mockLogger = mockObject<ILogger>({
				trace: logSpy,
			});
			class TestClass {
				public logger = mockLogger;

				constructor(
					private readonly returnValue: number
				) { }

				@logTime()
				public async myAsyncMethod(): Promise<number> {
					await waitRandom(10);

					return this.returnValue;
				}
			}

			const expectedReturnValue = randomInt(1000);
			const testObject = new TestClass(expectedReturnValue);

			const resultPromise = testObject.myAsyncMethod();

			assert(
				resultPromise instanceof Promise,
				'My method must return a promise.',
			);

			const result = await resultPromise;
			assert.strictEqual(
				result,
				expectedReturnValue,
				'Decorator must return correct value.',
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

			assert.strictEqual(
				cleanupTimingMessage(callArgs[0]),
				'[⏱][TestClass.myAsyncMethod] took 100.50 ms',
				'Logger method must be called with correct message.',
			);
		});
	});

	suite('• logExecutionTime helper', () => {
		suite('• async function', () => {
			const logLevels: (keyof ILogger)[] = [
				'trace', 'debug', 'info', 'warn', 'error',
			];

			for (const logLevel of logLevels) {
				test(`• '${logLevel}' log level`, async () => {
					const logSpy = sinon.spy();

					const mockLogService = mockObject<ILogger>({
						[logLevel]: logSpy,
					});

					const expectedReturnValue = randomInt(1000);
					const resultPromise = logExecutionTime(
						'my-async-function',
						async () => {
							await waitRandom(10);

							return expectedReturnValue;
						},
						mockLogService[logLevel],
					);

					assert(
						resultPromise instanceof Promise,
						'Callback function must return a promise.',
					);

					const result = await resultPromise;
					assert.strictEqual(
						result,
						expectedReturnValue,
						'Helper must return correct value.',
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

					assert.strictEqual(
						cleanupTimingMessage(callArgs[0]),
						'[⏱][my-async-function] took 100.50 ms',
						'Logger message must start with the correct value.',
					);
				});
			}
		});

		suite('• sync function', () => {
			const logLevels: (keyof ILogger)[] = [
				'trace', 'debug', 'info', 'warn', 'error',
			];

			for (const logLevel of logLevels) {
				test(`• '${logLevel}' log level`, async () => {
					const logSpy = sinon.spy();

					const mockLogService = mockObject<ILogger>({
						[logLevel]: logSpy,
					});

					const expectedReturnValue = randomInt(1000);
					const result = logExecutionTime(
						'my-sync-function',
						() => {
							return expectedReturnValue;
						},
						mockLogService[logLevel],
					);

					assert.strictEqual(
						result,
						expectedReturnValue,
						'Helper must return correct value.',
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

					assert.strictEqual(
						cleanupTimingMessage(callArgs[0]),
						'[⏱][my-sync-function] took 100.50 ms',
						'Logger message must start with the correct value.',
					);
				});
			}
		});
	});
});
