/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { AbstractMessageLogger, AdapterLogger, createUnexpectedErrorHandler, LogLevel } from '../../common/log.js';

class TestLogger extends AbstractMessageLogger {
	readonly errors: (string | Error)[] = [];
	readonly messages: { level: LogLevel; message: string }[] = [];

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push(message);
		super.error(message, ...args);
	}

	protected log(level: LogLevel, message: string): void {
		this.messages.push({ level, message });
	}
}

suite('Log', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('AdapterLogger', () => {
		test('retains unexpected error stacks when forwarding to another process', () => {
			const entries: { level: LogLevel; args: unknown[] }[] = [];
			const logger = store.add(new AdapterLogger({ log: (level, args) => entries.push({ level, args }) }));
			const error = new Error('Unexpected error');

			createUnexpectedErrorHandler(logger)(error);

			assert.deepStrictEqual(entries, [{ level: LogLevel.Error, args: [toErrorMessage(error, true)] }]);
		});

		test('preserves string arguments, warning formatting and log level filtering', () => {
			const entries: { level: LogLevel; args: unknown[] }[] = [];
			const logger = store.add(new AdapterLogger({ log: (level, args) => entries.push({ level, args }) }));
			const warning = new Error('Warning');

			logger.error('Error text', 42);
			logger.warn(warning);
			logger.setLevel(LogLevel.Off);
			logger.error(new Error('Suppressed error'));

			assert.deepStrictEqual(entries, [
				{ level: LogLevel.Error, args: ['Error text', 42] },
				{ level: LogLevel.Warning, args: [warning.message] }
			]);
		});
	});

	suite('createUnexpectedErrorHandler', () => {
		test('preserves native errors for debugger source mapping', () => {
			const logger = store.add(new TestLogger());
			const error = new Error('Unexpected error', { cause: new Error('Original cause') });

			createUnexpectedErrorHandler(logger)(error);

			assert.strictEqual(logger.errors[0], error);
		});

		test('retains the original stack in message loggers', () => {
			const logger = store.add(new TestLogger());
			const error = new Error('Unexpected error');
			const stack = error.stack;

			createUnexpectedErrorHandler(logger)(error);

			assert.deepStrictEqual({ messages: logger.messages, stack: error.stack }, {
				messages: [{ level: LogLevel.Error, message: stack }],
				stack
			});
		});

		test('preserves formatting for stackless errors and non-native values', () => {
			const logger = store.add(new TestLogger());
			const error = new Error('Missing stack');
			error.stack = undefined;
			const emptyStackError = new Error('Empty stack');
			emptyStackError.stack = '';
			const errors = [
				error,
				emptyStackError,
				'Error text',
				{ message: 'Serialized error', stack: 'Error: Serialized error\n    at generated.js:1:2' },
				{ detail: { exception: { message: 'Nested error', stack: 'Error: Nested error\n    at generated.js:3:4' } } },
				[new Error('First error'), new Error('Second error')],
				undefined
			];
			const handleError = createUnexpectedErrorHandler(logger);

			errors.forEach(handleError);

			assert.deepStrictEqual(logger.errors, errors.map(error => toErrorMessage(error, true)));
		});

		test('suppresses duplicates through 1000ms without extending the interval', () => runWithFakedTimers({}, async () => {
			const logger = store.add(new TestLogger());
			const error = new Error('Repeated error');
			const handleError = createUnexpectedErrorHandler(logger);

			handleError(error);
			await timeout(1000);
			handleError(error);
			await timeout(1);
			handleError(error);

			assert.deepStrictEqual(logger.errors, [error, error]);
		}));

		test('compares the complete formatted stack when suppressing duplicates', () => {
			const logger = store.add(new TestLogger());
			const firstError = new Error('Same message');
			const secondError = new Error('Same message');
			const handleError = createUnexpectedErrorHandler(logger);

			handleError(firstError);
			handleError(secondError);

			assert.deepStrictEqual(logger.errors, [firstError, secondError]);
		});

		test('keeps duplicate suppression local to each handler', () => {
			const logger = store.add(new TestLogger());
			const error = new Error('Unexpected error');

			createUnexpectedErrorHandler(logger)(error);
			createUnexpectedErrorHandler(logger)(error);

			assert.deepStrictEqual(logger.errors, [error, error]);
		});

		test('retains log level filtering', () => {
			const logger = store.add(new TestLogger());
			const handleError = createUnexpectedErrorHandler(logger);
			logger.setLevel(LogLevel.Off);
			handleError(new Error('Suppressed error'));
			logger.setLevel(LogLevel.Error);
			const error = new Error('Logged error');
			handleError(error);

			assert.deepStrictEqual(logger.messages, [{ level: LogLevel.Error, message: error.stack }]);
		});

		test('does not swallow logging failures', () => {
			const failure = new Error('Logging failed');
			const logger = store.add(new class extends TestLogger {
				override error(): void {
					throw failure;
				}
			}());

			assert.throws(() => createUnexpectedErrorHandler(logger)(new Error('Unexpected error')), /^Error: Logging failed$/);
		});
	});
});
