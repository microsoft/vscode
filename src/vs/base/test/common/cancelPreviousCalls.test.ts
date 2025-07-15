/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable } from '../../common/lifecycle.js';
import { CancellationToken } from '../../common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { cancelPreviousCalls } from '../../common/decorators/cancelPreviousCalls.js';

suite('cancelPreviousCalls decorator', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class MockDisposable extends Disposable {
		/**
		 * Arguments that the {@linkcode doSomethingAsync} method was called with.
		 */
		private readonly callArgs1: ([number, string, CancellationToken | undefined])[] = [];

		/**
		 * Arguments that the {@linkcode doSomethingElseAsync} method was called with.
		 */
		private readonly callArgs2: ([number, string, CancellationToken | undefined])[] = [];

		/**
		 * Returns the arguments that the {@linkcode doSomethingAsync} method was called with.
		 */
		public get callArguments1() {
			return this.callArgs1;
		}

		/**
		 * Returns the arguments that the {@linkcode doSomethingElseAsync} method was called with.
		 */
		public get callArguments2() {
			return this.callArgs2;
		}

		@cancelPreviousCalls
		async doSomethingAsync(arg1: number, arg2: string, cancellationToken?: CancellationToken): Promise<void> {
			this.callArgs1.push([arg1, arg2, cancellationToken]);

			await new Promise(resolve => setTimeout(resolve, 25));
		}

		@cancelPreviousCalls
		async doSomethingElseAsync(arg1: number, arg2: string, cancellationToken?: CancellationToken): Promise<void> {
			this.callArgs2.push([arg1, arg2, cancellationToken]);

			await new Promise(resolve => setTimeout(resolve, 25));
		}
	}

	test('should call method with CancellationToken', async () => {
		const instance = disposables.add(new MockDisposable());

		await instance.doSomethingAsync(1, 'foo');

		const callArguments = instance.callArguments1;
		assert.strictEqual(
			callArguments.length,
			1,
			`The 'doSomethingAsync' method must be called just once.`,
		);

		const args = callArguments[0];
		assert(
			args.length === 3,
			`The 'doSomethingAsync' method must be called with '3' arguments, got '${args.length}'.`,
		);

		const arg1 = args[0];
		const arg2 = args[1];
		const arg3 = args[2];

		assert.strictEqual(
			arg1,
			1,
			`The 'doSomethingAsync' method call must have the correct 1st argument.`,
		);

		assert.strictEqual(
			arg2,
			'foo',
			`The 'doSomethingAsync' method call must have the correct 2nd argument.`,
		);

		assert(
			CancellationToken.isCancellationToken(arg3),
			`The last argument of the 'doSomethingAsync' method must be a 'CancellationToken', got '${arg3}'.`,
		);

		assert(
			arg3.isCancellationRequested === false,
			`The 'CancellationToken' argument must not yet be cancelled.`,
		);

		assert(
			instance.callArguments2.length === 0,
			`The 'doSomethingElseAsync' method must not be called.`,
		);
	});

	test('cancel token of the previous call when method is called again', async () => {
		const instance = disposables.add(new MockDisposable());

		instance.doSomethingAsync(1, 'foo');
		await new Promise(resolve => setTimeout(resolve, 10));
		instance.doSomethingAsync(2, 'bar');

		const callArguments = instance.callArguments1;
		assert.strictEqual(
			callArguments.length,
			2,
			`The 'doSomethingAsync' method must be called twice.`,
		);

		const call1Args = callArguments[0];
		assert(
			call1Args.length === 3,
			`The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`,
		);

		assert.strictEqual(
			call1Args[0],
			1,
			`The first call of the 'doSomethingAsync' method must have the correct 1st argument.`,
		);

		assert.strictEqual(
			call1Args[1],
			'foo',
			`The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`,
		);

		assert(
			CancellationToken.isCancellationToken(call1Args[2]),
			`The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`,
		);

		assert(
			call1Args[2].isCancellationRequested === true,
			`The 'CancellationToken' of the first call must be cancelled.`,
		);

		const call2Args = callArguments[1];
		assert(
			call2Args.length === 3,
			`The second call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`,
		);

		assert.strictEqual(
			call2Args[0],
			2,
			`The second call of the 'doSomethingAsync' method must have the correct 1st argument.`,
		);

		assert.strictEqual(
			call2Args[1],
			'bar',
			`The second call of the 'doSomethingAsync' method must have the correct 2nd argument.`,
		);

		assert(
			CancellationToken.isCancellationToken(call2Args[2]),
			`The second call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`,
		);

		assert(
			call2Args[2].isCancellationRequested === false,
			`The 'CancellationToken' of the second call must be cancelled.`,
		);

		assert(
			instance.callArguments2.length === 0,
			`The 'doSomethingElseAsync' method must not be called.`,
		);
	});

	test('different method calls must not interfere with each other', async () => {
		const instance = disposables.add(new MockDisposable());

		instance.doSomethingAsync(10, 'baz');
		await new Promise(resolve => setTimeout(resolve, 10));
		instance.doSomethingElseAsync(25, 'qux');

		assert.strictEqual(
			instance.callArguments1.length,
			1,
			`The 'doSomethingAsync' method must be called once.`,
		);

		const call1Args = instance.callArguments1[0];
		assert(
			call1Args.length === 3,
			`The first call of the 'doSomethingAsync' method must have '3' arguments, got '${call1Args.length}'.`,
		);

		assert.strictEqual(
			call1Args[0],
			10,
			`The first call of the 'doSomethingAsync' method must have the correct 1st argument.`,
		);

		assert.strictEqual(
			call1Args[1],
			'baz',
			`The first call of the 'doSomethingAsync' method must have the correct 2nd argument.`,
		);

		assert(
			CancellationToken.isCancellationToken(call1Args[2]),
			`The first call of the 'doSomethingAsync' method must have the 'CancellationToken' as the 3rd argument.`,
		);

		assert(
			call1Args[2].isCancellationRequested === false,
			`The 'CancellationToken' of the first call must not be cancelled.`,
		);

		assert.strictEqual(
			instance.callArguments2.length,
			1,
			`The 'doSomethingElseAsync' method must be called once.`,
		);

		const call2Args = instance.callArguments2[0];
		assert(
			call2Args.length === 3,
			`The first call of the 'doSomethingElseAsync' method must have '3' arguments, got '${call1Args.length}'.`,
		);

		assert.strictEqual(
			call2Args[0],
			25,
			`The first call of the 'doSomethingElseAsync' method must have the correct 1st argument.`,
		);

		assert.strictEqual(
			call2Args[1],
			'qux',
			`The first call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`,
		);

		assert(
			CancellationToken.isCancellationToken(call2Args[2]),
			`The first call of the 'doSomethingElseAsync' method must have the 'CancellationToken' as the 3rd argument.`,
		);

		assert(
			call2Args[2].isCancellationRequested === false,
			`The 'CancellationToken' of the second call must be cancelled.`,
		);

		instance.doSomethingElseAsync(105, 'uxi');

		assert.strictEqual(
			instance.callArguments1.length,
			1,
			`The 'doSomethingAsync' method must be called once.`,
		);

		assert.strictEqual(
			instance.callArguments2.length,
			2,
			`The 'doSomethingElseAsync' method must be called twice.`,
		);

		assert(
			call1Args[2].isCancellationRequested === false,
			`The 'CancellationToken' of the first call must not be cancelled.`,
		);

		const call3Args = instance.callArguments2[1];
		assert(
			CancellationToken.isCancellationToken(call3Args[2]),
			`The last argument of the second call of the 'doSomethingElseAsync' method must be a 'CancellationToken'.`,
		);

		assert(
			call2Args[2].isCancellationRequested,
			`The 'CancellationToken' of the first call must be cancelled.`,
		);

		assert(
			call3Args[2].isCancellationRequested === false,
			`The 'CancellationToken' of the second call must not be cancelled.`,
		);

		assert.strictEqual(
			call3Args[0],
			105,
			`The second call of the 'doSomethingElseAsync' method must have the correct 1st argument.`,
		);

		assert.strictEqual(
			call3Args[1],
			'uxi',
			`The second call of the 'doSomethingElseAsync' method must have the correct 2nd argument.`,
		);
	});
});
